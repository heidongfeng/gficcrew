/**
 * 幂等脚本：把「内部排序术语」从用户可见文案里收掉。
 *
 * 老郑 2026-10-05 的纠正（原话）：
 *   「我发你那些只是资料参考，你也不要把所有文字都放进网站里呀，
 *    也不要写什么 tier1、tier2 了，首页不要写这些，把吸引人的活动类型列出来就行了。」
 *
 * 所以十类活动的 Tier 排序是**内部权重**（决定先写什么、重点写什么），
 * 不是给用户看的文案。用户看到的应该是「有哪些好玩的活动」，
 * 而不是「我们按五个维度加权排了个序，这组 carry most of the load」。
 *
 * 处理原则：
 *   - 首页 hero-list：直接列吸引人的活动类型，不提排序、不提 Tier
 *   - 城市 highlights：去掉 `Tier N · ` 前缀，只留「活动类型: 本地细节」
 *   - 服务条目：去掉 `Tier N:` 前缀
 *   - SITE.intro / 服务 summary：去掉 "ranked by…" 这套方法论表述
 *   - FORMAT_TIERS 的 label / note：改成人话（数据里的 tier 字段保留，后台还要用来分组）
 *
 * 用法：node scripts/_drop-tier-speak.mjs [--write]
 * 幂等：已经是新文案就跳过，复跑应输出「0 处」。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

// ---- 精确替换（引号内的内容级，源码单引号 / generated 双引号都能命中）-----------------
const EDITS = [
  // ① 首页 hero-list：从「排序方法论」换成「吸引人的活动类型」
  {
    name: 'hero 1：排序总领 → 酒吧之夜',
    from: 'Ten formats, ranked by how easy each one is to walk into alone',
    to: 'Bar nights and pub crawls: the easiest way to start talking to people here',
  },
  {
    name: 'hero 2：Tier 1 → 美食探索',
    from: 'Tier 1 does most of the work: bar nights, food crawls, language exchange',
    to: 'Food crawls: street food, hotpot and dim sum with a table full of people',
  },
  {
    name: 'hero 3：Tier 2 → 语言交换',
    from: 'Tier 2 for a bigger ask: sports groups, hiking trips, culture workshops',
    to: 'Language exchange: swap your English for Mandarin over a table',
  },
  {
    name: 'hero 4：Tier 3 → 户外运动文化',
    from: 'Tier 3 keeps it varied: board games, holiday parties, coffee, shared interests',
    to: 'Hiking, sports groups and culture workshops: for when an evening is not enough',
  },

  // ② About 页 / 首页都渲染的「活动组织」服务项
  {
    name: 'service.social summary：去掉 ranked by',
    from: 'Ten formats, ranked by how easy each one is to walk into on your own. Bar nights, food crawls and language exchange sit at the top because they need the least explaining and work best for people arriving alone.',
    to: 'Ten formats on the board, from bar nights and pub crawls, food crawls and language exchange through to sports groups, hiking trips and Chinese culture workshops.',
  },
  {
    name: 'service.social points[0]：去 Tier 1',
    from: 'Tier 1: bar nights and pub crawls, food crawls and shared meals, language exchange',
    to: 'Bar nights and pub crawls, food crawls and shared meals, language exchange',
  },
  {
    name: 'service.social points[1]：去 Tier 2',
    from: 'Tier 2: sports and fitness groups, hiking and weekend trips, Chinese culture workshops',
    to: 'Sports and fitness groups, hiking and weekend trips, Chinese culture workshops',
  },
  {
    name: 'service.social points[2]：去 Tier 3',
    from: 'Tier 3: board games and trivia nights, holiday parties, coffee and brunch, interest groups',
    to: 'Board games and trivia nights, holiday parties, coffee and brunch, interest groups',
  },

  // ③ SITE.intro（About 页首段 + JSON-LD description）
  {
    name: 'SITE.intro：去掉排序与方法论',
    from: 'We keep ten meetup formats on the board, ranked by how natural each one is to walk into alone: bar nights and pub crawls, food crawls and language exchange carry most of the load, with sports, hiking and Chinese culture workshops behind them.',
    to: 'We keep ten meetup formats on the board: bar nights and pub crawls, food crawls, language exchange, sports groups, hiking and weekend trips, Chinese culture workshops and more.',
  },

  // ④ FORMAT_TIERS：分组名与说明改成人话（数据里的 tier 字段不动，后台还要用）
  {
    name: 'formatTiers[0] label',
    from: 'Core social engines',
    to: 'Easiest to turn up to alone',
  },
  {
    name: 'formatTiers[0] note',
    from: 'These three carry most of the load. They need the least explanation, they work for people who arrive on their own, and each one solves a problem that is specific to living in China.',
    to: 'The ones you can turn up to on your own without it feeling strange, and each solves a problem that is specific to living in China.',
  },
  {
    name: 'formatTiers[1] label',
    from: 'High interest, strong pull to return',
    to: 'Worth planning ahead for',
  },
  {
    name: 'formatTiers[1] note',
    from: 'Demand is real and people stick around once they start, but each needs more organising than the tier above it.',
    to: 'People stick around once they start, though each takes more organising than a bar night does.',
  },
  {
    name: 'formatTiers[2] label',
    from: 'Steady demand, good as a second option',
    to: 'Also on the board',
  },
  {
    name: 'formatTiers[2] note',
    from: 'Worth keeping in the mix. They either depend on the calendar, need equipment somebody has to supply, or work best once you already know a few faces.',
    to: 'They either depend on the calendar, need equipment somebody has to supply, or work best once you already know a few faces.',
  },

  // ⑤ FAQ：这三条把内部排序方法论直接写给了用户
  {
    name: 'FAQ「GFIC 是什么」：ten ranked formats → 正常列举',
    from: 'the meetups we are building fall into ten ranked formats, led by bar nights and pub crawls, food crawls and language exchange',
    to: 'the meetups we are building fall into ten formats, from bar nights and pub crawls, food crawls and language exchange through to hiking trips and culture workshops',
  },
  {
    name: 'FAQ「有哪些活动」：删掉五个维度的方法论',
    from: 'Ten formats, ranked by how easy each one is to walk into on your own. The three doing most of the work are bar nights and pub crawls, food crawls and shared meals, and language exchange. Behind those sit sports and fitness groups, hiking and weekend trips, and Chinese culture workshops, then board games and trivia, holiday parties, coffee and brunch, and interest groups. We rank them on five things at once: how natural the socialising feels, how familiar the format already is, whether people come back, what changes once you are in China, and how hard it is to turn up alone.',
    to: 'Ten formats, from bar nights and pub crawls, food crawls and shared meals, and language exchange through to sports and fitness groups, hiking and weekend trips, Chinese culture workshops, board games and trivia, holiday parties, coffee and brunch, and interest groups. The ones at the front of the list are the easiest to turn up to on your own.',
  },
  {
    name: 'FAQ「不会中文能参加吗」：去掉 ranked where they are',
    from: 'Yes, and part of the reason our top three formats are ranked where they are is that they work without much language. Bar nights and food crawls need almost none',
    to: 'Yes. Several of the formats work without much language. Bar nights and food crawls need almost none',
  },
];

// ---- 正则替换：城市 highlights 的 `Tier N · ` 前缀 ------------------------------------
const REGEX_EDITS = [
  { name: '城市 highlight 前缀', re: /Tier\s*[123]\s*·\s*/g, to: '' },
  { name: '城市 blurb 里的 Tier N formats', re: /Tier\s*[123]\s+formats:\s*/g, to: '' },
];

const FILES = [
  { path: path.join(root, 'src', 'data', 'site.js'), regex: false },
  { path: path.join(root, 'src', 'data', 'generated', 'site.json'), regex: false },
  { path: path.join(root, 'src', 'data', 'faq.js'), regex: false },
  { path: path.join(root, 'src', 'data', 'generated', 'faq.json'), regex: false },
  { path: path.join(root, 'src', 'data', 'cities.js'), regex: true },
  { path: path.join(root, 'src', 'data', 'generated', 'cities.json'), regex: true },
];

// 自检：用户可见文案里不该再出现 Tier 术语，也不该再讲排序方法论。
// 注意用大写 T + 空格，避免误伤数据字段 `tier: 1`、`tier: 2`（后台分组还要用）。
const BAN = [/Tier\s[123]/, /Tier\s*[123]\s*·/, /ranked by how easy/i, /ranked by five things/i];

let totalApplied = 0;
let totalSkipped = 0;
const problems = [];

for (const file of FILES) {
  const rel = path.relative(root, file.path).replaceAll('\\', '/');
  let text = fs.readFileSync(file.path, 'utf8');
  let applied = 0;
  let skipped = 0;

  for (const edit of EDITS) {
    const countFrom = text.split(edit.from).length - 1;
    const countTo = text.split(edit.to).length - 1;
    if (countTo > 0 && countFrom === 0) {
      skipped += 1;
      continue;
    }
    if (countFrom === 0) continue; // 这份文件本来就没有该文案
    if (countFrom !== 1) {
      problems.push(`${rel}｜${edit.name}：命中 ${countFrom} 次（应为 1）`);
      continue;
    }
    text = text.replace(edit.from, edit.to);
    applied += 1;
  }

  if (file.regex) {
    for (const edit of REGEX_EDITS) {
      const n = (text.match(edit.re) || []).length;
      if (n === 0) continue;
      text = text.replace(edit.re, edit.to);
      applied += 1;
      console.log(`  ${rel}｜${edit.name}：替换 ${n} 处`);
    }
  }

  for (const ban of BAN) {
    const n = (text.match(ban) || []).length;
    if (n > 0) problems.push(`${rel}：残留内部术语 ${ban} ×${n}`);
  }

  if (applied > 0 && WRITE) fs.writeFileSync(file.path, text, 'utf8');
  console.log(`${rel}：应用 ${applied} 处，已应用跳过 ${skipped} 处${WRITE ? '（已写入）' : '（dry-run）'}`);
  totalApplied += applied;
  totalSkipped += skipped;
}

console.log(`\n合计：应用 ${totalApplied} 处，已应用跳过 ${totalSkipped} 处`);
if (problems.length) {
  console.log('\n⚠ 问题：');
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('✓ 自检通过：用户可见文案里没有 Tier 术语，也没有排序方法论');
}
