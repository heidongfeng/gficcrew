/**
 * 把本次「真实性改写」的结果写回云端 cms_docs。
 *
 * 为什么必须做：云端是唯一 source of truth，generated 优先。本地改完不写回，
 * 下一次 content:pull（每 6 小时一班）会把云端旧内容原样覆盖回来 ——
 * 15 场虚构活动、14 个城市分部、编出来的租金金额都会复活。
 *
 * 匹配规则一律用**内容键**而不是下标：云端与本地的顺序可能不同，下标会改错条目。
 *   cities  → docId === slug
 *   guides  → docId === slug
 *   plans   → docId === id
 *   faq     → data.q === q
 *   site / contact → 该集合只有一条文档
 *   events  → 全部删除（15 条都是虚构的）
 *
 * 用法：node scripts/_sync-truth-to-cloud.mjs [--write]
 *   不带 --write 只对比预览。
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

// Same slug rule the admin uses for FAQ docIds, kept here so ids match either way round.
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

const gen = (f) => JSON.parse(fs.readFileSync(path.join(root, 'src/data/generated', f), 'utf8'));
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

const problems = [];
let changed = 0;
let unchanged = 0;

/**
 * 逐条对比并（可选）写回。
 *
 * keyOf 给出人类可读的定位键；match 用内容键匹配云端（不能用下标，顺序可能不同）。
 * idOf 可选：给了才允许「本地有、云端没有」的条目新增进来。没给的话缺失仍然报错，
 * 因为集合里突然多出一条往往是我们改错了东西，不该静默通过。
 */
async function sync({ collection, local, keyOf, match, idOf, nextSort, note }) {
  const remote = await list(collection);
  console.log(`\n=== ${collection} ===  本地 ${local.length} 条 ｜ 云端 ${remote.length} 条`);
  // 新增条目必须拿到互不相同的 sortOrder。全部给同一个值的话，cms_list 碰到并列会按自己的
  // 顺序返回，下次 pull 回来的顺序就跟本地不一样了 —— FAQ 页面的顺序会毫无理由地来回变。
  let inserted = 0;
  for (const item of local) {
    const key = keyOf(item);
    const hits = remote.filter((r) => match(r, item));
    if (hits.length === 0 && idOf) {
      const docId = idOf(item);
      if (!docId) {
        problems.push(`${collection}: 「${key}」无法生成 docId，已跳过`);
        continue;
      }
      const sortOrder = nextSort(remote, item) + inserted;
      console.log(`  ＋ 新增 ${docId}  · ${String(key).slice(0, 46)}  (sortOrder ${sortOrder})`);
      if (WRITE) await save(collection, docId, item, sortOrder);
      inserted += 1;
      changed += 1;
      continue;
    }
    if (hits.length !== 1) {
      problems.push(`${collection}: 「${key}」在云端匹配到 ${hits.length} 条（应为 1）`);
      continue;
    }
    const r = hits[0];
    // 以云端 data 为底，整体用本地覆盖：本次是整段改写，且本地字段集与云端一致。
    const merged = { ...item };
    const same = JSON.stringify(merged) === JSON.stringify(r.data);
    if (same) {
      unchanged += 1;
      continue;
    }
    console.log(`  ✎ ${docLabel(r, key)}${note ? '  ' + note(item) : ''}`);
    if (WRITE) await save(collection, r.docId, merged, r.sortOrder);
    changed += 1;
  }
}
const docLabel = (r, key) => `${r.docId || '(单文档)'}  ${key ? '· ' + String(key).slice(0, 46) : ''}`;

// ---------------------------------------------------------------- 各集合
await sync({
  collection: 'cities',
  local: gen('cities.json'),
  keyOf: (c) => c.slug,
  match: (r, c) => r.docId === c.slug,
});

// 2026-10-08：绝对化用语清理把一条 FAQ 的问题标题从「the best area」问法改成中性问法。
// 云端那一行的 data.q 仍是旧值，只按新 q 匹配会「匹配不到 → 当成新条目插入」，
// 结果旧行变成孤儿、FAQ 页多出一条。这张对照表让「旧 q」也能配上本地条目，
// 随后 save 会把新 q 写进同一行（docId 保持旧 slug，不影响匹配）。
const FAQ_Q_RENAMES = new Map([
  ['What is the best area to live in Guangzhou as an expat?', 'Where do expats usually live in Guangzhou?'],
]);

await sync({
  collection: 'faq',
  local: gen('faq.json'),
  keyOf: (f) => f.q,
  match: (r, f) => r.data && (r.data.q === f.q || FAQ_Q_RENAMES.get(r.data.q) === f.q),
  // 与后台一致：新增一条 FAQ 时 docId 由问题标题生成（见 admin.astro 的 slugify(d.q)）。
  idOf: (f) => slugify(f.q),
  nextSort: (remote) => Math.max(0, ...remote.map((r) => r.sortOrder || 0)) + 1,
});

await sync({
  collection: 'plans',
  local: gen('plans.json').plans,
  keyOf: (p) => p.id,
  match: (r, p) => r.docId === p.id,
});

await sync({
  collection: 'guides',
  local: gen('guides.json'),
  keyOf: (g) => g.slug,
  match: (r, g) => r.docId === g.slug,
});

// 单文档集合：整份替换
for (const [collection, file] of [
  ['site', 'site.json'],
  ['contact', 'contact.json'],
]) {
  const local = gen(file);
  const remote = await list(collection);
  console.log(`\n=== ${collection} ===  云端 ${remote.length} 条（整份替换）`);
  if (remote.length !== 1) {
    problems.push(`${collection}: 云端有 ${remote.length} 条文档（应为 1）`);
    continue;
  }
  const r = remote[0];
  if (JSON.stringify(local) === JSON.stringify(r.data)) {
    unchanged += 1;
    console.log('  ⏭ 无变化');
    continue;
  }
  const diffKeys = Object.keys({ ...local, ...r.data }).filter(
    (k) => JSON.stringify(local[k]) !== JSON.stringify(r.data[k]),
  );
  console.log(`  ✎ ${r.docId || '(单文档)'}  变更字段：${diffKeys.join(', ')}`);
  if (WRITE) await save(collection, r.docId, local, r.sortOrder);
  changed += 1;
}

// ---------------------------------------------------------------- events：全部删除
{
  const remote = await list('events');
  const local = gen('events.json');
  console.log(`\n=== events ===  本地 ${local.length} 条 ｜ 云端 ${remote.length} 条`);
  if (local.length !== 0) {
    problems.push(`events: 本地仍有 ${local.length} 条，本脚本只做清空，请先确认`);
  } else {
    for (const r of remote) {
      console.log(`  🗑 删除 ${r.docId} — ${(r.data && r.data.title) || '(无标题)'}`);
      if (WRITE) {
        const { error } = await rpc('cms_delete', {
          p_password: pw,
          p_collection: 'events',
          p_doc_id: r.docId,
        });
        if (error) problems.push(`cms_delete events/${r.docId}: ${error.message}`);
      }
      changed += 1;
    }
  }
}

// ---------------------------------------------------------------- 报告
console.log('\n================ 汇总 ================');
console.log(`${WRITE ? '已写入' : '待写入'}：${changed} 条 ｜ 无变化：${unchanged} 条`);
if (problems.length) {
  console.log('\n❌ 有问题，需先解决：');
  problems.forEach((p) => console.log('   ✗ ' + p));
  process.exit(1);
}
if (!WRITE) console.log('\n（dry-run，未写云端。加 --write 才执行）');
else console.log('\n✓ 云端已同步。下一班 content:pull 不会再覆盖本次改写。');
