/** 发布前确认后台产物 CSS 里确实带上了手机端修复（压缩后关键字仍在）。 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dir = join(ROOT, 'dist-global', '_astro');
const css = readdirSync(dir)
  .filter((f) => f.startsWith('admin.') && f.endsWith('.css'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');
const js = readdirSync(dir)
  .filter((f) => f.includes('admin.astro_astro_type_script'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

const MUST_CSS = [
  ['minmax(0', '侧栏/主区 grid 列下限'],
  ['hover:none', '触屏常驻删除按钮'],
  ['safe-area-inset-bottom', 'iPhone 底部安全区'],
  ['mon-scroll', '表格横滑容器'],
  ['overflow-x:auto', '横滑生效'],
];
const MUST_JS = [['mon-scroll', 'JS 里给表格套了容器']];

let bad = 0;
console.log('CSS 产物：');
for (const [k, why] of MUST_CSS) {
  const ok = css.includes(k);
  if (!ok) bad += 1;
  console.log(`  ${ok ? '✓' : '❌'} ${k.padEnd(26)} ${why}`);
}
console.log('JS 产物：');
for (const [k, why] of MUST_JS) {
  const ok = js.includes(k);
  if (!ok) bad += 1;
  console.log(`  ${ok ? '✓' : '❌'} ${k.padEnd(26)} ${why}`);
}
const bp = (css.match(/max-width:\s*640px/g) || []).length;
console.log(`\n≤640px 断点数：${bp}`);
if (bad) {
  console.log('\n✗ 产物缺修复，别发布');
  process.exit(1);
}
console.log('\n✓ 产物含全部手机端修复');
