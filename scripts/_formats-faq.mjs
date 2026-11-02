#!/usr/bin/env node
// Realign the FAQ with the ranked Tier taxonomy, and pull the last of the over-promises.
//
// Two jobs in one pass, because they overlap:
//
//   A. Rewrite answers that predate the truth clean-up and still promise capacity the crew
//      does not have today (a bilingual host at every event, HSK courses, Mahjong nights,
//      Suzhou and Yunnan trips, "regularly hosts" at Golden Week).
//   B. Add three Tier 1 questions, since Tier 1 is where the ranking says our content should
//      be concentrated, and one language-exchange comparison answer.
//
// Writes both ends, always together: generated/faq.json (generated-first) and faq.js
// (LOCAL_FAQ fallback). Matching is by question substring, never by array index.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const BAN = /\b(weekly|monthly|quarterly|recurring)\b|\bevery (week|month|two weeks)\b|regularly hosts|at least one meetup/i;

// --- A. rewrites, keyed by a unique fragment of the question --------------------

const EDITS = [
  {
    match: 'the meetups we are building fall into',
    // keyed on nothing; handled below via the q-substring variant
    qKey: 'What is GFIC Crew (GFIC歪果社)?',
    type: 'replace',
    old: 'the meetups we are building fall into three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — with language exchange and cultural workshops alongside',
    new: 'the meetups we are building fall into ten ranked formats, led by bar nights and pub crawls, food crawls and language exchange',
  },
  {
    qKey: 'Do I need to become a member to attend an event?',
    type: 'whole',
    new: 'Every group is free to join right now, and there is nothing to pay to come along, because we have not opened paid membership yet. When it does open it covers a lifetime membership rather than a fee per meetup. For now you add us on WeChat, tell us which format you are after, and we let you know when something is confirmed.',
  },
  {
    qKey: 'What kind of events does GFIC Crew organize?',
    type: 'whole',
    new: 'Ten formats, ranked by how easy each one is to walk into on your own. The three doing most of the work are bar nights and pub crawls, food crawls and shared meals, and language exchange. Behind those sit sports and fitness groups, hiking and weekend trips, and Chinese culture workshops, then board games and trivia, holiday parties, coffee and brunch, and interest groups. We rank them on five things at once: how natural the socialising feels, how familiar the format already is, whether people come back, what changes once you are in China, and how hard it is to turn up alone.',
  },
  {
    qKey: 'Are events suitable for people who do not speak Chinese?',
    type: 'whole',
    new: 'Yes, and part of the reason our top three formats are ranked where they are is that they work without much language. Bar nights and food crawls need almost none, and language exchange is built for beginners by definition. Announcements go out in English, and there is usually somebody around who can translate when it actually matters.',
  },
  {
    qKey: 'Do you offer Chinese language exchange?',
    type: 'whole',
    new: 'Yes, it is the third of our ten formats. It earns that spot by solving something the others cannot: it gives you a stated reason to be there, which is much easier to say out loud than wanting to meet people. Sessions get announced in the WeChat groups once they are confirmed.',
  },
  {
    qKey: 'What cultural activities do you organize?',
    type: 'whole',
    new: 'Cultural workshops sit sixth on our list: cooking, calligraphy, tea ceremony and tai chi, run by locals rather than performed for visitors. Being shown something by somebody who grew up with it is the difference, and people pick up on it straight away. We do not run a standing workshop calendar, so when one goes ahead it is announced in the groups.',
  },
  {
    qKey: 'Can foreigners join local events in China during Golden Week?',
    type: 'whole',
    new: 'Golden Week is one of the easiest weeks of the year to meet people, because nobody is working. Local communities, malls and expat groups all put things on. Because it is a public holiday the logistics change though: venues get crowded, trains and tickets sell out early, and some places keep holiday hours. Our own meetups are announced inside the WeChat groups rather than on a calendar, so if you are heading to Guangzhou or Shenzhen, add us before you travel and we will tell you what is on.',
  },
];

// --- B. additions ---------------------------------------------------------------

const ADDS = [
  {
    category: 'Events & Activities',
    q: 'Which meetup should I start with if I am coming on my own?',
    a: 'A bar night, if one is going. Walking into a bar alone is ordinary in a lot of Western cities and much rarer here, and that gap is why people put it off for months. Arriving with a group means the question never comes up. Food crawls come next, because nobody has to be interesting when there is food on the table. Language exchange is a close third and suits people who would rather have a stated reason to be in the room. We rank our ten formats partly on exactly this: how hard each one is to walk into alone.',
  },
  {
    category: 'Events & Activities',
    q: 'Do you run bar nights or pub crawls?',
    a: 'Bar nights sit at the top of our ten formats, above food crawls and language exchange. A drink gives you somewhere to stand and something to do with your hands, so there is no opening line to prepare. What is genuinely China-specific is knowing which places are used to foreign customers, what a night actually costs, and how the room reads once it fills up. Our pub crawls work on that: somebody who already knows takes the lead.',
  },
  {
    category: 'Events & Activities',
    q: 'Can I join a food crawl if I cannot read a menu?',
    a: 'That is most of the point. Pictureless menus, dishes you cannot pronounce, and no way to tell whether you ordered well are exactly what puts people off eating out here. On a food crawl somebody orders for the table, so you get more dishes and none of the guesswork. Hands-on food like hotpot and dumplings works best, because everyone is busy doing something rather than making conversation.',
  },
  {
    category: 'Language & Culture',
    q: 'How is your language exchange different from the ones I have tried?',
    a: 'The complaint we hear most is that they quietly turn into a dating event, or an English corner where nobody talks to anyone new. What we aim for instead is a host, a structure and an actual topic, so you get paired with somebody early instead of standing in a corner. It also pulls two crowds into one room: expats who want Chinese and locals who want English. Demand for this in China is enormous and the quality is uneven, which is why it sits third overall rather than lower.',
  },
];

// --- read both ends -------------------------------------------------------------

const genPath = path.join(ROOT, 'src', 'data', 'generated', 'faq.json');
const jsPath = path.join(ROOT, 'src', 'data', 'faq.js');

const gen = JSON.parse(fs.readFileSync(genPath, 'utf8'));
let jsSrc = fs.readFileSync(jsPath, 'utf8');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);

function applyTo(list) {
  let changed = 0;
  const log = [];

  for (const e of EDITS) {
    const idx = list.findIndex((f) => f.q === e.qKey || f.q.includes(e.qKey));
    if (idx === -1) {
      log.push(`✗ 找不到题干包含「${e.qKey}」的条目`);
      continue;
    }
    const old = list[idx].a;
    const next = e.type === 'whole' ? e.new : old.replace(e.old, e.new);
    if (next === old) continue;
    list[idx] = { ...list[idx], a: next };
    changed += 1;
    log.push(`↻ ${list[idx].q.slice(0, 62)}`);
  }

  for (const add of ADDS) {
    if (list.some((f) => f.q === add.q)) continue;
    list.push({ category: add.category, q: add.q, a: add.a });
    changed += 1;
    log.push(`＋ ${add.q.slice(0, 62)}`);
  }
  return { changed, log };
}

const before = gen.length;
const genRes = applyTo(gen);

// Rebuild LOCAL_FAQ in faq.js from scratch so it cannot drift from the JSON.
const arrStart = jsSrc.indexOf('const LOCAL_FAQ = [');
if (arrStart === -1) {
  console.error('\n✗ faq.js 里找不到 const LOCAL_FAQ = [');
  process.exit(1);
}
const openBracket = jsSrc.indexOf('[', arrStart);
let depth = 0;
let close = openBracket;
for (; close < jsSrc.length; close += 1) {
  if (jsSrc[close] === '[') depth += 1;
  else if (jsSrc[close] === ']') {
    depth -= 1;
    if (depth === 0) break;
  }
}
// Key order follows each generated object rather than a fixed guess, so a fallback entry that
// already matches still serialises byte-for-byte the way the checker expects it.
const rendered = gen
  .map(
    (f) =>
      '  {\n' +
      Object.keys(f)
        .map((k) => `    ${k}: ${q(f[k])},`)
        .join('\n') +
      '\n  },',
  )
  .join('\n');
const nextJs = jsSrc.slice(0, openBracket + 1) + '\n' + rendered + '\n' + jsSrc.slice(close);

// --- self-check -----------------------------------------------------------------

const problems = [];
for (const f of gen) {
  const hit = (f.q + ' ' + f.a).match(BAN);
  if (hit) problems.push(`触发周期/能力承诺「${hit[0]}」— ${f.q.slice(0, 50)}`);
  if (f.a.includes('three main formats')) problems.push(`仍是旧口径 three main formats — ${f.q.slice(0, 50)}`);
}
const dupQ = gen.map((f) => f.q).filter((x, i, a) => a.indexOf(x) !== i);
if (dupQ.length) problems.push(`题干重复：${dupQ.join(' / ')}`);

console.log(`\n改动 ${genRes.changed} 处（原 ${before} 条 → 现 ${gen.length} 条）：`);
for (const l of genRes.log) console.log('  ' + l);

if (problems.length) {
  console.error('\n✗ 自检未通过：');
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}
console.log('\n✓ 自检通过：无周期性承诺、无 three main formats 残留、题干无重复');

console.log(`\n${WRITE ? '→ 写入' : '→ 干跑（加 --write 才落盘）'}`);
console.log(`  ${path.relative(ROOT, genPath)}  ${gen.length} 条`);
console.log(`  ${path.relative(ROOT, jsPath)}  LOCAL_FAQ 按同一份数据重建`);

if (WRITE) {
  fs.writeFileSync(genPath, JSON.stringify(gen, null, 2) + '\n', 'utf8');
  fs.writeFileSync(jsPath, nextJs, 'utf8');
  console.log('✓ 已落盘。');
} else {
  console.log('（未修改任何文件）');
}
