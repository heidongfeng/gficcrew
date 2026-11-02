// 全站 SEO / GEO 结构检测 —— 只看构建产物，不看源码，避免"凭最佳实践列清单"。
//
// 用法：node tools/_seo-geo-audit.cjs [dist-global] [dist-cn]
// 输出：stdout 摘要；完整明细写到 tools/audit/_out/seo-geo-report.md
const fs = require('node:fs');
const path = require('node:path');
const parse5 = require('parse5');

const ROOT = path.resolve(__dirname, '..');
const GLOBAL = path.join(ROOT, process.argv[2] || 'dist-global');
const CN = path.join(ROOT, process.argv[3] || 'dist-cn');
const OUT_DIR = path.join(ROOT, 'tools', 'audit', '_out');

const lines = [];
const out = (s = '') => lines.push(s);

// ---------------------------------------------------------------- 工具
function htmlFiles(dir, base = '') {
  const res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) res.push(...htmlFiles(path.join(dir, e.name), rel));
    else if (e.name.endsWith('.html')) res.push(rel);
  }
  return res;
}
const urlOf = (rel) => (rel === 'index.html' ? '/' : rel === '404.html' ? '/404.html' : '/' + rel.replace(/index\.html$/, ''));

function walk(node, fn) {
  fn(node);
  const kids = node.childNodes || [];
  for (const k of kids) walk(k, fn);
}
function attr(node, name) {
  return (node.attrs || []).find((a) => a.name === name)?.value ?? null;
}
function textOf(node) {
  let t = '';
  walk(node, (n) => {
    if (n.nodeName === '#text') t += n.value;
  });
  return t.replace(/\s+/g, ' ').trim();
}
function findAll(root, tag) {
  const res = [];
  walk(root, (n) => {
    if (n.tagName === tag) res.push(n);
  });
  return res;
}

// ---------------------------------------------------------------- 采集
function analyse(dir) {
  const pages = htmlFiles(dir).map((rel) => {
    const html = fs.readFileSync(path.join(dir, rel), 'utf8');
    const doc = parse5.parse(html);
    const heads = findAll(doc, 'head');
    const head = heads[0] || doc;
    const metas = findAll(head, 'meta');
    const meta = (n, k, v) => metas.find((m) => (attr(m, n) || '').toLowerCase() === k)?.[  'value' ] ?? (metas.find((m) => (attr(m, n) || '').toLowerCase() === k) ? attr(metas.find((m) => (attr(m, n) || '').toLowerCase() === k), v) : null);
    const pick = (n, k, v) => {
      const m = metas.find((x) => (attr(x, n) || '').toLowerCase() === k);
      return m ? attr(m, v) : null;
    };
    const titleEl = findAll(head, 'title')[0];
    const links = findAll(head, 'link');
    const linkRel = (r) => links.filter((l) => (attr(l, 'rel') || '') === r);
    const jsonld = findAll(doc, 'script').filter((s) => (attr(s, 'type') || '') === 'application/ld+json');
    const body = findAll(doc, 'body')[0] || doc;
    const h1 = findAll(body, 'h1');
    const imgs = findAll(body, 'img');
    const anchors = findAll(body, 'a');
    const langEl = findAll(doc, 'html')[0];
    const canonical = linkRel('canonical')[0];
    const alts = links.filter((l) => (attr(l, 'hreflang') || '') !== null);

    const internal = anchors
      .map((a) => attr(a, 'href') || '')
      .filter((h) => h.startsWith('/') && !h.startsWith('//'))
      .map((h) => h.split('#')[0].split('?')[0]);

    return {
      rel,
      url: urlOf(rel),
      lang: langEl ? attr(langEl, 'lang') : null,
      title: titleEl ? textOf(titleEl) : null,
      desc: pick('name', 'description', 'content'),
      robots: pick('name', 'robots', 'content'),
      refresh: pick('http-equiv', 'refresh', 'content'),
      canonical: canonical ? attr(canonical, 'href') : null,
      hreflang: alts.map((l) => `${attr(l, 'hreflang')}=${attr(l, 'href')}`),
      og: {
        title: pick('property', 'og:title', 'content'),
        desc: pick('property', 'og:description', 'content'),
        image: pick('property', 'og:image', 'content'),
        url: pick('property', 'og:url', 'content'),
        type: pick('property', 'og:type', 'content'),
        site: pick('property', 'og:site_name', 'content'),
        imgW: pick('property', 'og:image:width', 'content'),
        imgH: pick('property', 'og:image:height', 'content'),
        imgAlt: pick('property', 'og:image:alt', 'content'),
      },
      twitter: { card: pick('name', 'twitter:card', 'content'), imageAlt: pick('name', 'twitter:image:alt', 'content') },
      h1Count: h1.length,
      h1Text: h1[0] ? textOf(h1[0]) : null,
      h2: findAll(body, 'h2').length,
      h3: findAll(body, 'h3').length,
      imgTotal: imgs.length,
      imgNoAlt: imgs.filter((i) => attr(i, 'alt') === null).length,
      imgEmptyAlt: imgs.filter((i) => attr(i, 'alt') === '').length,
      words: textOf(body).split(/\s+/).filter(Boolean).length,
      jsonld: jsonld.map((s) => {
        const t = textOf(s);
        try {
          return JSON.parse(t);
        } catch (e) {
          return { __parseError: e.message };
        }
      }),
      internal: [...new Set(internal)],
    };
  });

  const files = {};
  for (const f of ['robots.txt', 'sitemap-index.xml', 'sitemap-0.xml', 'llms.txt', 'llms-full.txt', 'rss.xml', '5a83257216067620efa85a5fb9888f23.txt']) {
    const p = path.join(dir, f);
    files[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }
  return { pages, files };
}

// ---------------------------------------------------------------- 报告
function section(t) {
  out('');
  out(`## ${t}`);
}

function run() {
  const G = analyse(GLOBAL);
  const C = analyse(CN);

  out('# 全站 SEO / GEO 结构检测（基于构建产物）');
  out('');
  out(`- 境外产物：\`${path.basename(GLOBAL)}\`　${G.pages.length} 个 HTML`);
  out(`- 国内产物：\`${path.basename(CN)}\`　${C.pages.length} 个 HTML`);

  // ---- 站点文件
  section('一、站点级文件');
  for (const [label, D, host] of [['dist-global', G, 'gficcrew.com'], ['dist-cn', C, 'gficcrew.cn']]) {
    out('');
    out(`### ${label}`);
    const r = D.files['robots.txt'];
    if (!r) out('- ✗ robots.txt 缺失');
    else {
      const aiAllow = (r.match(/^User-agent:\s*(\S+)\s*\nAllow:\s*\//gim) || []).length;
      const groups = [...r.matchAll(/^User-agent:\s*(.+)$/gim)].map((m) => m[1].trim());
      const gbot = /User-agent:\s*Googlebot\b[\s\S]*?(?=\nUser-agent:|\s*$)/i.exec(r);
      out(`- robots.txt：${r.length} 字节，${groups.length} 个 User-agent 组，其中 Allow 组 ${aiAllow} 个`);
      out(`- Googlebot 组：${gbot ? (/Disallow:\s*\/\s*$/im.test(gbot[0]) ? '**Disallow: /**' : 'Allow: /') : '未单独出现'}`);
      out(`- Sitemap 行：${(r.match(/^Sitemap:.*$/gim) || []).join(' ') || '**缺失**'}`);
      out(`- Disallow /admin/：${/Disallow:\s*\/admin\//i.test(r) ? '有' : '**无**'}`);
      out(`- 通配组是否重复了具名组的 Disallow：${/User-agent:\s*\*[\s\S]*?Disallow:/i.test(r) ? '是' : '否'}`);
    }
    const sm = D.files['sitemap-0.xml'];
    if (!sm) out('- ✗ sitemap-0.xml 缺失');
    else {
      const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      const lastmods = [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
      const hosts = [...new Set(urls.map((u) => new URL(u).origin))];
      out(`- sitemap：${urls.length} 条 URL，域名 ${hosts.join(', ')}`);
      out(`- lastmod：${lastmods.length}/${urls.length} 条有；不同取值 ${new Set(lastmods).size} 个`);
      const noLast = urls.length - lastmods.length;
      if (noLast > 0) out(`  - ⚠ ${noLast} 条缺 lastmod`);
    }
    for (const f of ['llms.txt', 'llms-full.txt', 'rss.xml']) {
      const v = D.files[f];
      out(`- ${f}：${v === null ? '**缺失**' : v.length + ' 字节'}`);
    }
    const key = D.files['5a83257216067620efa85a5fb9888f23.txt'];
    if (key !== null) {
      out(`- IndexNow 密钥文件：${key.length} 字节，内容与文件名一致：${key.trim() === '5a83257216067620efa85a5fb9888f23' ? '是' : '**否**'}，无尾随换行：${key === key.trim() ? '是' : '**否**'}`);
    }
  }

  // ---- 每条页面的 head
  section('二、逐页 head（dist-global）');
  const TITLE_MIN = 15, TITLE_MAX = 65, DESC_MIN = 60, DESC_MAX = 165;
  const rows = [];
  const issues = [];
  for (const p of G.pages) {
    // 分档：可索引页才套 title/desc/h1/canonical/og 这些规则。工具页、重定向桩、404
    // 的规则完全不同，不分档就会把有意设计报成缺陷（_out 的旧报告里就误报过 4 条）。
    const isStub = /noindex/.test(p.robots || '') || (p.refresh && p.canonical && !p.canonical.includes(p.url));
    const isTool = /noindex/.test(p.robots || '') || p.url === '/admin/';
    const tier = isTool ? 'tool' : isStub ? 'stub' : 'indexable';
    if (tier !== 'indexable') {
      rows.push({ url: p.url, tier, t: (p.title || '').length, d: (p.desc || '').length, h2: p.h2, h3: p.h3, words: p.words, imgs: p.imgTotal, links: p.internal.length, jsonld: p.jsonld.length, flags: [`非索引页（${tier}），规则不适用`] });
      continue;
    }
    const t = (p.title || '').length;
    const d = (p.desc || '').length;
    const flags = [];
    if (!p.title) flags.push('无 title');
    else if (t < TITLE_MIN) flags.push(`title 偏短 ${t}`);
    else if (t > TITLE_MAX) flags.push(`title 偏长 ${t}`);
    if (!p.desc) flags.push('无 description');
    else if (d < DESC_MIN) flags.push(`desc 偏短 ${d}`);
    else if (d > DESC_MAX) flags.push(`desc 偏长 ${d}`);
    if (p.h1Count !== 1) flags.push(`h1 数量 ${p.h1Count}`);
    if (!p.canonical) flags.push('无 canonical');
    else if (!p.canonical.includes(p.url === '/' ? 'gficcrew.com/' : p.url)) flags.push(`canonical 不自引用(${p.canonical})`);
    if (!p.hreflang.length) flags.push('无 hreflang');
    if (!p.og.image) flags.push('无 og:image');
    if (p.imgNoAlt) flags.push(`${p.imgNoAlt} 图无 alt`);
    if (p.robots && !/max-image-preview:large/.test(p.robots) && !/noindex/.test(p.robots)) flags.push('robots 缺 max-image-preview:large');
    rows.push({ url: p.url, tier, t, d, h2: p.h2, h3: p.h3, words: p.words, imgs: p.imgTotal, links: p.internal.length, jsonld: p.jsonld.length, flags });
    if (flags.length) issues.push(`${p.url} → ${flags.join('、')}`);
  }
  out('');
  out('| URL | 分档 | title | desc | h2 | h3 | 词数 | 图 | 内链 | JSON-LD | 问题 |');
  out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) out(`| ${r.url} | ${r.tier || 'indexable'} | ${r.t} | ${r.d} | ${r.h2} | ${r.h3} | ${r.words} | ${r.imgs} | ${r.links} | ${r.jsonld} | ${r.flags.join('；') || '—'} |`);

  // 重复 title / desc
  const dup = (k) => {
    const m = new Map();
    for (const p of G.pages) {
      const v = p[k];
      if (!v) continue;
      if (!m.has(v)) m.set(v, []);
      m.get(v).push(p.url);
    }
    return [...m].filter(([, v]) => v.length > 1);
  };
  out('');
  const dupT = dup('title'), dupD = dup('desc');
  out(`- 重复 title：${dupT.length ? dupT.map(([v, u]) => `「${v}」×${u.length}`).join('、') : '无 ✓'}`);
  out(`- 重复 description：${dupD.length ? dupD.map(([v, u]) => `「${v.slice(0, 40)}…」×${u.length}`).join('、') : '无 ✓'}`);

  // ---- 结构化数据
  section('三、结构化数据');
  const typeCount = new Map();
  for (const p of G.pages) {
    for (const blk of p.jsonld) {
      if (blk.__parseError) { out(`- ✗ ${p.url} 有无法解析的 JSON-LD：${blk.__parseError}`); continue; }
      const nodes = Array.isArray(blk['@graph']) ? blk['@graph'] : [blk];
      for (const n of nodes) {
        const t = n['@type'];
        for (const tt of Array.isArray(t) ? t : [t]) typeCount.set(tt, (typeCount.get(tt) || 0) + 1);
      }
    }
  }
  out(`- 类型分布：${[...typeCount].map(([k, v]) => `${k}×${v}`).join(' ')}`);
  const required = {
    Organization: ['name', 'url', 'logo'],
    WebSite: ['name', 'url'],
    WebPage: ['name', 'url'],
    BreadcrumbList: ['itemListElement'],
    FAQPage: ['mainEntity'],
    Article: ['headline', 'datePublished'],
    LocalBusiness: ['name', 'address'],
    Event: ['name', 'startDate'],
  };
  for (const p of G.pages) {
    for (const blk of p.jsonld) {
      if (blk.__parseError) continue;
      const nodes = Array.isArray(blk['@graph']) ? blk['@graph'] : [blk];
      for (const n of nodes) {
        const t = Array.isArray(n['@type']) ? n['@type'][0] : n['@type'];
        const need = required[t];
        if (!need) continue;
        const miss = need.filter((k) => n[k] === undefined);
        if (miss.length) out(`- ✗ ${p.url} 的 ${t} 缺 ${miss.join('/')}`);
      }
    }
  }
  out(`- 必填项检查完毕（上表无 ✗ 即全部齐全）`);

  // ---- 内链图
  section('四、内链结构');
  const known = new Set(G.pages.map((p) => p.url));
  const linked = new Set();
  for (const p of G.pages) for (const h of p.internal) linked.add(h === '/' ? '/' : h.replace(/\/$/, '/'));
  const orphans = [...known].filter((u) => u !== '/' && u !== '/404.html' && ![...linked].some((l) => l === u || l + 'index.html' === u));
  out(`- 已知页面 ${known.size} 个；被至少一个页面链到的 ${linked.size} 个`);
  out(`- 疑似孤立页：${orphans.length ? orphans.join('、') : '无 ✓'}`);
  const sitemapUrls = [...(G.files['sitemap-0.xml'] || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const inSitemapNotLinked = sitemapUrls.filter((u) => !linked.has(u));
  out(`- sitemap 有但没有任何内链指向：${inSitemapNotLinked.length ? inSitemapNotLinked.join('、') : '无 ✓'}`);
  const pageNotInSitemap = G.pages.filter((p) => !sitemapUrls.includes(p.url) && p.url !== '/404.html');
  out(`- 有页面但不在 sitemap：${pageNotInSitemap.length ? pageNotInSitemap.map((p) => p.url).join('、') : '无 ✓'}`);

  // ---- 双产物差分
  section('五、两个产物是否各自指向自己');
  const cmp = (k) => {
    const g = G.pages.map((p) => p[k]).filter(Boolean);
    const c = C.pages.map((p) => p[k]).filter(Boolean);
    const gcn = g.filter((v) => String(v).includes('gficcrew.cn')).length;
    const ccom = c.filter((v) => String(v).includes('gficcrew.com')).length;
    out(`- ${k}：global 里出现 cn 域名 ${gcn} 处；cn 里出现 com 域名 ${ccom} 处`);
  };
  cmp('canonical');
  cmp('og');
  const gSitemap = (G.files['robots.txt'] || '').match(/^Sitemap:.*$/gim) || [];
  const cSitemap = (C.files['robots.txt'] || '').match(/^Sitemap:.*$/gim) || [];
  out(`- robots Sitemap：global → ${gSitemap.join(',')}｜cn → ${cSitemap.join(',')}`);

  // ---- llms.txt 新鲜度
  section('六、llms.txt / llms-full.txt 与站点事实是否一致');
  const full = G.files['llms-full.txt'] || '';
  const check = (label, re, expect) => {
    const m = full.match(re);
    out(`- ${label}：声明 ${m ? m[1] : '(未声明)'}　期望 ${expect}　${m && m[1] === String(expect) ? '✓' : '⚠'}`);
  };
  check('城市数', /\b(\d+)\s+cities\b/, 16);
  const faqQ = (full.match(/^Q[:：]/gm) || []).length;
  out(`- llms-full 里 Q: 行数：${faqQ}（站点 FAQ ${G.pages.find((p) => p.url === '/faq/')?.jsonld?.length ? '' : ''}）`);
  out(`- llms-full 是否提到已清空的活动：${/upcoming event|活动日历/.test(full) ? '提到（需核对是否还有活动）' : '未提到'}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, 'seo-geo-report.md');
  fs.writeFileSync(dest, lines.join('\n') + '\n', 'utf8');

  // stdout 摘要
  console.log(`报告已写入 ${path.relative(ROOT, dest)}（${lines.length} 行）`);
  console.log('');
  console.log('逐页问题汇总：');
  console.log(issues.length ? issues.map((s) => '  ' + s).join('\n') : '  无 ✓');
  console.log('');
  console.log('页面数：global ' + G.pages.length + ' / cn ' + C.pages.length);
}

run();
