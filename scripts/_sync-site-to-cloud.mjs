/**
 * 一次性脚本：把 src/data/generated/site.json 的内容写回云端 cms_docs 的 site 集合。
 * site 是单 doc（docId = "main"）。
 *
 * 用法：node scripts/_sync-site-to-cloud.mjs [--write]
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

const local = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'generated', 'site.json'), 'utf8'));
const { data: remote, error } = await rpc('cms_list', { p_password: pw, p_collection: 'site' });
if (error) throw new Error('cms_list site: ' + error.message);

const r = remote[0];
if (!r) throw new Error('云端 site 集合为空');

const same = JSON.stringify(local) === JSON.stringify(r.data);
if (same) {
  console.log('⏭  云端 site 与本地一致，无需写入');
  process.exit(0);
}

// 差异定位
const keys = [...new Set([...Object.keys(local), ...Object.keys(r.data)])];
const diffKeys = keys.filter((k) => JSON.stringify(local[k]) !== JSON.stringify(r.data[k]));
console.log(`本地 site 与云端差异字段：${diffKeys.join(', ') || '（无）'}`);

if (WRITE) {
  const { error: se } = await rpc('cms_save', {
    p_password: pw, p_collection: 'site', p_doc_id: r.docId, p_data: local, p_sort_order: r.sortOrder,
  });
  if (se) throw new Error(`cms_save site/${r.docId}: ${se.message}`);
  console.log('✓ 已写入云端 site（docId=' + r.docId + '）');
} else {
  console.log('（dry-run，加 --write 才执行）');
}
