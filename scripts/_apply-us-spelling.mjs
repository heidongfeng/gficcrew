/**
 * 一次性脚本：把 `organise` 词族的英式拼写统一为美式（-ise → -ize）。
 *
 * 背景（2026-10-06 老郑批准）：全站主用美式（organized / organizational / Organization / organizing），
 * 但有 4 处内容仍是英式，统一掉：
 *   src/data/site.js        culture 服务 summary  "need organising"   → organizing
 *   src/data/site.js        FORMAT_TIERS T2 note   "more organised"   → organized
 *   src/data/guangzhou.js   guide 段落              "take more organising" → organizing
 *   src/data/guangzhou.js   guide 段落              "trouble to organise"  → organize
 *   （generated/site.json、generated/guides.json 是生效副本，同步改写）
 *
 * 注意：**只动 organise 词族**，不碰 centre / neighbour / licence / travell / recognise
 * （那是另一批，老郑尚未批准）。admin.astro 里 organisation(s) 是代码注释，不动。
 *
 * 用法：node scripts/_apply-us-spelling.mjs [--write] [--no-cloud]
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const NO_CLOUD = process.argv.includes('--no-cloud');

// 长的先替换（organisations 含 organisation；organising/organised 不含 organise，需各自列出）
const PAIRS = [
  ['organisations', 'organizations'],
  ['organisation', 'organization'],
  ['organising', 'organizing'],
  ['organised', 'organized'],
  ['organiser', 'organizer'],
  ['organise', 'organize'],
];

const FILES = [
  'src/data/site.js',
  'src/data/guangzhou.js',
  'src/data/generated/site.json',
  'src/data/generated/guides.json',
];

const applyPairs = (s) => {
  let out = s;
  for (const [from, to] of PAIRS) out = out.split(from).join(to);
  return out;
};

console.log('== 本地 ==');
let total = 0;
for (const rel of FILES) {
  const p = path.join(root, rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = applyPairs(before);
  // 顺序累加计数（organised 含 organise 子串，直接对原串求和会重复计）
  let cur = before;
  let diffs = 0;
  for (const [f, t] of PAIRS) {
    diffs += cur.split(f).length - 1;
    cur = cur.split(f).join(t);
  }
  total += diffs;
  if (diffs === 0) {
    console.log(`  –   ${rel}（无匹配）`);
    continue;
  }
  console.log(`  ✎   ${rel}  ×${diffs}`);
  if (WRITE) fs.writeFileSync(p, after);
}
console.log(`  小计 ${total} 处 → ${WRITE ? '已写入' : '（dry-run）'}`);

// 保险：不该被动的词族必须原样保留
console.log('== 未纳入本批（须仍在）==');
for (const w of ['centre', 'neighbour', 'licence', 'travell', 'recognis']) {
  const hits = FILES.reduce(
    (acc, rel) =>
      acc + (fs.readFileSync(path.join(root, rel), 'utf8').split(w).length - 1),
    0,
  );
  console.log(`  ${hits > 0 ? '🔒' : '⚠️'}  ${w}：${hits} 处`);
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
    ? applyPairs(v)
    : Array.isArray(v)
      ? v.map(replaceDeep)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceDeep(x)]))
        : v;
const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;

console.log('== 云端 cms_docs ==');
for (const collection of ['site', 'guides']) {
  const { data: rows, error } = await rpc('cms_list', { p_password: pw, p_collection: collection });
  if (error) throw new Error(`cms_list ${collection}: ${error.message}`);
  let hit = 0;
  for (const r of rows || []) {
    const next = replaceDeep(r.data);
    if (JSON.stringify(canon(next)) === JSON.stringify(canon(r.data))) continue;
    hit += 1;
    console.log(`  ☁   ${collection}/${r.docId} 需更新`);
    if (WRITE) {
      const { error: se } = await rpc('cms_save', {
        p_password: pw,
        p_collection: collection,
        p_doc_id: r.docId,
        p_data: next,
        p_sort_order: r.sortOrder,
      });
      if (se) throw new Error(`cms_save ${collection}/${r.docId}: ${se.message}`);
    }
  }
  console.log(`  ${collection}：${hit} 条需要更新`);
}
console.log(WRITE ? '✓ 完成' : '（dry-run，加 --write 才执行）');
