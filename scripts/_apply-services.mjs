/**
 * 一次性脚本：把 src/data/site.js 的 LOCAL_SERVICES（四大服务）同步进
 * src/data/generated/site.json 的 services，以及云端 cms_docs 的 site 单 doc。
 *
 * 背景（2026-10-06 老郑）：四项服务重排为
 *   1 Organization of Social Activities
 *   2 Cultural Experience Activities
 *   3 Chinese Language Exchange and Learning
 *   4 Daily Crew Communication
 * 并把第 1 点按最新社群介绍（首页 brand intro）写丰富。
 *
 * 顺序即渲染顺序：首页 /about/ 的 01–04 编号、about 的 JSON-LD ItemList、llms-full 都按数组顺序。
 *
 * 用法：node scripts/_apply-services.mjs [--write] [--no-cloud]
 *   默认 dry-run；--write 写 generated + 云端。
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const NO_CLOUD = process.argv.includes('--no-cloud');

// ---- 1) 从 site.js 取 LOCAL_SERVICES（纯字面量，安全 eval） ----
const siteSrc = fs.readFileSync(path.join(root, 'src/data/site.js'), 'utf8');
const m = siteSrc.match(/const LOCAL_SERVICES = (\[[\s\S]*?\n\]);/);
if (!m) {
  console.error('❌ 找不到 LOCAL_SERVICES 数组');
  process.exit(1);
}
const services = eval(m[1]);
console.log(`LOCAL_SERVICES ${services.length} 项，顺序：`);
services.forEach((s, i) => console.log(`  ${i + 1}. ${s.title}  (${s.id})`));

// ---- 2) 写 generated/site.json 的 services ----
const genPath = path.join(root, 'src/data/generated/site.json');
const gen = JSON.parse(fs.readFileSync(genPath, 'utf8'));
const before = JSON.stringify(gen.services);
const after = JSON.stringify(services);
if (before === after) {
  console.log('generated/site.json services 已一致，无需写入');
} else {
  console.log('generated/site.json services 有差异');
  if (WRITE) {
    gen.services = services;
    fs.writeFileSync(genPath, JSON.stringify(gen, null, 2) + '\n');
    console.log('  ✓ 已写入 generated/site.json');
  }
}

// ---- 3) 云端 site 单 doc ----
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

// 忽略键序的比对（云端会重排对象键）
const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;

const { data: rows, error } = await rpc('cms_list', {
  p_password: pw,
  p_collection: 'site',
});
if (error) throw new Error('cms_list site: ' + error.message);
const r = (rows || [])[0];
if (!r) throw new Error('云端 site 集合为空');

const next = { ...r.data, services };
if (JSON.stringify(canon(next)) === JSON.stringify(canon(r.data))) {
  console.log('云端 site.services 已一致，无需写入');
} else {
  console.log('云端 site.services 有差异');
  if (WRITE) {
    const { error: se } = await rpc('cms_save', {
      p_password: pw,
      p_collection: 'site',
      p_doc_id: r.docId,
      p_data: next,
      p_sort_order: r.sortOrder,
    });
    if (se) throw new Error(`cms_save site/${r.docId}: ${se.message}`);
    console.log('  ✓ 已写入云端 site（docId=' + r.docId + '）');
  }
}
console.log(WRITE ? '✓ 完成' : '（dry-run，加 --write 才执行）');
