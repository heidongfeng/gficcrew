#!/usr/bin/env node
// Deploy dist-global to Netlify as a PRE-BUILT bundle.
//
//   node scripts/deploy-netlify.mjs            draft deploy (safe: does not touch gficcrew.com)
//   node scripts/deploy-netlify.mjs --prod     publish to production
//
// Why this exists instead of just using Netlify's Git integration: the account's
// build allowance is exhausted, and a Git-triggered deploy makes Netlify run
// `npm run build` on their machines. We already build locally (npm run build:global),
// so we only need to hand over the finished files. This path uploads a digest of the
// artifact and never asks Netlify to build anything, so it does not draw on the
// build allowance at all.
//
// Netlify's deploy API works the same way `netlify deploy --dir` does underneath:
//   1. POST the map of {path: sha1} to create a deploy, and get back the sha1s it
//      still needs (empty on a redeploy where nothing changed -- so repeat deploys
//      are cheap; the 622 KB cn-bundle.txt only travels once).
//   2. PUT the raw bytes for each still-needed sha1.
//   3. Poll until the deploy leaves the "uploading"/"processing" states.
//
// The token is read from .netlify-token (gitignored) so it never lands in shell
// history. Revoke it in Netlify once you are done with it.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist-global');
const SITE_HINT = 'gficcrew';
const API = 'https://api.netlify.com/api/v1';

const PROD = process.argv.includes('--prod');

function die(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

const token = fs.existsSync(path.join(ROOT, '.netlify-token'))
  ? fs.readFileSync(path.join(ROOT, '.netlify-token'), 'utf8').trim()
  : '';
if (!token) {
  die(
    '缺少凭证。请在 Netlify 里建一个 Personal access token，存到 gficcrew-site/.netlify-token（单行，不要有多余换行）。\n' +
      '  Netlify → 右上角头像 → User settings → Applications → Personal access tokens → New access token',
  );
}
if (!fs.existsSync(DIST)) die('找不到 ' + DIST + '，先跑 npm run build:global。');

const api = async (method, url, body, raw) => {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const detail = json && (json.message || json.error) ? json.message || json.error : text.slice(0, 300);
    die(`Netlify API ${method} ${url} → HTTP ${res.status}\n  ${detail}`);
  }
  return json;
};

// 1. Which site is gficcrew.com?
console.log('→ 解析站点…');
let siteId = process.env.NETLIFY_SITE_ID || '';
if (siteId) {
  console.log('  用 NETLIFY_SITE_ID 指定：' + siteId);
} else {
  const sites = await api('GET', '/sites?per_page=100');
  const list = Array.isArray(sites) ? sites : [];
  const hit =
    list.find((s) => s.custom_domain === 'gficcrew.com') ||
    list.find((s) => (s.name || '').includes(SITE_HINT)) ||
    list.find((s) => (s.url || '').includes(SITE_HINT));
  if (!hit) {
    die(
      '在这个 token 能看到 ' + list.length + ' 个站点里没找到 gficcrew。看到的站点：\n' +
        (list.map((s) => `  - ${s.name}  (${s.custom_domain || s.url})`).join('\n') || '  （一个都没有）'),
    );
  }
  siteId = hit.id;
  console.log(`  匹配到：${hit.name} — ${hit.custom_domain || hit.url}  (id ${hit.id})`);
}

// 2. Walk the artifact and hash everything.
const files = {};
let bytes = 0;
const walk = (dir, prefix) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = prefix + '/' + e.name;
    if (e.isDirectory()) walk(abs, rel);
    else {
      const buf = fs.readFileSync(abs);
      bytes += buf.length;
      files[rel] = crypto.createHash('sha1').update(buf).digest('hex');
    }
  }
};
walk(DIST, '');
const count = Object.keys(files).length;
console.log(`→ 产物 ${count} 个文件 / ${(bytes / 1024 / 1024).toFixed(2)} MB`);

// 3. Create the deploy. Draft by default so gficcrew.com is untouched.
console.log(`→ 创建${PROD ? '生产' : '草稿'}部署…`);
const deploy = await api('POST', `/sites/${siteId}/deploys`, { files, draft: !PROD });
const needed = new Set(deploy.required || []);
console.log(`  ${needed.size === 0 ? '没有新文件要传（内容与上次一致）' : '需要上传 ' + needed.size + ' 个文件'}`);

// 4. Upload only what Netlify asked for. The API addresses files by sha1, so map back.
if (needed.size) {
  let sent = 0;
  for (const [rel, sha] of Object.entries(files)) {
    if (!needed.has(sha)) continue;
    await api('PUT', `/deploys/${deploy.id}/files${rel}`, fs.readFileSync(path.join(DIST, rel)), true);
    sent += 1;
    if (sent % 10 === 0 || sent === needed.size) console.log(`  已上传 ${sent}/${needed.size}`);
  }
}

// 5. Wait for it to go live.
process.stdout.write('→ 等待 Netlify 处理');
for (let i = 0; i < 60; i += 1) {
  const d = await api('GET', `/deploys/${deploy.id}`);
  if (d.state === 'ready') {
    console.log('\n\n✓ 部署完成');
    // Careful: on a deploy-preview, ssl_url is still the site's own domain. The
    // unique preview lives in deploy_ssl_url. Printing ssl_url here would claim
    // gficcrew.com had changed when it had not.
    const preview = d.deploy_ssl_url || d.deploy_url;
    console.log('  部署上下文：' + (d.context || '?') + '   state=' + d.state);
    console.log('  预览地址：' + preview);
    if (PROD) {
      console.log('  生产域名：' + (d.ssl_url || 'https://gficcrew.com/'));
    } else {
      console.log('  ⚠️ deploy-preview 上下文，gficcrew.com 没有任何变化。确认无误后再跑 --prod。');
      console.log('  ⚠️ 该预览受 Netlify Edge Access 保护，匿名访问会 401 跳到 app.netlify.com；');
      console.log('     要肉眼检查请登录 Netlify 后打开，或直接看 Deploys 页面里的文件清单。');
    }
    process.exit(0);
  }
  if (d.state === 'error') die('Netlify 处理失败，state=error。到 Netlify 的 Deploys 页面看详情。');
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, 2000));
}
die('等了 2 分钟还没 ready，到 Netlify 的 Deploys 页面看状态。');
