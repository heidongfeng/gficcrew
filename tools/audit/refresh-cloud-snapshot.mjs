#!/usr/bin/env node
/**
 * 重新抓取云端契约快照里的「集合条数」，让 cloud-contract 检查器不会拿旧数字报警。
 *
 * 为什么单独做个工具：tools/audit/fixtures/cloud-schema.json 是人工抓取的离线快照，
 * 里面记着各集合的文档数。云端条数一变（比如删掉一批活动），检查器就会报
 * 「云端 N 条，src/data 里 M 条」。fixture 自己的注释写得很清楚：
 *   「任何一项与线上不符时，先重新抓取本文件 —— 不要直接改这里的值去迁就代码。」
 * 手改数字正是注释禁止的做法，所以走脚本从线上重新数一遍。
 *
 * 只覆盖 collections / collectionsNote / _refresh.capturedAt 三项；
 * 表结构、RLS、函数签名、口令策略这些靠云控制台核对，脚本不动。
 *
 * 用法：node tools/audit/refresh-cloud-snapshot.mjs [--write]
 *   不带 --write 只打印线上条数与差异。
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const WRITE = process.argv.includes('--write');
const SNAPSHOT = path.join(root, 'tools/audit/fixtures/cloud-schema.json');

const pw = process.env.GFIC_ADMIN_PW || fs.readFileSync(path.join(root, '.adminpw'), 'utf8').trim();
const cloud = createWorkBuddyCloud({
  endpoint: 'https://gficcrew.app.workbuddy.host',
  publishableKey: 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum',
});

const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const collections = Object.keys(snap.collections);

const live = {};
let failed = 0;
for (const c of collections) {
  const { data, error } = await cloud.database.rpc('cms_list', { p_password: pw, p_collection: c });
  if (error) {
    console.error(`  ${c.padEnd(10)} 读取失败：${error.message || error}`);
    failed += 1;
    continue;
  }
  live[c] = (data || []).length;
  const old = snap.collections[c];
  const flag = old === live[c] ? '  ' : '→ ';
  console.log(`  ${flag}${c.padEnd(10)} 快照 ${String(old).padStart(2)} → 线上 ${String(live[c]).padStart(2)}`);
}
if (failed) {
  console.error(`\n有 ${failed} 个集合读取失败，未改动快照。`);
  process.exit(1);
}

const changed = Object.keys(live).filter((c) => live[c] !== snap.collections[c]);
console.log(`\n变化：${changed.length ? changed.join(', ') : '无'}`);

if (!WRITE) {
  console.log('（dry-run，未落盘。加 --write 才写入快照）');
  process.exit(0);
}

const total = Object.values(live).reduce((a, b) => a + b, 0);
const today = new Date().toISOString().slice(0, 10);
snap.collections = live;
snap.collectionsNote =
  `cms_docs 共 ${total} 条 = 上表之和。` +
  `各集合条数：CITIES ${live.cities} / EVENTS ${live.events} / FAQ ${live.faq} / PLANS ${live.plans} / GUIDES ${live.guides}。` +
  `${today} 重新抓取：删除了全部虚构活动（EVENTS ${snap.collections.events === 0 ? '15→0' : '变化'}），其余集合条数未变。`;
snap._refresh.capturedAt = `2026-10-04（当日四次：02:26 初始、02:55 改完 RLS/KDF、13:00 Golden Week FAQ 30→35、${today} 清空虚构活动后重抓）`;

fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2) + '\n', 'utf8');
console.log(`\n✓ 已更新 ${path.relative(root, SNAPSHOT)}`);
console.log('下一步：node tools/audit/run.mjs cloud-contract');
