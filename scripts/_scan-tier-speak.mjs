/**
 * 全站复扫：确认内部排序术语没有残留在用户可见文案里。
 *
 * 背景：老郑 2026-10-05 明确要求——十类活动的排序只是内部参考，
 * 不能把 "Tier 1/2/3"、"ranked by ..." 这类方法论写进页面给用户看。
 *
 * 用法：node scripts/_scan-tier-speak.mjs
 * 退出码 0 = 干净；1 = 还有残留。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// 允许保留 Tier 术语的地方：后台表单（运营内部用）、探针题库（内部评估用）
const ALLOW = [
  /src[/\\]pages[/\\]admin\.astro$/,
  /src[/\\]data[/\\]probe-bank\.js$/,
  /scripts[/\\]_scan-tier-speak\.mjs$/, // 本文件自带
];

// 违规模式：命中即算残留。
// 前两批只认字面术语，漏掉了**用序数词写出来的排名**——
// 「is the third of our ten formats」「sit sixth on our list」「food crawls sit second…」
// 一样是把内部排序外露，2026-10-05 补进来了。
const BAD = [
  { id: 'tier-number', re: /Tier\s*[123]/ },
  { id: 'tier-dot', re: /Tier\s*[123]\s*·/ },
  { id: 'ranked-by', re: /ranked by\b/i },
  { id: 'rank-five', re: /rank(?:ed)?\s+(?:them\s+)?on five things/i },
  { id: 'walk-into-alone', re: /walk into (?:alone|on your own)/i },
  { id: 'tier-word', re: /\btier-badge\b/ },
  { id: 'format-rank', re: /\bformat-rank\b/ },
  // ↓ 序数词 / 名次类说法
  { id: 'ordinal-of-ten', re: /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+of\s+(our|the)\s+ten\b/i },
  { id: 'sits-ordinal', re: /\bsits?\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i },
  { id: 'come-ordinal', re: /\bcome[sd]?\s+(first|second|third)\b/i },
  { id: 'top-n', re: /\btop\s+(three|four|five)\b/i },
  { id: 'at-top-of', re: /\bat the top of\b/i },
  { id: 'highest-of', re: /\bthe highest of\b/i },
  { id: 'ten-ranked', re: /\bten\s+ranked\b/i },
  { id: 'earns-spot', re: /\bearns?\s+(that|the)\s+spot\b/i },
  // ↓ 2026-10-08 补：上一版报「干净」是**假阴性**，它只认 `sits <序数>` 与 `come(s) <序数>`，
  //   于是 `rank fifth`、`sits lower`、`is a close third`、`come next` 全部漏掉 —— 实测确实
  //   三处残留在线上页面上。这里把同义的写法补齐。
  { id: 'rank-ordinal', re: /\brank(?:s|ed)?\s+(?:it\s+|them\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i },
  { id: 'sits-lower-higher', re: /\bsits?\s+(lower|higher|above|below)\b/i },
  { id: 'is-ordinal', re: /\b(is|are|was|were)\s+(?:a\s+close\s+|an?\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b(?=[\s,.;:!?]|$)/i },
  // 只认句读后的 "come(s) next"，避免把 "somebody comes next week" 这种正常说法算进来。
  { id: 'comes-next', re: /\bcomes?\s+next\s*[,.;:]/i },
  { id: 'ordinal-of-list', re: /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:on|in)\s+(?:our|the)\s+(?:list|order|ranking|board)\b/i },
  { id: 'list-position', re: /\b(front|back|top|bottom|head|tail|end)\s+of\s+(?:the|our)\s+(?:list|order|ranking)\b/i },
];

const EXTS = /\.(astro|js|ts|mjs)$/;

function allowed(p) {
  const rel = p.slice(ROOT.length).replace(/\\/g, '/');
  return ALLOW.some((r) => r.test(rel));
}

const files = walk(SRC).filter((p) => EXTS.test(p));
const hits = [];

for (const f of files) {
  if (allowed(f)) continue;
  const text = readFileSync(f, 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    for (const b of BAD) {
      if (b.re.test(line)) {
        hits.push({
          file: f.slice(ROOT.length).replace(/\\/g, '/'),
          line: i + 1,
          id: b.id,
          text: line.trim().slice(0, 160),
        });
      }
    }
  });
}

if (hits.length === 0) {
  console.log(`✓ 干净：${files.length} 个文件，0 处残留`);
  process.exit(0);
}

console.log(`✗ 发现 ${hits.length} 处残留：`);
for (const h of hits) {
  console.log(`  [${h.id}] ${h.file}:${h.line}`);
  console.log(`      ${h.text}`);
}
process.exit(1);
