#!/usr/bin/env node
// 只读诊断：比较首页与 About 页"谁更全"。不做任何修改。
//   node scripts/_home-about-thickness.mjs

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// 产物：dist-global/index.html 与 dist-global/about/index.html
const pages = [
  { name: '首页 Home', file: 'dist-global/index.html' },
  { name: '关于页 About', file: 'dist-global/about/index.html' },
];

for (const p of pages) {
  const fp = path.join(root, p.file);
  if (!fs.existsSync(fp)) { console.log(`${p.name}: 产物不存在，先 build`); continue; }
  const raw = fs.readFileSync(fp, 'utf8');

  // 只取 <main> 里的内容，排除 header/footer（那是全站共用的）
  const mainMatch = raw.match(/<main[\s\S]*?<\/main>/i);
  const main = mainMatch ? mainMatch[0] : raw;
  const t = textOf(main);

  // 数 h2（一个 h2 = 一个区块）
  const h2s = [...raw.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => textOf(m[1]))
    .filter((s) => s && s.length < 60);

  console.log(`\n===== ${p.name} =====`);
  console.log(`  正文字数（main 内）: ${t.length}`);
  console.log(`  区块数（h2）: ${h2s.length}`);
  h2s.forEach((h, i) => console.log(`    ${i + 1}. ${h}`));
}

console.log('\n===== 首页比 About 少了什么（About 独有的信息）=====');
const aboutRaw = fs.readFileSync(path.join(root, 'dist-global/about/index.html'), 'utf8');
const homeRaw = fs.readFileSync(path.join(root, 'dist-global/index.html'), 'utf8');
const aboutT = textOf(aboutRaw.match(/<main[\s\S]*?<\/main>/i)?.[0] || aboutRaw);
const homeT = textOf(homeRaw.match(/<main[\s\S]*?<\/main>/i)?.[0] || homeRaw);

const aboutSent = aboutT.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 40);
const missing = aboutSent.filter((s) => !homeT.includes(s.slice(0, 60)));
console.log(`  About 共 ${aboutSent.length} 个长句，其中 ${missing.length} 句在首页完全找不到：`);
for (const s of missing.slice(0, 12)) console.log(`    · ${s.slice(0, 120)}…`);
if (missing.length > 12) console.log(`    ... 还有 ${missing.length - 12} 句`);
