/**
 * 一次性脚本：把本地压缩版二维码（public/wechat-qr.png，24KB）写回云端 cms_docs 的
 * contact 集合 wechatQr 字段，根治「content:import 用旧 206KB 图覆盖」的坑。
 *
 * 用法：node scripts/_fix-qr-to-cloud.mjs [--write]
 * 不带 --write 只预览（打印新旧体积、是否一致）；带 --write 才真正 cms_save。
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

const newPng = fs.readFileSync(path.join(root, 'public', 'wechat-qr.png'));
const newB64 = 'data:image/png;base64,' + newPng.toString('base64');

const { data: remote, error } = await rpc('cms_list', { p_password: pw, p_collection: 'contact' });
if (error) throw new Error('cms_list contact: ' + error.message);
const r = remote[0];
if (!r) throw new Error('云端 contact 集合为空');

const old = r.data.wechatQr || '';
const oldBytes = old.startsWith('data:image/png;base64,')
  ? Buffer.from(old.slice('data:image/png;base64,'.length), 'base64')
  : Buffer.alloc(0);

console.log(`云端旧图：${old ? (oldBytes.length / 1024).toFixed(1) : 0} KB`);
console.log(`本地新图：${(newPng.length / 1024).toFixed(1)} KB`);

if (old === newB64) {
  console.log('⏭  云端 wechatQr 已是压缩版，无需写入');
  process.exit(0);
}

if (!WRITE) {
  console.log('\n（dry-run，加 --write 才执行 cms_save。即将把 wechatQr 替换为压缩版。）');
  process.exit(0);
}

const nextData = { ...r.data, wechatQr: newB64 };
const { error: se } = await rpc('cms_save', {
  p_password: pw,
  p_collection: 'contact',
  p_doc_id: r.docId,
  p_data: nextData,
  p_sort_order: r.sortOrder,
});
if (se) throw new Error(`cms_save contact/${r.docId}: ${se.message}`);
console.log(`✓ 已写入云端 contact.wechatQr（docId=${r.docId}，${(newPng.length / 1024).toFixed(1)} KB 压缩版）`);
