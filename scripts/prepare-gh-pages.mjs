#!/usr/bin/env node
// Build dist-ghpages/ -- a GitHub Pages-safe copy of dist-global.
//
//   node scripts/prepare-gh-pages.mjs            (no CNAME file)
//   node scripts/prepare-gh-pages.mjs --cname    (also write CNAME = gficcrew.com)
//
// Why a separate directory instead of pushing dist-global straight up:
//
//  1. GitHub Pages does NOT read `_redirects`. Every 301 in it would silently
//     become a hard 404 -- and /guangzhou/ is a URL the previous site really
//     served (it was one of only five working pages) and therefore very likely
//     indexed. Losing it means Google drops a known URL instead of transferring
//     it. So we materialise each 301 rule as a real stub page: HTTP 200, a
//     canonical pointing at the target, and a 0-second meta refresh. Google
//     follows both, so the URL survives the host change.
//
//     Note the deliberate absence of <meta name="robots" content="noindex">:
//     noindex would tell the crawler to DROP the page, which is the opposite of
//     what we want here.
//
//  2. /admin/ only works from the WorkBuddy origin -- the cloud backend pins the
//     exact Origin header, so on gficcrew.com it would render a shell that cannot
//     reach its API. Shipping it here is both useless and needless public
//     surface, so it is excluded (the root 404.html covers the path).
//
//  3. cn-bundle.txt is the zip the China server pulls. It is the dist-cn build
//     (China variant: ICP footer, no overseas social links), NOT dist-global.
//     It used to live only on the WorkBuddy host; that origin can no longer be
//     published from here, so the China pull script now fetches it from
//     https://gficcrew.com/cn-bundle.txt and publish.mjs copies the China zip
//     in after this script runs. Keeping it out of this copy step is deliberate,
//     but the reason is freshness, not variant: package-cn.mjs does write
//     dist-global/cn-bundle.txt, and that copy is a byte-identical dist-cn zip
//     (verified 2026-11-03: both md5 a5488f13). The problem is that `build:all`
//     does not refresh it -- only `cn:zip` does -- so the file sitting there
//     during a build is whatever the *previous* release produced. Copying it
//     here would publish last time's package next to this time's HTML.
//
//  4. `_headers` and `_redirects` are Netlify/Cloudflare metafiles. GitHub Pages
//     ignores both, and if published they are downloadable as plain text.
//
//  5. An empty `.nojekyll` at the artifact root is mandatory. Without it Jekyll
//     processes the output, drops every directory starting with an underscore,
//     and the site renders as unstyled HTML with no CSS or JS.
//
// The `--cname` flag is NOT the default on purpose. Once a CNAME file is present
// (or a custom domain is set in repo settings) GitHub redirects the project URL
// <owner>.github.io/<repo>/ to the custom domain, which would leave us with no
// way to preview before DNS is switched. So: push without CNAME, verify, then
// add CNAME + move DNS together.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeStamp } from './lib/build-stamp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'dist-global');
const OUT = path.join(ROOT, 'dist-ghpages');
const SITE = 'https://gficcrew.com';

// The custom domain file, taken from github-pages.config.json so there is one place to
// change it. Default ON; --no-cname is the escape hatch.
//
// It used to be opt-in, because a CNAME file makes GitHub redirect the project URL
// <owner>.github.io/<repo>/ to the custom domain and that removed the only preview we
// had before DNS was switched. That reason is gone now the domain is claimed -- and
// keeping it out has become actively dangerous: the deploy pushes a FULL-SNAPSHOT tree,
// so an artifact without CNAME would DELETE it from the branch and unset the custom
// domain on the next scheduled 6-hourly run.
const domain = (() => {
  const p = path.join(ROOT, 'github-pages.config.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')).domain || 'gficcrew.com';
  } catch {
    return 'gficcrew.com';
  }
})();
const NO_CNAME = process.argv.includes('--no-cname');
const CNAME = !NO_CNAME;

const die = (msg) => {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
};

if (!fs.existsSync(SRC)) die('找不到 ' + SRC + '，先跑 npm run build:global。');

// ---------------------------------------------------------------------------
// 1. Parse the redirect rules

const redirectsPath = path.join(SRC, '_redirects');
const rules = [];
if (fs.existsSync(redirectsPath)) {
  for (const raw of fs.readFileSync(redirectsPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to, status] = line.split(/\s+/);
    if (!from || !to) continue;
    rules.push({ from, to, status: status || '301' });
  }
}
console.log(`→ 从 _redirects 读到 ${rules.length} 条规则`);

// ---------------------------------------------------------------------------
// 2. What must not reach GitHub

// Host-specific metafiles. GitHub Pages reads none of them, and because
// .nojekyll disables Jekyll's dotfile filtering they would be served as
// downloadable plain text -- so they must not be published at all.
//   _headers / _redirects : Netlify & Cloudflare convention
//   .assetsignore         : Cloudflare Workers static assets only
//   .htaccess             : Apache, shipped for the China (CentOS) server
const EXCLUDED_METAFILES = new Set([
  '_headers',
  '_redirects',
  '.assetsignore',
  '.htaccess',
  'cn-bundle.txt',
  'CNAME', // we write our own, or deliberately omit it
]);

// Astro's server-side entry output, written at the artifact root next to the static site:
// renderers.mjs / noop-entrypoint.mjs / _noop-middleware.mjs, a hash-named manifest_*.mjs,
// and the chunks/ + pages/ trees they import.
//
// The WorkBuddy origin that serves dist-global needs these -- that host runs the built app,
// which is why a plain `astro build` leaves them behind. GitHub Pages only serves files, so
// copying them across published about 500 KB of build internals on the public domain:
// chunks/contact_*.mjs alone is 285 KB, and manifest_*.mjs enumerates every route and chunk
// hash. Nothing links to any of it, so it is surface with no upside.
//
// This is a copy filter, not a build change: dist-global keeps them, dist-cn (built for the
// Tencent server) never had them, and the deployed GitHub artifact gets neither.
const SSR_ENTRY_FILES = new Set(['renderers.mjs', 'noop-entrypoint.mjs', '_noop-middleware.mjs']);
const SSR_ENTRY_DIRS = new Set(['chunks', 'pages']);

const excluded = [];
const isExcluded = (rel) => {
  if (EXCLUDED_METAFILES.has(rel)) return true;
  if (SSR_ENTRY_FILES.has(rel)) return true;
  if (/^manifest_[A-Za-z0-9_-]+\.mjs$/.test(rel)) return true;
  if (SSR_ENTRY_DIRS.has(rel)) return true;
  if (rel === 'admin' || rel.startsWith('admin/')) return true;
  if (rel.startsWith('_astro/admin.')) return true;
  // The China bundle must come from dist-cn, never from dist-global.
  if (rel === 'cn-bundle.txt') return true;
  return false;
};

// ---------------------------------------------------------------------------
// 3. Copy

// Wipe the output directory.
//
// On this machine `fs.rmSync` on a directory is routed through the sandbox's
// trash helper, which occasionally hangs and throws ETIMEDOUT (observed once).
// A single flaky failure must not take down the 6-hourly publish job, so fall
// back to unlinking file by file -- file-level deletes go through regardless of
// what the helper is doing -- and then rmdir the emptied tree.
function clearDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  } catch (e) {
    console.log('  ! rmSync 失败（' + String(e.message).split('\n')[0] + '），改用逐个删除');
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) clearDir(p);
      else fs.unlinkSync(p);
    }
    try {
      fs.rmdirSync(dir);
    } catch {
      /* contents are gone; leaving an empty dir behind is harmless */
    }
  }
}

clearDir(OUT);
let copied = 0;
let bytes = 0;
const walk = (dir, prefix) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (isExcluded(rel)) {
        excluded.push(rel + '/  (' + fs.readdirSync(abs).length + ' 个文件)');
        continue;
      }
      walk(abs, rel);
      continue;
    }
    if (isExcluded(rel)) {
      excluded.push(rel);
      continue;
    }
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    copied += 1;
    bytes += fs.statSync(abs).size;
  }
};
walk(SRC, '');
console.log(`→ 复制 ${copied} 个文件 / ${(bytes / 1024).toFixed(0)} KB`);
for (const x of excluded) console.log('   排除 ' + x);

// ---------------------------------------------------------------------------
// 4. Materialise the 301/302 rules as stub pages

const missingTargets = [];
const made = new Map(); // output path -> target, so /guangzhou and /guangzhou/ collapse

for (const r of rules) {
  const code = Number.parseInt(r.status, 10);
  if (code !== 301 && code !== 302 && code !== 303 && code !== 307 && code !== 308) {
    continue; // 404 rewrites need no file: the root 404.html already answers them
  }
  const clean = r.from.replace(/\/+$/, '').replace(/^\//, '');
  if (!clean || clean.includes('*')) continue;

  const outRel = clean + '/index.html';
  if (made.has(outRel)) continue;
  made.set(outRel, r.to);

  // Sanity: the destination should actually exist in this artifact.
  const targetRel = r.to === '/' ? 'index.html' : r.to.replace(/^\//, '').replace(/\/+$/, '') + '/index.html';
  if (!fs.existsSync(path.join(OUT, targetRel))) missingTargets.push(`${r.from} → ${r.to}`);
}

for (const [outRel, to] of made) {
  const abs = path.join(OUT, outRel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const href = to.startsWith('http') ? to : SITE + (to === '/' ? '/' : to);
  fs.writeFileSync(
    abs,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>This page has moved</title>
<link rel="canonical" href="${href}">
<meta http-equiv="refresh" content="0; url=${to}">
<style>body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:22vh 24px;text-align:center;color:#222}a{color:#0b6b4f}</style>
</head>
<body>
<p>This page has moved to <a href="${to}">${to}</a>.</p>
</body>
</html>
`,
  );
}
console.log(`→ 生成 ${made.size} 个重定向桩页（保住 _redirects 里那几条 301）`);
for (const [outRel, to] of made) console.log(`   /${outRel.replace('/index.html', '/')}  →  ${to}`);
if (missingTargets.length) {
  console.log('  ⚠️ 以下规则的目标在产物里找不到，桩页会把人送进 404：');
  for (const m of missingTargets) console.log('     ' + m);
}

// ---------------------------------------------------------------------------
// 5. .nojekyll (mandatory) and optionally CNAME

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('→ 写入 .nojekyll（空文件，必须有，否则 Jekyll 会吃掉 _astro/）');

if (CNAME) {
  fs.writeFileSync(path.join(OUT, 'CNAME'), domain + '\n');
  console.log(`→ 写入 CNAME = ${domain}`);
} else {
  console.log('→ --no-cname：未写 CNAME。正常发布链路不要用这个 —— 全量快照会把它从分支上删掉，');
  console.log('   自定义域名会跟着掉线。只在你确实要摘掉域名时用。');
}

const total = [];
const count = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const abs = path.join(d, e.name);
    if (e.isDirectory()) count(abs);
    else total.push(path.relative(OUT, abs).split(path.sep).join('/'));
  }
};
count(OUT);
console.log(`\n✓ dist-ghpages 就绪：${total.length} 个文件`);

// 6. Stamp it.
//
// Record which source produced this artifact. The publish step recomputes the
// same fingerprint and refuses to run if src/ or public/ moved on since. Without
// this, an artifact sitting on disk since yesterday looks exactly as good as one
// built a minute ago -- that is how an outdated build reached production on
// 2026-11-01.
const stamp = writeStamp(ROOT, {
  files: total.length,
  kind: 'ghpages',
  // Also pin the home page: if someone swaps dist-ghpages/ for a different build
  // sideways, the source fingerprint can still match while the artifact does not.
  indexSha1: crypto.createHash('sha1').update(fs.readFileSync(path.join(OUT, 'index.html'))).digest('hex').slice(0, 16),
});
console.log(`→ 已落章：源码指纹 ${stamp.sourceHash}（${stamp.sourceFiles} 个输入文件），产物 ${total.length} 个文件`);
console.log('  下一步：npm run deploy:ghpages:dry（先干跑看看要传什么）');
