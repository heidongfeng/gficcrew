// "When did this page last change?" — answered once, for two consumers.
//
// astro.config.mjs writes the answer into the sitemap as <lastmod>; src/pages/rss.xml.ts
// writes it into each feed item as <pubDate>. Deriving it twice would let the two drift,
// and a feed whose dates disagree with the sitemap is worse than one with no dates at all.
//
// The date comes from git (when the source actually changed), not from the build clock.
// Stamping every URL with the build time would be worse than leaving it out: all entries
// would share one second, which tells a crawler nothing and trains it to ignore the field.
//
// But git only knows about committed history. A file edited since the last commit would
// report its previous commit date, so an unpublished-but-pending edit looks stale — which
// is the opposite of the signal we want. Dirty paths therefore fall back to the working
// tree's mtime. In CI (clean checkout) nothing is dirty and git dates win.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// process.cwd(), not a path derived from import.meta.url. This module is imported by the
// Astro config loader *and* inlined into the build by src/pages/rss.xml.ts; in the second
// case a bundled module's import.meta.url points at the bundle, not at scripts/. Both
// callers run from the project directory, which is what cwd gives us.
const ROOT = process.cwd();

export function mtimeOf(rel) {
  const abs = path.join(ROOT, rel);
  try {
    const st = fs.statSync(abs);
    if (!st.isDirectory()) return st.mtime.toISOString();
    // A directory's own mtime only moves when its entries change, not when a child is
    // edited, so take the newest file underneath it.
    let newest = st.mtime;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childDate = mtimeOf(path.join(rel, entry.name));
      if (childDate && new Date(childDate) > newest) newest = new Date(childDate);
    }
    return newest.toISOString();
  } catch {
    return null;
  }
}

let dirtyCache;
function dirtyPaths() {
  if (dirtyCache !== undefined) return dirtyCache;
  dirtyCache = null;
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const set = new Set();
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      // porcelain v1 is "XY <path>", and a rename is "old -> new".
      const rest = line.slice(3).trim();
      const target = rest.includes(' -> ') ? rest.split(' -> ')[1] : rest;
      set.add(target.replace(/^"|"$/g, ''));
    }
    dirtyCache = set;
  } catch {
    dirtyCache = null; // No git at all — trust the working tree for everything.
  }
  return dirtyCache;
}

function isDirty(rel) {
  const set = dirtyPaths();
  if (set === null) return true;
  if (set.has(rel)) return true;
  const prefix = rel.endsWith('/') ? rel : `${rel}/`;
  for (const p of set) if (p.startsWith(prefix)) return true;
  return false;
}

const gitDateCache = new Map();
export function gitDate(rel) {
  if (gitDateCache.has(rel)) return gitDateCache.get(rel);
  let date = null;
  if (isDirty(rel)) {
    date = mtimeOf(rel);
  } else {
    try {
      const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out) date = out;
    } catch {
      date = null;
    }
    if (!date) date = mtimeOf(rel);
  }
  gitDateCache.set(rel, date);
  return date;
}

// Which source files actually determine each URL's content.
const SHARED_SOURCES = ['src/layouts', 'src/components', 'src/styles/global.css'];
const withShared = (sources) => [...sources, ...SHARED_SOURCES];

export const LASTMOD_SOURCES = [
  { page: /^\/$/, sources: withShared(['src/pages/index.astro', 'src/data/site.js', 'src/data/events.js', 'src/data/generated/site.json', 'src/data/generated/events.json']) },
  { page: /^\/about\/$/, sources: withShared(['src/pages/about.astro', 'src/data/site.js', 'src/data/generated/site.json']) },
  { page: /^\/cities\/$/, sources: withShared(['src/pages/cities/index.astro', 'src/data/cities.js', 'src/data/generated/cities.json']) },
  { page: /^\/cities\/(guangzhou|shenzhen)\/$/, sources: withShared(['src/pages/cities/[slug].astro', 'src/data/cities.js', 'src/data/generated/cities.json']) },
  { page: /^\/events\/$/, sources: withShared(['src/pages/events.astro', 'src/data/events.js', 'src/data/generated/events.json', 'src/data/generated/site.json']) },
  { page: /^\/events\/[^/]+\/$/, sources: withShared(['src/pages/events/[slug].astro', 'src/data/events.js', 'src/data/generated/events.json']) },
  { page: /^\/faq\/$/, sources: withShared(['src/pages/faq.astro', 'src/data/faq.js', 'src/data/generated/faq.json']) },
  { page: /^\/membership\/$/, sources: withShared(['src/pages/membership.astro', 'src/data/plans.js', 'src/data/generated/plans.json']) },
  { page: /^\/contact\/$/, sources: withShared(['src/pages/contact.astro', 'src/data/contact.js', 'src/data/generated/contact.json']) },
  { page: /^\/guides\//, sources: withShared(['src/pages/guides', 'src/data/guides.js', 'src/data/guangzhou.js', 'src/data/generated/guides.json']) },
];

/** ISO 8601 date for one page URL, or null when nothing could be resolved. */
export function lastmodFor(pageUrl) {
  let pathname = '/';
  try {
    pathname = new URL(pageUrl).pathname;
  } catch {
    return null;
  }
  const rule = LASTMOD_SOURCES.find((r) => r.page.test(pathname));
  const dates = (rule ? rule.sources : ['src']).map(gitDate).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
