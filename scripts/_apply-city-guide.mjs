/**
 * 一次性脚本：把城市页 / 广州指南里的活动类型措辞换到新的十类。
 *
 * 做法是「成对文本替换」，同时作用于代码兜底与 generated，两端不会漂移。
 * 顺序很重要：先处理整句（更具体），再处理通用前缀（更宽）。
 *
 * 用法：node scripts/_apply-city-guide.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const FILES = [
  'src/data/cities.js',
  'src/data/generated/cities.json',
  'src/data/guangzhou.js',
  'src/data/guides.js',
  'src/data/generated/guides.json',
];

// 先整句、后前缀 —— 顺序错了会互相吃掉。
const PAIRS = [
  // ---- guangzhou.js：首字母大写的列举行 + 一整段 ----
  ['Bar nights and pub crawls, food crawls and language exchange', 'Parties and socials, food crawls and language exchange'],
  ['Sports groups, hiking and weekend trips, Cantonese culture workshops', 'Sports leagues, hikes and weekend getaways, Cantonese cultural experiences'],
  ['A bar night is the easiest place to start, and the reason is prosaic:', 'A party is the easiest place to start, and the reason is prosaic:'],
  ['Sports groups, hiking and weekend trips, and Cantonese culture workshops take more organising', 'Sports leagues, hikes and weekend getaways, and Cantonese cultural experiences take more organising'],
  // ---- 城市 blurb（整句） ----
  [
    'Ten meetup formats start here: bar nights and pub crawls, food crawls through the old districts and along the river, and language exchange, as well as sports groups, hiking and culture workshops.',
    'Ten meetup formats start here: parties and networking mixers, food crawls through the old districts and along the river, and language exchange, as well as sports leagues, hikes and cultural experiences.',
  ],
  [
    'the ones that are easy to start with are bar nights, food crawls and language exchange',
    'the ones that are easy to start with are parties, food crawls and language exchange',
  ],
  [
    'The same ten formats start here: bar nights, seafood and night-market food crawls, and language exchange for people who have just landed.',
    'The same ten formats start here: parties and socials, seafood and night-market food crawls, and language exchange for people who have just landed.',
  ],
  // ---- guangzhou.js ----
  [
    'from bar nights and pub crawls, food crawls and language exchange through to sports groups, hiking and weekend trips, and Cantonese culture workshops. Bar nights, food crawls and language exchange are the ones most people start with.',
    'from parties and networking mixers, food crawls and language exchange through to sports leagues, hikes and weekend getaways, and Cantonese cultural experiences. Parties, food crawls and language exchange are the ones most people start with.',
  ],
  [
    'start with a bar night or a food crawl.',
    'start with a party or a food crawl.',
  ],
  [
    'from bar nights, food crawls and language exchange through to sports groups, hiking trips and Cantonese culture workshops',
    'from parties, food crawls and language exchange through to sports leagues, hikes and Cantonese cultural experiences',
  ],
  // ---- guides.js ----
  [
    'from bar nights and pub crawls, food crawls and language exchange through to hiking trips and culture workshops.',
    'from parties and networking mixers, food crawls and language exchange through to hikes, sports leagues and cultural experiences.',
  ],
  [
    'built around ten meetup formats: bar nights and pub crawls, food crawls and language exchange, sports groups, hiking trips and culture workshops.',
    'built around ten meetup formats: parties and socials, networking mixers, food crawls and language exchange, sports leagues, hikes and cultural experiences.',
  ],
  // ---- 广州 highlights 的格式列表行 ----
  [
    'bar nights and pub crawls, food crawls and language exchange',
    'parties and networking mixers, food crawls and language exchange',
  ],
  [
    'sports groups, hiking and weekend trips, Cantonese culture workshops',
    'sports leagues, hikes and weekend getaways, Cantonese cultural experiences',
  ],
  // ---- 通用前缀（13 城市各一行） ----
  ['bar nights and pub crawls:', 'parties and socials:'],
  ['games, holidays and brunch:', 'board games, coffee and brunch:'],
  ['sports, hiking and culture:', 'sports, hikes and culture:'],
];

let total = 0;
for (const rel of FILES) {
  const p = path.join(root, rel);
  let text = fs.readFileSync(p, 'utf8');
  const hits = [];
  for (const [oldS, newS] of PAIRS) {
    const n = text.split(oldS).length - 1;
    if (n > 0) {
      hits.push(`${n}× ${oldS.slice(0, 44)}`);
      text = text.split(oldS).join(newS);
      total += n;
    }
  }
  if (WRITE) fs.writeFileSync(p, text);
  console.log(`${rel}  →  ${hits.length ? hits.join(' ｜ ') : '（无匹配）'}`);
}
console.log(`\n${WRITE ? '已写入' : '（dry-run）'}：共替换 ${total} 处`);
