/**
 * 幂等脚本：把首页「社群信息」和 About 页用到的数据，对齐到十类活动形式的 Tier 口径。
 *
 * 背景：上一轮升级了 /events/ /cities/ /faq/ /llms-full.txt，但漏了两处最显眼的地方：
 *   1. 首页 hero 的 hero-list（HOME.highlights）—— 还在用旧四分类
 *      （Social mixers / Food crawls / Hiking / Language exchange），
 *      顺带 "Founded by passionate locals who know every corner of this country" 这句夸大，
 *      与 About 页 SITE.intro 的 "Founded by locals who know the country well" 不一致。
 *   2. ORG_METHODS 第 1 条把「第三方合作」写成了现在进行时，
 *      但 FAQ 里已经改成 "partner events are planned for later"。
 *
 * 只改文字，不改结构：highlights 仍是 4 条，ORG_METHODS 仍是 3 条。
 *
 * 用法：node scripts/_formats-home-about.mjs [--write]
 * 幂等：已经是新文案就跳过，复跑应输出「0 处」。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

// 引号内的内容级替换 —— site.js 用单引号、generated/site.json 用双引号，
// 所以这里不写引号，两个文件同一份 from/to 就能都命中。
const EDITS = [
  {
    name: 'hero-list 第 1 条：旧「社交派对」→ 十类总领',
    from: 'Social mixers & parties: rooftop meetups, potlucks and pub crawls',
    to: 'Ten formats, ranked by how easy each one is to walk into alone',
  },
  {
    name: 'hero-list 第 2 条：旧「美食」→ Tier 1',
    from: 'Food crawls & dining: street-food walks, hotpot feasts and dim sum sessions',
    to: 'Tier 1 does most of the work: bar nights, food crawls, language exchange',
  },
  {
    name: 'hero-list 第 3 条：旧「徒步」（含长城徒步=宣称北京办活动）→ Tier 2',
    from: 'Hiking & city walks: Great Wall treks, coastal hikes and old-town strolls',
    to: 'Tier 2 for a bigger ask: sports groups, hiking trips, culture workshops',
  },
  {
    name: 'hero-list 第 4 条：旧「语言+文化」→ Tier 3',
    from: 'Language exchange and cultural workshops: Mandarin, Cantonese, calligraphy, tea and Mahjong',
    to: 'Tier 3 keeps it varied: board games, holiday parties, coffee, shared interests',
  },
  {
    name: '首页 lead：夸大表述 → 与 About 页一致',
    from: 'Founded by passionate locals who know every corner of this country',
    to: 'Founded by locals who know the country well',
  },
  {
    name: '组织方式第 1 条：第三方合作改为「以后做」',
    from: 'Co-creation and execution through third-party partnerships: the GFIC Crew team provides organizational support.',
    to: 'Co-creation and execution through third-party partnerships: planned for later, with the GFIC Crew team providing organizational support.',
  },
];

const FILES = [
  path.join(root, 'src', 'data', 'site.js'),
  path.join(root, 'src', 'data', 'generated', 'site.json'),
];

// 自检：改完之后不应该还有旧口径残留
const BAN = [
  'Social mixers & parties',
  'Food crawls & dining',
  'Hiking & city walks',
  'Great Wall treks',
  'know every corner of this country',
];

let totalApplied = 0;
let totalSkipped = 0;
const problems = [];

for (const file of FILES) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  let text = fs.readFileSync(file, 'utf8');
  let applied = 0;
  let skipped = 0;

  for (const edit of EDITS) {
    const countFrom = text.split(edit.from).length - 1;
    const countTo = text.split(edit.to).length - 1;

    if (countTo > 0 && countFrom === 0) {
      skipped += 1;
      continue; // 已经改过了
    }
    if (countFrom !== 1) {
      problems.push(`${rel}｜${edit.name}：命中 ${countFrom} 次（应为 1）`);
      continue;
    }
    text = text.replace(edit.from, edit.to);
    applied += 1;
  }

  if (applied > 0 && WRITE) {
    fs.writeFileSync(file, text, 'utf8');
  }
  console.log(`${rel}：应用 ${applied} 处，已应用跳过 ${skipped} 处${WRITE ? '（已写入）' : '（dry-run）'}`);
  totalApplied += applied;
  totalSkipped += skipped;

  // 自检在「替换后的内存文本」上跑，这样 dry-run 也能验证结果（而不是重读未改的原文）
  for (const ban of BAN) {
    const n = text.split(ban).length - 1;
    if (n > 0) problems.push(`${rel}：残留旧文案「${ban}」×${n}`);
  }
}

console.log(`\n合计：应用 ${totalApplied} 处，已应用跳过 ${totalSkipped} 处`);
if (problems.length) {
  console.log('\n⚠ 问题：');
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('✓ 自检通过，无旧文案残留');
}
