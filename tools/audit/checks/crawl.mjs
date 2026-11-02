// Method 4 — link and asset crawl over the built output.
//
// The two builds are generated from different data merges, so a path that resolves in
// one variant can dangle in the other. And because the site has no runtime, a broken
// href is never logged anywhere: it just 404s in the browser.
//
// Fragments are checked too. The home page links to /cities/#beijing and
// /events/#cantonese-language-exchange-guangzhou, so a slug rename silently breaks a
// link that still looks perfectly fine in the source.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, warn, pass, loadDist, parseHtml, findAll, attr, nodes, rel } from '../_util.mjs';

export const id = 'crawl';
export const name = '链接 / 资源 / 锚点可达性（逐页遍历两个产物）';

/** Attributes that carry a URL we must resolve. */
const URL_ATTRS = [
  ['a', 'href'],
  ['link', 'href'],
  ['script', 'src'],
  ['img', 'src'],
  ['iframe', 'src'],
  ['source', 'src'],
  ['video', 'src'],
  ['audio', 'src'],
  ['embed', 'src'],
  ['object', 'data'],
];

const SKIP_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, https:, mailto:, data:, //cdn…

export async function run() {
  const out = [];
  const dists = ['dist-global', 'dist-cn'].filter((d) => fs.existsSync(path.join(ROOT, d)));
  if (!dists.length) return [warn('没有可遍历的产物', '先跑 npm run build')];

  for (const dist of dists) {
    const abs = path.join(ROOT, dist);
    const files = new Set(fileList(abs));
    const pages = loadDist(dist);
    const pageByPath = new Map(pages.map((p) => [p.urlPath, p]));

    // All fragments available on each page: id="…" plus legacy <a name="…">.
    const anchors = new Map();
    const idsPerPage = new Map();
    for (const page of pages) {
      const tree = parseHtml(page.html);
      const ids = new Set();
      for (const n of nodes(tree)) {
        const id = n.attrs ? attr(n, 'id') : null;
        if (id) ids.add(id);
        if (n.tagName === 'a') {
          const nm = attr(n, 'name');
          if (nm) ids.add(nm);
        }
      }
      idsPerPage.set(page.urlPath, ids);
      anchors.set(page.urlPath, ids);
    }

    const brokenLinks = [];
    const brokenAssets = [];
    const brokenAnchors = [];
    const dupIds = [];
    let idCount = 0;

    for (const page of pages) {
      const tree = parseHtml(page.html);
      const pageDir = page.urlPath.replace(/[^/]*$/, '');
      const rawIds = allIdsOf(tree);
      const seen = new Map();
      for (const id of rawIds) seen.set(id, (seen.get(id) || 0) + 1);
      for (const [id, n] of seen) if (n > 1) dupIds.push(`${page.urlPath} #${id} ×${n}`);
      idCount += rawIds.length;

      for (const [tag, attrName] of URL_ATTRS) {
        for (const el of findAll(tree, tag)) {
          const raw = attr(el, attrName);
          if (raw === null) continue;
          for (const value of attrName === 'srcset' ? raw.split(',') : [raw]) {
            const url = value.trim().split(/\s+/)[0];
            if (!url) continue;
            const verdict = classify(url, page.urlPath, files, pageByPath, idsPerPage, dist);
            if (verdict === 'ok' || verdict === 'external' || verdict === 'skip') continue;
            const where = `<${tag} ${attrName}="${raw.slice(0, 90)}"> @ ${page.urlPath}`;
            if (verdict === 'missing-asset') brokenAssets.push(where);
            else if (verdict === 'missing-page') brokenLinks.push(where);
            else if (verdict.startsWith('missing-anchor')) brokenAnchors.push(`${where} → 目标页没有这个锚点`);
          }
        }
      }

      // srcset lives on img/source and is comma separated
      for (const [tag, attrName] of [['img', 'srcset'], ['source', 'srcset']]) {
        for (const el of findAll(tree, tag)) {
          const raw = attr(el, attrName);
          if (!raw) continue;
          for (const part of raw.split(',')) {
            const url = part.trim().split(/\s+/)[0];
            if (!url || SKIP_SCHEME.test(url) || url.startsWith('#')) continue;
            if (classify(url, page.urlPath, files, pageByPath, idsPerPage, dist) === 'missing-asset') {
              brokenAssets.push(`<${tag} ${attrName}> ${url} @ ${page.urlPath}`);
            }
          }
        }
      }
    }

    out.push(
      brokenLinks.length
        ? fail(`${dist} 有 ${brokenLinks.length} 条失效的内部页面链接`, '', brokenLinks.slice(0, 15))
        : pass(`${dist} 内部页面链接全部可达`, `${pages.length} 个页面`),
    );
    out.push(
      brokenAssets.length
        ? fail(`${dist} 有 ${brokenAssets.length} 个失效的静态资源引用`, '', brokenAssets.slice(0, 15))
        : pass(`${dist} 静态资源引用全部存在`),
    );
    out.push(
      brokenAnchors.length
        ? fail(`${dist} 有 ${brokenAnchors.length} 条锚点链接指向不存在的 id`, '', brokenAnchors.slice(0, 15))
        : pass(`${dist} 锚点链接全部命中真实 id`),
    );
    out.push(
      dupIds.length
        ? warn(`${dist} 有重复 id（${dupIds.length} 处）`, '', dupIds.slice(0, 10))
        : pass(`${dist} 页面内 id 无重复`, `${idCount} 个 id`),
    );
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

/** Resolve one URL and report what, if anything, is wrong with it. */
function classify(url, fromPath, files, pageByPath, idsPerPage, dist) {
  if (!url || url.startsWith('#') || url.startsWith('?')) return 'skip'; // same-page anchor / query
  if (SKIP_SCHEME.test(url)) {
    // Absolute URLs to our own host are still our problem.
    const own = url.match(/^https?:\/\/(?:www\.)?(gficcrew\.com|gficcrew\.cn)(\/.*)?$/i);
    if (!own) return 'external';
    return classify(own[2] || '/', fromPath, files, pageByPath, idsPerPage, dist);
  }

  const [pathPart, hash] = url.split('#');
  const clean = pathPart.split('?')[0];
  if (!clean && !hash) return 'ok';

  // Resolve relative links against the page's directory.
  const dir = fromPath.replace(/[^/]*$/, '');
  let target = clean.startsWith('/') ? clean : path.posix.normalize(dir + clean);
  if (target.endsWith('/')) target = target.slice(0, -1);
  if (target === '') target = '/';

  const pageKey = target === '/' ? '/' : target + '/';
  // Web App Manifest uses the standards-based `.webmanifest` extension (11 chars).
  const isAsset = /\.[a-z0-9]{1,16}$/i.test(target) && !target.endsWith('/');

  if (isAsset) {
    const relPath = target.replace(/^\//, '');
    if (!files.has(relPath)) return 'missing-asset';
    return 'ok';
  }

  // A page either exists as <path>/index.html or as <path>.html
  const asDir = target === '/' ? 'index.html' : target.replace(/^\//, '') + '/index.html';
  const asFile = target.replace(/^\//, '') + '.html';
  const exists = files.has(asDir) || files.has(asFile);
  if (!exists) return 'missing-page';

  if (hash) {
    const ids = idsPerPage.get(pageKey) || idsPerPage.get(target + '/index.html');
    if (ids && !ids.has(hash)) return `missing-anchor:${hash}`;
  }
  return 'ok';
}

function allIdsOf(tree) {
  const out = [];
  for (const n of nodes(tree)) {
    if (!n.attrs) continue;
    const id = attr(n, 'id');
    if (id) out.push(id);
  }
  return out;
}

function fileList(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...fileList(path.join(dir, e.name), relPath));
    else out.push(relPath);
  }
  return out;
}
