/**
 * 一次性脚本：把 5 条国庆 Golden Week FAQ 加进云端 cms_docs（唯一真实来源）。
 *
 * 为什么要走云端：FAQ 是 generated-first，云端是唯一 source of truth。
 * 只改 src/data/faq.js 或 generated/faq.json 会在下一次 content:pull / 后台编辑时被覆盖。
 *
 * 用法：node scripts/_add-golden-week-faq.mjs
 * 幂等：题目或 docId 已存在就跳过（可重复跑）。
 *
 * 已执行记录：2026-10-04 13:00 写入云端 faq 集合，sortOrder 38–42，
 * docId = what-to-do-in-china-during-national-day-golden-week 等 5 条语义化 slug。
 * 执行后云端 faq 30 → 35 条，已同步 content:pull → content:import → faq.js 兜底。
 * 审核意见与改写依据见 docs/faq-golden-week-review.md。
 */
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
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

const CATEGORY = 'Living in China — Daily Life';

// docId 用语义化 slug（与既有 30 条同风格），不用序号 —— 既有的都是
// `what-is-gfic-crew-gfic` / `do-i-need-a-wechat-account-to-join` 这种。
const NEW_FAQ = [
  {
    docId: 'what-to-do-in-china-during-national-day-golden-week',
    category: CATEGORY,
    q: 'What should expats do in China during National Day Golden Week?',
    a: 'During National Day Golden Week (October 1–7), major tourist attractions are extremely crowded and hotel prices spike. For expats already living in China, staying local usually beats travelling: neighborhood restaurants stay open, and small parks and lesser-known districts are quiet. GFIC Crew keeps running community events through the holiday — language exchanges, food crawls and cultural workshops — across its 14 city chapters, with Guangzhou the most active.',
  },
  {
    docId: 'is-golden-week-a-good-time-to-visit-china',
    category: CATEGORY,
    q: 'Is it a good time for foreigners to visit China during Golden Week?',
    a: 'Golden Week is one of the busiest travel periods in China: trains, flights and hotels book out weeks ahead, and the first and last days are the worst. If you are already living here, the crowds are a good reason to stay local and join community events instead. If you are planning a first visit, the two weeks after October 8 are far more comfortable, and you will find the local groups easier to reach too.',
  },
  {
    docId: 'what-is-open-and-closed-in-china-during-national-day',
    category: CATEGORY,
    q: 'What is open and closed in China during National Day?',
    a: 'Most restaurants, shopping malls, convenience stores and supermarkets stay open through the holiday, and public transport runs as usual. Some government offices, banks and administrative services may close or run reduced hours, and many businesses shift their rest days around the first week. If you rely on a specific service, check its holiday notice a few days ahead — and for anything time-sensitive, start it before the break rather than during it.',
  },
  {
    docId: 'how-to-avoid-crowds-in-china-during-october-holiday',
    category: CATEGORY,
    q: 'How can I avoid crowds in China during October holiday?',
    a: 'Avoid major tourist landmarks on peak days. Choose lesser-known destinations such as smaller museums, local parks, or historic neighborhoods. If you are in Guangzhou, explore areas beyond Tianhe and Yuexiu, try local markets, or join small-group community events. GFIC Crew events are often smaller and more relaxed than typical tourist activities.',
  },
  {
    docId: 'can-foreigners-join-local-events-during-golden-week',
    category: CATEGORY,
    q: 'Can foreigners join local events in China during Golden Week?',
    a: 'Yes. Many local communities and expat groups organize events during Golden Week, and holidays are often when people have the most free time. GFIC Crew regularly hosts language exchanges, food crawls, cultural workshops and social meetups during holiday periods. Search "GFIC Crew" on WeChat Official Account (GFIC Crew), WeChat Channels, Xiaohongshu, Instagram, YouTube or X to find events near you. WeChat: DN8117.',
  },
];

const docs = await list('faq');
const existingQ = new Set(docs.map((d) => String((d.data && d.data.q) || '').trim()));
const existingId = new Set(docs.map((d) => String(d.docId || '')));
// sortOrder 接在现有最大值之后（现有最大 37，历史上有空洞，不能用 docs.length 推）。
const maxOrder = docs.reduce((m, d) => Math.max(m, Number(d.sortOrder) || 0), -1);
console.log(`云端现有 FAQ：${docs.length} 条，当前最大 sortOrder = ${maxOrder}`);

let added = 0;
let skipped = 0;
let order = maxOrder;
for (const item of NEW_FAQ) {
  if (existingQ.has(item.q.trim())) {
    console.log(`  ⏭  已存在（题目重复），跳过：${item.q}`);
    skipped++;
    continue;
  }
  if (existingId.has(item.docId)) {
    console.log(`  ⏭  已存在（docId 重复），跳过：${item.docId}`);
    skipped++;
    continue;
  }
  order += 1;
  await save('faq', item.docId, { category: item.category, q: item.q, a: item.a }, order);
  console.log(`  ✓ 已添加 [sort=${order}] ${item.docId}`);
  added++;
}

console.log(`\n完成：新增 ${added} 条，跳过 ${skipped} 条。`);
