/**
 * 探针题库与轮换逻辑的性质测试。
 *
 * 后台那段逻辑跑在浏览器里，没法直接 import，所以这里按同样的规则复算一遍并断言性质。
 * 关键是：轮换必须真的轮起来（不能每轮都一样）、必须覆盖到每个分类、且不能和核心题撞。
 *
 * 运行：node scripts/test-probe-rotation.mjs（exit 0 = 全过）
 */

import { PROBE_BANK, PROBE_CATEGORIES } from '../src/data/probe-bank.js';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ✓ ' + msg);
  else {
    console.log('  ✗ ' + msg);
    failed += 1;
  }
};

const core = PROBE_BANK.filter((p) => p.tier === 'core');
const rotate = PROBE_BANK.filter((p) => p.tier === 'rotate');
const cats = PROBE_CATEGORIES.map((c) => c.id);
const rotCats = [...new Set(rotate.map((p) => p.cat))];

console.log('题库形状');
ok(PROBE_BANK.length === core.length + rotate.length, `总数 = core + rotate（${PROBE_BANK.length} = ${core.length} + ${rotate.length}）`);
ok(core.length > 0, `core 非空（${core.length} 条）`);
ok(rotate.length > 0, `rotate 非空（${rotate.length} 条）`);
ok(new Set(PROBE_BANK.map((p) => p.id)).size === PROBE_BANK.length, 'id 无重复');
ok(new Set(PROBE_BANK.map((p) => p.q)).size === PROBE_BANK.length, '问题文本无重复');

const discoveryCats = new Set(PROBE_BANK.filter((p) => p.kind !== 'brand').map((p) => p.cat));
console.log('\n分类覆盖');
ok(discoveryCats.size === cats.length, `每个分类都有题（${discoveryCats.size}/${cats.length}）`);
for (const c of cats) ok(rotate.some((p) => p.cat === c), `分类 ${c} 至少有一条轮换题`);

console.log('\n轮换算法（复刻后台 pickRotation）');
const ROUNDS_TO_COVER = 6;
const quota = (size) => Math.max(1, Math.ceil(size / ROUNDS_TO_COVER));

function pickRotation(round, perCat) {
  const byCat = new Map();
  for (const p of rotate) {
    if (!byCat.has(p.cat)) byCat.set(p.cat, []);
    byCat.get(p.cat).push(p);
  }
  const picked = [];
  for (const [cat, items] of byCat) {
    const n = Math.min(perCat && perCat > 0 ? perCat : quota(items.length), items.length);
    const base = (round * n) % items.length;
    for (let k = 0; k < n; k += 1) {
      picked.push(items[(base + k) % items.length]);
    }
  }
  const coreQ = new Set(core.map((p) => p.q));
  return picked.filter((p) => !coreQ.has(p.q));
}

const r0 = pickRotation(0, 0);
const r1 = pickRotation(1, 0);
console.log(`  每分类配额（分类大小 → 每轮抽几条）：`);
for (const c of rotCats) {
  const n = rotate.filter((p) => p.cat === c).length;
  console.log(`    ${c}: ${n} → ${quota(n)}`);
}
ok(new Set(r0.map((p) => p.id)).size === r0.length, '同一轮内无重复题');
ok(JSON.stringify(r0.map((p) => p.id)) !== JSON.stringify(r1.map((p) => p.id)), '第 0 轮与第 1 轮不是同一组（真的轮换了）');
ok(!r0.some((p) => core.some((c) => c.q === p.q)), '轮换题不与核心题重合');

// 每个分类都必须在自己配额所对应的轮数内被走完。
console.log('\n覆盖速度（按分类）');
let worst = 0;
for (const c of rotCats) {
  const items = rotate.filter((p) => p.cat === c);
  const q = quota(items.length);
  const seenCat = new Set();
  for (let r = 0; r < ROUNDS_TO_COVER; r += 1) {
    for (const p of pickRotation(r, 0)) if (p.cat === c) seenCat.add(p.id);
  }
  const covered = seenCat.size === items.length;
  worst = Math.max(worst, q);
  ok(covered, `分类 ${c}（${items.length} 条）在 ${ROUNDS_TO_COVER} 轮内走完（${seenCat.size}/${items.length}）`);
}

// 全池也要在合理轮数内走完。
const seen = new Set();
const seenRounds = [];
for (let r = 0; r < ROUNDS_TO_COVER + 4; r += 1) {
  for (const p of pickRotation(r, 0)) seen.add(p.id);
  if (seen.size === rotate.length && !seenRounds.length) seenRounds.push(r + 1);
}
ok(seen.size === rotate.length, `轮换题全部走过一遍（${seen.size}/${rotate.length}）`);
console.log(`  全池走完用了 ${seenRounds[0] || '>' + (ROUNDS_TO_COVER + 4)} 轮`);

console.log('\n一轮规模');
const roundSize = core.length + pickRotation(0, 0).length;
ok(roundSize <= 40, `一轮 ${roundSize} 题（core ${core.length} + 轮换 ${roundSize - core.length}），控制在 40 以内`);

console.log('');
if (failed) {
  console.log(`失败 ${failed} 项`);
  process.exit(1);
}
console.log('全部通过');
