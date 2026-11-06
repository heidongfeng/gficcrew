#!/usr/bin/env node
// Pulls the current content straight out of the cloud database and writes it as
// content-export.json, i.e. exactly the file the admin's "导出内容 JSON" button produces.
// This removes the manual download step from the publish pipeline.
//
//   node scripts/pull-content.mjs
//
// The admin password is read from $GFIC_ADMIN_PW, else from ./.adminpw (git-ignored).
// Exit codes: 0 = pulled, 1 = failed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';

const root = path.resolve(import.meta.dirname, '..');
const ENDPOINT = 'https://gficcrew.app.workbuddy.host';
const PUBLISHABLE_KEY = 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum';

// Same order as the admin sidebar, and the same keys import-content.mjs expects.
const COLLECTIONS = ['site', 'contact', 'cities', 'events', 'faq', 'plans', 'guides'];

function readPassword() {
  if (process.env.GFIC_ADMIN_PW) return process.env.GFIC_ADMIN_PW;
  const file = path.join(root, '.adminpw');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return '';
}

const password = readPassword();
if (!password) {
  console.error('缺少后台口令：设置环境变量 GFIC_ADMIN_PW，或在项目根目录放一个 .adminpw 文件。');
  process.exit(1);
}

const cloud = createWorkBuddyCloud({ endpoint: ENDPOINT, publishableKey: PUBLISHABLE_KEY });

// 1. Log in once, before touching any collection.
//
// cms_list returns a flat "unauthorized" for a wrong password, and the previous
// version surfaced that as seven separate "读取失败" lines -- which reads like the
// network or the database is broken, when the actual cause is a stale .adminpw.
// Worse, every collection that still succeeded would be written as if the pull had
// worked. A single cms_login up front turns that into one unambiguous message.
//
// Careful: cms_login locks the account for 15 minutes after 5 bad attempts, so this
// check must not be retried in a loop.
const login = await cloud.database.rpc('cms_login', { p_password: password });
if (login.error || login.data !== true) {
  const reason = login.error?.message || (login.data !== true ? `返回值 ${JSON.stringify(login.data)}` : '');
  console.error(`\n✗ 登录被拒：${reason}`);
  console.error('  项目根目录 .adminpw 里的口令很可能已过期（后台点「改口令」后本地不会自动同步）。');
  console.error('  更新该文件后重试；连续 5 次失败会锁定 15 分钟，别反复试。');
  process.exit(1);
}
console.log('登录成功，开始拉取：');

const out = {};
let failed = 0;
for (const collection of COLLECTIONS) {
  const { data, error } = await cloud.database.rpc('cms_list', {
    p_password: password,
    p_collection: collection,
  });
  if (error) {
    console.error(`  ${collection.padEnd(10)} 读取失败：${error.message || error}`);
    failed += 1;
    continue;
  }
  const rows = Array.isArray(data) ? data : [];
  out[collection] = rows;
  console.log(`  ${collection.padEnd(10)} ${rows.length} 条`);
}

if (failed) {
  console.error(`\n有 ${failed} 个集合读取失败，未写入 content-export.json。`);
  process.exit(1);
}

const json = JSON.stringify(out, null, 2) + '\n';
const target = path.join(root, 'content-export.json');
fs.writeFileSync(target, json, 'utf8');

const hash = crypto.createHash('md5').update(json).digest('hex');
fs.mkdirSync(path.join(root, '.state'), { recursive: true });
fs.writeFileSync(path.join(root, '.state', 'pulled-content-hash'), hash, 'utf8');

console.log(`\n已写入 content-export.json（${Math.round(json.length / 1024)} KB，md5 ${hash.slice(0, 12)}）`);
console.log('下一步：npm run content:import && npm run build:all');
