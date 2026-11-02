/**
 * 一次性脚本：把 src/data/generated/cities.json 的 14 城内容写回云端 cms_docs 的 cities 集合。
 *
 * 为什么必须写云端：内容 generated-first，云端是唯一 source of truth。
 * 只改本地 .json / .js，下一次 content:pull 会把云端旧内容覆盖回来。
 *
 * 关键：保留云端既有的 docId 与 sortOrder（不新建、不重排），只更新 data 体内
 * 的 blurb / highlights（以及需要时的 tagline）。
 *
 * 用法：node scripts/_sync-cities-to-cloud.mjs [--write]
 *   不带 --write 只对比预览；带 --write 才 cms_save。
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

const local = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'generated', 'cities.json'), 'utf8'));
const remote = await list('cities');

console.log(`本地 cities：${local.length} 条 ｜ 云端 cities：${remote.length} 条`);
if (local.length !== remote.length) {
  console.error('❌ 条数不一致，先核对再同步。');
  process.exit(1);
}

const byId = new Map(remote.map((d) => [d.docId, d]));
let changed = 0;
let skipped = 0;

for (const city of local) {
  const r = byId.get(city.slug);
  if (!r) {
    console.error(`❌ 云端找不到 docId=${city.slug}`);
    process.exit(1);
  }
  // 以云端 data 为基准，只覆盖本次要改的字段，避免丢掉云端可能有的其它键。
  const merged = { ...r.data, blurb: city.blurb, highlights: city.highlights };
  if (city.tagline !== undefined) merged.tagline = city.tagline;

  const same = JSON.stringify(merged) === JSON.stringify(r.data);
  if (same) {
    console.log(`  ⏭  ${city.slug} 无变化`);
    skipped++;
    continue;
  }
  const hlDelta = (city.highlights || []).length - (r.data.highlights || []).length;
  console.log(`  ✎  ${city.slug}  highlights ${(r.data.highlights || []).length} → ${city.highlights.length} (${hlDelta >= 0 ? '+' : ''}${hlDelta})  sortOrder=${r.sortOrder}`);
  if (WRITE) {
    await save('cities', city.slug, merged, r.sortOrder);
  }
  changed++;
}

console.log(`\n${WRITE ? '已写入' : '待写入'}：${changed} 条 ｜ 无变化：${skipped} 条`);
if (!WRITE) console.log('（dry-run，未写云端。加 --write 才执行）');
