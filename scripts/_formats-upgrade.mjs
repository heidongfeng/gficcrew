#!/usr/bin/env node
// Upgrade the meetup-format taxonomy to the ranked Tier system.
//
// Writes two places, always together, because content is generated-first with a code
// fallback and only the fallback is visible when the admin snapshot is missing:
//
//   1. src/data/generated/site.json  (the "formats" key + "eventCategories")
//   2. src/data/site.js              (LOCAL_FORMATS + LOCAL_EVENT_CATEGORIES fallback)
//
// The ranking is five-dimensional: social naturalness x cultural familiarity x
// willingness to repeat x uniqueness to China x the barrier to turning up alone.
//
// HARD RULE: these are FORMATS, not schedule claims. Nothing here may say how often
// something happens, name a venue, or imply a past edition. See topics/content-truth.md.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const arrKey = (k, v) => `  ${q(k)}: [${v.map(q).join(', ')}],`;

function render(f) {
  return [
    '  {',
    `    id: ${q(f.id)},`,
    `    tier: ${f.tier},`,
    `    rank: ${f.rank},`,
    `    name: ${q(f.name)},`,
    `    tagline: ${q(f.tagline)},`,
    `    why: ${q(f.why)},`,
    `    inChina: ${q(f.inChina)},`,
    `    soloNote: ${q(f.soloNote)},`,
    arrKey('keywords', f.keywords),
    '  },',
  ].join('\n');
}

const FORMATS = [
  {
    id: 'bars',
    tier: 1,
    rank: 1,
    name: 'Bar nights and pub crawls',
    tagline: 'The easiest way to start talking to strangers in a new city.',
    why: "A drink gives you something to hold and somewhere to stand, which is often all it takes. You don't need a shared hobby or a prepared opening line. Most Westerners have been doing this since they were twenty, so there is nothing new to learn.",
    inChina: 'The bar format is familiar, the surroundings are not. Which places are used to foreign customers, what a night actually costs, how the room reads when it fills up. Someone who already knows helps you skip the part where you guess.',
    soloNote: 'Walking into a bar alone is ordinary in a lot of Western cities and much rarer here. That gap is why people put it off for months. Arriving with a group means the question never comes up.',
    keywords: ['expat bar night China', 'pub crawl Guangzhou', 'where to meet foreigners Shenzhen'],
  },
  {
    id: 'food',
    tier: 1,
    rank: 2,
    name: 'Food crawls and shared meals',
    tagline: 'Nobody has to be interesting when there is food on the table.',
    why: 'Eating together is the one thing every culture already agrees on. You point, you react, and that reaction becomes the conversation. Hands-on food like hotpot or dumplings works better than a formal dinner because everyone is busy doing something.',
    inChina: 'The food is why plenty of people came to China, but ordering it is a separate skill. Pictureless menus, dishes you cannot pronounce, and no reliable way to tell whether you chose well. Having someone order for the table turns a stressful meal into a good one.',
    soloNote: 'Eating alone is normal at home and draws attention in a lot of Chinese restaurants. Going with people removes the stares and gets you more dishes to try.',
    keywords: ['Cantonese food crawl', 'street food Guangzhou expat', 'hotpot with foreigners China'],
  },
  {
    id: 'language',
    tier: 1,
    rank: 3,
    name: 'Language exchange',
    tagline: 'A reason to show up that is easier to say out loud than wanting friends.',
    why: 'Saying you are here to practise Chinese is a much easier sentence than saying you are here to meet people. That is why quieter people turn up to these and never turn up to anything else. It also brings two crowds into one room: expats who want Chinese and locals who want English.',
    inChina: 'Demand is enormous and quality is uneven. Plenty of people have been to one that quietly became a dating event, or an English corner where nobody talks to anyone new. Sessions with a host, a structure and a topic are rare enough that you notice straight away.',
    soloNote: 'Almost nobody feels awkward arriving alone here, because the whole point is that you get paired with someone within minutes.',
    keywords: ['language exchange Guangzhou', 'Mandarin practice foreigners', 'Chinese English tandem partner'],
  },
  {
    id: 'sports',
    tier: 2,
    rank: 4,
    name: 'Sports and fitness groups',
    tagline: 'You can be useful before your Mandarin is good enough for small talk.',
    why: 'Sport gives you a job on the pitch and something to talk about afterwards, so language stops being the barrier. The repeat factor is what sets it apart though. You see the same faces regularly instead of once, and that is how friendships actually form.',
    inChina: 'Courts and pitches are everywhere in Chinese cities. What eats your time is rounding up enough people, holding a booking, and making sure somebody comes next week. Most informal attempts fade out after two sessions for exactly this reason.',
    soloNote: 'Turning up alone is expected. Teams are short of players far more often than they are full.',
    keywords: ['expat football China', 'foreigner sports league Guangzhou', 'badminton meetup Shenzhen'],
  },
  {
    id: 'outdoor',
    tier: 2,
    rank: 5,
    name: 'Hiking and weekend trips',
    tagline: 'A whole day together does more than an evening does.',
    why: 'Time is the thing that turns acquaintances into friends. On a day trip there is room for the conversation to get past where you are from and what you do. Westerners generally arrive already liking the outdoors, so there is nothing to sell.',
    inChina: 'There is a lot of scenery within reach of every big Chinese city, and getting to it means tickets, transport, sometimes a night somewhere, and a language gap at each step. Doing that alone on a Saturday is a big ask, which is why most people never do.',
    soloNote: 'Nobody joins a hike to talk to people they already know. Turning up alone is the normal way to do it.',
    keywords: ['expat hiking China', 'weekend trip from Guangzhou', 'camping with foreigners China'],
  },
  {
    id: 'culture',
    tier: 2,
    rank: 6,
    name: 'Chinese culture workshops',
    tagline: 'Curiosity is easy. Acting on it alone is not.',
    why: 'Real interest in Chinese culture is common and hard to follow up on your own. You have to find someone who teaches it, get there, and then work out what you are actually looking at. In a workshop all of that is handled, and there are other people reacting alongside you.',
    inChina: 'Being run by locals is the genuine edge here. A Chinese host explaining dumplings, calligraphy or tea is not putting on a show for visitors, they are explaining something they grew up with, and people pick up on that difference immediately.',
    soloNote: 'Workshops are structured enough that you are never left standing in a corner wondering who to talk to.',
    keywords: ['Chinese cooking class expats', 'calligraphy workshop Guangzhou', 'tea ceremony China experience'],
  },
  {
    id: 'games',
    tier: 3,
    rank: 7,
    name: 'Board games and trivia nights',
    tagline: 'The game supplies the conversation so you do not have to.',
    why: 'Structure is the whole appeal. Nobody has to improvise small talk because there is something on the table that everyone is looking at. It suits people who are new in town, or who are not going to walk up to a stranger and introduce themselves.',
    inChina: 'It needs games in English and most shops stock Chinese versions, so somebody has to bring them. A bit more setup than everything above, which is the only reason it sits lower.',
    soloNote: 'Good first event. You spend the first twenty minutes learning rules rather than making conversation.',
    keywords: ['board game night expats China', 'trivia night Guangzhou foreigners'],
  },
  {
    id: 'holidays',
    tier: 3,
    rank: 8,
    name: 'Holiday parties',
    tagline: 'Christmas is a normal working day here unless somebody does something about it.',
    why: 'The Western calendar carries an emotional weight that it does not carry for anyone around you. Halloween, Thanksgiving and Christmas are the dates expats feel the distance most, and something on those nights is closer to a necessity than a nice extra.',
    inChina: 'Those dates are ordinary working days. There is no public holiday to build around and no reason your city will acknowledge it, so without somebody organising it the day simply passes.',
    soloNote: 'Most people come because they would otherwise spend the evening alone, which makes it an unusually friendly room.',
    keywords: ['Christmas party expats China', 'Thanksgiving dinner Guangzhou foreigners', 'Halloween expat party Shenzhen'],
  },
  {
    id: 'coffee',
    tier: 3,
    rank: 9,
    name: 'Coffee chats and brunch',
    tagline: 'A low-commitment first step rather than the main event.',
    why: 'Brunch is a real cultural touchstone for plenty of Westerners and an easy first meeting. Nobody has to commit their whole evening and nobody has to drink.',
    inChina: 'Coffee here is a fast transaction and brunch crowds exist mainly in the biggest cities, so it carries less weight than it does at home. Useful as a gentle entry, weak as a centrepiece.',
    soloNote: 'Sitting in a cafe with people you have not met yet costs you an hour and nothing else.',
    keywords: ['expat brunch China', 'coffee meetup Guangzhou foreigners'],
  },
  {
    id: 'interests',
    tier: 3,
    rank: 10,
    name: 'Interest groups: books, photography, film',
    tagline: 'What keeps people coming back rather than what brings them in.',
    why: 'Smaller groups, tighter bonds, and much better suited to people who already know a few faces. Photography walks in particular give you something to look at together, which takes the pressure off the conversation.',
    inChina: 'Retention more than recruitment. It matters once somebody has settled in and wants a reason to keep showing up.',
    soloNote: 'Joining alone is fine, though these work better once you already recognise somebody in the room.',
    keywords: ['photography walk expats China', 'book club Guangzhou foreigners'],
  },
];

const EVENT_CATEGORIES = [
  'Bar & Nightlife',
  'Food & Dining',
  'Language Exchange',
  'Sports',
  'Outdoor & Trips',
  'Culture & Workshops',
  'Games & Trivia',
  'Holiday Parties',
  'Coffee & Brunch',
  'Interest Groups',
];

// --- sanity checks the script performs on itself ---------------------------------

const problems = [];
const tiers = new Set(FORMATS.map((f) => f.tier));
if ([...tiers].sort().join() !== '1,2,3') problems.push(`Tier 分组异常：${[...tiers].join()}`);
if (FORMATS.map((f) => f.rank).join() !== FORMATS.map((_, i) => i + 1).join()) {
  problems.push('rank 不是 1..10 连续且有序');
}
const expectedTiers = { 1: 3, 2: 3, 3: 4 };
for (const [t, n] of Object.entries(expectedTiers)) {
  const got = FORMATS.filter((f) => f.tier === Number(t)).length;
  if (got !== n) problems.push(`Tier ${t} 应有 ${n} 条，实际 ${got} 条`);
}
const badChars = /\u2014|\u2013/;
for (const f of FORMATS) {
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'string' && badChars.test(v)) problems.push(`${f.id}.${k} 含破折号`);
  }
}
// A frequency claim here would be exactly the mistake this taxonomy is meant to avoid.
for (const f of FORMATS) {
  const blob = `${f.name} ${f.tagline} ${f.why} ${f.inChina} ${f.soloNote}`.toLowerCase();
  for (const kw of ['weekly', 'monthly', 'every week', 'every two weeks', 'each month']) {
    if (blob.includes(kw)) problems.push(`${f.id} 出现周期性措辞「${kw}」`);
  }
}
if (problems.length) {
  console.error('\n✗ 自检未通过：');
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}
console.log(`✓ 自检通过：${FORMATS.length} 类（Tier 1 有 3 条、Tier 2 有 3 条、Tier 3 有 4 条），无周期性措辞，无破折号`);

// --- 1. generated/site.json -----------------------------------------------------

const genPath = path.join(ROOT, 'src', 'data', 'generated', 'site.json');
const gen = JSON.parse(fs.readFileSync(genPath, 'utf8'));
gen.formats = FORMATS;
gen.eventCategories = EVENT_CATEGORIES;

// --- 2. src/data/site.js --------------------------------------------------------

const sitePath = path.join(ROOT, 'src', 'data', 'site.js');
let src = fs.readFileSync(sitePath, 'utf8');

const oldCat = "const LOCAL_EVENT_CATEGORIES = ['Social', 'Food', 'Sports', 'Culture', 'Outdoor', 'Language'];";
if (!src.includes(oldCat)) {
  console.error('\n✗ site.js 里找不到 LOCAL_EVENT_CATEGORIES 原文，脚本需要先确认锚点。\n');
  process.exit(1);
}
src = src.replace(oldCat, `const LOCAL_EVENT_CATEGORIES = [\n${EVENT_CATEGORIES.map((c) => `  ${q(c)},`).join('\n')}\n];`);

const anchor = '  LOCAL_EVENT_CATEGORIES;';
if (!src.includes(anchor)) {
  console.error('\n✗ site.js 里找不到 EVENT_CATEGORIES 的导出锚点。\n');
  process.exit(1);
}

const block = `

// Meetup formats ranked by five things at once: how natural the socialising feels, how
// familiar the format already is to Westerners, whether people come back, how China-specific
// the friction is, and how hard it is to turn up alone. The ranking drives content priority,
// not a promise about frequency — see docs/meetup-format-ranking.md. Managed from the admin
// backend (站点内容 → 活动形式).
const LOCAL_FORMATS = [
${FORMATS.map(render).join('\n')}
];

export const FORMATS =
  (genSite && Array.isArray(genSite.formats) && genSite.formats.length > 0 && genSite.formats) ||
  LOCAL_FORMATS;

export const FORMAT_TIERS = [
  {
    tier: 1,
    label: 'Core social engines',
    note: 'These three carry most of the load. They need the least explanation, they work for people who arrive on their own, and each one solves a problem that is specific to living in China.',
  },
  {
    tier: 2,
    label: 'High interest, strong pull to return',
    note: 'Demand is real and people stick around once they start, but each needs more organising than the tier above it.',
  },
  {
    tier: 3,
    label: 'Steady demand, good as a second option',
    note: 'Worth keeping in the mix. They either depend on the calendar, need equipment somebody has to supply, or work best once you already know a few faces.',
  },
];`;

src = src.replace(anchor, anchor + block);

console.log(`\n${WRITE ? '→ 写入' : '→ 干跑（加 --write 才落盘）'}`);
console.log(`  ${path.relative(ROOT, genPath)}  formats: ${FORMATS.length} 条，eventCategories: ${EVENT_CATEGORIES.length} 条`);
console.log(`  ${path.relative(ROOT, sitePath)}  LOCAL_FORMATS + LOCAL_EVENT_CATEGORIES 兜底`);

if (WRITE) {
  fs.writeFileSync(genPath, JSON.stringify(gen, null, 2) + '\n', 'utf8');
  fs.writeFileSync(sitePath, src, 'utf8');
  console.log('\n✓ 已落盘。');
} else {
  console.log('\n（未修改任何文件）');
}
