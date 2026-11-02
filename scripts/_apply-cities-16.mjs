/**
 * 一次性脚本：把 src/data/generated/cities.json 的 16 城写回云端 cms_docs 的 cities 集合。
 *
 * 背景（2026-10-08）：老郑决定城市数统一为「写了 16、也列了 16」。
 * 站上把 yunnan 一条拆成 kunming / dali / lijiang 三条（14 - 1 + 3 = 16），
 * 同时按品牌知识库把优先城市从「广州/上海/北京/深圳」改成「广州/上海/深圳/成都」。
 *
 * 与 _sync-cities-to-cloud.mjs 的区别：那个脚本要求两端条数一致、只合并不增删；
 * 这个脚本要新增 3 条 doc、删除 1 条 doc，所以单独写。
 *
 * 用法：node scripts/_apply-cities-16.mjs [--write]
 * 幂等：内容相同则跳过。
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const pw = process.env.GFIC_ADMIN_PW || fs.readFileSync(path.join(root, '.adminpw'), 'utf8').trim();

const cloud = createWorkBuddyCloud({
  endpoint: 'https://gficcrew.app.workbuddy.host',
  publishableKey: 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum',
});
const rpc = (name, args) => cloud.database.rpc(name, args);

const local = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'generated', 'cities.json'), 'utf8'));
const { data: remote, error } = await rpc('cms_list', { p_password: pw, p_collection: 'cities' });
if (error) throw new Error('cms_list cities: ' + error.message);

const byId = new Map(remote.map((d) => [d.docId, d]));
const localIds = new Set(local.map((c) => c.slug));

console.log(`本地 cities：${local.length} 条 ｜ 云端 cities：${remote.length} 条\n`);

let changed = 0;
let skipped = 0;
const problems = [];

// --- 1. 新增 / 更新 ---------------------------------------------------------
for (const [i, city] of local.entries()) {
  const r = byId.get(city.slug);
  // 以本地对象为准整条写入（云端键序会重排，比对时忽略键序）
  const norm = (o) => JSON.stringify(o, Object.keys(o || {}).sort());
  const same = r && JSON.stringify(r.data) === JSON.stringify(city);

  if (same) {
    console.log(`  ⏭  ${city.slug} 无变化`);
    skipped++;
    continue;
  }

  const action = r ? '更新' : '新增';
  console.log(`  ✎  ${action} ${city.slug}  sortOrder=${i}  priority=${city.priority ? 'true' : '-'}`);
  if (WRITE) {
    const { error: se } = await rpc('cms_save', {
      p_password: pw,
      p_collection: 'cities',
      p_doc_id: city.slug,
      p_data: city,
      p_sort_order: i,
    });
    if (se) problems.push(`cms_save cities/${city.slug}: ${se.message}`);
  }
  changed++;
  void norm;
}

// --- 2. 删除本地已不存在的条目 ----------------------------------------------
for (const r of remote) {
  if (localIds.has(r.docId)) continue;
  console.log(`  🗑  删除 ${r.docId}（本地已无此城市）`);
  if (WRITE) {
    const { error: de } = await rpc('cms_delete', {
      p_password: pw,
      p_collection: 'cities',
      p_doc_id: r.docId,
    });
    if (de) problems.push(`cms_delete cities/${r.docId}: ${de.message}`);
  }
  changed++;
}

console.log(`\n${WRITE ? '已写入' : '待写入'}：${changed} 条 ｜ 无变化：${skipped} 条`);
if (!WRITE) console.log('（dry-run，未写云端。加 --write 才执行）');
if (problems.length) {
  console.error('\n❌ 有失败：');
  problems.forEach((p) => console.error('   ' + p));
  process.exit(1);
}
