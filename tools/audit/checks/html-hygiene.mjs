// Method 5 — markup hygiene and head metadata.
//
// These are the defects that never throw and never 404, so nothing else catches them:
// a second <h1>, an image without alt, a duplicated <title>, a canonical pointing at the
// wrong host, a 200-character meta description that search engines truncate at 155.
//
// Scope matters more than the assertions. The build emits four different kinds of page —
// indexable content, noindex utility pages (/account/, /join/, /admin/), hand-written
// redirect stubs, and /404 — and holding a redirect stub to the standards of a content
// page produces noise, not findings. So each page is classified first and only checked
// against the rules that actually apply to it. The classification lives in _util.mjs
// because the feed check asks the same question about the same pages.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  fail,
  warn,
  pass,
  loadDist,
  readText,
  parseHtml,
  findAll,
  nodes,
  attr,
  textOf,
  locOf,
  robotsMeta,
  samePath,
  classifyPage,
} from '../_util.mjs';

export const id = 'html-hygiene';
export const name = '页面结构与头部元信息（按页面性质分档检查）';

// Google truncates titles near 60 chars and descriptions near 155; the upper bounds here
// leave a little room rather than being the exact cut-off.
const TITLE_MIN = 15;
const TITLE_MAX = 65;
const DESC_MIN = 50;
const DESC_MAX = 175;

export async function run() {
  const out = [];
  const dists = ['dist-global', 'dist-cn'].filter((d) => fs.existsSync(path.join(ROOT, d)));
  if (!dists.length) return [warn('没有可检查的产物', '先跑 npm run build')];

  for (const dist of dists) {
    const pages = loadDist(dist).map((p) => ({ ...p, ...classifyPage(p) }));
    const content = pages.filter((p) => p.kind === 'indexable');
    const utility = pages.filter((p) => p.kind !== 'indexable');

    out.push(
      pass(
        `${dist} 页面分档`,
        `可收录 ${content.length} 个（${content.map((p) => p.urlPath).join(' ')}）｜工具页/跳转桩/404 ${utility.length} 个`,
      ),
    );

    const P = blank();

    // --- checks that apply to every page that is served to a browser ---------
    for (const page of pages) {
      const tree = parseHtml(page.html);
      const where = `${page.urlPath}`;

      if (page.kind !== 'stub') {
        const html = findAll(tree, 'html')[0];
        if (!html || !attr(html, 'lang')) P.lang.push(where);
        if (!findAll(tree, 'meta').some((m) => (attr(m, 'name') || '').toLowerCase() === 'viewport')) P.viewport.push(where);
      }

      for (const a of findAll(tree, 'a')) {
        const name = textOf(a) || attr(a, 'aria-label') || attr(a, 'title') || '';
        if (!name.trim() && !findAll(a, 'img').length) P.emptyLink.push(`${where} 空链接 href="${(attr(a, 'href') || '').slice(0, 60)}"`);
      }
    }

    // --- head metadata: only the pages search engines are invited to index ---
    const titles = new Map();
    const descs = new Map();
    for (const page of content) {
      const tree = parseHtml(page.html);
      const where = page.urlPath;
      const metas = findAll(tree, 'meta');
      const metaOf = (key) => metas.find((m) => (attr(m, 'name') || attr(m, 'property') || '') === key);

      const title = textOf(findAll(tree, 'title')[0] || {});
      if (!title) P.title.push(`${where} 没有 <title>`);
      else {
        if (title.length < TITLE_MIN) P.title.push(`${where} 标题过短（${title.length} 字符）：${title}`);
        if (title.length > TITLE_MAX) P.title.push(`${where} 标题过长（${title.length} 字符，建议 ≤${TITLE_MAX}）：${title}`);
        if (!titles.has(title)) titles.set(title, []);
        titles.get(title).push(where);
      }

      const descEl = metaOf('description');
      const desc = descEl ? attr(descEl, 'content') || '' : '';
      if (!descEl) P.desc.push(`${where} 没有 meta description`);
      else {
        if (desc.length < DESC_MIN) P.desc.push(`${where} 描述过短（${desc.length} 字符）`);
        if (desc.length > DESC_MAX) P.desc.push(`${where} 描述过长（${desc.length} 字符，搜索结果显示约 155 字符后截断）`);
        if (!descs.has(desc)) descs.set(desc, []);
        descs.get(desc).push(where);
      }

      const canonical = findAll(tree, 'link').find((l) => (attr(l, 'rel') || '') === 'canonical');
      const wantHost = dist === 'dist-cn' ? 'gficcrew.cn' : 'gficcrew.com';
      if (!canonical) P.canonical.push(`${where} 没有 canonical`);
      else {
        const href = attr(canonical, 'href') || '';
        if (!/^https:\/\//.test(href)) P.canonical.push(`${where} canonical 不是绝对 https：${href}`);
        else if (!href.includes(wantHost)) P.canonical.push(`${where} canonical 指向错误域名（应含 ${wantHost}）：${href}`);
        else if (!samePath(href, page.urlPath)) P.canonical.push(`${where} canonical 不指向自身：${href}`);
      }

      for (const prop of ['og:title', 'og:description', 'og:image', 'og:type']) {
        if (!metas.some((m) => (attr(m, 'property') || '') === prop)) P.og.push(`${where} 缺 ${prop}`);
      }
      const ogImage = metaOf('og:image');
      if (ogImage && !/^https:\/\//.test(attr(ogImage, 'content') || '')) P.og.push(`${where} og:image 不是绝对地址`);

      // --- heading structure ------------------------------------------------
      const headings = [...nodes(tree)]
        .filter((n) => /^h[1-6]$/.test(n.tagName || ''))
        .map((n) => ({ level: +n.tagName[1], text: textOf(n), loc: locOf(n) }));
      const h1s = headings.filter((h) => h.level === 1);
      if (h1s.length !== 1) P.h1.push(`${where} 有 ${h1s.length} 个 <h1>${h1s.length ? '：' + h1s.map((h) => h.text.slice(0, 40)).join(' | ') : ''}`);
      for (let i = 1; i < headings.length; i += 1) {
        if (headings[i].level - headings[i - 1].level > 1) {
          P.level.push(`${where} h${headings[i - 1].level}→h${headings[i].level}「${headings[i].text.slice(0, 40)}」${headings[i].loc}`);
        }
      }

      for (const img of findAll(tree, 'img')) {
        const alt = attr(img, 'alt');
        const decorative = attr(img, 'aria-hidden') === 'true' || attr(img, 'role') === 'presentation';
        const src = (attr(img, 'src') || '').slice(0, 60);
        if (alt === null && !decorative) P.alt.push(`${where} <img src="${src}"> 缺 alt`);
        else if (alt === '' && !decorative) P.alt.push(`${where} <img src="${src}"> alt 为空（装饰图应加 aria-hidden="true"）`);
      }
    }

    // --- 404 must not invite indexing ---------------------------------------
    const notFound = pages.find((p) => p.urlPath === '/404');
    if (notFound) {
      const robots = robotsMeta(notFound.html);
      if (!/noindex/i.test(robots)) {
        P.notFound.push(
          `404.html 的 robots 为「${robots || '(未声明)'}」：404 页不应被收录，应写 noindex`,
        );
      }
      // One 404 document answers every unmatched path, so a canonical can only be right
      // for one of them and wrong for all the rest — and Astro reports the route as /404/,
      // which is not a file the host serves either. The hreflang pair mirrors the
      // canonical, so it goes with it. Declaring none is the honest markup.
      //
      // Matched on elements, not on the raw text: the layout's explanatory comment above
      // the hreflang pair contains both words, and a substring test reports the comment.
      const links = findAll(parseHtml(notFound.html), 'link');
      const canonicalTag = links.find((l) => (attr(l, 'rel') || '') === 'canonical');
      if (canonicalTag) P.canonical404.push(`404.html 声明了 canonical：${attr(canonicalTag, 'href') || ''}`);
      for (const l of links) {
        if (attr(l, 'hreflang')) P.canonical404.push(`404.html 声明了 hreflang alternate：${attr(l, 'href') || ''}`);
      }
    }

    // --- noindex pages must not sit in the sitemap --------------------------
    const smPath = path.join(ROOT, dist, 'sitemap-0.xml');
    if (fs.existsSync(smPath)) {
      const inSitemap = new Set([...readText(smPath).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '') || '/'));
      const wrong = utility.filter((p) => p.kind === 'noindex' && inSitemap.has(p.urlPath)).map((p) => p.urlPath);
      out.push(
        wrong.length
          ? fail(`${dist} sitemap 收录了 noindex 页面`, wrong.join(', '))
          : pass(`${dist} sitemap 未收录 noindex 页面`),
      );
    }

    out.push(bucket(`${dist} 每页恰好一个 <h1>`, P.h1));
    out.push(bucket(`${dist} 标题层级不跳级`, P.level, 'warn'));
    out.push(bucket(`${dist} img 都有 alt`, P.alt));
    out.push(bucket(`${dist} html lang 与 viewport 齐备`, [...P.lang, ...P.viewport]));
    out.push(bucket(`${dist} 标题长度合规`, P.title, 'warn'));
    out.push(bucket(`${dist} 描述长度合规`, P.desc));
    out.push(bucket(`${dist} canonical 指向自身与本站域名`, P.canonical));
    out.push(bucket(`${dist} OG 卡片完整`, P.og, 'warn'));
    out.push(bucket(`${dist} 没有无文本链接`, P.emptyLink, 'warn'));
    out.push(bucket(`${dist} 404 页声明 noindex`, P.notFound));
    out.push(bucket(`${dist} 404 页不声明 canonical / hreflang`, P.canonical404));

    const dupTitles = [...titles.entries()].filter(([, v]) => v.length > 1);
    const dupDescs = [...descs.entries()].filter(([, v]) => v.length > 1);
    out.push(
      dupTitles.length
        ? warn(`${dist} 有 ${dupTitles.length} 组重复标题`, '', dupTitles.map(([t, v]) => `「${t.slice(0, 55)}」→ ${v.join(' , ')}`))
        : pass(`${dist} 标题在可收录页内唯一`, `${titles.size} 个`),
    );
    out.push(
      dupDescs.length
        ? warn(`${dist} 有 ${dupDescs.length} 组重复描述`, '', dupDescs.map(([, v]) => `→ ${v.join(' , ')}`))
        : pass(`${dist} 描述在可收录页内唯一`, `${descs.size} 个`),
    );
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

const blank = () => ({ h1: [], level: [], alt: [], title: [], desc: [], canonical: [], og: [], lang: [], viewport: [], emptyLink: [], notFound: [], canonical404: [] });

const bucket = (label, items, level = 'fail') => {
  if (!items.length) return pass(label);
  const max = 12;
  const evidence = items.slice(0, max).concat(items.length > max ? [`…另有 ${items.length - max} 处`] : []);
  return (level === 'warn' ? warn : fail)(`${label}（${items.length} 处）`, '', evidence);
};
