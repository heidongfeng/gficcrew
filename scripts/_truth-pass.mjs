/**
 * 一次性脚本：把站上「我编出来的事实」改回真实。
 *
 * 背景（2026-10-04 老郑亲口确认，这是唯一事实来源）：
 *   1. 没有 14 个城市分部 —— 只有广州、深圳能落地线下活动，其他城市没有工作人员，
 *      但可以建线上社群，并且有全国群（任何城市都能加入）。
 *   2. 15 场活动全都不存在，目前刚起步。
 *   3. 三档会员价格是以后要执行的标准，退款条款可以承诺，但目前所有群免费加入。
 *   4. 「24 小时内回复」「活动前一天拉群」真实可兑现；看房这类活动外的线下服务没有，
 *      那些只是群内纯线上交流。
 *   5. 城市生活成本里的具体金额也是生成的 —— 改成不带数字的相对表述。
 *
 * 为什么必须同时改 generated 和 .js 兜底：
 *   数据是 generated-first，generated/*.json 每 6 小时被 content:pull 覆盖，
 *   而 src/data/*.js 的 LOCAL_* 只在快照缺失时生效。两边不一致时，
 *   页面看起来是干净的（generated 生效），只有兜底真正生效那一刻才现形，且不报错。
 *   审计的 text-claims 会比对两端，所以必须同步。
 *
 * 用法：node scripts/_truth-pass.mjs [--write]
 *   不带 --write 只预览。幂等：重复跑结果相同。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// ---------------------------------------------------------------- 城市：去掉具体金额
//
// 原来的 livingNote 每条都带「RMB x,000–y,000」，那是生成出来的，无从核实。
// 改成相对表述：只说与一线城市的相对高低 + 聚居区，信息量还在，但不会给错数字。
const LIVING_NOTES = {
  guangzhou:
    'Living costs sit in the mid range for a Chinese first-tier city, noticeably below Beijing and Shanghai. Yuexiu, Tianhe and Zhujiang New Town are where most newcomers start looking.',
  shanghai:
    'The most expensive city on this list, especially inside the inner ring. Expect to pay a premium for space and for international schooling.',
  beijing:
    'Pricier than most of China, though a little below Shanghai. Chaoyang and Dongcheng are the long-established expat districts.',
  shenzhen:
    'Close to Beijing on cost and rising fast, with Nanshan and Futian the most popular districts.',
  chengdu:
    'One of the most affordable big cities in China, with a slower pace and a food scene people move here for.',
  hangzhou:
    'Cheaper than Shanghai but not cheap, and popular with tech professionals.',
  chongqing:
    'Among the most affordable major cities, with low rents and a distinctive local food culture.',
  suzhou:
    'Moderate costs, a short train ride from Shanghai, with a large manufacturing and expat base.',
  qingdao:
    'Moderate for a coastal city, busy in summer, with a long-standing Korean community.',
  xian: 'Affordable by first-tier standards, with a large student population and deep history.',
  tianjin: 'Moderate costs, and a short train ride from Beijing.',
  xiamen: 'Moderate for a coastal city with a mild climate and a noticeably relaxed pace.',
  guilin: 'One of the cheapest cities here, known for scenery rather than for salaries.',
  yunnan:
    'Costs vary between Kunming, Dali and Lijiang, but all three sit well below the first tier.',
};

// ---------------------------------------------------------------- FAQ：按题干匹配后替换
//
// 用题干子串定位而不是数组下标 —— generated 与兜底的顺序可能不同，下标会改错条目。
// newA 里凡是涉及城市、频次、服务的，一律按老郑给的口径写。
const FAQ_EDITS = [
  {
    match: 'What is GFIC Crew (GFIC歪果社)?',
    newA:
      'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China, started by locals who know the country well. We are an events crew first: the meetups we are building fall into three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — with language exchange and cultural workshops alongside. We meet up in person in Guangzhou and Shenzhen, and anyone else in China can join our online groups and national WeChat group. We are small and growing, and every group is free to join right now.',
  },
  {
    match: 'Is GFIC Crew active in Guangzhou?',
    newA:
      'Yes. Guangzhou is our home base and the city where we can actually meet up in person. Alongside Shenzhen it is where we run offline meetups, and it is where our longest-running local knowledge sits — the Guangzhou living guide on this site covers visas, housing, banking, healthcare and getting around.',
  },
  {
    match: 'Which cities does GFIC Crew cover?',
    newA:
      'We run offline meetups in Guangzhou and Shenzhen, which is where we have people on the ground. Everywhere else in China you can still join us: our online groups and our national WeChat group are open to expats in any city, and that is where most of the day-to-day conversation, questions and event announcements happen. If your city grows a group of its own, we will build it out from there.',
  },
  {
    match: 'What kind of events does GFIC Crew organize?',
    newA:
      'Three main formats, with a couple of things running alongside. Social mixers and parties: potlucks, casual bar nights and rooftop meetups. Food crawls and dining: street-food walks, hotpot nights and dumpling-making sessions. Hiking and city walks: weekend hikes and walks through older neighbourhoods. Alongside those we plan language exchange and cultural workshops such as calligraphy and tea. Exact plans get announced inside the groups — we are still small, so what runs depends on who is around.',
  },
  {
    match: 'How often are events held?',
    newA:
      'We are just getting started, so there is no fixed schedule yet. Meetups are announced inside the WeChat groups as they are confirmed, and we add people to the event group the day before each one. Guangzhou and Shenzhen are where in-person meetups happen first; other cities join in through the online and national groups until a local group forms.',
  },
  {
    match: 'How do I sign up for an event?',
    newA:
      'Add us on WeChat (DN8117) and tell us you want to join. Meetups are announced in the groups rather than on a public calendar, and we add you to the event group the day before it happens. Every group is free to join right now.',
  },
  {
    match: 'What is the difference between the National Group, City Group and Business Group?',
    newA:
      'The National Group (RMB 288) is the nationwide community: online groups and event announcements, open wherever you are in China. A City Group (RMB 688) adds the local group for your city and its local knowledge. The Business Group (RMB 2,888) adds business networking and visibility for your own projects within the crew. These are our membership tiers for when paid membership opens — every group is free to join right now.',
  },
  {
    match: 'How much does rent cost in Guangzhou?',
    newA:
      'It depends heavily on district. Zhujiang New Town is the modern, most expensive option; Tianhe and Yuexiu give you more space for less; Haizhu and Panyu are cheaper again. Rather than trust a number on a website, ask inside the group — members post what they actually pay, and that changes faster than any guide.',
  },
  {
    match: 'National Day Golden Week',
    newA:
      'During National Day Golden Week (October 1-7) major attractions are extremely crowded and hotel prices spike. For expats already living in China, staying local usually beats travelling: neighbourhood restaurants stay open, and small parks and lesser-known districts are quiet. It is a good week to ask the group what everyone is doing — plenty of members are around and not travelling.',
  },
];

// ---------------------------------------------------------------- 工具

const problems = [];

/** 把 generated 里的数组写回 .js 兜底的具名常量，保持两端逐字一致。 */
function mirrorArrayConst(relJs, constName, items, toLines) {
  const jsPath = path.join(root, relJs);
  const js = fs.readFileSync(jsPath, 'utf8');
  const startMarker = `const ${constName} = [`;
  const start = js.indexOf(startMarker);
  const end = js.indexOf('\n];\n', start);
  if (start < 0 || end < 0) {
    problems.push(`找不到 ${constName} 的数组边界，未改 ${relJs}`);
    return;
  }
  const body =
    items.length === 0
      ? ''
      : '\n' + items.map((it) => toLines(it).join('\n')).join('\n') + '\n';
  const rebuilt = js.slice(0, start) + `const ${constName} = [` + body + js.slice(end + 1);
  fs.writeFileSync(jsPath, rebuilt, 'utf8');
  console.log(`✓ ${relJs}（${constName} 兜底，${items.length} 条）`);
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

// ---------------------------------------------------------------- 1. 城市
const citiesPath = 'src/data/generated/cities.json';
const cities = readJson(citiesPath);
const outCities = cities.map((c) => {
  const note = LIVING_NOTES[c.slug];
  if (!note) {
    problems.push(`城市 ${c.slug} 没有对应的新 livingNote`);
    return c;
  }
  if (/\d/.test(note)) problems.push(`${c.slug}: 新 livingNote 仍含数字`);
  return { ...c, livingNote: note };
});
const digitsLeft = outCities.filter((c) => /\d/.test(c.livingNote)).length;
console.log(`\n=== 城市 ===\n共 ${outCities.length} 城，改写后仍含数字的：${digitsLeft} 条`);

// ---------------------------------------------------------------- 2. 活动：清空
// 注意：generated 为空数组时 EVENTS 会回落到 LOCAL_EVENTS，所以两端都必须清空，
// 否则删了个寂寞 —— 兜底里那 15 场会在快照缺失时原样回来。
const outEvents = [];
console.log(`\n=== 活动 ===\n清空 ${readJson('src/data/generated/events.json').length} 场虚构活动 → 0`);

// ---------------------------------------------------------------- 3. FAQ
const faqPath = 'src/data/generated/faq.json';
const faq = readJson(faqPath);
const usedMatches = new Set();
const outFaq = faq.map((item) => {
  const edit = FAQ_EDITS.find((e) => item.q.includes(e.match));
  if (!edit) return item;
  usedMatches.add(edit.match);
  if (/\d{1,3},\d{3}/.test(edit.newA) && !edit.match.includes('National Group')) {
    problems.push(`FAQ「${edit.match}」的新答案里仍带大额数字`);
  }
  return { ...item, a: edit.newA };
});
for (const e of FAQ_EDITS) {
  if (!usedMatches.has(e.match)) problems.push(`FAQ 未匹配到题干：${e.match}`);
}
console.log(`\n=== FAQ ===\n共 ${faq.length} 条，改写 ${usedMatches.size} 条`);

// ---------------------------------------------------------------- 自检
console.log('\n=== 残留问题自检 ===');
const staleClaims = [];
const scan = (label, text) => {
  if (/14 city chapters|14 Chinese cities|most active chapter|pop-up chapters/i.test(text))
    staleClaims.push(`${label}: 仍有「14 城/分部」类表述`);
  if (/(apartment|house) (hunting|viewing)|lease negotiation|licence conversion|pet relocation/i.test(text))
    staleClaims.push(`${label}: 仍有线下服务承诺`);
};
outCities.forEach((c) => scan(`city:${c.slug}`, `${c.blurb} ${c.livingNote} ${c.tagline}`));
outFaq.forEach((f) => scan(`faq:${f.q.slice(0, 30)}`, f.a));
[...staleClaims, ...problems].forEach((p) => console.log('   ✗ ' + p));
if (!staleClaims.length && !problems.length) console.log('   ✓ 未发现残留的分部/线下服务承诺');

if (staleClaims.length || problems.length) {
  console.log('\n❌ 自检不通过，未落盘。');
  process.exit(1);
}

if (!WRITE) {
  console.log('\n（dry-run，未落盘。加 --write 才写入）');
  process.exit(0);
}

// ---------------------------------------------------------------- 落盘
fs.writeFileSync(path.join(root, citiesPath), JSON.stringify(outCities, null, 2) + '\n', 'utf8');
console.log(`\n✓ ${citiesPath}`);
mirrorArrayConst('src/data/cities.js', 'LOCAL_CITIES', outCities, (c) => {
  const lines = ['  {', `    slug: ${q(c.slug)},`, `    name: ${q(c.name)},`, `    province: ${q(c.province)},`];
  if (c.priority) lines.push('    priority: true,');
  if (c.tagline) lines.push(`    tagline: ${q(c.tagline)},`);
  lines.push(`    blurb: ${q(c.blurb)},`);
  lines.push('    highlights: [');
  c.highlights.forEach((h) => lines.push(`      ${q(h)},`));
  lines.push('    ],');
  lines.push(`    livingNote: ${q(c.livingNote)},`);
  lines.push('  },');
  return lines;
});

fs.writeFileSync(path.join(root, 'src/data/generated/events.json'), '[]\n', 'utf8');
console.log('✓ src/data/generated/events.json');
mirrorArrayConst('src/data/events.js', 'LOCAL_EVENTS', [], () => []);

fs.writeFileSync(path.join(root, faqPath), JSON.stringify(outFaq, null, 2) + '\n', 'utf8');
console.log(`✓ ${faqPath}`);
mirrorArrayConst('src/data/faq.js', 'LOCAL_FAQ', outFaq, (f) => [
  '  {',
  `    category: ${q(f.category)},`,
  `    q: ${q(f.q)},`,
  `    a: ${q(f.a)},`,
  '  },',
]);

console.log('\n✓ 全部落盘。下一步：同步到云端 cms_docs，否则 6 小时后的 content:pull 会全部冲掉。');
