/**
 * 第二批真实性改写：清掉「我们有 14 个城市分部 / 我们提供线下服务」这类口径，
 * 并把城市成本里的具体金额换成相对表述。
 *
 * 和第一批的区别：第一批是整段重建（城市 livingNote、活动、FAQ），
 * 这一批是**定点字符串替换**，所以能同时作用在 generated JSON 和 .js 兜底上 ——
 * 两端是逐字镜像的，替换同一段文本即可保持同步，不必再重排数组。
 *
 * 事实陈述 vs 服务承诺（老郑 2026-10-04 口径，也是合规判据）：
 *   指南里讲「怎么租房、驾照怎么换」= 事实，保留；
 *   「我们帮你找房 / 帮你谈 lease」= 服务承诺，删。
 *   所以这里改的是**动词**：把「我们提供」改成「大家在群里聊」。
 *
 * 金额只删**城市成本**类，会员价格（288 / 688 / 2888）保留 ——
 * 那是老郑确认过的未来执行标准，不是编出来的。
 *
 * 用法：node scripts/_truth-pass2.mjs [--write]
 *   不带 --write 只预览。幂等：跑第二遍应报告「合计 0 处替换」。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

/** .js 里字符串是单引号包裹的，内部单引号写成 \'；JSON 里是字面的。 */
const js = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------------------------------------------------------------- 替换表
const REPS = [
  // ============ 站点定位：这是最要紧的两段，直接进 meta description 和 JSON-LD ============
  [
    'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China. Founded by passionate locals who know every corner of this country, we are dedicated to helping global friends live a fun, connected, and hassle-free life here. We are currently active in Beijing, Shanghai, Guangzhou, Shenzhen, Chengdu, and other cities, and we organize regular real-world events in three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — plus language exchange and cultural workshops. No lonely expat life here. This is your crew.',
    'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China. Founded by locals who know the country well, we are dedicated to helping global friends live a fun, connected, and hassle-free life here. We meet up in person in Guangzhou and Shenzhen, and expats anywhere in China can join our online groups and national WeChat group. Our events fall into three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — plus language exchange and cultural workshops. No lonely expat life here. This is your crew.',
  ],
  [
    'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China. Founded by locals who know every corner of the country, we help global friends live a fun, connected and hassle-free life here. We are an events crew first, and our activities fall into three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — alongside language exchange and cultural workshops across Beijing, Shanghai, Guangzhou, Shenzhen, Chengdu and 9 more cities.',
    'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China, founded by locals who know the country well. We meet up in person in Guangzhou and Shenzhen, and we run online groups plus a national WeChat group that expats in any Chinese city can join. Our events fall into three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — alongside language exchange and cultural workshops.',
  ],
  // ============ 首页：城市口径 + 会员「现在免费」 ============
  [
    '{cityCount} cities across China. Guangzhou is our home base and the most active chapter.',
    '{cityCount} cities covered by guides and online groups. Guangzhou and Shenzhen are where we meet in person.',
  ],
  [
    'One payment, no subscription. Your first week is refundable.',
    'Every group is free to join right now — paid membership has not opened yet. When it does, it is one payment with no subscription, and your first week is refundable.',
  ],
  // ============ 服务清单：从「我们提供」改成「大家在群里聊」 ============
  [
    'Online groups and forums that act as the go-to lifeline for expat daily life in China — housing, healthcare, banking, mobile payments and everything in between.',
    'Online groups where expats swap first-hand answers about daily life in China — housing, healthcare, banking, mobile payments and everything in between. Peer advice from people who have already done it, not a service desk.',
  ],
  [
    'Healthcare: international clinics and health insurance',
    'Healthcare: comparing international clinics and health insurance with people who use them',
  ],
  [
    'Housing: apartment hunting and lease negotiation',
    'Housing: comparing districts, rents and lease terms before you sign',
  ],
  [
    'Banking and mobile payments: setting up WeChat Pay and Alipay',
    'Banking and mobile payments: walking each other through WeChat Pay and Alipay setup',
  ],
  [
    'Driving licence conversion and pet relocation',
    'Other paperwork people get stuck on: driving licence conversion and moving pets',
  ],
  [
    'Unlock practical living guides: housing assistance, healthcare navigation, banking setups and mobile payment tutorials for all our service cities.',
    'Unlock practical living guides on renting, healthcare, banking setups and mobile payments, written from first-hand experience.',
  ],
  [
    'Enjoy a calendar of regular events across multiple cities — there is always a new adventure waiting with your crew.',
    'Meet up in person in Guangzhou and Shenzhen, or join the conversation from anywhere in China through our online and national groups.',
  ],
  // ============ 会员档位 ============
  [
    'Event announcements for all 14 service cities',
    'Event announcements for Guangzhou, Shenzhen and the national group',
  ],
  [
    'Dedicated city chapter with its own weekly and monthly events',
    'Dedicated city group with local meetups and local knowledge',
  ],
  [
    'Local housing and healthcare support from people in your city',
    'Local knowledge on renting, healthcare and getting around, shared by people in your city',
  ],
  [
    'One city chapter, all local events. The plan most members choose — Guangzhou first.',
    'One city group, with local meetups and local knowledge. Guangzhou first.',
  ],
  // ============ 广州城市卡片：不再自称「最活跃分部」 ============
  [
    'Guangzhou is where GFIC Crew is most active, and it is one of the most expat-friendly cities in China',
    'Guangzhou is our home base, and it is one of the most expat-friendly cities in China',
  ],
  [
    'with language exchange and badminton running alongside them all week.',
    'with language exchange and badminton in the mix.',
  ],
  // ============ 不在广深也能加入 ============
  [
    'We also maintain pop-up chapters and organize trips to other expat-frequented destinations across China.',
    'Outside Guangzhou and Shenzhen, the national WeChat group is the fastest way in: it is open wherever you are in China.',
  ],
  // ============ 广州指南：去掉编出来的城市成本金额 ============
  [
    'Guangzhou is our home base and the city where GFIC Crew is most active.',
    'Guangzhou is our home base and the city we know best.',
  ],
  [
    'A single expat typically spends RMB 6,000–10,000 per month including rent, food, transport and social life. A modern one-bedroom in Zhujiang New Town costs RMB 4,000–7,000 per month, and a serious local meal costs RMB 20–40.',
    'A single expat can live comfortably here on a mid-range budget. Rent is the biggest variable by far, while food, transport and eating out all cost noticeably less than in Beijing or Shanghai.',
  ],
  [
    'A modern one-bedroom in Zhujiang New Town costs RMB 4,000–7,000 per month. Cantonese food is widely considered the best regional cuisine in China and costs RMB 20–40 for a serious meal.',
    'Rent in Zhujiang New Town is the biggest line in your budget. Cantonese food, widely considered the best regional cuisine in China, is cheap enough to eat out often.',
  ],
  [
    'Zhujiang New Town: RMB 4,000–7,000 for a modern one-bedroom',
    'Zhujiang New Town: the most expensive option, modern one-bedrooms in the CBD',
  ],
  [
    'Tianhe or Yuexiu: RMB 3,000–5,500 for a comparable apartment',
    'Tianhe or Yuexiu: noticeably less for a comparable apartment',
  ],
  ['Haizhu: RMB 2,500–4,500, greener and quieter', 'Haizhu: cheaper again, greener and quieter'],
  ['Shared flat room: RMB 1,500–2,800', 'Shared flat room: the cheapest way to start out'],
  [
    'Budget an extra RMB 400–800 per month for management fees, internet and utilities',
    'Budget extra each month for management fees, internet and utilities',
  ],
  [
    'Expect to pay two months deposit plus one month rent in advance, and to sign a one-year lease.',
    'Expect to pay a deposit of a couple of months rent plus rent in advance, and to sign a one-year lease.',
  ],
  [
    'the same apartment can vary in price by 20 percent depending on who you rent through.',
    'the same apartment can vary in price quite a bit depending on who you rent through.',
  ],
  [
    'Keep RMB 1,000–2,000 in cash for the first week before everything is verified',
    'Keep some cash on hand for the first week before everything is verified',
  ],
  [
    'For routine care, private clinics cost RMB 300–800 per visit out of pocket; serious treatment at a public hospital is far cheaper but involves more paperwork and less English.',
    'For routine care, private clinics charge a consultation fee out of pocket; serious treatment at a public hospital is far cheaper but involves more paperwork and less English.',
  ],
  [
    'with most central journeys costing RMB 2–8.',
    'with most central journeys costing only a few yuan.',
  ],
  ['Metro: RMB 2–8 per trip, English signage throughout', 'Metro: a few yuan per trip, English signage throughout'],
];

// generated（原始文本）与 .js 兜底（单引号转义）两份，外加只在代码端存在的常量
const FILES = [
  { p: 'src/data/generated/site.json', json: true },
  { p: 'src/data/site.js', json: false },
  { p: 'src/data/generated/plans.json', json: true },
  { p: 'src/data/plans.js', json: false },
  { p: 'src/data/generated/cities.json', json: true },
  { p: 'src/data/cities.js', json: false },
  { p: 'src/data/generated/contact.json', json: true },
  { p: 'src/data/contact.js', json: false },
  { p: 'src/data/generated/guides.json', json: true },
  { p: 'src/data/guides.js', json: false },
  // 指南正文的兜底其实在 guangzhou.js（guides.js 只是 import GUIDE_SECTIONS），必须一起改
  { p: 'src/data/guangzhou.js', json: false },
];

// 只在代码端存在的常量：generated 里没有对应字段，没法镜像
const CODE_ONLY = [
  {
    file: 'src/data/cities.js',
    old: `export const POPUP_NOTE =
  'We also maintain pop-up chapters and organize trips to other expat-frequented destinations across China. If your city is not listed, message us and we will connect you with the nearest crew.';`,
    new: `export const POPUP_NOTE =
  'Wherever you are in China, you can join our national WeChat group: that is where announcements, questions and day-to-day conversation happen. If your city is not listed, message us and we will point you to the right group.';`,
  },
  {
    file: 'src/data/schema.js',
    old: `memberOf: { '@type': 'Organization', name: 'GFIC Crew city chapters' }`,
    new: `memberOf: { '@type': 'Organization', name: 'GFIC Crew' }`,
  },
];

// ---------------------------------------------------------------- 执行
const orig = new Map();
for (const f of FILES) orig.set(f.p, fs.readFileSync(path.join(root, f.p), 'utf8'));
const next = new Map(orig);

const perFile = new Map();
const hit = (p) => perFile.set(p, (perFile.get(p) || 0) + 1);

for (const [oldStr, newStr] of REPS) {
  for (const f of FILES) {
    const src = f.json ? oldStr : js(oldStr);
    const dst = f.json ? newStr : js(newStr);
    const text = next.get(f.p);
    const n = text.split(src).length - 1;
    if (n === 0) continue;
    hit(f.p);
    next.set(f.p, text.split(src).join(dst));
  }
}

for (const c of CODE_ONLY) {
  const text = next.get(c.file) ?? fs.readFileSync(path.join(root, c.file), 'utf8');
  const n = text.split(c.old).length - 1;
  if (n > 0) {
    hit(c.file);
    next.set(c.file, text.split(c.old).join(c.new));
  }
}

// ---------------------------------------------------------------- 报告
console.log('\n=== 各文件替换数 ===');
for (const [k, v] of [...perFile.entries()].sort()) console.log(`  ${String(v).padStart(2)} 处  ${k}`);
const total = [...perFile.values()].reduce((a, b) => a + b, 0);
console.log(`  合计 ${total} 处`);

// 一条替换如果在所有文件里都没命中，说明替换表写错了（比如原文有细微出入），必须报出来
const dead = REPS.filter(([oldStr]) => {
  for (const f of FILES) if (orig.get(f.p).includes(f.json ? oldStr : js(oldStr))) return false;
  for (const c of CODE_ONLY) if ((orig.get(c.file) ?? '').includes(c.old)) return false;
  return true;
});
console.log('\n=== 完全没命中的替换（必须为空）===');
if (dead.length === 0) console.log('   ✓ 每条替换都命中了');
else dead.forEach(([s]) => console.log('   ✗ ' + s.slice(0, 80)));

// 两端镜像检查：改完之后，同一段文本在 generated 和兜底里应当同时存在或同时不存在
console.log('\n=== 两端同步 ===');
const desync = [];
for (const [oldStr, newStr] of REPS) {
  let inGen = false;
  let inJs = false;
  for (const f of FILES) {
    const has = next.get(f.p).includes(f.json ? newStr : js(newStr));
    if (f.json && has) inGen = true;
    if (!f.json && has) inJs = true;
  }
  if (inGen !== inJs) desync.push(newStr.slice(0, 70));
}
if (desync.length === 0) console.log('   ✓ 每条新文案两端都在');
else desync.forEach((s) => console.log('   ✗ 只有一端有：' + s));

// ---------------------------------------------------------------- 残留自检
console.log('\n=== 残留自检 ===');
const bad = [];
for (const [p, text] of next) {
  const checks = [
    [/14 service cities|14 city chapters|14 Chinese cities|most active chapter|pop-up chapters/i, '仍有 14 城/分部表述'],
    [/apartment hunting|lease negotiation|housing assistance|healthcare navigation/i, '仍有线下服务承诺'],
    [/\d+ more cities/, '仍有「还有 N 个城市」'],
  ];
  // 会员价格是老郑确认过的执行标准，不在这条自检范围内
  const costRe = /RMB \d[\d,]*[–-]\d/;
  if (costRe.test(text)) {
    const left = (text.match(/[^\n"]*RMB \d[\d,]*[–-]\d[^\n"]*/g) || []).slice(0, 3);
    bad.push(`${p}: 仍有城市成本金额 → ${left.join(' ／ ').slice(0, 160)}`);
  }
  for (const [re, msg] of checks) if (re.test(text)) bad.push(`${p}: ${msg}`);
}
if (bad.length === 0) console.log('   ✓ 未发现残留');
else bad.forEach((b) => console.log('   ✗ ' + b));

if (dead.length || desync.length || bad.length) {
  console.log('\n❌ 自检不通过，未落盘。');
  process.exit(1);
}

if (!WRITE) {
  console.log('\n（dry-run，未落盘。加 --write 才写入）');
  process.exit(0);
}

let n = 0;
for (const [p, text] of next) {
  if (text === orig.get(p)) continue;
  fs.writeFileSync(path.join(root, p), text, 'utf8');
  n += 1;
}
console.log(`\n✓ 已落盘 ${n} 个文件。下一步：同步到云端 cms_docs。`);
