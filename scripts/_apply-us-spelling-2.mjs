/**
 * 一次性脚本（第 2 批）：把剩余英式拼写统一为美式。
 *
 * 背景（2026-10-08 老郑「一起发」＝先统一、再一起上线）：
 * 第 1 批已处理 `organise` 词族（见 `_apply-us-spelling.mjs`）。本批处理其余 9 组，
 * **只改用户可见文案**，不动任何代码注释（`about.astro` / `guide-codec.js` / `admin.astro` 里的注释保持原样）。
 *
 * 本批处理的 9 组词：
 *   centre → center ｜ travell → travel ｜ labell → label ｜ judgement → judgment
 *   neighbour → neighbor ｜ licence → license ｜ practise → practice
 *   recognis → recogniz ｜ prioritis → prioritiz
 *
 * 用户可见改动位置：
 *   cities.js        centre ×5（centred on the city centre / the centre of / The centre is compact / pedestrian centre ×2）
 *   faq.js           travellers / labelled ×2 / non-judgemental / travelling + neighbourhood
 *   site.js          driving licence / to practise Chinese / centrepiece / recognise ×2
 *   guangzhou.js     Driving licence / neighbourhood
 *   cities/index.astro  prioritise
 *   + generated/{site,faq,cities,guides}.json 同步
 *
 * 用法：node scripts/_apply-us-spelling-2.mjs [--write] [--no-cloud]
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const NO_CLOUD = process.argv.includes('--no-cloud');

// 顺序：先长后短，避免子串互相吃掉
const PAIRS = [
  ['centre', 'center'], // centred→centered, centres→centers, centrepiece→centerpiece
  ['travell', 'travel'], // travellers→travelers, travelling→traveling
  ['labell', 'label'], // labelled→labeled
  ['judgement', 'judgment'], // non-judgemental→non-judgmental
  ['neighbour', 'neighbor'], // neighbourhood→neighborhood
  ['licence', 'license'], // driving licence→driving license
  ['practise', 'practice'],
  ['recognis', 'recogniz'], // recognise→recognize
  ['prioritis', 'prioritiz'], // prioritise→prioritize
];

const FILES = [
  'src/data/cities.js',
  'src/data/faq.js',
  'src/data/site.js',
  'src/data/guangzhou.js',
  'src/pages/cities/index.astro',
  'src/data/generated/site.json',
  'src/data/generated/faq.json',
  'src/data/generated/cities.json',
  'src/data/generated/guides.json',
];

// 明确不动（代码注释）
const UNTOUCHED = ['src/pages/about.astro', 'src/scripts/guide-codec.js', 'src/pages/admin.astro'];

const applyPairs = (s) => {
  let out = s;
  for (const [from, to] of PAIRS) out = out.split(from).join(to);
  return out;
};

console.log('== 本地（用户可见文案）==');
let total = 0;
for (const rel of FILES) {
  const p = path.join(root, rel);
  const before = fs.readFileSync(p, 'utf8');
  let cur = before;
  let n = 0;
  for (const [f, t] of PAIRS) {
    n += cur.split(f).length - 1;
    cur = cur.split(f).join(t);
  }
  total += n;
  if (n === 0) {
    console.log(`  –   ${rel}（无匹配）`);
    continue;
  }
  console.log(`  ✎   ${rel}  ×${n}`);
  if (WRITE) fs.writeFileSync(p, cur);
}
console.log(`  小计 ${total} 处 → ${WRITE ? '已写入' : '（dry-run）'}`);

console.log('== 明确不动（代码注释，须保留英式）==');
for (const rel of UNTOUCHED) {
  const t = fs.readFileSync(path.join(root, rel), 'utf8');
  const hits = PAIRS.reduce((a, [f]) => a + (t.split(f).length - 1), 0);
  console.log(`  ${hits > 0 ? '🔒' : '–'}  ${rel}：${hits} 处`);
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
for (const collection of ['site', 'faq', 'cities', 'guides']) {
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
