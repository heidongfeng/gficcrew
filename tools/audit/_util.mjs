// Shared helpers for the audit checks.
//
// HTML goes through parse5 (already present as an Astro dependency) rather than regex,
// because half the bugs worth finding live in malformed or nested markup where regex lies.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export const fail = (title, detail = '', evidence = []) => ({ level: 'fail', title, detail, evidence });
export const warn = (title, detail = '', evidence = []) => ({ level: 'warn', title, detail, evidence });
export const pass = (title, detail = '') => ({ level: 'pass', title, detail });

export function walk(dir, filter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, filter));
    else if (!filter || filter(abs)) out.push(abs);
  }
  return out;
}

export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

export function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

// --- HTML -------------------------------------------------------------------

export function parseHtml(html) {
  return parse(html, { sourceCodeLocationInfo: true });
}

export function* nodes(tree) {
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop();
    yield n;
    if (n.childNodes) for (let i = n.childNodes.length - 1; i >= 0; i -= 1) stack.push(n.childNodes[i]);
  }
}

export const tagOf = (n) => n.tagName || null;

export function findAll(tree, tagName) {
  const out = [];
  for (const n of nodes(tree)) if (n.tagName === tagName) out.push(n);
  return out;
}

export function attr(node, name) {
  const a = (node.attrs || []).find((x) => x.name === name);
  return a ? a.value : null;
}

export function allAttrs(node, name) {
  return (node.attrs || []).filter((x) => x.name === name).map((x) => x.value);
}

export function textOf(node) {
  let s = '';
  for (const n of nodes(node)) if (n.nodeName === '#text') s += n.value;
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Text of a node with the original whitespace, newlines included.
 *
 * Use this for anything that is *source code*, never textOf(). textOf() collapses every run
 * of whitespace to a single space, which is what you want for visible copy and quietly
 * destructive for JavaScript: with the newlines gone, the first `//` line comment swallows
 * the rest of the file. The result still parses as valid JS, so nothing fails — the AST just
 * contains a fraction of the code, and every conclusion drawn from it is wrong.
 *
 * That happened here. admin.astro is a ~2,400-line inline script; read through textOf() only
 * the first ~190 characters of it were ever analysed, and the imports used further down were
 * reported as unused.
 */
export function rawTextOf(node) {
  let s = '';
  for (const n of nodes(node)) if (n.nodeName === '#text') s += n.value;
  return s;
}

export function locOf(node) {
  const l = node.sourceCodeLocation;
  return l ? `line ${l.startLine}` : '';
}

/**
 * Visible text of a page: drops <script>/<style>/<noscript> and collapses whitespace.
 * Used for copy-claim checks, where matching against raw HTML would trip over markup
 * and inline JSON.
 */
export function visibleText(html) {
  const tree = typeof html === 'string' ? parseHtml(html) : html;
  let out = '';
  const visit = (n) => {
    if (n.tagName === 'script' || n.tagName === 'style' || n.tagName === 'noscript') return;
    if (n.nodeName === '#text') {
      out += n.value + ' ';
      return;
    }
    for (const c of n.childNodes || []) visit(c);
  };
  visit(tree);
  return out.replace(/\s+/g, ' ').trim();
}

/** Every string anywhere inside a nested object/array, with the path it came from. */
export function collectStrings(value, path = '') {
  const out = [];
  const visit = (v, p) => {
    if (typeof v === 'string') out.push({ text: v, path: p });
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${p}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, p ? `${p}.${k}` : k);
  };
  visit(value, path);
  return out;
}

/** Every built HTML page: [{ file, url path, html }] */
export function loadDist(distDir) {
  const abs = path.join(ROOT, distDir);
  return walk(abs, (p) => p.endsWith('.html')).map((file) => {
    const relPath = path.relative(abs, file).split(path.sep).join('/');
    const urlPath = '/' + relPath.replace(/index\.html$/, '').replace(/\.html$/, '');
    return { file, rel: rel(relPath), urlPath, html: readText(file) };
  });
}

export const robotsMeta = (html) => {
  const m = /<meta[^>]+name=["']?robots["']?[^>]*content=["']([^"']*)["']/i.exec(html);
  return m ? m[1] : '';
};

/** Does an absolute or root-relative URL point at this page itself? */
export const samePath = (href, urlPath) => {
  const p = (href.replace(/^https?:\/\/[^/]+/, '') || '/').replace(/\/$/, '');
  return p === urlPath.replace(/\/$/, '') || (p === '' && urlPath === '/');
};

/**
 * Decide what kind of page this is, so only the rules that apply get applied to it.
 *
 * The build emits four different kinds of page — indexable content, noindex utility pages
 * (/account/, /join/, /admin/), hand-written redirect stubs, and /404 — and holding a
 * redirect stub to the standards of a content page produces noise, not findings.
 */
export function classifyPage(page) {
  if (page.urlPath === '/404') return { kind: 'notfound' };
  if (/<meta[^>]+http-equiv=["']?refresh/i.test(page.html)) {
    const canonical = /<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)["']/i.exec(page.html);
    if (canonical && !samePath(canonical[1], page.urlPath)) return { kind: 'stub' };
  }
  if (/noindex/i.test(robotsMeta(page.html))) return { kind: 'noindex' };
  return { kind: 'indexable' };
}

/** JSON-LD blocks, parsed. Returns [{ file, raw, data | error }] */
export function loadJsonLd(pages) {
  const out = [];
  for (const page of pages) {
    const tree = page._tree || parseHtml(page.html);
    for (const s of findAll(tree, 'script')) {
      if (attr(s, 'type') !== 'application/ld+json') continue;
      const raw = textOf(s);
      try {
        out.push({ file: page.rel, data: JSON.parse(raw), raw });
      } catch (e) {
        out.push({ file: page.rel, error: e.message, raw });
      }
    }
  }
  return out;
}

/** Normalise the many shapes JSON-LD uses for a single node into an array. */
export function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// --- App source -------------------------------------------------------------
//
// Imported through the loader hooks in _loader.mjs, so what the checks inspect is
// the same source the bundler builds from — not a rewritten copy.

// _util.mjs lives in tools/audit/, so src/ is two levels up.
const data = (...segs) => new URL('../../src/data/' + segs.join('/'), import.meta.url).href;

export async function loadData() {
  const [cities, events, faq, plans, guides, site, schema, guangzhou] = await Promise.all([
    import(data('cities.js')),
    import(data('events.js')),
    import(data('faq.js')),
    import(data('plans.js')),
    import(data('guides.js')),
    import(data('site.js')),
    import(data('schema.js')),
    import(data('guangzhou.js')),
  ]);
  const pick = (m, k) => m[k] ?? m.default;
  return {
    CITIES: pick(cities, 'CITIES'),
    POPUP_NOTE: pick(cities, 'POPUP_NOTE'),
    EVENTS: pick(events, 'EVENTS'),
    // The same function the pages call, so "how many events should be rendered" is answered
    // once in src and reused here instead of being re-derived — see upcomingEvents() in events.js.
    upcomingEvents: events.upcomingEvents,
    FAQ: pick(faq, 'FAQ'),
    PLANS: pick(plans, 'PLANS'),
    REFUND_TERMS: plans.REFUND_TERMS,
    GUIDES: pick(guides, 'GUIDES'),
    SITE: pick(site, 'SITE'),
    NAV: pick(site, 'NAV'),
    HOME: pick(site, 'HOME'),
    SERVICES: pick(site, 'SERVICES'),
    RULES: pick(site, 'RULES'),
    WHY_JOIN: pick(site, 'WHY_JOIN'),
    EVENT_CATEGORIES: pick(site, 'EVENT_CATEGORIES'),
    FORMATS: pick(site, 'FORMATS'),
    FORMAT_TIERS: pick(site, 'FORMAT_TIERS'),
    ORG_METHODS: pick(site, 'ORG_METHODS'),
    VARIANT: site.VARIANT,
    IS_CN: site.IS_CN,
    SCHEMA: schema,
    GUANGZHOU: guangzhou,
    raw: { cities, events, faq, plans, guides, site },
  };
}

/** Raw text of every source data module, for "no placeholder left behind" scans. */
export function dataSourceText() {
  const files = fs
    .readdirSync(path.join(ROOT, 'src', 'data'), { withFileTypes: true })
    .filter((e) => e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.json')))
    .map((e) => path.join(ROOT, 'src', 'data', e.name));
  return files.map((f) => ({ file: rel(f), text: readText(f) }));
}
