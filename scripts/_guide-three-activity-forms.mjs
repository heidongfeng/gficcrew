/**
 * 一次性脚本：改写广州指南的 social / food / weekends 三节，并统一头部文案。
 *
 * 背景（同 _cities-three-activity-forms.mjs）：社群最大定位是「活动社群」，
 * 活动主要是三类：① Social mixers & parties ② Food crawls & dining ③ Hiking & city walks。
 * 指南的社交章节要按这三类组织，并与 14 城的表述口径一致。
 *
 * 顺带修一处主权表述隐患：weekends 节原文写 "Hong Kong and Macau are easy
 * weekend trips"，未带 China —— 改为规范写法。
 *
 * 用法：node scripts/_guide-three-activity-forms.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const genPath = path.join(root, 'src', 'data', 'generated', 'guides.json');
const guides = JSON.parse(fs.readFileSync(genPath, 'utf8'));
const g = guides.find((x) => x.slug === 'guangzhou');
if (!g) {
  console.error('❌ 找不到 guangzhou 指南');
  process.exit(1);
}

// ---- 1. social 节：以三类活动为骨架重写 ----
const social = g.sections.find((s) => s.id === 'social');
social.title = 'Meeting people: the social scene';
social.paragraphs = [
  'Guangzhou is easier to make friends in than most Chinese megacities, mostly because the expat community is smaller and more concentrated, so you keep running into the same people. The crew is an events crew first, and almost everything it runs falls into one of three formats: social mixers and parties, food crawls and dining, and hiking and city walks.',
  'Social mixers and parties are the fastest way in. Think riverfront pub crawls in Zhujiang New Town, international potluck dinners, and rooftop meetups where nobody expects you to speak Chinese. Food crawls and dining come a close second: a monthly street-food crawl through Liwan and Yuexiu, dim sum mornings, and Cantonese cooking sessions where the eating is the point. If you would rather be outdoors, the hiking and city walks format covers Baiyun Mountain sunrise hikes, Shamian Island and old-town walks, and weekend camping trips to Conghua.',
  'If you are new, the fastest route in is a potluck or a food crawl. Both are structured enough that you are never standing alone, and both involve talking about food, which works in any language.',
];

// ---- 2. food 节：末段加一句把 food crawl 明确归到「美食探索」这类活动 ----
const food = g.sections.find((s) => s.id === 'food');
food.paragraphs = [
  food.paragraphs[0],
  'Start with dim sum on a weekend morning, which is the social heart of Cantonese food culture. Then work through clay pot rice, roast goose, wonton noodles, rice noodle rolls, herbal jelly and egg tarts. Our Liwan street food crawl covers most of this in one evening — food crawls and dining are one of the three formats the crew runs, alongside social mixers and outdoor walks.',
];

// ---- 3. weekends 节：修主权表述 + 明确 hik/walk 类活动 ----
const weekends = g.sections.find((s) => s.id === 'weekends');
weekends.title = 'Weekends and day trips from Guangzhou';
weekends.paragraphs = [
  'Guangzhou is a good base for exploring southern China. Conghua and Zengcheng offer hot springs and hiking within two hours. Baiyun Mountain is inside the city. Hong Kong, China and Macao, China are easy weekend trips, and the karst scenery of Guilin is a single high-speed train ride away.',
  'Several of these run as crew group trips under our hiking and city walks format — a day on Baiyun Mountain, a walk through the old quarters, or a weekend camping trip to Conghua. Group trips are cheaper and considerably more fun than going alone.',
];

// ---- 4. 头部文案：把三类活动带进 intro / description ----
g.intro = [
  'Guangzhou is our home base and the city where GFIC Crew is most active. This guide covers what you actually need to sort out in your first month — visa, apartment, bank account, WeChat Pay, healthcare, transport — and then how to enjoy the city: Cantonese food, language and the social scene, built around the three formats the crew runs most: social mixers and parties, food crawls and dining, and hiking and city walks.',
];
g.description =
  'A practical living guide for expats in Guangzhou: visas and residence permits, apartment rental and district prices, banking and WeChat Pay, healthcare, transport, Cantonese food, language and a social scene built on three formats — social mixers and parties, food crawls and dining, and hiking and city walks.';

// ---- 5. 修既有内容的港澳表述（全站规范：必须写「中国香港 / 中国澳门」）----
// 原写法漏了 China，属合规隐患，一并纠正（只动地名，不改其它内容）。
const whyGz = g.sections.find((s) => s.id === 'why-guangzhou');
whyGz.paragraphs[1] = whyGz.paragraphs[1].replace(
  'Hong Kong, Shenzhen and most of Southeast Asia',
  'Hong Kong, China, Shenzhen and most of Southeast Asia',
);

const gettingAround = g.sections.find((s) => s.id === 'getting-around');
gettingAround.paragraphs[1] = gettingAround.paragraphs[1].replace(
  'connects to Hong Kong (about 50 minutes)',
  'connects to Hong Kong, China (about 50 minutes)',
);

// ---- 自检 ----
const problems = [];
const blob = [g.intro.join(' '), g.description, ...g.sections.flatMap((s) => s.paragraphs)].join(' ');
for (const [label, re] of [
  ['social mixers and parties', /social mixers and parties/i],
  ['food crawls and dining', /food crawls and dining/i],
  ['hiking and city walks', /hiking and city walks/i],
]) {
  if (!re.test(blob)) problems.push(`三类活动的统一表述缺：${label}`);
}
// 港澳表述：凡出现港澳名，后面必须紧跟 , China
const sovHits = [...blob.matchAll(/\b(Hong Kong|Macau|Macao)\b(?!, China)/g)];
if (sovHits.length) problems.push(`港澳表述未带 ", China"：${sovHits.map((m) => m[0]).join(' | ')}`);
if (/vpn|job lead|we (?:help|handle) .{0,20}visa/i.test(blob)) problems.push('命中红线词');

console.log('=== 自检 ===');
console.log('  social 节段数：', social.paragraphs.length);
console.log('  三类活动表述：', /social mixers and parties/i.test(blob) && /food crawls and dining/i.test(blob) && /hiking and city walks/i.test(blob) ? '✓ 全含' : '✗');
console.log('  港澳表述：', sovHits.length ? '✗ ' + sovHits.length + ' 处未带 China' : '✓ 全部规范');
if (problems.length) {
  console.log('\n❌ 自检不通过：');
  problems.forEach((p) => console.log('   ' + p));
  process.exit(1);
}
console.log('\n✓ 自检通过');

if (!WRITE) {
  console.log('\n（dry-run，未落盘。加 --write 才写入）');
  process.exit(0);
}

fs.writeFileSync(genPath, JSON.stringify(guides, null, 2) + '\n', 'utf8');
console.log(`\n✓ 已写入 ${path.relative(root, genPath)}`);
