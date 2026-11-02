/**
 * 第二批：清掉「内部排序术语」残留（第一批 `_drop-tier-speak.mjs` 没覆盖到的地方）。
 *
 * 老郑 2026-10-05：十类活动的排序只是内部参考，不要把排序逻辑、也不要把分组术语写进页面文案。
 * 页面只写「有哪些吸引人的活动类型」。
 *
 * 用法：
 *   node scripts/_drop-tier-speak-2.mjs          # dry-run，只报命中数 + 自检
 *   node scripts/_drop-tier-speak-2.mjs --write  # 落盘
 *
 * 幂等：同一批替换跑第二次应命中 0。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

// ---------------------------------------------------------------------------
// 1. 精确替换（原文 → 新文）。顺序敏感：长句在前。
// ---------------------------------------------------------------------------
const EDITS = [
  // --- 广州指南 social 段：第一段（五维方法论）---
  [
    'The crew keeps ten meetup formats on the board, ranked by five things at once: how natural the socialising feels, how familiar the format already is, whether people come back, what changes once you are in China, and how hard it is to walk in on your own. Three of them do most of the work.',
    'The crew keeps ten meetup formats on the board, from bar nights and pub crawls, food crawls and language exchange through to sports groups, hiking and weekend trips, and Cantonese culture workshops. Bar nights, food crawls and language exchange are the ones most people start with.',
  ],
  // --- 广州指南 social 段：第二段（lead / come second / is third / sit behind）---
  [
    'Bar nights lead, and the reason is prosaic: a drink gives you somewhere to stand and something to do with your hands, so there is no opening line to prepare. What genuinely helps in Guangzhou is knowing which places are used to foreign customers and what a night actually costs, which is not something a listings site will tell you. Food crawls come second for the ordering reasons above. Language exchange is third, and it suits people who would rather have a stated reason to be in the room. Sports groups, hiking and weekend trips, and culture workshops sit behind those three. They take more organising, and they are the ones people keep coming back to.',
    'A bar night is the easiest place to start, and the reason is prosaic: a drink gives you somewhere to stand and something to do with your hands, so there is no opening line to prepare. What genuinely helps in Guangzhou is knowing which places are used to foreign customers and what a night actually costs, which is not something a listings site will tell you. Food crawls work the same way, because there is food on the table and something to talk about. Language exchange suits people who would rather have a stated reason to be in the room. Sports groups, hiking and weekend trips, and Cantonese culture workshops take more organising, and they are the ones people keep coming back to.',
  ],
  // --- 广州指南 list：分组术语 ---
  [
    'Tier 1 formats: bar nights and pub crawls, food crawls and language exchange',
    'Bar nights and pub crawls, food crawls and language exchange',
  ],
  [
    'Tier 2 formats: sports groups, hiking and weekend trips, Cantonese culture workshops',
    'Sports groups, hiking and weekend trips, Cantonese culture workshops',
  ],
  // --- 广州指南 FAQ：社群是什么样的 ---
  [
    'The ten formats are described earlier in this guide and ranked by how easy each is to walk into alone, with bar nights, food crawls and language exchange on top.',
    'The ten formats are described earlier in this guide, from bar nights, food crawls and language exchange through to sports groups, hiking trips and Cantonese culture workshops.',
  ],
  // --- 指南总览 description ---
  [
    'a social scene built on ten ranked formats, led by bar nights and pub crawls, food crawls and language exchange.',
    'a social scene built on ten meetup formats, from bar nights and pub crawls, food crawls and language exchange through to hiking trips and culture workshops.',
  ],
  // --- 指南总览 intro ---
  [
    'the social scene, built around ten meetup formats ranked by how easy each one is to walk into on your own, with bar nights, food crawls and language exchange at the top.',
    'the social scene, built around ten meetup formats: bar nights and pub crawls, food crawls and language exchange, sports groups, hiking trips and culture workshops.',
  ],
  // --- 全站 FAQ：独自参加先选哪个 ---
  [
    ' We rank our ten formats partly on exactly this: how hard each one is to walk into alone.',
    '',
  ],
  // --- 全站 FAQ：有没有酒吧之夜 ---
  [
    'Bar nights sit at the top of our ten formats, above food crawls and language exchange. A drink gives you',
    'Of our ten formats, a bar night is the easiest one to turn up to on your own. A drink gives you',
  ],
  // --- llms.txt 摘要 ---
  [
    'It runs ten meetup formats ranked by how easy each one is to walk into on your own, led by bar nights and pub crawls, food crawls and language exchange.',
    'It runs ten meetup formats, from bar nights and pub crawls, food crawls and language exchange through to sports groups, hiking trips and culture workshops.',
  ],
];

// ---------------------------------------------------------------------------
// 2. 作用文件：代码兜底 + generated 副本 + 页面硬编码
//    JSON 走「深遍历字符串替换」，避免逐个 key 定位出错。
// ---------------------------------------------------------------------------
const TEXT_FILES = [
  'src/data/guangzhou.js',
  'src/data/guides.js',
  'src/data/faq.js',
  'src/pages/llms.txt.ts',
];

const JSON_FILES = ['src/data/generated/guides.json', 'src/data/generated/faq.json'];

// ---------------------------------------------------------------------------
// 3. 自检：这些模式一条都不该剩下
// ---------------------------------------------------------------------------
const BAN = [
  { id: 'tier-number', re: /Tier\s*[123]/ },
  { id: 'tier-dot', re: /Tier\s*[123]\s*·/ },
  { id: 'ranked-by', re: /ranked by\b/i },
  { id: 'rank-five', re: /rank(?:ed)?\s+(?:them\s+)?on five things/i },
  { id: 'walk-into-alone', re: /walk into (?:alone|on your own)/i },
];
// 例外：这句是自然语言描述（"独自走进酒吧在西方城市很平常"），不是排序方法论
const BAN_OK = [/is ordinary in a lot of Western cities/];

function applyText(src) {
  let out = src;
  let n = 0;
  for (const [from, to] of EDITS) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      n += 1;
    }
  }
  return { out, n };
}

function applyJsonDeep(node) {
  let n = 0;
  if (typeof node === 'string') {
    let s = node;
    for (const [from, to] of EDITS) {
      if (s.includes(from)) {
        s = s.split(from).join(to);
        n += 1;
      }
    }
    return { node: s, n };
  }
  if (Array.isArray(node)) {
    const out = node.map((v) => {
      const r = applyJsonDeep(v);
      n += r.n;
      return r.node;
    });
    return { node: out, n };
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      const r = applyJsonDeep(v);
      n += r.n;
      out[k] = r.node;
    }
    return { node: out, n };
  }
  return { node, n };
}

function selfCheck(text, label, problems) {
  for (const line of text.split(/\r?\n/)) {
    if (BAN_OK.some((r) => r.test(line))) continue;
    for (const b of BAN) {
      if (b.re.test(line)) problems.push(`[${b.id}] ${label}: ${line.trim().slice(0, 140)}`);
    }
  }
}

let applied = 0;
let skipped = 0;
const problems = [];

for (const rel of TEXT_FILES) {
  const p = join(ROOT, rel);
  const orig = readFileSync(p, 'utf8');
  const { out, n } = applyText(orig);
  if (n === 0) {
    skipped += 1;
    console.log(`  · ${rel}（已应用过，跳过）`);
  } else {
    applied += n;
    console.log(`  ✓ ${rel}：应用 ${n} 处`);
    if (WRITE) writeFileSync(p, out, 'utf8');
  }
  selfCheck(out, rel, problems);
}

for (const rel of JSON_FILES) {
  const p = join(ROOT, rel);
  const orig = readFileSync(p, 'utf8');
  const parsed = JSON.parse(orig);
  const { node, n } = applyJsonDeep(parsed);
  if (n === 0) {
    skipped += 1;
    console.log(`  · ${rel}（已应用过，跳过）`);
  } else {
    applied += n;
    console.log(`  ✓ ${rel}：应用 ${n} 处`);
    if (WRITE) writeFileSync(p, JSON.stringify(node, null, 2) + '\n', 'utf8');
  }
  selfCheck(JSON.stringify(node, null, 2), rel, problems);
}

console.log(`\n合计：应用 ${applied} 处，已应用跳过 ${skipped} 个文件` + (WRITE ? '（已写入）' : '（dry-run）'));

if (problems.length) {
  console.log('\n✗ 自检未通过：');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log('✓ 自检通过：无排序术语残留');
