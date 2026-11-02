/**
 * 一次性脚本：把广州指南的 list / faq 字段也同步到三类活动口径 + 港澳规范表述。
 *
 * 上一版 _guide-three-activity-forms.mjs 只改了 paragraphs，漏了 section.list 与 guide.faq。
 * 本脚本补齐，使 generated 与 src/data/guangzhou.js 兜底逐字一致。
 *
 * 用法：node scripts/_guide-list-faq-sync.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const genPath = path.join(root, 'src', 'data', 'generated', 'guides.json');
const guides = JSON.parse(fs.readFileSync(genPath, 'utf8'));
const g = guides.find((x) => x.slug === 'guangzhou');

// ---- social.list：三类活动作骨架 ----
const social = g.sections.find((s) => s.id === 'social');
social.list = [
  'Social mixers and parties: riverfront pub crawls, international potlucks and rooftop meetups',
  'Food crawls and dining: monthly Liwan street food crawl and dim sum making workshops',
  'Hiking and city walks: Baiyun Mountain hikes, old-town walks and weekend camping in Conghua',
  'Weekly Cantonese and Mandarin language exchange',
  'Weekly badminton social night',
  'Quarterly weekend camping trip to Conghua',
];

// ---- getting-around.list：港澳表述规范 ----
const ga = g.sections.find((s) => s.id === 'getting-around');
ga.list = ga.list.map((x) => x.replace('High-speed rail: Hong Kong in 50 minutes', 'High-speed rail: Hong Kong, China in 50 minutes'));

// ---- faq：港澳表述规范 ----
g.faq = g.faq.map((f) => ({
  ...f,
  a: f.a.replace('fast rail links to Hong Kong, Shenzhen', 'fast rail links to Hong Kong, China, Shenzhen'),
}));

// ---- 自检 ----
const blob = [g.intro.join(' '), g.description, ...g.sections.flatMap((s) => [...s.paragraphs, ...(s.list || [])]), ...g.faq.map((f) => f.a)].join(' ');
const problems = [];
const sov = [...blob.matchAll(/\b(Hong Kong|Macau|Macao)\b(?!, China)/g)];
if (sov.length) problems.push(`港澳表述未带 ", China"：${sov.map((m) => m[0]).join(' | ')}`);
if (!/Social mixers and parties:/.test(social.list[0])) problems.push('social.list 第 1 条不是社交聚会与派对');
if (!/Food crawls and dining:/.test(social.list[1])) problems.push('social.list 第 2 条不是美食探索');
if (!/Hiking and city walks:/.test(social.list[2])) problems.push('social.list 第 3 条不是户外徒步与城市漫步');

console.log('=== 自检 ===');
console.log('  social.list 条数：', social.list.length, '｜前三类：', /Social mixers and parties:/.test(social.list[0]) && /Food crawls and dining:/.test(social.list[1]) && /Hiking and city walks:/.test(social.list[2]) ? '✓' : '✗');
console.log('  港澳表述：', sov.length ? '✗ ' + sov.length + ' 处' : '✓ 全部规范');
console.log('  faq 条数：', g.faq.length);

if (problems.length) {
  console.log('\n❌ 自检不通过：');
  problems.forEach((p) => console.log('   ' + p));
  process.exit(1);
}
console.log('\n✓ 自检通过');

if (!WRITE) {
  console.log('\n（dry-run，未落盘）');
  process.exit(0);
}
fs.writeFileSync(genPath, JSON.stringify(guides, null, 2) + '\n', 'utf8');
console.log(`\n✓ 已写入 ${path.relative(root, genPath)}`);
