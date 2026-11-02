/**
 * 一次性脚本：把「品牌/描述类」文案里的 `national WeChat group` 统一为 `national group`。
 *
 * 背景（2026-10-06 老郑拍板）：他连改两版首页介绍，特意去掉 “WeChat” → 品牌口径不再点名微信。
 * 但他只要改**品牌/描述类**，**报名指引类保留**（点名「微信群」对新人更直观）。
 *
 * 改（品牌/描述类）：
 *   src/data/site.js             SITE.description（进 meta / llms-full）
 *   src/data/faq.js              #9「What is GFIC Crew?」+ #24「Which cities does GFIC Crew cover?」（q 不动）
 *   src/pages/events.astro       lead
 *   src/pages/cities/index.astro JSON-LD description + 页面 lead + 一处注释
 *   src/pages/llms.txt.ts        llms
 *   src/data/generated/site.json （生效副本）
 *   src/data/generated/faq.json  （生效副本）
 *
 * 保留（报名指引类，本脚本**不碰**）：
 *   src/data/cities.js           POPUP_NOTE（“the fastest way in … message us”）
 *   src/data/contact.js          meetNote（“the fastest way in”）
 *   src/pages/guides/index.astro （“still join us through … Tell us which one you need”）
 *   src/data/generated/contact.json
 *
 * 用法：node scripts/_apply-national-group.mjs [--write] [--no-cloud]
 *   默认 dry-run 只预览；--write 写本地 + 云端；--no-cloud 只写本地。
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const NO_CLOUD = process.argv.includes('--no-cloud');
const FROM = 'national WeChat group';
const TO = 'national group';

const FILES = [
  'src/data/site.js',
  'src/data/faq.js',
  'src/pages/events.astro',
  'src/pages/cities/index.astro',
  'src/pages/llms.txt.ts',
  'src/data/generated/site.json',
  'src/data/generated/faq.json',
];

console.log('== 本地：改（品牌/描述类）==');
let total = 0;
for (const rel of FILES) {
  const p = path.join(root, rel);
  const before = fs.readFileSync(p, 'utf8');
  const n = before.split(FROM).length - 1;
  total += n;
  if (n === 0) {
    console.log(`  –   ${rel}（无匹配）`);
    continue;
  }
  console.log(`  ✎   ${rel}  ×${n}`);
  if (WRITE) fs.writeFileSync(p, before.split(FROM).join(TO));
}
console.log(`  小计 ${total} 处 → ${WRITE ? '已写入' : '（dry-run，加 --write 才执行）'}`);

console.log('== 本地：保留（报名指引类，须仍含原短语）==');
const KEEP = [
  'src/data/cities.js',
  'src/data/contact.js',
  'src/pages/guides/index.astro',
  'src/data/generated/contact.json',
];
for (const rel of KEEP) {
  const t = fs.readFileSync(path.join(root, rel), 'utf8');
  const ok = t.includes(FROM);
  console.log(`  ${ok ? '🔒' : '⚠️'}  ${rel}  ${ok ? '仍含原短语（符合预期）' : '没有原短语（检查是否被误改）'}`);
}

// ---------------------------------------------------------------- 云端
if (NO_CLOUD) {
  console.log('（--no-cloud，跳过云端）');
  process.exit(0);
}

const pw =
  process.env.GFIC_ADMIN_PW || fs.readFileSync(path.join(root, '.adminpw'), 'utf8').trim();
const cloud = createWorkBuddyCloud({
  endpoint: 'https://gficcrew.app.workbuddy.host',
  publishableKey: 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum',
});
const rpc = (name, args) => cloud.database.rpc(name, args);

const replaceDeep = (v) =>
  typeof v === 'string'
    ? v.split(FROM).join(TO)
    : Array.isArray(v)
      ? v.map(replaceDeep)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceDeep(x)]))
        : v;
// 忽略键序的比对（云端会重排对象键，严格 stringify 会常报假差异）
const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;

async function list(collection) {
  const { data, error } = await rpc('cms_list', { p_password: pw, p_collection: collection });
  if (error) throw new Error(`cms_list ${collection}: ${error.message}`);
  return data || [];
}
async function save(collection, docId, data, sortOrder) {
  const { error } = await rpc('cms_save', {
    p_password: pw,
    p_collection: collection,
    p_doc_id: docId,
    p_data: data,
    p_sort_order: sortOrder || 0,
  });
  if (error) throw new Error(`cms_save ${collection}/${docId}: ${error.message}`);
}

console.log('== 云端 cms_docs ==');
for (const collection of ['site', 'faq']) {
  const rows = await list(collection);
  let hit = 0;
  for (const r of rows) {
    const next = replaceDeep(r.data);
    if (JSON.stringify(canon(next)) === JSON.stringify(canon(r.data))) continue;
    hit += 1;
    const label = collection === 'faq' ? String(r.data.q).slice(0, 55) : r.docId;
    console.log(`  ☁   ${collection}/${label} 需更新`);
    if (WRITE) await save(collection, r.docId, next, r.sortOrder);
  }
  console.log(`  ${collection}：${hit} 条需要更新`);
}
console.log(WRITE ? '✓ 云端已同步' : '（云端 dry-run）');
