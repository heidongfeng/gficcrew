#!/usr/bin/env node
/**
 * 一键发布 gficcrew.com 到 GitHub Pages。
 *
 *   npm run publish            # 构建 → 审计 → 生成公开包 → 干跑（不写入）
 *   npm run publish -- --apply # 真发布，并在发布后逐页核验线上
 *
 * 设计要点：
 *   1. 复用已有脚本，不重复实现构建与上传逻辑。
 *   2. 凭证从 .github-token 读取（gitignored），绝不出现在命令行或日志里。
 *   3. --apply 前强制跑静态审计，审计不过就不发布。
 *   4. 发布后裸连（--noproxy '*'）核验，避免代理或 CDN 缓存造成假通过。
 *   5. 只动 gh-pages，不碰源码分支，不碰其他托管。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const APPLY = process.argv.includes('--apply');
const SKIP_AUDIT = process.argv.includes('--skip-audit');
const SITE = 'https://gficcrew.com';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

let failed = false;
const step = (n, msg) => console.log(`\n${C.bold(`[${n}]`)} ${msg}`);
const ok = (msg) => console.log(`  ${C.green('✓')} ${msg}`);
const warn = (msg) => console.log(`  ${C.yellow('!')} ${msg}`);
const bad = (msg) => {
  failed = true;
  console.log(`  ${C.red('✗')} ${msg}`);
};

function run(label, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: opts.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, CODEBUDDY_TOOL_CALL_ID: undefined },
    ...opts,
  });
  if (r.status !== 0) {
    if (opts.capture) console.log((r.stdout || '') + (r.stderr || ''));
    throw new Error(`${label} 失败（exit ${r.status}）`);
  }
  return r.stdout || '';
}

// ---------------------------------------------------------------- 0. 前置检查
step(0, '前置检查');
// Token: environment first, file second.
//
// The file is how this runs on a workstation (.github-token, git-ignored). Inside GitHub
// Actions there is no such file and there should not be one -- the runner injects
// GITHUB_TOKEN, and hard-failing on a missing file made this script impossible to run
// unattended. Env wins so a CI run can never accidentally pick up a stale local file.
const tokenFile = path.join(ROOT, '.github-token');
const token = (process.env.GITHUB_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '')).trim();
if (!token) {
  bad('没有可用的 GitHub Token：设置环境变量 GITHUB_TOKEN，或把 Token 存到 .github-token（仅一行）。');
  process.exit(1);
}
ok(`凭证已就绪（来自 ${process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN 环境变量' : '.github-token 文件'}，未打印）`);

const dirty = run('git status', 'git', ['status', '--porcelain'], { capture: true }).trim();
if (dirty) warn(`工作区有未提交改动：\n${dirty.split('\n').map((l) => '     ' + l).join('\n')}`);

// ---------------------------------------------------------------- 1. 构建
step(1, '构建两个变体');
try {
  run('build:all', 'npm', ['run', 'build:all']);
  ok('dist-global / dist-cn 构建完成');
} catch (e) {
  bad(e.message);
  process.exit(1);
}

// ---------------------------------------------------------------- 2. 静态审计
step(2, '静态审计');
if (SKIP_AUDIT) {
  warn('已跳过（--skip-audit）');
} else {
  try {
    run('audit', 'node', ['tools/audit/run.mjs']);
    ok('审计通过');
  } catch (e) {
    bad('审计未通过，终止发布：' + e.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 3. 公开包
step(3, '生成 GitHub Pages 公开包');
try {
  run('cn:zip', 'npm', ['run', 'cn:zip']);
  run('ghpages:prepare', 'npm', ['run', 'ghpages:prepare']);
} catch (e) {
  bad(e.message);
  process.exit(1);
}

const GH = path.join(ROOT, 'dist-ghpages');

// 国内包单独放进公开包。
// 国内站无法再从 .app 取包（那个环境已停发），所以改成从这里取，国内宝塔脚本只改一行 URL。
// 必须用 dist-cn 打出来的 zip，绝不能用 dist-global 里那份 cn-bundle.txt（那是国际版）。
const cnZip = path.join(ROOT, '..', 'gficcrew-cn.zip');
const cnSource = fs.existsSync(cnZip) ? cnZip : path.join(ROOT, 'dist-global', 'cn-bundle.txt');
if (!fs.existsSync(cnSource)) {
  bad('找不到国内包，先跑 npm run build:all');
  process.exit(1);
}
fs.copyFileSync(cnSource, path.join(GH, 'cn-bundle.txt'));
const cnBuf = fs.readFileSync(cnSource);
const cnSizeKb = (cnBuf.length / 1024).toFixed(0);
ok(`国内包已放入公开包（${cnSizeKb} KB，来自 dist-cn）`);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(GH, p).split(path.sep).join('/'));
  }
})(GH);

const leaks = files.filter((f) => f.startsWith('admin/') || /^_astro\/admin[.-]/.test(f));
const hasCname = files.includes('CNAME');
const hasNojekyll = files.includes('.nojekyll');
const hasCnBundle = files.includes('cn-bundle.txt');

if (leaks.length) bad(`公开包含后台文件：${leaks.join(', ')}`);
else ok(`后台零泄漏（${files.length} 个文件）`);
if (!hasCname) bad('缺少 CNAME，自定义域名会掉');
else ok('CNAME = gficcrew.com');
if (!hasNojekyll) bad('缺少 .nojekyll，_astro/ 会被 Jekyll 忽略');
else ok('.nojekyll 存在');
if (!hasCnBundle) warn('未包含 cn-bundle.txt，国内站将无法拉取更新');
else ok('已包含 cn-bundle.txt（国内站拉取源）');

if (failed) {
  console.log(C.red('\n公开包不合格，终止。\n'));
  process.exit(1);
}

// ---------------------------------------------------------------- 4. 发布
step(4, APPLY ? '推送到 gh-pages' : '干跑（不写入任何东西）');
try {
  const args = ['scripts/deploy-github-pages.mjs'];
  if (APPLY) args.push('--apply');
  run('deploy', 'node', args);
} catch (e) {
  bad(e.message);
  process.exit(1);
}

if (!APPLY) {
  console.log(C.dim('\n干跑结束。确认无误后运行：npm run publish -- --apply'));
  console.log(C.dim('提示：干跑不会改动任何线上内容。\n'));
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------- 5. 线上核验
step(5, '线上逐页核验（裸连，不吃缓存）');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

function fetchUrl(url) {
  const r = spawnSync(
    'curl',
    ['-sS', '-o', '-', '-w', '\n%{http_code}', '--max-time', '30', '--noproxy', '*', '-H', 'Cache-Control: no-cache', url],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );
  const all = r.stdout || Buffer.alloc(0);
  const nl = all.lastIndexOf(0x0a);
  const code = nl >= 0 ? all.subarray(nl + 1).toString().trim() : '';
  const body = nl >= 0 ? all.subarray(0, nl) : all;
  return { code, body };
}

// 首次发布后 Pages 需要重新构建，轮询到 last-modified 变成今天为止。
const today = new Date().toISOString().slice(0, 10);
let built = false;
for (let i = 0; i < 15; i++) {
  const head = spawnSync('curl', ['-s', '-D', '-', '-o', '/dev/null', '--max-time', '20', '--noproxy', '*', SITE + '/'], {
    encoding: 'utf8',
  }).stdout;
  const lm = (head.match(/^last-modified:\s*(.+)$/im) || [])[1] || '';
  if (lm && lm.includes(new Date().toUTCString().slice(8, 16))) {
    built = true;
    ok(`Pages 已重新构建（${lm.trim()}）`);
    break;
  }
  console.log(C.dim(`  等待 Pages 构建… (${i + 1}/15) ${lm.trim()}`));
  spawnSync('sleep', ['20']);
}
if (!built) warn('未检测到新构建时间，继续核验（可能仍在构建，稍后复查）');

const mustMatch = files.filter((f) => /\.(html|xml|txt|webmanifest|json|css|js)$/.test(f));
let checked = 0;
for (const f of mustMatch) {
  const url = SITE + '/' + f;
  const local = fs.readFileSync(path.join(GH, f));
  const localMd5 = md5(local);
  let code = '';
  let matched = false;
  // Pages 刚推送后存在短暂的构建/CDN 传播窗口，瞬时读到旧内容是正常的。
  // 对不一致的文件做有界重试，避免把「发布成功」误报成「内容不一致」。
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = fetchUrl(url);
    code = r.code;
    if (code === '200' && md5(r.body) === localMd5) { matched = true; break; }
    spawnSync('sleep', ['3']);
  }
  if (code !== '200') {
    bad(`${f} → HTTP ${code}`);
  } else if (!matched) {
    bad(`${f} → 200 但内容与本地不一致（已重试 3 次）`);
  } else {
    checked++;
  }
}
ok(`${checked}/${mustMatch.length} 个文件与本地逐字节一致`);

// 后台必须不可达；国内包必须可达且与本地 dist-cn 一致
for (const p of ['admin/', 'admin/index.html', '.htaccess']) {
  const { code } = fetchUrl(`${SITE}/${p}`);
  if (code === '200') bad(`/${p} 仍可访问（HTTP 200）`);
  else ok(`/${p} → ${code}（已隔离）`);
}

{
  const { code, body } = fetchUrl(`${SITE}/cn-bundle.txt`);
  if (code !== '200') {
    bad(`/cn-bundle.txt → HTTP ${code}，国内站将拉不到新包`);
  } else if (md5(body) !== md5(cnBuf)) {
    bad('/cn-bundle.txt 与本地国内包不一致');
  } else {
    ok(`/cn-bundle.txt 可下载且与本地一致（${cnSizeKb} KB）`);
  }
}

// 国内站是否已跟上（宝塔按计划拉取，可能还没轮到）
{
  const url = 'https://gficcrew.cn/faq/';
  const r = spawnSync('curl', ['-sS', '-o', '-', '-w', '\n%{http_code}', '--max-time', '25', '--noproxy', '*', '-H', 'Cache-Control: no-cache', url], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  const all = r.stdout || Buffer.alloc(0);
  const nl = all.lastIndexOf(0x0a);
  const code = nl >= 0 ? all.subarray(nl + 1).toString().trim() : '';
  const html = nl >= 0 ? all.subarray(0, nl).toString() : '';
  const n = (html.match(/"@type":"Question"/g) || []).length;
  if (code !== '200') warn(`国内站 /faq/ → HTTP ${code}`);
  else if (n >= 42) ok(`国内站已是新版（FAQ ${n} 条）`);
  else warn(`国内站仍是旧版（FAQ ${n} 条），等宝塔下次拉包，或手动执行一次计划任务`);
}

// 关键业务内容
const faq = fetchUrl(`${SITE}/faq/`);
const faqCount = (faq.body.toString().match(/"@type":"Question"/g) || []).length;
if (faqCount < 42) bad(`FAQ 题目 ${faqCount} 条，少于预期 42`);
else ok(`FAQ ${faqCount} 条`);

for (const city of ['guangzhou', 'shenzhen']) {
  const { code } = fetchUrl(`${SITE}/cities/${city}/`);
  if (code !== '200') bad(`/cities/${city}/ → HTTP ${code}`);
  else ok(`/cities/${city}/ 可访问`);
}

const sm = fetchUrl(`${SITE}/sitemap-0.xml`).body.toString();
const cityUrls = [...new Set(sm.match(/cities\/[a-z-]+\//g) || [])].sort();
const expect = ['cities/guangzhou/', 'cities/shenzhen/'];
if (JSON.stringify(cityUrls) !== JSON.stringify(expect)) {
  bad(`sitemap 城市页为 ${cityUrls.join(', ')}，预期只有广深`);
} else {
  ok('sitemap 只含广州、深圳两个城市页');
}

// ---------------------------------------------------------------- 6. 收尾
step(6, '结果');
if (failed) {
  console.log(C.red('发布流程有检查未通过，请按上面标红的项处理。\n'));
} else {
  console.log(C.green('全部通过。gficcrew.com 已是本次构建。\n'));
  console.log(C.dim('国内站：宝塔计划任务会从 gficcrew.com/cn-bundle.txt 拉取，拉完即更新。'));
  console.log(C.dim('管理端 .app：当前环境无部署组件，不在本脚本范围内。'));
  console.log(C.dim('提醒：云端 cms_docs 若仍是旧数据，下次内容同步可能回退本地改动。\n'));
}
process.exit(failed ? 1 : 0);
