// Method 7 — differential between the two build variants.
//
// dist-global and dist-cn are generated from the same source with a different mode, so
// they should differ in exactly the places where the mode is consulted:
//   * the domain in canonical / og:url / JSON-LD
//   * the "find us" platform line (X, Instagram and YouTube are unreachable in China)
//   * robots.txt (the .cn mirror asks Google to stay out to avoid duplicate indexing)
// Everything else should be byte-for-byte equivalent once those are normalised away.
//
// That gives a strong oracle: any other difference means a template is branching on
// something it should not, or a build picked up stale output. This is the check that
// would catch "the cn build silently rendered an older data snapshot".
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, warn, pass, loadDist } from '../_util.mjs';

export const id = 'dist-parity';
export const name = '双变体差异（页面集合 / 资源集合 / 归一化后正文一致性）';

/** Platform names that legitimately appear in one variant only. */
// No trailing \b: after ")" the next char is a space, so a word boundary never exists there.
const PLATFORM_TOKENS = [/\bYouTube\b/g, /X \(Twitter\)/g, /\bInstagram\b/g, /@GFICCrew\b/gi, /@gficcrew\b/gi];

// The ICP filing number appears only on the mainland (.cn) build's footer — it is a
// hard regulatory requirement that the global build must NOT carry. The footer line is
// `…All rights reserved. <a href="https://beian.miit.gov.cn/">粤ICP备…号</a>`, and after
// normalize() strips the tags the link text and its visible label survive as plain text,
// so both must be collapsed away (the URL text too, or the diff points at "beian").
const ICP_TOKEN = [/粤ICP备\d+号/g, /beian\.miit\.gov\.cn/gi];

export async function run() {
  const G = 'dist-global';
  const C = 'dist-cn';
  if (!fs.existsSync(path.join(ROOT, G)) || !fs.existsSync(path.join(ROOT, C)))
    return [warn('两个产物不齐全，无法对比', `${G} / ${C} 需同时存在`)];

  const out = [];
  const gPages = loadDist(G);
  const cPages = loadDist(C);
  const gPaths = new Set(gPages.map((p) => p.urlPath));
  const cPaths = new Set(cPages.map((p) => p.urlPath));

  const onlyGlobal = [...gPaths].filter((p) => !cPaths.has(p));
  const onlyCn = [...cPaths].filter((p) => !gPaths.has(p));
  out.push(
    onlyGlobal.length || onlyCn.length
      ? fail(
          '两个变体的页面集合不同',
          '同一个源应当产出同一批页面；缺失通常意味着某次构建不完整',
          [...onlyGlobal.map((p) => `${G} 独有 ${p}`), ...onlyCn.map((p) => `${C} 独有 ${p}`)],
        )
      : pass('两个变体页面集合一致', `${gPaths.size} 个页面`),
  );

  // --- static assets -------------------------------------------------------
  const gAssets = assetSet(G);
  const cAssets = assetSet(C);
  const assetOnlyG = [...gAssets].filter((f) => !cAssets.has(f));
  const assetOnlyC = [...cAssets].filter((f) => !gAssets.has(f));
  const hashed = (f) => /^_astro\//.test(f);
  const diff = [...assetOnlyG, ...assetOnlyC].filter((f) => !hashed(f));

  // Build internals and packaging residue are not part of the served site, and their
  // presence is not stable from build to build: the WorkBuddy origin's own build writes the
  // SSR entry tree (renderers.mjs / manifest_*.mjs / chunks/ / pages/) into whichever variant
  // it builds, while a plain local `astro build` does not. Comparing those names says nothing
  // about whether the two variants are in sync — it only reports which build ran last — so
  // they are surfaced as information instead of as a failure. What actually keeps them off
  // the public artifact is the copy filter in prepare-gh-pages.mjs.
  const BUILD_INTERNAL = /^(?:chunks\/|pages\/|renderers\.mjs$|manifest_\w+\.mjs$|noop-entrypoint\.mjs$|_noop-middleware\.mjs$|cn-bundle\.txt$|[^/]*\.zip$)/;
  const buildInternals = diff.filter((f) => BUILD_INTERNAL.test(f));
  const siteDiff = diff.filter((f) => !BUILD_INTERNAL.test(f));

  out.push(
    buildInternals.length
      ? pass(
          '构建中间产物差异（不属于站点内容）',
          `${buildInternals.length} 项只出现在单侧：` +
            buildInternals.slice(0, 6).map((f) => `${assetOnlyG.includes(f) ? G : C} 独有 ${f}`).join('；') +
            `（共 ${buildInternals.length} 项）`,
        )
      : pass('两侧都没有构建中间产物残留'),
  );

  // Whatever is left is site content one variant is missing, and that is a real defect —
  // the truncated build that lost dist-global's sitemap lands here.
  if (siteDiff.length) {
    const evidence = siteDiff.slice(0, 12).map((f) => `${assetOnlyG.includes(f) ? G : C} 独有 ${f}`);
    if (siteDiff.length > 12) evidence.push(`…另有 ${siteDiff.length - 12} 项`);
    out.push(fail('两个变体的站点资源不同', '同一份源应当产出同一批站点文件', evidence));
  } else {
    out.push(
      pass('非哈希站点资源完全一致', `${[...gAssets].filter((f) => !hashed(f) && !BUILD_INTERNAL.test(f)).length} 个`),
    );
  }

  const hashDiff = [...assetOnlyG, ...assetOnlyC].filter(hashed);
  out.push(
    hashDiff.length
      ? warn(
          `_astro/ 下 ${hashDiff.length} 个带哈希的文件只出现在一边`,
          '哈希取自内容，通常说明某个变体引用了不同版本的资源',
          hashDiff.slice(0, 10).map((f) => (assetOnlyG.includes(f) ? `${G} 独有 ${f}` : `${C} 独有 ${f}`)),
        )
      : pass('_astro/ 资源两份完全同名', `${[...gAssets].filter(hashed).length} 个`),
  );

  // --- page body parity ----------------------------------------------------
  const diffs = [];
  for (const gp of gPages) {
    const cp = cPages.find((p) => p.urlPath === gp.urlPath);
    if (!cp) continue;
    const a = normalize(gp.html);
    const b = normalize(cp.html);
    if (a === b) continue;
    let i = 0;
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i += 1;
    diffs.push({
      page: gp.urlPath,
      detail: `${G}：…${a.slice(Math.max(0, i - 70), i + 110)}…`,
      detail2: `${C}：…${b.slice(Math.max(0, i - 70), i + 110)}…`,
    });
  }
  out.push(
    diffs.length
      ? fail(
          `归一化后仍有 ${diffs.length} 个页面正文不同`,
          '域名与「Find us」平台行已归一，剩下的差异说明模板在按变体分叉，或某一侧用了过期数据',
          diffs.flatMap((d) => [`${d.page}`, `      ${d.detail}`, `      ${d.detail2}`]).slice(0, 18),
        )
      : pass('归一化后两个变体正文完全一致', `${gPages.length} 个页面逐一比对`),
  );

  // --- robots.txt ---------------------------------------------------------
  // Compared by effective policy, not by text. The .cn file names Bingbot, Sogou, 360
  // and Yisou explicitly so that, having told Google to leave, it is unambiguous which
  // crawlers are still welcome -- and every one of those rules merely restates what
  // `User-agent: *` already says. A textual diff flags that as a difference; an
  // effective-policy diff correctly sees no change.
  const gr = readOr('dist-global/robots.txt');
  const cr = readOr('dist-cn/robots.txt');
  if (gr && cr) {
    const gBlocks = parseRobots(gr);
    const cBlocks = parseRobots(cr);
    const allAgents = [...new Set([...gBlocks.keys(), ...cBlocks.keys()])];
    const PROBES = ['/', '/about/', '/admin/', '/404.html'];
    const mismatched = [];
    for (const agent of allAgents) {
      if (/google/i.test(agent)) continue; // the two builds are meant to disagree here
      for (const probe of PROBES) {
        const g = disposition(gBlocks, agent, probe);
        const c = disposition(cBlocks, agent, probe);
        if (g !== c) mismatched.push(`${agent || '(通配)'} 访问 ${probe}：${G} ${g} vs ${C} ${c}`);
      }
    }
    out.push(
      mismatched.length
        ? fail('robots.txt 在非 Google 爬虫上策略不同', '', mismatched.slice(0, 10))
        : pass('除 Google 外，两个变体的 robots 策略等价', `${allAgents.length} 个 user-agent 段 × ${PROBES.length} 条路径`),
    );
    const gNoGoogle = /User-agent:\s*Googlebot\s*[\r\n]+Disallow:\s*\//i.test(gr);
    const cNoGoogle = /User-agent:\s*Googlebot\s*[\r\n]+Disallow:\s*\//i.test(cr);
    out.push(
      gNoGoogle || !cNoGoogle
        ? fail(
            'Google 规则方向不对',
            '期望：.com 放行 Googlebot、.cn 拒绝 Googlebot（避免两个镜像重复收录）',
            [`${G} 拒绝 Googlebot：${gNoGoogle}`, `${C} 拒绝 Googlebot：${cNoGoogle}`],
          )
        : pass('Google 规则方向正确', '.com 放行、.cn 拒绝'),
    );
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

/**
 * Reduce a page to the part that must be variant-independent:
 *   * both hosts collapse to HOST (the admin page mentions both in one sentence)
 *   * the "Find us" sentence collapses to SOCIAL
 *   * platform names that only exist in one variant are dropped
 *   * scripts and styles are dropped, whitespace collapsed
 */
function normalize(html) {
  let s = html.replaceAll('gficcrew.com', 'HOST').replaceAll('gficcrew.cn', 'HOST');
  s = s.replace(/Search\s*(?:&quot;|["“”'])\s*GFIC Crew\s*(?:&quot;|["“”'])\s*on[^<.]*\./g, 'SOCIAL ');
  s = s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  for (const re of PLATFORM_TOKENS) s = s.replace(re, ' ');
  for (const re of ICP_TOKEN) s = s.replace(re, ' ');
  return s.replace(/[\s,;·—–-]+/g, ' ').trim();
}

function assetSet(dist) {
  const abs = path.join(ROOT, dist);
  const out = new Set();
  const walk = (d, prefix) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else if (!e.name.endsWith('.html')) out.add(rel);
    }
  };
  walk(abs, '');
  return out;
}

function readOr(p) {
  const abs = path.join(ROOT, p);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

/** robots.txt → Map<lowercased user-agent, directive lines> */
function parseRobots(text) {
  const map = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^user-agent:\s*(.*)$/i.exec(line);
    if (m) {
      current = m[1].trim().toLowerCase();
      if (!map.has(current)) map.set(current, []);
      continue;
    }
    if (current && /^(allow|disallow):/i.test(line)) {
      const d = /^(allow|disallow):\s*(.*)$/i.exec(line);
      map.get(current).push({ type: d[1].toLowerCase(), path: d[2].trim() });
    }
  }
  return map;
}

/**
 * Whether a crawler is allowed to fetch a path, applying the usual rules: the most
 * specific user-agent group wins over `*`, and within a group the longest matching
 * pattern wins. This is what makes "explicit Allow: /" and "no rule at all" compare equal.
 */
function disposition(blocks, agent, pathname) {
  const own = blocks.get(agent);
  const rules = own && own.length ? own : blocks.get('*') || [];
  if (!rules.length) return 'allow（无规则）';
  let best = null;
  for (const r of rules) {
    if (r.path === '') continue; // "Disallow:" with nothing means allow all
    if (!matchPattern(r.path, pathname)) continue;
    if (!best || r.path.length > best.path.length) best = r;
  }
  if (!best) return 'allow（无匹配规则）';
  return best.type === 'allow' ? `allow（${best.path}）` : `disallow（${best.path}）`;
}

function matchPattern(pattern, pathname) {
  const p = pattern.replace(/\*+$/, '');
  return pathname.startsWith(p.replace(/\*+/g, ''));
}
