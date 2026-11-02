/**
 * 一次性脚本：把 /events/ 的十类活动形式改成新方案（2026-10-06 老郑拍板）。
 *
 * 数据只在本文件定义一次，然后写两个地方：
 *   1. src/data/site.js 的 LOCAL_FORMATS（代码兜底）
 *   2. src/data/generated/site.json 的 formats（实际生效）
 * 这样两端不可能漂移。
 *
 * 用法：node scripts/_apply-formats.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

// 新排名口径 = 首页开场白里出现的顺序：派对/社交 → 商务 mixers → 美食 → 语言交换 →
// 徒步/周末出游 → 运动联赛 → 文化体验；board games / coffee / interest groups 由
// 开场白结尾的 "and more" 承接，留在第三组。
const NEW_FORMATS = [
  {
    id: 'parties',
    tier: 1,
    rank: 1,
    name: 'Parties and socials',
    tagline: 'The format everyone already knows how to enjoy.',
    why: 'No shared hobby and no structured activity to sit through — a party does the work for you. Rooftop parties, BBQs, karaoke nights, wine tastings, club nights, and themed or holiday nights all put people in the same room with something to do. That is why they are both the easiest way in and the thing people keep coming back to.',
    inChina: 'The party is familiar, the surroundings are not. Which venues are used to international crowds, what a night actually costs, how to get home afterwards, and how to find the crowd in the first place. Someone who already knows skips the part where you guess.',
    soloNote: 'Turning up alone is normal here, not awkward: almost everyone at a party is there to meet people. Coming in with the crew means you are never the one left by the door.',
    keywords: ['expat party China', 'rooftop party Guangzhou', 'club night Shenzhen', 'karaoke night expats China', 'wine tasting China', 'themed party China', 'pub crawl Guangzhou'],
  },
  {
    id: 'mixers',
    tier: 1,
    rank: 2,
    name: 'Networking mixers',
    tagline: 'A room where everyone is there to meet someone new.',
    why: 'A mixer gives you a reason to talk to a stranger before you have one — work, a side project, or simply being new in town. It suits people who would rather have a stated purpose than a purely social night, and it is where a lot of the practical help in the community first gets passed around.',
    inChina: 'Industry events happen in every big Chinese city, but they are scattered, often run in Chinese, and hard to find from the outside. A crew mixer pulls the same expat and internationally-minded crowd into one room and handles the introductions.',
    soloNote: 'Everyone arrives alone, so there is nothing to explain. The whole point of the format is that you do not know anyone yet.',
    keywords: ['expat networking China', 'business mixer Guangzhou', 'professional meetup Shenzhen', 'foreigners business network China'],
  },
  {
    id: 'food',
    tier: 1,
    rank: 3,
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
    rank: 4,
    name: 'Language exchange',
    tagline: 'A reason to show up that is easier to say out loud than wanting friends.',
    why: 'Saying you are here to practise Chinese is a much easier sentence than saying you are here to meet people. That is why quieter people turn up to these and never turn up to anything else. It also brings two crowds into one room: expats who want Chinese and locals who want English.',
    inChina: 'Demand is enormous and quality is uneven. Plenty of people have been to one that quietly became a dating event, or an English corner where nobody talks to anyone new. Sessions with a host, a structure and a topic are rare enough that you notice straight away.',
    soloNote: 'Almost nobody feels awkward arriving alone here, because the whole point is that you get paired with someone within minutes.',
    keywords: ['language exchange Guangzhou', 'Mandarin practice foreigners', 'Chinese English tandem partner'],
  },
  {
    id: 'outdoor',
    tier: 2,
    rank: 5,
    name: 'Hikes and weekend getaways',
    tagline: 'A whole day together does more than an evening does.',
    why: 'Time is the thing that turns acquaintances into friends. On a day trip there is room for the conversation to get past where you are from and what you do. Westerners generally arrive already liking the outdoors, so there is nothing to sell.',
    inChina: 'There is a lot of scenery within reach of every big Chinese city, and getting to it means tickets, transport, sometimes a night somewhere, and a language gap at each step. Doing that alone on a Saturday is a big ask, which is why most people never do.',
    soloNote: 'Nobody joins a hike to talk to people they already know. Turning up alone is the normal way to do it.',
    keywords: ['expat hiking China', 'weekend trip from Guangzhou', 'camping with foreigners China'],
  },
  {
    id: 'sports',
    tier: 2,
    rank: 6,
    name: 'Sports leagues and fitness',
    tagline: 'You can be useful before your Mandarin is good enough for small talk.',
    why: 'Sport gives you a job on the pitch and something to talk about afterwards, so language stops being the barrier. The repeat factor is what sets it apart though. You see the same faces regularly instead of once, and that is how friendships actually form.',
    inChina: 'Courts and pitches are everywhere in Chinese cities. What eats your time is rounding up enough people, holding a booking, and making sure somebody comes next week. Most informal attempts fade out after two sessions for exactly this reason.',
    soloNote: 'Turning up alone is expected. Teams are short of players far more often than they are full.',
    keywords: ['expat football China', 'foreigner sports league Guangzhou', 'badminton meetup Shenzhen'],
  },
  {
    id: 'culture',
    tier: 2,
    rank: 7,
    name: 'Chinese cultural experiences',
    tagline: 'Curiosity is easy. Acting on it alone is not.',
    why: 'Real interest in Chinese culture is common and hard to follow up on your own. You have to find someone who teaches it, get there, and then work out what you are actually looking at. In a session like this all of that is handled, and there are other people reacting alongside you.',
    inChina: 'Being run by locals is the genuine edge here. A Chinese host explaining dumplings, calligraphy or tea is not putting on a show for visitors, they are explaining something they grew up with, and people pick up on that difference immediately.',
    soloNote: 'These are structured enough that you are never left standing in a corner wondering who to talk to.',
    keywords: ['Chinese cooking class expats', 'calligraphy workshop Guangzhou', 'tea ceremony China experience'],
  },
  {
    id: 'games',
    tier: 3,
    rank: 8,
    name: 'Board games and trivia nights',
    tagline: 'The game supplies the conversation so you do not have to.',
    why: 'Structure is the whole appeal. Nobody has to improvise small talk because there is something on the table that everyone is looking at. It suits people who are new in town, or who are not going to walk up to a stranger and introduce themselves.',
    inChina: 'It needs games in English and most shops stock Chinese versions, so somebody has to bring them. A bit more setup than everything above, which is the only reason it sits lower.',
    soloNote: 'Good first event. You spend the first twenty minutes learning rules rather than making conversation.',
    keywords: ['board game night expats China', 'trivia night Guangzhou foreigners'],
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

// ---------------------------------------------------------------- 序列化
const FIELDS = ['id', 'tier', 'rank', 'name', 'tagline', 'why', 'inChina', 'soloNote'];
const q = (s) => {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};
const serFormat = (f) => {
  const pad = '  ';
  const lines = [`${pad}{`];
  for (const k of FIELDS) lines.push(`${pad}  ${k}: ${typeof f[k] === 'number' ? f[k] : q(f[k])},`);
  lines.push(`${pad}  keywords: [${(f.keywords || []).map(q).join(', ')}],`);
  lines.push(`${pad}},`);
  return lines.join('\n');
};
const serialize = (arr) => `[\n${arr.map(serFormat).join('\n')}\n]`;

// 不变量自检：10 条 / tier 合法 / rank 1..N 连续 / 同 tier 内 rank 连续 / id 唯一
{
  const ids = NEW_FORMATS.map((f) => f.id);
  const ranks = NEW_FORMATS.map((f) => f.rank).sort((a, b) => a - b);
  const expect = NEW_FORMATS.map((_, i) => i + 1);
  const byTier = {};
  for (const f of NEW_FORMATS) (byTier[f.tier] ||= []).push(f.rank);
  const errs = [];
  if (NEW_FORMATS.length !== 10) errs.push(`条数 ${NEW_FORMATS.length} ≠ 10`);
  if (new Set(ids).size !== ids.length) errs.push('id 有重复');
  if (JSON.stringify(ranks) !== JSON.stringify(expect)) errs.push(`rank 不是 1..N：${ranks}`);
  if (NEW_FORMATS.some((f) => ![1, 2, 3].includes(f.tier))) errs.push('tier 不合法');
  for (const [t, rs] of Object.entries(byTier)) {
    const s = [...rs].sort((a, b) => a - b);
    const cont = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
    if (!cont) errs.push(`tier ${t} 的 rank 不连续：${s}`);
  }
  if (errs.length) {
    console.error('❌ 自检失败：\n  - ' + errs.join('\n  - '));
    process.exit(1);
  }
  console.log(`自检通过：${NEW_FORMATS.length} 条，tier 分布 ` +
    Object.entries(byTier).map(([t, rs]) => `T${t}×${rs.length}`).join(' / '));
}

// ---------------------------------------------------------------- 1. site.js
const siteJsPath = path.join(root, 'src/data/site.js');
let js = fs.readFileSync(siteJsPath, 'utf8');
const re = /const LOCAL_FORMATS = \[[\s\S]*?\n\];/;
const m = js.match(re);
if (!m) {
  console.error('❌ 在 site.js 里找不到 LOCAL_FORMATS 块');
  process.exit(1);
}
const replacement = `const LOCAL_FORMATS = ${serialize(NEW_FORMATS)};`;
js = js.replace(re, replacement);
if (WRITE) fs.writeFileSync(siteJsPath, js);
console.log(`site.js LOCAL_FORMATS：${m[0].split('\n').length} 行 → ${replacement.split('\n').length} 行`);

// ---------------------------------------------------------------- 2. generated/site.json
const genPath = path.join(root, 'src/data/generated/site.json');
const gen = JSON.parse(fs.readFileSync(genPath, 'utf8'));
const before = (gen.formats || []).map((f) => f.id).join(',');
gen.formats = NEW_FORMATS;
if (WRITE) fs.writeFileSync(genPath, JSON.stringify(gen, null, 2) + '\n');
console.log(`generated/site.json formats：${before} → ${NEW_FORMATS.map((f) => f.id).join(',')}`);

console.log(WRITE ? '\n✓ 已写入两个文件' : '\n（dry-run，加 --write 才写）');
