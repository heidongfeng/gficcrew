#!/usr/bin/env node
// 线上内容体检：把抓下来的线上页面和本地 dist-global 产物逐页对比，
// 找出「线上有、本地没有」的差异，用于排查是不是别的窗口动过官网。
//
//   node scripts/_online-forensics.mjs <线上页面目录>
//
// 路径全部从脚本自身位置解析，不依赖 process.cwd()。

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ONLINE = process.argv[2] || 'C:/tmp/gfic-online';

// 线上文件名 → 本地产物路径
const MAP = {
  'com-home.html': 'index.html',
  'com-about.html': 'about/index.html',
  'com-events.html': 'events/index.html',
  'com-cities.html': 'cities/index.html',
  'com-faq.html': 'faq/index.html',
  'com-guides.html': 'guides/index.html',
  'com-contact.html': 'contact/index.html',
  'com-account.html': 'account/index.html',
};

// 不该出现的表述（老郑定过的红线）
const BANS = [
  { id: 'tier-literal', re: /\bTier\s*[123]\b/i },
  { id: 'ranked-by', re: /\branked\s+(by|on)\b/i },
  { id: 'ordinal-of-ten', re: /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+of\s+(our|the)\s+ten\b/i },
  { id: 'sits-ordinal', re: /\bsits?\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i },
  { id: 'top-n', re: /\btop\s+(three|four|five)\b/i },
  { id: 'at-top-of', re: /\bat the top of\b/i },
  { id: 'highest-of', re: /\bthe highest of\b/i },
];

// 已知的第三方机构名（内部清单里有，但对外不得出现）
const THIRD_PARTY = [
  'amcham', 'chamber of commerce', 'internations', 'gzstuff', 'asiaxpat',
  'alloexpat', 'thatsguangzhou', "that's guangzhou", 'expat.com',
];

// 会员口径：必须是将来时，不能让人以为现在能付款
const MEMBERSHIP_NOW = /\b(membership|member plan|paid plan)\b[^\n.]{0,80}\b(is|are)\s+(now\s+)?(open|available|live)\b/i;

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

let problems = 0;

console.log('===== 1. 线上 vs 本地产物：差异 =====');
for (const [onlineName, localRel] of Object.entries(MAP)) {
  const op = path.join(ONLINE, onlineName);
  const lp = path.join(root, 'dist-global', localRel);
  if (!fs.existsSync(op)) { console.log(`  [跳过] 线上没有 ${onlineName}`); continue; }
  if (!fs.existsSync(lp)) { console.log(`  [缺] 本地没有 ${localRel}`); continue; }

  const o = fs.readFileSync(op, 'utf8');
  const l = fs.readFileSync(lp, 'utf8');

  // 字节完全一致 = 线上就是本地这一版（已发布）
  if (o === l) { console.log(`  ✅ 完全一致  ${localRel}`); continue; }

  const ot = textOf(o);
  const lt = textOf(l);
  // 抓出线上有、本地没有的句子（按句号切）
  const oSent = new Set(ot.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25));
  const lSent = new Set(lt.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25));
  const onlyOnline = [...oSent].filter((s) => !lSent.has(s));

  console.log(`  ⚠️  有差异  ${localRel}  （线上 ${o.length}B / 本地 ${l.length}B）`);
  if (onlyOnline.length === 0) {
    console.log(`       差异只在标签/属性层面，正文句子无新增`);
  } else {
    for (const s of onlyOnline.slice(0, 8)) {
      console.log(`       线上独有: ${s.slice(0, 160)}`);
    }
    if (onlyOnline.length > 8) console.log(`       ... 还有 ${onlyOnline.length - 8} 句`);
  }
}

console.log('\n===== 2. 红线表述扫描（线上页面）=====');
const files = fs.readdirSync(ONLINE).filter((f) => f.endsWith('.html'));
for (const f of files) {
  const raw = fs.readFileSync(path.join(ONLINE, f), 'utf8');
  const t = textOf(raw);
  const hits = BANS.filter((b) => b.re.test(t)).map((b) => b.id);
  if (hits.length) {
    problems += hits.length;
    console.log(`  ❌ ${f}  命中: ${hits.join(', ')}`);
    for (const b of BANS) {
      const m = t.match(new RegExp(`.{0,90}${b.re.source}.{0,90}`, 'i'));
      if (m) console.log(`       …${m[0].trim()}…`);
    }
  }
}
if (!problems) console.log('  ✅ 0 处');

console.log('\n===== 3. 第三方机构名（线上页面）=====');
let tp = 0;
for (const f of files) {
  const t = textOf(fs.readFileSync(path.join(ONLINE, f), 'utf8')).toLowerCase();
  const hit = THIRD_PARTY.filter((k) => t.includes(k));
  if (hit.length) { tp += hit.length; console.log(`  ❌ ${f}  出现: ${hit.join(', ')}`); }
}
if (!tp) console.log('  ✅ 0 处');

console.log('\n===== 4. 会员口径（写成"现已开放"= 错）=====');
let mm = 0;
for (const f of files) {
  const t = textOf(fs.readFileSync(path.join(ONLINE, f), 'utf8'));
  if (MEMBERSHIP_NOW.test(t)) { mm += 1; console.log(`  ❌ ${f}`); }
}
if (!mm) console.log('  ✅ 0 处');

console.log('\n===== 5. 疑似 404 的页面（小于 2KB）=====');
for (const f of files) {
  const raw = fs.readFileSync(path.join(ONLINE, f), 'utf8');
  if (raw.length < 2000) {
    const title = (raw.match(/<title>([^<]*)<\/title>/) || [])[1] || '(无)';
    console.log(`  ⚠️  ${f}  ${raw.length}B  title="${title.trim()}"`);
  }
}

console.log(`\n红线合计: ${problems} 处 / 第三方 ${tp} 处 / 会员 ${mm} 处`);
process.exit(problems + tp + mm > 0 ? 1 : 0);
