/**
 * 第三批：清掉「序数词排名」残留。
 *
 * 前两批（`_drop-tier-speak.mjs` / `-2.mjs`）只认 `Tier 1/2/3`、`ranked by` 这些字面，
 * 漏掉了用**序数词**写出来的排名："is the third of our ten formats"、"sit sixth on our list"、
 * "food crawls sit second … right behind bar nights"、"the ones at the top of the list"。
 * 这些一样是把内部排序外露给用户，老郑 2026-10-05 明确要求不许写。
 *
 * 用法：
 *   node scripts/_drop-rank-speak-3.mjs          # dry-run
 *   node scripts/_drop-rank-speak-3.mjs --write
 * 幂等：跑第二次应命中 0。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

const EDITS = [
  // ---- services 摘要（首页 / about 的服务区）----
  [
    'Language exchange is the third of our ten formats. It puts expats who want Mandarin next to locals who want English, and it gives anyone a stated reason to turn up.',
    'Language exchange puts expats who want Mandarin next to locals who want English, and it gives anyone a stated reason to turn up.',
  ],
  [
    'Culture workshops sit sixth of our ten formats, the highest of the group that needs organising before anything happens. Interest in Chinese culture is common;',
    'Culture workshops are the ones that need organising before anything happens, and that is exactly why they are worth doing with a crew. Interest in Chinese culture is common;',
  ],

  // ---- 全站 FAQ ----
  [
    'Yes, it is the third of our ten formats. It earns that spot by solving something the others cannot: it gives you a stated reason to be there, which is much easier to say out loud than wanting to meet people.',
    'Yes. Language exchange is one of our ten formats, and it is the one that gives you a stated reason to be there, which is much easier to say out loud than wanting to meet people.',
  ],
  [
    'Cultural workshops sit sixth on our list: cooking, calligraphy, tea ceremony and tai chi, run by locals rather than performed for visitors.',
    'Cultural workshops cover cooking, calligraphy, tea ceremony and tai chi, run by locals rather than performed for visitors.',
  ],
  [
    ' Demand for this in China is enormous and the quality is uneven, which is why it sits third overall rather than lower.',
    ' Demand for this in China is enormous and the quality is uneven, which is why ours runs with a host, a structure and an actual topic.',
  ],

  // ---- 广州指南 ----
  [
    'That gap is why food crawls sit second in our ten formats, right behind bar nights: somebody who already knows orders for the table, so you get more dishes and none of the guesswork.',
    'That gap is why a food crawl works so well here: somebody who already knows orders for the table, so you get more dishes and none of the guesswork.',
  ],
  [
    'Language exchange is the third of our ten formats, and it earns the spot by giving you a stated reason to turn up, which is easier to say out loud than wanting to meet people.',
    'Language exchange gives you a stated reason to turn up, which is easier to say out loud than wanting to meet people.',
  ],

  // ---- 城市 blurb ----
  [
    'Our ten ranked formats start here: bar nights and pub crawls, food crawls through the old districts and along the river, and language exchange, with sports groups, hiking and culture workshops behind them.',
    'Ten meetup formats start here: bar nights and pub crawls, food crawls through the old districts and along the river, and language exchange, as well as sports groups, hiking and culture workshops.',
  ],
  [
    'When people do meet up on our ten formats, the ones at the top of the list are the easy ones: bar nights, food crawls and language exchange.',
    'When people do meet up, the ones that are easy to start with are bar nights, food crawls and language exchange.',
  ],
];

const TEXT_FILES = ['src/data/site.js', 'src/data/faq.js', 'src/data/cities.js', 'src/data/guangzhou.js'];
const JSON_FILES = [
  'src/data/generated/site.json',
  'src/data/generated/faq.json',
  'src/data/generated/cities.json',
  'src/data/generated/guides.json',
];

const BAN = [
  { id: 'ordinal-of-ten', re: /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+of\s+(our|the)\s+ten\b/i },
  { id: 'sits-ordinal', re: /\bsits?\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i },
  { id: 'top-n', re: /\btop\s+(three|four|five)\b/i },
  { id: 'at-top-of', re: /\bat the top of\b/i },
  { id: 'highest-of', re: /\bthe highest of\b/i },
  { id: 'ten-ranked', re: /\bten\s+ranked\b/i },
  { id: 'come-ordinal', re: /\bcome[sd]?\s+(first|second|third)\b/i },
  { id: 'earns-spot', re: /\bearns?\s+(that|the)\s+spot\b/i },
  { id: 'tier-number', re: /Tier\s*[123]/ },
  { id: 'ranked-by', re: /ranked by\b/i },
];

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
    return node.reduce(
      (acc, v) => {
        const r = applyJsonDeep(v);
        acc.n += r.n;
        acc.node.push(r.node);
        return acc;
      },
      { node: [], n: 0 },
    );
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
  text.split(/\r?\n/).forEach((line) => {
    for (const b of BAN) {
      if (b.re.test(line)) problems.push(`[${b.id}] ${label}: ${line.trim().slice(0, 140)}`);
    }
  });
}

let applied = 0;
let skipped = 0;
const problems = [];

for (const rel of TEXT_FILES) {
  const p = join(ROOT, rel);
  const { out, n } = applyText(readFileSync(p, 'utf8'));
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
  const { node, n } = applyJsonDeep(JSON.parse(readFileSync(p, 'utf8')));
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
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('✓ 自检通过：无排序术语残留');
