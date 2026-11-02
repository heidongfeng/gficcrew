#!/usr/bin/env node
// Publish dist-ghpages/ to GitHub Pages using the Git Data API.
//
//   node scripts/deploy-github-pages.mjs              dry run (default, changes nothing)
//   node scripts/deploy-github-pages.mjs --apply      actually push
//
// Why the REST API and not `git push`:
//   The machine that runs the 6-hourly publish job cannot reach github.com at all
//   (direct: timeout; sandbox proxy: TLS handshake failure; the local VPN proxy:
//   CONNECT 502). But api.github.com IS reachable. The Git Data API lets us build
//   a commit -- blobs, tree, commit, ref -- entirely over api.github.com, so the
//   whole deploy works without ever touching the git wire protocol or github.com.
//
// How it avoids re-uploading the site every time:
//   A git blob's object name is sha1("blob <byte length>\0" + content), which we
//   can compute locally. So before uploading anything we fetch the branch's
//   current tree, and any path whose local hash already matches is reused as-is.
//   Only genuinely changed files are uploaded, and unchanged paths cost nothing.
//   The same property doubles as the integrity check after the push: we re-read
//   the tree GitHub stored and compare it path by path against local hashes.
//
// Credentials come from .github-token (gitignored) so the token never lands in
// shell history. Revoke it on GitHub when you are done with it.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkStamp } from './lib/build-stamp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'dist-ghpages');
const API = 'https://api.github.com';
const APPLY = process.argv.includes('--apply');
const SKIP_PAGES = process.argv.includes('--no-pages');

function die(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Config: CLI flag > env > github-pages.config.json

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const cfgPath = path.join(ROOT, 'github-pages.config.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};

const OWNER = arg('owner') || process.env.GH_OWNER || cfg.owner || '';
const REPO = arg('repo') || process.env.GH_REPO || cfg.repo || '';
const BRANCH = arg('branch') || process.env.GH_BRANCH || cfg.branch || 'gh-pages';
const CUSTOM_DOMAIN = arg('domain') || process.env.GH_DOMAIN || cfg.domain || 'gficcrew.com';

const tokenFile = path.join(ROOT, '.github-token');
const TOKEN = process.env.GITHUB_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');

if (!fs.existsSync(SRC)) die('找不到 ' + SRC + '，先跑 npm run ghpages:prepare。');
if (!/^[A-Za-z0-9._-]+$/.test(OWNER) || !/^[A-Za-z0-9._-]+$/.test(REPO)) {
  die(
    '还不知道要推到哪个仓库。补上 owner 与 repo 任一即可：\n' +
      '  1) 编辑 gficcrew-site/github-pages.config.json\n' +
      '  2) 或命令行：node scripts/deploy-github-pages.mjs --owner=你的用户名 --repo=gficcrew\n' +
      '  3) 或环境变量 GH_OWNER=... GH_REPO=...',
  );
}

console.log(`→ 目标：${OWNER}/${REPO}  分支 ${BRANCH}  自定义域名 ${CUSTOM_DOMAIN}`);
console.log(`→ 模式：${APPLY ? '真实推送' : '干跑（只报告，不写入任何东西）'}`);

// ---------------------------------------------------------------------------
// API helper

let apiCalls = 0;
async function api(method, url, body) {
  apiCalls += 1;
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gficcrew-site-deploy',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function must(method, url, body) {
  const r = await api(method, url, body);
  if (!r.ok) {
    const detail = (r.json && (r.json.message || r.json.error)) || r.text.slice(0, 300);
    die(`GitHub API ${method} ${url} → HTTP ${r.status}\n  ${detail}`);
  }
  return r.json;
}

if (!TOKEN) {
  console.log('\n! 没有读到 .github-token，只能查到公开信息，无法推送。\n');
}

// ---------------------------------------------------------------------------
// 1. Verify the target repo

const repoInfo = await api('GET', `/repos/${OWNER}/${REPO}`);
if (!repoInfo.ok) {
  if (repoInfo.status === 404) {
    die(
      `仓库 ${OWNER}/${REPO} 不存在，或者当前凭证看不到它。\n` +
        '  如果是私有仓库而 token 权限不够，会同样返回 404。请确认仓库全名与 token 权限。',
    );
  }
  die(`读取仓库信息失败：HTTP ${repoInfo.status}\n  ${repoInfo.text.slice(0, 300)}`);
}
const R = repoInfo.json;
console.log(`→ 仓库：${R.full_name}  ${R.private ? '私有' : '公开'}  默认分支 ${R.default_branch}`);
if (R.private) {
  console.log('  ⚠️ 仓库是私有的。免费计划不允许私有仓库用 Pages —— 要么把仓库转公开，要么账户升到 Pro。');
}

// ---------------------------------------------------------------------------
// 2. Hash the artifact the way git does

const gitSha = (buf) =>
  crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'utf8'), buf])).digest('hex');

const local = new Map(); // repo path -> { sha, size }
let bytes = 0;
const walk = (dir, prefix) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) {
      walk(abs, rel);
      continue;
    }
    const buf = fs.readFileSync(abs);
    bytes += buf.length;
    local.set(rel, { sha: gitSha(buf), size: buf.length, abs });
  }
};
walk(SRC, '');
console.log(`→ 本地产物：${local.size} 个文件 / ${(bytes / 1024).toFixed(0)} KB`);

// ---------------------------------------------------------------------------
// 2b. Refuse to publish an incomplete artifact.
//
// This script can be invoked on its own (`npm run deploy:ghpages:apply`), which
// skips publish.mjs and therefore skips the audit. That is exactly how a stale
// worktree overwrote the live site on 2026-11-01: a build missing the Shenzhen
// page, site.webmanifest and cn-bundle.txt was pushed as if it were current,
// GitHub Pages then failed the build, and the China mirror lost its pull source.
// A publish path that can be called alone has to defend itself.
const REQUIRED = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap-index.xml',
  'faq/index.html',
  'cities/index.html',
  'cities/guangzhou/index.html',
  'cities/shenzhen/index.html',
  'site.webmanifest',
  'cn-bundle.txt',
];
const missing = REQUIRED.filter((f) => !local.has(f));
if (missing.length) {
  console.error('✗ 产物不完整，拒绝发布。缺：' + missing.join(', '));
  console.error('  先跑 npm run build:all 和 npm run cn:zip，再发布。');
  process.exit(1);
}
const bundleBuf = fs.readFileSync(local.get('cn-bundle.txt').abs);
if (bundleBuf[0] !== 0x50 || bundleBuf[1] !== 0x4b) {
  console.error('✗ cn-bundle.txt 不是 ZIP（文件头不对），拒绝发布。国内站会拉到坏包。');
  process.exit(1);
}
if (local.size < 30) {
  console.error(`✗ 产物只有 ${local.size} 个文件，明显偏少，拒绝发布。`);
  process.exit(1);
}
console.log(`→ 完整性检查通过：${REQUIRED.length} 项必备文件齐全，国内包 ${(bundleBuf.length / 1024).toFixed(0)} KB 是有效 ZIP`);

// ---------------------------------------------------------------------------
// 2c. Refuse to publish a stale artifact.
//
// 2b asks "is this artifact complete?". It does not ask "is this artifact
// current?" -- and on 2026-11-01 the artifact was complete but hours old, so it
// sailed through. prepare-gh-pages.mjs now stamps the source fingerprint it was
// built from, and this is where that claim gets checked. If src/ or public/
// changed after the build, the artifact no longer represents the code, and
// publishing it overwrites the live site with an older version.
const freshness = checkStamp(ROOT);
if (!freshness.ok) {
  if (APPLY) {
    console.error('\n✗ ' + freshness.reason + '\n');
    process.exit(1);
  }
  console.error('\n⚠ 干跑发现陈旧产物（真实发布会拒绝执行）：' + freshness.reason + '\n');
} else {
  const st = freshness.stamp;
  const ageMin = Math.round((Date.now() - Date.parse(st.builtAt)) / 60000);
  console.log(`→ 新鲜度检查通过：源码指纹 ${st.sourceHash}，产物构建于 ${ageMin} 分钟前`);
  const indexAbs = local.get('index.html')?.abs;
  if (st.indexSha1 && indexAbs) {
    const nowIndex = crypto.createHash('sha1').update(fs.readFileSync(indexAbs)).digest('hex').slice(0, 16);
    if (nowIndex !== st.indexSha1) {
      console.error(`✗ 首页内容与落章时不一致（${st.indexSha1} → ${nowIndex}），产物被替换过，拒绝发布。`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. What is already on the branch?

let parentSha = null;
let remote = new Map();
let repoIsEmpty = false;
const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
// An empty repository answers this two different ways depending on how it is queried:
//   404 -> the branch does not exist (repo has commits, just not on this branch)
//   409 -> "Git Repository is empty", i.e. no commits at all, so no ref can exist yet
// Both mean "no parent commit", but 409 additionally means the Git Data API will refuse
// to create blobs until the repository has been bootstrapped once (see below).
if (ref.ok) {
  parentSha = ref.json.object.sha;
  const tree = await must('GET', `/repos/${OWNER}/${REPO}/git/trees/${parentSha}?recursive=1`);
  if (tree.truncated) console.log('  ! 远端 tree 被截断，比对可能不完整');
  for (const e of tree.tree) if (e.type === 'blob') remote.set(e.path, e.sha);
  console.log(`→ 分支 ${BRANCH} 已存在：${parentSha.slice(0, 7)}，远端 ${remote.size} 个文件`);
} else if (ref.status === 404 || ref.status === 409) {
  repoIsEmpty = ref.status === 409;
  console.log(
    `→ 分支 ${BRANCH} 还不存在${repoIsEmpty ? '（仓库一个提交都没有）' : ''} —— 这会是它的第一个提交`,
  );
} else {
  die(`读取分支失败：HTTP ${ref.status}\n  ${ref.text.slice(0, 300)}`);
}

const changed = [];
const removed = [];
for (const [rel, info] of local) if (remote.get(rel) !== info.sha) changed.push(rel);
for (const rel of remote.keys()) if (!local.has(rel)) removed.push(rel);

console.log(`→ 需要上传 ${changed.length} 个文件，删除 ${removed.length} 个，其余 ${local.size - changed.length} 个可直接复用`);
for (const rel of changed.slice(0, 15)) console.log('   传  ' + rel);
if (changed.length > 15) console.log(`   … 还有 ${changed.length - 15} 个`);
for (const rel of removed.slice(0, 15)) console.log('   删  ' + rel);
if (removed.length > 15) console.log(`   … 还有 ${removed.length - 15} 个`);

if (!changed.length && !removed.length && parentSha) {
  console.log('\n✓ 内容与远端完全一致，无需推送。');
  process.exit(0);
}

if (!APPLY) {
  console.log('\n（干跑结束，什么都没改。确认无误后加 --apply）');
  process.exit(0);
}

if (!TOKEN) die('没有 token，不能推送。请把 token 写进 ' + tokenFile);

// ---------------------------------------------------------------------------
// 3b. Bootstrap a repository that has no commits yet
//
// A repository with zero commits rejects POST /git/blobs with 409 "Git Repository is
// empty" -- GitHub will not accept objects into the object database until a first
// commit exists. The Contents API is the one endpoint that can create it, so use that
// to bootstrap and then carry on with the normal Git Data API flow.
//
// The bootstrap file is `.nojekyll` deliberately: it is a file the site wants anyway,
// so if the run dies right here the repo is still in a sane state. The tree created
// below is a full snapshot, so the final gh-pages commit contains only the artifact
// files and this placeholder is superseded.

if (repoIsEmpty) {
  console.log('→ 仓库还没有任何提交，先用 Contents API 打一个初始化提交…');
  await must('PUT', `/repos/${OWNER}/${REPO}/contents/.nojekyll`, {
    message: 'chore: initialise the repository so the Git Data API accepts objects',
    content: Buffer.from('\n').toString('base64'),
  });
  console.log('  ✓ 已初始化（落在默认分支 main 上）；gh-pages 仍会是全新的孤立分支');
}

// ---------------------------------------------------------------------------
// 4. Upload only the blobs git does not already have

console.log('→ 上传 blob…');
const uploadQueue = changed.map((rel) => local.get(rel).abs);
let done = 0;
const worker = async () => {
  while (uploadQueue.length) {
    const abs = uploadQueue.shift();
    const rel = path.relative(SRC, abs).split(path.sep).join('/');
    const blob = await must('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: fs.readFileSync(abs).toString('base64'),
      encoding: 'base64',
    });
    if (blob.sha !== local.get(rel).sha) die(`blob 校验失败：${rel}\n  本地 ${local.get(rel).sha}\n  远端 ${blob.sha}`);
    done += 1;
    if (done % 8 === 0 || done === changed.length) console.log(`  已上传 ${done}/${changed.length}`);
  }
};
await Promise.all(Array.from({ length: Math.min(6, changed.length) }, worker));

// ---------------------------------------------------------------------------
// 5. Full-snapshot tree, commit, ref

const treeEntries = [...local.entries()].map(([rel, info]) => ({ path: rel, mode: '100644', type: 'blob', sha: info.sha }));
const tree = await must('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeEntries });
console.log(`→ 建 tree ${tree.sha.slice(0, 7)}（${treeEntries.length} 条）`);

const message =
  `deploy: gficcrew.com from dist-ghpages\n\n` +
  `${treeEntries.length} files, ${(bytes / 1024).toFixed(0)} KB. ` +
  `Generated by scripts/prepare-gh-pages.mjs (nojekyll + redirect stubs, admin/ excluded).`;
const commit = await must('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message,
  tree: tree.sha,
  parents: parentSha ? [parentSha] : [],
});
console.log(`→ 建 commit ${commit.sha.slice(0, 7)}`);

if (parentSha) {
  await must('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
} else {
  await must('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
}
console.log(`✓ 已推送分支 ${BRANCH}`);

// ---------------------------------------------------------------------------
// 6. Verify by reading the tree back (not by trusting the write)

const check = await must('GET', `/repos/${OWNER}/${REPO}/git/trees/${commit.sha}?recursive=1`);
const remoteAfter = new Map();
for (const e of check.tree) if (e.type === 'blob') remoteAfter.set(e.path, e.sha);
const mismatched = [...local.entries()].filter(([rel, info]) => remoteAfter.get(rel) !== info.sha);
console.log(
  mismatched.length
    ? `✗ 回读校验失败，${mismatched.length} 个文件对不上：\n` + mismatched.map(([r]) => '   ' + r).join('\n')
    : `✓ 回读校验通过：远端 ${remoteAfter.size} 个文件的 blob sha 与本地逐一一致`,
);
if (mismatched.length) process.exit(1);

// ---------------------------------------------------------------------------
// 7. Pages configuration -- report, and only create it if it is not there yet

if (!SKIP_PAGES) {
  const pages = await api('GET', `/repos/${OWNER}/${REPO}/pages`);
  if (pages.ok) {
    const p = pages.json;
    console.log(`→ Pages 已启用：${p.html_url}  来源 ${p.source && p.source.branch}${p.source && p.source.path}  ${p.status || ''}`);
    const onBranch = p.source && p.source.branch === BRANCH;
    if (!onBranch) {
      console.log(`  ⚠️ 但它的发布来源不是 ${BRANCH}。这里是故意不自动改的 —— 改成别的分支会立刻影响线上。`);
      console.log(`     要切的话：Settings → Pages → Source 选 ${BRANCH} / (root)，或让我用 API 改（需要 pages 写权限）。`);
    }
    if ((p.cname || '') !== CUSTOM_DOMAIN) {
      console.log(`  自定义域名当前是 ${p.cname || '（未设置）'}；等你确认后再设成 ${CUSTOM_DOMAIN}。`);
    }
  } else if (pages.status === 404) {
    console.log('→ Pages 尚未启用，尝试启用…');
    const created = await api('POST', `/repos/${OWNER}/${REPO}/pages`, {
      source: { branch: BRANCH, path: '/' },
      build_type: 'legacy',
    });
    if (created.ok) {
      console.log(`✓ 已启用，来源 ${BRANCH} / (root)`);
      console.log('  首次构建通常 1–3 分钟，之后 https://' + OWNER.toLowerCase() + '.github.io/' + REPO + '/ 可用');
    } else {
      const d = (created.json && created.json.message) || created.text.slice(0, 300);
      console.log(`  ✗ 启用失败 HTTP ${created.status}：${d}`);
      console.log('    常见原因：仓库是私有的（免费计划不支持），或 token 缺 pages 写权限。');
      console.log('    也可以手动开：Settings → Pages → Source = ' + BRANCH + ' / (root)');
    }
  } else {
    console.log(`→ 查询 Pages 失败：HTTP ${pages.status}（可能 token 缺 pages 权限，不影响上面已完成的推送）`);
  }
}

console.log(`\n（共 ${apiCalls} 次 API 调用）`);
console.log('下一步：等 Pages 首次构建完成，逐页确认 200，最后再加 CNAME 并把 DNS 指过来。');
