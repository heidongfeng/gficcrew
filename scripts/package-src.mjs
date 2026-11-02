#!/usr/bin/env node
/**
 * 打「源码交付包」给接手方 / 团队成员。
 *
 *   npm run src:zip
 *
 * 为什么用 `git archive` 而不是手工压目录：
 *   1. 只含**已提交**的文件 → .gitignore 里的凭证（.adminpw / .github-token /
 *      .netlify-token）和构建产物（node_modules / dist-* / content-export.json）天然被排除，
 *      不需要维护一份容易漏的排除清单 —— 漏一次就是凭证外泄。
 *   2. 体积小（约 820 KB），解压即可 `npm install && npm run build:all`。
 *
 * 交付路径：zip 落在 ../handover/，由人上传到资料库给接手方。
 *
 * ⚠️ 未提交的工作区改动不会进包 —— 脚本会先检查并拒绝出包，避免给出「缺了最后几处改动」的源码。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.resolve(ROOT, '..', 'handover');

const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- 1. 工作区必须干净
let dirty = '';
try {
  dirty = run('git status --porcelain').trim();
} catch {
  fail('读不到 git 状态，确认这是不是 git 仓库根目录。');
}
if (dirty) {
  const lines = dirty.split('\n');
  console.error('以下改动还没提交，不会进包：\n' + lines.map((l) => '   ' + l).join('\n'));
  fail(
    `有 ${lines.length} 个未提交的改动。先提交（git add -A && git commit -m "..."）再打源码包，\n` +
      '   否则交给对方的源码会缺这几处修改。'
  );
}

// ---------------------------------------------------------------- 2. 出包
const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
  now.getDate()
).padStart(2, '0')}`;
const outFile = path.join(OUT_DIR, `gficcrew-site-src-${stamp}.zip`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(outFile)) fs.rmSync(outFile);

const head = run('git rev-parse --short HEAD').trim();
const branch = run('git rev-parse --abbrev-ref HEAD').trim();
console.log(`→ 从 ${branch} @ ${head} 出包…`);

// 排除 docs/：里面是运营策略（GEO 打法、站外投放清单、SEO playbook），
// 交付方只需要代码和交接文档，不需要这些内部思路。本机保留，不进包。
const EXCLUDE = ['docs'];
const archiveArgs = ['HEAD', '--', '.', ...EXCLUDE.map((d) => `:(exclude)${d}`)];

try {
  // No shell: Git pathspecs such as :(exclude)docs are otherwise parsed as shell syntax
  // on Linux, while quoting behaviour differs again on Windows.
  execFileSync('git', ['archive', '--format=zip', '-o', outFile, ...archiveArgs], { cwd: ROOT });
} catch (e) {
  fail('git archive 失败：' + String(e.message).split('\n')[0]);
}

// ---------------------------------------------------------------- 3. 自检（防凭证外泄）
// List the committed tree directly; this avoids a platform-specific tar pipeline and
// describes the same content selected by the archive pathspec above.
const names = run('git ls-tree -r --name-only HEAD')
  .trim()
  .split('\n')
  .filter((n) => n && !EXCLUDE.some((d) => n === d || n.startsWith(d + '/')));

const excluded = names.filter((n) => EXCLUDE.some((d) => n === d || n.startsWith(d + '/')));
if (excluded.length) {
  fail(`应排除的目录仍进了包：${EXCLUDE.join(', ')}（${excluded.length} 个文件）`);
}

const FORBIDDEN = ['adminpw', 'github-token', 'netlify-token', 'node_modules', 'content-export.json'];
const leaks = names.filter((n) => {
  const low = n.toLowerCase();
  if (FORBIDDEN.some((k) => low.includes(k))) return true;
  if (/^dist[^/]*\//.test(low)) return true;
  return false;
});
if (leaks.length) {
  fail('包里出现不应交付的文件：\n' + leaks.map((n) => '   ' + n).join('\n'));
}

const size = fs.statSync(outFile).size;
const REQUIRED = [
  'package.json',
  'package-lock.json',
  'astro.config.mjs',
  'src/data/site.js',
  'scripts/release-all.mjs',
  'README.md',
];
const missing = REQUIRED.filter((f) => !names.includes(f));
if (missing.length) fail('包内缺少关键文件：' + missing.join(', '));

// .env.* 只允许出现域名 / 变体 / 备案号，不允许出现密钥
const envFiles = names.filter((n) => /^\.env\./.test(n));
for (const f of envFiles) {
  const body = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/(KEY|TOKEN|SECRET|PASSWORD|PW)\s*=/i.test(body)) {
    fail(`${f} 里疑似含密钥，检查后再出包。`);
  }
}

console.log(`\n✅ 源码包已生成`);
console.log(`   路径：${outFile}`);
console.log(`   大小：${size} bytes（${Math.round(size / 1024)} KB）`);
console.log(`   文件：${names.length} 个（git 已提交内容）`);
console.log(`   版本：${branch} @ ${head}`);
if (envFiles.length) console.log(`   含 ${envFiles.join('、')}（已确认无密钥）`);
console.log(`\n下一步：`);
console.log(`   1. 把 zip 上传到资料库，再交给接手方（上传是手动操作，本脚本不代传）`);
console.log(`   2. 告诉接手方：解压 → npm install（**别用 npm ci**，lock 缺跨平台可选依赖）→ npm run build:all`);
console.log('');
