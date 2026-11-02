// 审计：.astro 里用到的 class，是否在 global.css 或组件内 <style> 中定义
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SRC);
const astro = files.filter((f) => f.endsWith('.astro'));

// 收集 global.css 定义的类名
const globalCss = fs.readFileSync(path.join(SRC, 'styles/global.css'), 'utf8');
const defined = new Set();
for (const m of globalCss.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);

// 收集组件/页面内 <style> 块定义的类名（scoped 或 global）
const scopedDefined = new Set();
const astroDefined = new Map();
for (const f of astro) {
  const src = fs.readFileSync(f, 'utf8');
  const set = new Set();
  for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const c of m[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      set.add(c[1]);
      scopedDefined.add(c[1]);
    }
  }
  astroDefined.set(f, set);
}

// 收集 .astro 里实际使用的类名（class="..." 与 class:list / class={...} 中的字符串）
const used = new Map(); // cls -> Set(file)
function collect(str, file) {
  for (const m of str.matchAll(/class(?:Name)?=(?:"([^"]*)"|'([^']*)')/g)) {
    const raw = (m[1] ?? m[2]).replace(/\{[^}]*\}/g, ' ');
    for (const c of raw.split(/\s+/)) {
      if (/^[a-zA-Z][\w-]*$/.test(c)) {
        if (!used.has(c)) used.set(c, new Set());
        used.get(c).add(path.relative(SRC, file));
      }
    }
  }
  // class={...} 里的三元字符串
  for (const m of str.matchAll(/class=\{([\s\S]{0,200}?)\}/g)) {
    for (const q of m[1].matchAll(/['"`]([\w -]+)['"`]/g)) {
      for (const c of q[1].split(/\s+/)) {
        if (/^[a-zA-Z][\w-]*$/.test(c)) {
          if (!used.has(c)) used.set(c, new Set());
          used.get(c).add(path.relative(SRC, file));
        }
      }
    }
  }
}

for (const f of astro) collect(fs.readFileSync(f, 'utf8'), f);

const missing = [];
for (const [cls, fileset] of used) {
  if (defined.has(cls)) continue;
  if (scopedDefined.has(cls)) continue;
  missing.push([cls, [...fileset]]);
}

missing.sort((a, b) => b[1].length - a[1].length);
console.log(`使用的类名 ${used.size} 个，其中无样式定义 ${missing.length} 个：\n`);
for (const [cls, fileset] of missing) {
  console.log(`  ${cls.padEnd(24)} ${fileset.length} 处  ${fileset.slice(0, 4).join(', ')}${fileset.length > 4 ? ' …' : ''}`);
}
