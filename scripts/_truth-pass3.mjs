/**
 * 第三批：清掉**周期性承诺**（weekly / monthly / quarterly / recurring）。
 *
 * 前两批清的是「我们有 14 个分部」和「我们提供线下服务」，这一批清的是频次。
 * 判据：列活动「形式」是安全的（food crawls、hiking），但说它「每周办」就是承诺 ——
 * 老郑只有一个人，目前办不出任何固定频次。改成不带频次的复数形式即可，
 * 信息量几乎不变，AI 照样能引用「GFIC Crew 在广州办语言交换」，只是不再谎报周期。
 *
 * 用法：node scripts/_truth-pass3.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const js = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const REPS = [
  ['Weekly Cantonese and Mandarin language exchange', 'Cantonese and Mandarin language exchange'],
  ['Weekly badminton social night', 'Badminton social nights'],
  ['Quarterly weekend camping trip to Conghua', 'Weekend camping trips to Conghua'],
  [
    'a monthly street-food crawl through Liwan and Yuexiu',
    'street-food crawls through Liwan and Yuexiu',
  ],
  [
    'Food crawls and dining: monthly Liwan street food crawl and dim sum making workshops',
    'Food crawls and dining: Liwan street food crawls and dim sum making workshops',
  ],
  [
    'GFIC Crew runs a weekly language exchange in Guangzhou that splits each session between Mandarin and Cantonese, plus an online survival Chinese crash course every two weeks covering the phrases that actually matter in your first month.',
    'GFIC Crew runs language exchange meetups in Guangzhou that split each session between Mandarin and Cantonese, plus occasional online survival Chinese sessions covering the phrases that actually matter in your first month.',
  ],
  [
    'GFIC Crew is built around recurring, crew-led real-life events and practical mutual support:',
    'GFIC Crew is built around crew-led real-life meetups and practical mutual support:',
  ],
  [
    'Many of our most popular recurring events started as a member’s one-off idea.',
    'Some of the formats we run most often started as a member’s one-off idea.',
  ],
];

const FILES = [
  { p: 'src/data/generated/cities.json', json: true },
  { p: 'src/data/cities.js', json: false },
  { p: 'src/data/generated/guides.json', json: true },
  { p: 'src/data/guangzhou.js', json: false },
  { p: 'src/data/guides.js', json: false },
  { p: 'src/data/generated/faq.json', json: true },
  { p: 'src/data/faq.js', json: false },
];

const CODE_ONLY = [
  {
    file: 'src/pages/about.astro',
    old: 'built on recurring events and practical help for newcomers.',
    new: 'built on real-world meetups and practical help for newcomers.',
  },
  {
    file: 'src/pages/llms-full.txt.ts',
    old: 'out.push(`## Events (${EVENTS.length} recurring formats)`);',
    new: "out.push('## Events — formats the crew runs');",
  },
  {
    file: 'src/pages/llms-full.txt.ts',
    old: "out.push('Dates below are rolling example dates for the public calendar; members see the live schedule.');",
    new: "out.push('In-person meetups happen in Guangzhou and Shenzhen. Confirmed dates are announced inside the WeChat groups.');",
  },
];

const orig = new Map();
for (const f of FILES) orig.set(f.p, fs.readFileSync(path.join(root, f.p), 'utf8'));
for (const c of CODE_ONLY) if (!orig.has(c.file)) orig.set(c.file, fs.readFileSync(path.join(root, c.file), 'utf8'));
const next = new Map(orig);
const perFile = new Map();
const hit = (p) => perFile.set(p, (perFile.get(p) || 0) + 1);

for (const [oldStr, newStr] of REPS) {
  for (const f of FILES) {
    const src = f.json ? oldStr : js(oldStr);
    const dst = f.json ? newStr : js(newStr);
    const text = next.get(f.p);
    if (text.split(src).length - 1 === 0) continue;
    hit(f.p);
    next.set(f.p, text.split(src).join(dst));
  }
}
for (const c of CODE_ONLY) {
  const text = next.get(c.file);
  if (text.split(c.old).length - 1 > 0) {
    hit(c.file);
    next.set(c.file, text.split(c.old).join(c.new));
  }
}

console.log('\n=== 各文件替换数 ===');
for (const [k, v] of [...perFile.entries()].sort()) console.log(`  ${String(v).padStart(2)} 处  ${k}`);
console.log(`  合计 ${[...perFile.values()].reduce((a, b) => a + b, 0)} 处`);

const dead = REPS.filter(([o]) => {
  for (const f of FILES) if (orig.get(f.p).includes(f.json ? o : js(o))) return false;
  for (const c of CODE_ONLY) if ((orig.get(c.file) ?? '').includes(c.old)) return false;
  return true;
});
console.log('\n=== 完全没命中的替换（必须为空）===');
if (dead.length === 0) console.log('   ✓ 全部命中');
else dead.forEach(([s]) => console.log('   ✗ ' + s.slice(0, 80)));

const desync = [];
for (const [, newStr] of REPS) {
  let inGen = false;
  let inJs = false;
  for (const f of FILES) {
    if (next.get(f.p).includes(f.json ? newStr : js(newStr))) f.json ? (inGen = true) : (inJs = true);
  }
  if (inGen !== inJs) desync.push(newStr.slice(0, 60));
}
console.log('\n=== 两端同步 ===');
if (desync.length === 0) console.log('   ✓ 每条新文案两端都在');
else desync.forEach((s) => console.log('   ✗ 只有一端有：' + s));

console.log('\n=== 残留自检 ===');
const bad = [];
for (const [p, text] of next) {
  const m = text.match(/.{0,60}\b(weekly|monthly|quarterly|recurring)\b.{0,60}/gi);
  if (m) bad.push(`${p}: ${[...new Set(m)].slice(0, 2).join(' ／ ').replace(/\s+/g, ' ').slice(0, 170)}`);
}
if (bad.length === 0) console.log('   ✓ 未发现 weekly/monthly/quarterly/recurring');
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
console.log(`\n✓ 已落盘 ${n} 个文件。`);
