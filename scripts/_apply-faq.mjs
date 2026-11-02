/**
 * 一次性脚本：把 src/data/faq.js 里 LOCAL_FAQ 的 a（答案）同步进 src/data/generated/faq.json。
 * 按 q 匹配 —— q 不改（云端按 slugify(q) 认条目），只同步答案文本。
 * 用法：node scripts/_apply-faq.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const src = fs.readFileSync(path.join(root, 'src/data/faq.js'), 'utf8');
const m = src.match(/const LOCAL_FAQ = (\[[\s\S]*?\n\]);/);
if (!m) {
  console.error('❌ 找不到 LOCAL_FAQ 数组');
  process.exit(1);
}
const local = eval(m[1]);
const byQ = new Map(local.map((x) => [x.q, x]));

const genPath = path.join(root, 'src/data/generated/faq.json');
const gen = JSON.parse(fs.readFileSync(genPath, 'utf8'));

let changed = 0;
const missed = [];
for (const g of gen) {
  const l = byQ.get(g.q);
  if (!l) {
    missed.push(g.q);
    continue;
  }
  if (g.a !== l.a) {
    console.log(`  ✎ ${g.q.slice(0, 60)}`);
    g.a = l.a;
    changed += 1;
  }
}
console.log(`generated/faq.json ${gen.length} 条，更新 ${changed} 条答案`);
if (missed.length) {
  console.log(`⚠️ generated 里 ${missed.length} 条在 LOCAL_FAQ 找不到（q 不一致，不动）：`);
  missed.slice(0, 10).forEach((q) => console.log('   - ' + q));
}
if (WRITE) fs.writeFileSync(genPath, JSON.stringify(gen, null, 2) + '\n');
console.log(WRITE ? '✓ 已写入' : '（dry-run）');
