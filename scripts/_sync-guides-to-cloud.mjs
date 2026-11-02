/**
 * 一次性脚本：把 src/data/generated/guides.json 的内容写回云端 cms_docs 的 guides 集合。
 *
 * 用法：node scripts/_sync-guides-to-cloud.mjs [--write]
 * 幂等：内容相同则跳过。保留云端既有 docId 与 sortOrder。
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

const local = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'generated', 'guides.json'), 'utf8'));
const { data: remote, error } = await rpc('cms_list', { p_password: pw, p_collection: 'guides' });
if (error) throw new Error('cms_list guides: ' + error.message);

console.log(`本地 guides：${local.length} 条 ｜ 云端 guides：${remote.length} 条`);

const byId = new Map(remote.map((d) => [d.docId, d]));
let changed = 0;
for (const g of local) {
  const r = byId.get(g.slug);
  if (!r) { console.error(`❌ 云端找不到 docId=${g.slug}`); process.exit(1); }
  // 以云端 data 为基准，只覆盖本地存在的键（云端可能有额外字段）
  const merged = { ...r.data, ...g };
  const same = JSON.stringify(merged) === JSON.stringify(r.data);
  if (same) { console.log(`  ⏭  ${g.slug} 无变化`); continue; }
  console.log(`  ✎  ${g.slug}（sections=${g.sections.length}）sortOrder=${r.sortOrder}`);
  if (WRITE) {
    const { error: se } = await rpc('cms_save', {
      p_password: pw, p_collection: 'guides', p_doc_id: g.slug, p_data: merged, p_sort_order: r.sortOrder,
    });
    if (se) throw new Error(`cms_save guides/${g.slug}: ${se.message}`);
  }
  changed++;
}
console.log(`\n${WRITE ? '已写入' : '待写入'}：${changed} 条`);
if (!WRITE) console.log('（dry-run，加 --write 才执行）');
