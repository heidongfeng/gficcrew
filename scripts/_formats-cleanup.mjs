#!/usr/bin/env node
// Sweep every remaining "we run these specific events" claim and every "three formats"
// leftover, and align the whole site with the ranked ten-format taxonomy.
//
// The October truth clean-up removed the sample events and the 14-city claim, but it did not
// reach the prose that describes those events happening: a Liwan street-food crawl in the
// guide, sunrise hikes and Conghua camping in the city highlights, HSK preparation groups in
// the services list. All of it was written by us, none of it has ever happened. This pass
// removes the specifics and replaces them either with nothing or with something true, which is
// usually "this is one of the ten formats and here is why it sits where it does".
//
// Every entry must hit, or the script fails loudly. A silent miss here is how stale claims
// ship. --write to apply, dry run otherwise.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const DATA = [
  'src/data/site.js',
  'src/data/generated/site.json',
  'src/data/guides.js',
  'src/data/generated/guides.json',
  'src/data/guangzhou.js',
  'src/data/cities.js',
  'src/data/generated/cities.json',
];

const R = [
  // --- 1. the "three formats" taxonomy, everywhere ---------------------------
  {
    id: 'site-description',
    files: ['src/data/site.js', 'src/data/generated/site.json'],
    count: 1,
    old: 'Our events fall into three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — alongside language exchange and cultural workshops.',
    new: 'We keep ten meetup formats on the board, led by bar nights and pub crawls, food crawls and language exchange.',
  },
  {
    id: 'guide-description',
    files: ['src/data/guides.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'language and a social scene built on three formats — social mixers and parties, food crawls and dining, and hiking and city walks.',
    new: 'language and a social scene built on ten ranked formats, led by bar nights and pub crawls, food crawls and language exchange.',
  },
  {
    id: 'guide-intro',
    files: ['src/data/guides.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Cantonese food, language and the social scene, built around the three formats the crew runs most: social mixers and parties, food crawls and dining, and hiking and city walks.',
    new: 'Cantonese food, language and the social scene, built around ten meetup formats ranked by how easy each one is to walk into on your own, with bar nights, food crawls and language exchange at the top.',
  },

  // --- 2. language service: courses we have never delivered ------------------
  {
    id: 'service-language-summary',
    files: ['src/data/site.js', 'src/data/generated/site.json'],
    count: 1,
    old: 'Break the language barrier with language exchange meetups, survival Chinese crash courses, HSK preparation groups and Chinese corner events.',
    new: 'Language exchange is the third of our ten formats. It puts expats who want Mandarin next to locals who want English, and it gives anyone a stated reason to turn up.',
  },
  {
    id: 'service-language-crash-course',
    files: ['src/data/site.js', 'src/data/generated/site.json'],
    count: 1,
    old: 'Survival Chinese crash courses for daily life',
    new: 'Everyday Mandarin for the things you do in your first month',
  },
  {
    id: 'service-language-hsk',
    files: ['src/data/site.js', 'src/data/generated/site.json'],
    count: 1,
    old: 'HSK preparation groups',
    new: 'Structured practice rather than an open room where nobody talks to anyone new',
  },
  {
    id: 'service-language-corner',
    files: ['src/data/site.js', 'src/data/generated/site.json'],
    count: 1,
    old: 'Chinese corner events',
    new: 'Sessions shaped around a topic instead of free-form mingling',
  },

  // --- 3. guide: the street-food crawl that does not exist -------------------
  {
    id: 'guide-food-crawl',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Start with dim sum on a weekend morning, which is the social heart of Cantonese food culture. Then work through clay pot rice, roast goose, wonton noodles, rice noodle rolls, herbal jelly and egg tarts. Our Liwan street food crawl covers most of this in one evening — food crawls and dining are one of the three formats the crew runs, alongside social mixers and outdoor walks.',
    new: 'Start with dim sum on a weekend morning, which is the social heart of Cantonese food culture. Then work through clay pot rice, roast goose, wonton noodles, rice noodle rolls, herbal jelly and egg tarts. The part nobody warns you about is ordering. Menus often have no pictures, dish names are transliterations you cannot pronounce, and there is no obvious way to tell whether you chose well. That gap is why food crawls sit second in our ten formats, right behind bar nights: somebody who already knows orders for the table, so you get more dishes and none of the guesswork.',
  },

  // --- 4. guide: language sessions we do not run -----------------------------
  {
    id: 'guide-language-sessions',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'GFIC Crew runs language exchange meetups in Guangzhou that split each session between Mandarin and Cantonese, plus occasional online survival Chinese sessions covering the phrases that actually matter in your first month.',
    new: 'Language exchange is the third of our ten formats, and it earns the spot by giving you a stated reason to turn up, which is easier to say out loud than wanting to meet people. Guangzhou has plenty advertised. The complaint we hear most is that they drift into dating events, or English corners where nobody talks to anyone new, so ask inside the crew group which ones people actually rate.',
  },

  // --- 5. guide: the social section rewritten around the ranking -------------
  {
    id: 'guide-social-a',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Guangzhou is easier to make friends in than most Chinese megacities, mostly because the expat community is smaller and more concentrated, so you keep running into the same people. The crew is an events crew first, and almost everything it runs falls into one of three formats: social mixers and parties, food crawls and dining, and hiking and city walks.',
    new: 'Guangzhou is easier to make friends in than most Chinese megacities, mostly because the expat scene is smaller and more concentrated, so you keep running into the same people. The crew keeps ten meetup formats on the board, ranked by five things at once: how natural the socialising feels, how familiar the format already is, whether people come back, what changes once you are in China, and how hard it is to walk in on your own. Three of them do most of the work.',
  },
  {
    id: 'guide-social-b',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Social mixers and parties are the fastest way in. Think riverfront pub crawls in Zhujiang New Town, international potluck dinners, and rooftop meetups where nobody expects you to speak Chinese. Food crawls and dining come a close second: street-food crawls through Liwan and Yuexiu, dim sum mornings, and Cantonese cooking sessions where the eating is the point. If you would rather be outdoors, the hiking and city walks format covers Baiyun Mountain sunrise hikes, Shamian Island and old-town walks, and weekend camping trips to Conghua.',
    new: 'Bar nights lead, and the reason is prosaic: a drink gives you somewhere to stand and something to do with your hands, so there is no opening line to prepare. What genuinely helps in Guangzhou is knowing which places are used to foreign customers and what a night actually costs, which is not something a listings site will tell you. Food crawls come second for the ordering reasons above. Language exchange is third, and it suits people who would rather have a stated reason to be in the room. Sports groups, hiking and weekend trips, and culture workshops sit behind those three. They take more organising, and they are the ones people keep coming back to.',
  },
  {
    id: 'guide-social-c',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'If you are new, the fastest route in is a potluck or a food crawl. Both are structured enough that you are never standing alone, and both involve talking about food, which works in any language.',
    new: 'If you are new and turning up alone, start with a bar night or a food crawl. Both are structured enough that you are never standing on your own, and both involve talking about food or drink, which works in any language. Liwan and Yuexiu hold most of the older food streets, Zhujiang New Town is where the riverside bars cluster, and Baiyun Mountain plus Shamian Island are the easy halves of a day outdoors. Ask inside the group rather than trusting search results, because a lot of what is online has not been updated in years.',
  },
  // Replaced line by line rather than as a block: guides.json and cities.json store these
  // serialised with double quotes and different indentation, so only the string contents are
  // common to both ends. Each one is verified above to appear exactly once, only under Guangzhou.
  {
    id: 'list-social-mixers',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Social mixers and parties: riverfront pub crawls, international potlucks and rooftop meetups',
    new: 'Tier 1 formats: bar nights and pub crawls, food crawls and language exchange',
  },
  {
    id: 'list-food-dining',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Food crawls and dining: Liwan street food crawls and dim sum making workshops',
    new: 'Tier 2 formats: sports groups, hiking and weekend trips, Cantonese culture workshops',
  },
  {
    id: 'list-hiking',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Hiking and city walks: Baiyun Mountain hikes, old-town walks and weekend camping in Conghua',
    new: 'Old-district food streets in Liwan and Yuexiu',
  },
  {
    id: 'list-badminton',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Badminton social nights',
    new: 'Baiyun Mountain and Shamian Island for a half-day outdoors',
  },
  {
    id: 'list-weekend-camping',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Weekend camping trips to Conghua',
    new: 'Cantonese spoken daily alongside Mandarin',
  },

  // --- 6. guide: weekend trips we have not run ------------------------------
  {
    id: 'guide-weekends',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Several of these run as crew group trips under our hiking and city walks format — a day on Baiyun Mountain, a walk through the old quarters, or a weekend camping trip to Conghua. Group trips are cheaper and considerably more fun than going alone.',
    new: 'Reaching them is easier with other people. Tickets and trains sell out over holiday weekends, a car or a hotel room splits several ways, and somebody still has to read the signs. That is why hiking and weekend trips rank fifth even though they are the most trouble to organise. Ask in the crew group before booking anything non-refundable.',
  },

  // The guide's own FAQ block repeats the claim, and points back at the "three formats" list.
  {
    id: 'guide-faq-community',
    files: ['src/data/guangzhou.js', 'src/data/generated/guides.json'],
    count: 1,
    old: 'Smaller and more concentrated than Shanghai or Beijing, which makes it easier to build a real social circle because you keep meeting the same people. GFIC Crew runs meetups here in the three formats above, and this is the city where most of them happen.',
    new: 'Smaller and more concentrated than Shanghai or Beijing, which makes it easier to build a real social circle because you keep meeting the same people. The ten formats are described earlier in this guide and ranked by how easy each is to walk into alone, with bar nights, food crawls and language exchange on top. Guangzhou is one of the two cities where the crew meets in person.',
  },

  // --- 7. city blurb: activities that were invented --------------------------
  {
    id: 'city-blurb',
    files: ['src/data/cities.js', 'src/data/generated/cities.json'],
    count: 1,
    old: 'Our Guangzhou crew is an events crew first — social mixers and riverfront parties, street-food crawls through Liwan and Yuexiu, and weekend hikes and city walks around Baiyun Mountain, with language exchange and badminton in the mix.',
    new: 'It is one of the two cities where the crew meets in person. Our ten ranked formats start here: bar nights and pub crawls, food crawls through the old districts and along the river, and language exchange, with sports groups, hiking and culture workshops behind them.',
  },
  {
    id: 'list-language',
    files: [
      'src/data/guangzhou.js',
      'src/data/generated/guides.json',
      'src/data/cities.js',
      'src/data/generated/cities.json',
    ],
    count: 1,
    old: 'Cantonese and Mandarin language exchange',
    new: 'Riverside bars and nightlife around Zhujiang New Town',
  },
  {
    id: 'city-hl-mixers',
    files: ['src/data/cities.js', 'src/data/generated/cities.json'],
    count: 1,
    old: 'Social mixers & parties: riverfront pub crawls in Zhujiang New Town, international potluck dinners and rooftop meetups',
    new: 'Tier 1 formats: bar nights and pub crawls, food crawls and language exchange',
  },
  {
    id: 'city-hl-food',
    files: ['src/data/cities.js', 'src/data/generated/cities.json'],
    count: 1,
    old: 'Food crawls & dining: Liwan, Yuexiu and Haizhu street-food crawls plus Cantonese dim sum and tea ceremony sessions',
    new: 'Tier 2 formats: sports groups, hiking and weekend trips, Cantonese culture workshops',
  },
  {
    id: 'city-hl-hiking',
    files: ['src/data/cities.js', 'src/data/generated/cities.json'],
    count: 1,
    old: 'Hiking & city walks: Baiyun Mountain sunrise hikes, Shamian Island and old-town walks, weekend camping in Conghua',
    new: 'Old-district food streets in Liwan and Yuexiu',
  },
  {
    id: 'city-hl-sports',
    files: ['src/data/cities.js', 'src/data/generated/cities.json'],
    count: 1,
    old: 'Badminton, football and cycling socials',
    new: 'Baiyun Mountain and Shamian Island for a half-day outdoors',
  },
  {
    id: 'city-hl-weekend',
    files: ['src/data/cities.js', 'src/data/generated/cities.json'],
    count: 1,
    old: 'Weekend trips to the surrounding countryside',
    new: 'Cantonese spoken daily alongside Mandarin',
  },

  // --- 8. code-only: about page and llms.txt -------------------------------
  {
    id: 'about-prose',
    files: ['src/pages/about.astro'],
    count: 1,
    old: `      <p>
        We are currently active in {cityNames.slice(0, 6).join(', ')}, and other cities. Almost
        everything we run falls into three formats — social mixers and parties, food crawls and
        dining, and hiking and city walks — with language exchange and cultural workshops running
        alongside. No lonely expat life here. This is your crew.
      </p>`,
    new: `      <p>
        We meet up in person in Guangzhou and Shenzhen, and expats anywhere in China can join the
        online groups and the national WeChat group. We keep ten meetup formats, ranked by how easy
        each one is to walk into on your own, with bar nights, food crawls and language exchange
        doing most of the work. No lonely expat life here. This is your crew.
      </p>`,
  },
  {
    id: 'llms-summary',
    files: ['src/pages/llms.txt.ts'],
    count: 1,
    old: 'It is an events crew first, with activities in three main formats — social mixers and parties, food crawls and dining, and hiking and city walks — plus language exchange and cultural workshops. Active in ${CITIES.length} cities: ${cityNames}. Guangzhou is the priority city.',
    new: 'It runs ten meetup formats ranked by how easy each one is to walk into on your own, led by bar nights and pub crawls, food crawls and language exchange. In-person meetups happen in Guangzhou and Shenzhen; ${CITIES.length} cities are covered by guides and online groups.',
  },
  {
    id: 'llms-events-line',
    files: ['src/pages/llms.txt.ts'],
    count: 1,
    old: 'the formats the crew runs — social mixers and parties, food crawls and dining, hiking and city walks, plus language exchange and cultural workshops.',
    new: 'the ten formats the crew runs, ranked by how easy each is to walk into alone — tier 1 is bar nights and pub crawls, food crawls and shared meals, language exchange; tier 2 is sports groups, hiking and weekend trips, Chinese culture workshops; tier 3 is board games and trivia, holiday parties, coffee and brunch, and interest groups.',
  },
];

// --- run -----------------------------------------------------------------------

const cache = new Map();
const read = (f) => {
  if (!cache.has(f)) cache.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return cache.get(f);
};

const problems = [];
let total = 0;

for (const rule of R) {
  for (const f of rule.files) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      problems.push(`${rule.id}: 文件不存在 ${f}`);
      continue;
    }
    let src = read(f);
    const hits = src.split(rule.old).length - 1;
    if (hits === 0) {
      problems.push(`${rule.id} 在 ${f} 里没命中`);
      continue;
    }
    if (rule.count && hits !== rule.count) {
      problems.push(`${rule.id} 在 ${f} 里命中 ${hits} 次，期望 ${rule.count} 次`);
    }
    src = src.split(rule.old).join(rule.new);
    cache.set(f, src);
    total += hits;
    console.log(`  ${hits}×  ${rule.id.padEnd(28)} ${f}`);
  }
}

if (problems.length) {
  console.error('\n✗ 自检未通过：');
  for (const p of problems) console.error('   - ' + p);
  console.error('\n（一条都没写入。上面通常是原文已经变过了，先确认再改脚本。）');
  process.exit(1);
}

// Nothing we just wrote may reintroduce a cadence promise or keep the old taxonomy.
const BAN = [
  /\b(weekly|monthly|quarterly|recurring)\b/i,
  /\bevery (week|month|two weeks)\b/i,
  /three main formats/,
  /three formats/i,
  /Liwan street food crawl/,
  /survival Chinese/i,
  /HSK preparation/i,
  /Chinese corner/i,
  /camping trip to Conghua/i,
  /Baiyun Mountain sunrise/i,
  /riverfront pub crawls in Zhujiang/i,
];

const leftovers = [];
for (const f of [...new Set(R.flatMap((r) => r.files))]) {
  const src = read(f);
  for (const pat of BAN) {
    const m = src.match(pat);
    if (m) leftovers.push(`${f}  残留「${m[0]}」`);
  }
}
if (leftovers.length) {
  console.error('\n✗ 写入后仍有残留：');
  for (const l of leftovers) console.error('   - ' + l);
  process.exit(1);
}

console.log(`\n✓ 自检通过：${R.length} 条规则，共 ${total} 处替换；无周期承诺、无旧口径残留`);
console.log(`\n${WRITE ? '→ 写入' : '→ 干跑（加 --write 才落盘）'}`);

if (WRITE) {
  for (const [f, src] of cache) fs.writeFileSync(path.join(ROOT, f), src, 'utf8');
  console.log(`✓ 已落盘 ${cache.size} 个文件。`);
} else {
  console.log('（未修改任何文件）');
}
