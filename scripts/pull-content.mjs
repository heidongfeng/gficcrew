#!/usr/bin/env node
// Pulls the current content from OUR OWN server (gficcrew.cn) and writes it as
// content-export.json, i.e. exactly the file the admin's "导出内容 JSON" button
// produces. This removes the manual download step from the publish pipeline.
//
//   node scripts/pull-content.mjs
//
// The read-only export token is read from $GFIC_EXPORT_TOKEN, else from
// ./.export-token (git-ignored). The URL defaults to the production export
// endpoint and can be overridden with $GFIC_EXPORT_URL for local testing.
//
// Rollback: GFIC_CONTENT_SOURCE=cloud node scripts/pull-content.mjs
// switches back to the legacy WorkBuddy cloud source. That path needs the old
// admin password and only works while the cloud service is still enabled.
//
// Exit codes: 0 = pulled, 1 = failed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const COLLECTIONS = ['site', 'contact', 'cities', 'events', 'faq', 'plans', 'guides'];

const requestedSource = (process.env.GFIC_CONTENT_SOURCE || '').toLowerCase();

// 切换期保护：服务器接口还没部署、导出 token 还没配置时，本机如果还留着旧云端
// 口令，就继续走云端，并明确打印出来。否则每次定时发布都会因为"新接口还没上线"
// 而红一次。等 token 配好，这个分支自然不再触发。
const hasLegacyPassword = Boolean(process.env.GFIC_ADMIN_PW) || fs.existsSync(path.join(root, '.adminpw'));
const hasExportToken = Boolean(process.env.GFIC_EXPORT_TOKEN) || fs.existsSync(path.join(root, '.export-token'));
const useCloud = requestedSource === 'cloud' || (!requestedSource && !hasExportToken && hasLegacyPassword);

if (useCloud) {
  console.log('使用旧云端数据源（回滚路径）：未配置自有接口的导出 token。');
  console.log('  服务器部署完成后，把导出 token 写入 .export-token 或 GFIC_EXPORT_TOKEN 即自动切换。');
  await import('./pull-content-cloud.mjs');
  process.exit(0);
}

const EXPORT_URL = process.env.GFIC_EXPORT_URL || 'https://gficcrew.cn/api/export.php';

function readToken() {
  if (process.env.GFIC_EXPORT_TOKEN) return process.env.GFIC_EXPORT_TOKEN.trim();
  const file = path.join(root, '.export-token');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return '';
}

const token = readToken();
if (!token) {
  console.error('缺少内容导出 token：设置环境变量 GFIC_EXPORT_TOKEN，或在项目根目录放一个 .export-token 文件。');
  console.error('token 在服务器 /www/gfic-data/config.php 的 exportToken 字段里（只读权限，不是后台口令）。');
  process.exit(1);
}

const url = new URL(EXPORT_URL);
url.searchParams.set('token', token);

let response;
try {
  response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
} catch (error) {
  console.error(`\n✗ 无法连接内容接口 ${url.origin}${url.pathname}：${error.message}`);
  console.error('  本地构建需要能访问 gficcrew.cn；CI 里失败则检查服务器是否在线。');
  process.exit(1);
}

if (!response.ok) {
  console.error(`\n✗ 内容接口返回 HTTP ${response.status}`);
  if (response.status === 403) {
    console.error('  导出 token 不对。它跟后台口令是两个不同的值，别混用。');
  }
  console.error('  本次未写入 content-export.json，构建会继续使用上一次拉取的内容。');
  process.exit(1);
}

let data;
try {
  data = await response.json();
} catch {
  console.error('\n✗ 内容接口返回的不是 JSON，已中止。');
  process.exit(1);
}

// 导出接口直接返回未包装的完整数据。这里先做结构校验，避免接口异常时把
// 一份残缺数据写进 content-export.json，再被构建成"看起来正常"的线上页面。
const problems = [];
for (const collection of COLLECTIONS) {
  if (!Array.isArray(data?.[collection])) {
    problems.push(`${collection} 缺失或不是数组`);
  }
}
if (problems.length) {
  console.error(`\n✗ 数据结构不完整：${problems.join('；')}`);
  console.error('  未写入 content-export.json。');
  process.exit(1);
}

const out = {};
const counts = [];
for (const collection of COLLECTIONS) {
  out[collection] = data[collection];
  counts.push(`${collection.padEnd(10)} ${data[collection].length} 条`);
}
console.log(`从 ${url.origin} 拉取成功：`);
for (const line of counts) console.log(`  ${line}`);

const json = JSON.stringify(out, null, 2) + '\n';
const target = path.join(root, 'content-export.json');
fs.writeFileSync(target, json, 'utf8');

const hash = crypto.createHash('md5').update(json).digest('hex');
fs.mkdirSync(path.join(root, '.state'), { recursive: true });
fs.writeFileSync(path.join(root, '.state', 'pulled-content-hash'), hash, 'utf8');

console.log(`\n已写入 content-export.json（${Math.round(json.length / 1024)} KB，md5 ${hash.slice(0, 12)}）`);
console.log('下一步：npm run content:import && npm run build:all');
