#!/usr/bin/env node
// 只读诊断：首页与 About 页「页面上」真正重复的内容。不做任何修改。
// 直接比对构建产物的正文，不看数据源——数据源里还有的值，页面上可能早就不显示了。
//   node scripts/_home-about-overlap.mjs

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function mainText(file) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  const m = raw.match(/<main[\s\S]*?<\/main>/i);
  return (m ? m[0] : raw)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentences(t) {
  return t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);
}

const home = mainText('dist-global/index.html');
const about = mainText('dist-global/about/index.html');

console.log(`首页正文 ${home.length} 字符 / About 正文 ${about.length} 字符\n`);

const hs = sentences(home);
const as = sentences(about);

const exact = as.filter((s) => hs.includes(s));
console.log(`===== 两页逐字相同的句子：${exact.length} 句 =====`);
for (const s of exact) console.log(`  · ${s}`);

function bestCoverage(s, others) {
  const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return 0;
  let best = 0;
  for (const o of others) {
    const ol = o.toLowerCase();
    const hit = words.filter((w) => ol.includes(w)).length;
    best = Math.max(best, hit / words.length);
  }
  return best;
}

const high = as
  .filter((s) => !exact.includes(s))
  .map((s) => ({ s, c: bestCoverage(s, hs) }))
  .filter((x) => x.c >= 0.75);
console.log(`\n===== About 里与首页高度重合（≥75% 用词）的句子：${high.length} 句 =====`);
for (const x of high) console.log(`  · [${Math.round(x.c * 100)}%] ${x.s.slice(0, 130)}`);

const revHigh = hs
  .filter((s) => !as.includes(s))
  .map((s) => ({ s, c: bestCoverage(s, as) }))
  .filter((x) => x.c >= 0.75);
console.log(`\n===== 首页里与 About 高度重合（≥75% 用词）的句子：${revHigh.length} 句 =====`);
for (const x of revHigh) console.log(`  · [${Math.round(x.c * 100)}%] ${x.s.slice(0, 130)}`);

console.log('\n===== 结论 =====');
const totalDup = exact.length + high.length + revHigh.length;
console.log(totalDup === 0 ? '  ✅ 页面层面没有实质重复' : `  ⚠️  仍有 ${totalDup} 句重复或高度重合`);
