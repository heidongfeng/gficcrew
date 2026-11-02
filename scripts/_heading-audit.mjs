#!/usr/bin/env node
// 只读诊断：全站每个页面的 breadcrumb / eyebrow / h1 组合，找出标题区语义重复。
//   node scripts/_heading-audit.mjs

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist-global');

const dec = (s) =>
  String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function grab(html, re) {
  const m = html.match(re);
  return m ? dec(m[1].replace(/<[^>]+>/g, '')) : '';
}

const pages = [];
// 顶层 index.html
pages.push({ name: '/', file: path.join(dist, 'index.html') });
// 每个子目录
for (const d of fs.readdirSync(dist, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  if (d.name === '_astro' || d.name === 'admin') continue;
  const f = path.join(dist, d.name, 'index.html');
  if (fs.existsSync(f)) pages.push({ name: '/' + d.name + '/', file: f });
}

const rows = [];
for (const p of pages) {
  const html = fs.readFileSync(p.file, 'utf8');
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];

  const breadcrumb = grab(main, /<p class="breadcrumb"[^>]*>([\s\S]*?)<\/p>/i);
  // 取 main 里第一个 eyebrow 和第一个 h1
  const eyebrow = grab(main, /<span class="eyebrow"[^>]*>([\s\S]*?)<\/span>/i);
  const h1 = grab(main, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = grab(html, /<title>([\s\S]*?)<\/title>/i);

  rows.push({ name: p.name, breadcrumb, eyebrow, h1, title });
}

function norm(s) {
  return dec(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// 判断 eyebrow 与 h1 是否语义重复
function redundancy(eyebrow, h1) {
  const e = norm(eyebrow);
  const h = norm(h1);
  if (!e || !h) return { level: 'none', why: '' };
  if (e === h) return { level: '完全重复', why: 'eyebrow 与 h1 一字不差' };
  if (h.startsWith(e) || e.startsWith(h)) return { level: '包含关系', why: 'eyebrow 是 h1 的前缀/子串' };
  // eyebrow 的每个词都在 h1 里出现
  const ew = e.split(' ').filter(Boolean);
  const hw = new Set(h.split(' ').filter(Boolean));
  const allIn = ew.length > 0 && ew.every((w) => hw.has(w));
  if (allIn) return { level: '词全重合', why: `eyebrow 的词都在 h1 里：${ew.join(' / ')}` };
  // 缩写：如 FAQ vs Frequently asked questions
  const initials = h.split(' ').filter(Boolean).map((w) => w[0]).join('');
  if (e.replace(/\s/g, '') === initials) return { level: '缩写对全称', why: `${eyebrow} = ${h1}` };
  return { level: 'none', why: '' };
}

console.log('页面标题区结构（breadcrumb / eyebrow / h1）\n');
console.log('='.repeat(100));
let issues = 0;
for (const r of rows) {
  const rd = redundancy(r.eyebrow, r.h1);
  if (rd.level !== 'none') issues += 1;
  const flag = rd.level === 'none' ? '  ' : '⚠️';
  console.log(`${flag} ${r.name}`);
  console.log(`     breadcrumb : ${r.breadcrumb || '（无）'}`);
  console.log(`     eyebrow    : ${r.eyebrow || '（无）'}`);
  console.log(`     h1         : ${r.h1 || '（无）'}`);
  if (rd.level !== 'none') console.log(`     → ${rd.level}：${rd.why}`);
  console.log('');
}
console.log('='.repeat(100));
console.log(`共 ${rows.length} 个页面，其中 ${issues} 个页面的 eyebrow 与 h1 有语义重复`);
