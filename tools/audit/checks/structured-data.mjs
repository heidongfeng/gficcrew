// Method 6 — structured data validation.
//
// This is the layer generative engines read most literally, and it is also the layer with
// no safety net: a JSON-LD block that is invalid, or that contradicts the page it sits on,
// is silently ignored rather than reported. Type mismatches are invisible in a browser.
//
// Besides the schema.org shape rules, the checks below cross-reference the markup against
// the same data modules the pages were rendered from — so a list that says
// numberOfItems: 14 while carrying 13 elements is caught as a contradiction, not as a
// style issue.
import { fail, warn, pass, loadDist, loadData, loadJsonLd, asArray } from '../_util.mjs';

export const id = 'structured-data';
export const name = 'JSON-LD 结构化数据（shape / 必填项 / URL 域名 / 与源数据一致）';

/** Required properties per @type, and the reason each one matters. */
const REQUIRED = {
  Organization: { props: ['name', 'url', 'logo'], why: '知识面板与品牌实体识别的核心三件套' },
  WebSite: { props: ['name', 'url'], why: '站点实体' },
  WebPage: { props: ['url', 'name'], why: '页面实体' },
  BreadcrumbList: { props: ['itemListElement'], why: '面包屑' },
  ItemList: { props: ['itemListElement'], why: '列表' },
  Event: { props: ['name', 'startDate', 'endDate', 'location'], why: '活动富结果必需 name/startDate/location' },
  FAQPage: { props: ['mainEntity'], why: 'FAQ 富结果必需 mainEntity' },
  Article: { props: ['headline', 'datePublished'], why: '文章' },
  HowTo: { props: ['name', 'step'], why: '教程' },
  LocalBusiness: { props: ['name', 'address'], why: '本地商家' },
  Question: { props: ['name', 'acceptedAnswer'], why: '问答' },
  Answer: { props: ['text'], why: '答案正文' },
  ListItem: { props: ['position'], why: '列表项' },
  HowToStep: { props: ['text'], why: '教程步骤正文' },
  Place: { props: ['name'], why: '地点' },
  Offer: { props: ['price', 'priceCurrency'], why: '票价' },
};

/** Types that are legitimate inside a graph but usually carry no required properties here. */
const KNOWN_CONTAINER_TYPES = new Set(['PostalAddress', 'GeoCoordinates', 'ImageObject', 'SearchAction', 'EntryPoint', 'Person', 'OpeningHoursSpecification', 'AggregateRating', 'InteractionCounter']);

/**
 * Properties whose string values must be absolute URLs on the page's own host.
 * `sameAs` is deliberately absent: social profiles live on other domains by definition,
 * so demanding our host there would be the check inventing a rule.
 */
const URL_PROPS = new Set(['url', 'item', '@id', 'logo', 'image', 'mainEntityOfPage']);

export async function run() {
  const out = [];
  const D = await loadData();
  const dists = ['dist-global', 'dist-cn'].filter((d) => pageDirs(d).length);
  if (!dists.length) return [warn('没有可检查的产物', '先跑 npm run build')];

  for (const dist of dists) {
    const pages = loadDist(dist);
    const blocks = loadJsonLd(pages);

    const parseErrors = blocks.filter((b) => b.error);
    out.push(
      parseErrors.length
        ? fail(`${dist} 有 ${parseErrors.length} 段 JSON-LD 解析失败`, '', parseErrors.slice(0, 10).map((b) => `${b.file}: ${b.error}`))
        : pass(`${dist} 全部 JSON-LD 可解析`, `${blocks.length} 段`),
    );

    const wantHost = dist === 'dist-cn' ? 'gficcrew.cn' : 'gficcrew.com';
    const problems = { context: [], type: [], required: [], url: [], dupId: [], numbers: [], breadcrumb: [], dates: [], faq: [] };

    const byPage = groupByFile(blocks.filter((b) => !b.error));
    const typeCount = new Map();

    for (const [file, list] of byPage) {
      // depth 0 = the root node of one <script> block. Nested nodes inherit @context from
      // it, so only roots are required to declare one.
      const flat = list.flatMap((b) => flatten(b.data));
      const seenIds = new Map();

      for (const { node, depth } of flat) {
        const t = node['@type'];
        const label = `${file} [${t}]`;
        typeCount.set(t, (typeCount.get(t) || 0) + 1);

        if (depth === 0 && (!node['@context'] || !String(node['@context']).includes('schema.org')))
          problems.context.push(`${label} 根节点 @context 缺失或不含 schema.org`);
        if (!t) problems.type.push(`${file} 有节点缺 @type`);

        const req = REQUIRED[t];
        if (req) {
          const missing = req.props.filter((p) => node[p] === undefined || node[p] === '');
          if (missing.length) problems.required.push(`${label} 缺 ${missing.join(', ')}（${req.why}）`);
        } else if (t && !KNOWN_CONTAINER_TYPES.has(t)) {
          problems.type.push(`${label} 的类型没有在检查表里定义`);
        }

        // @id must be unique per page: two nodes sharing one @id merge into a single
        // entity, which silently discards one of them.
        if (node['@id']) {
          if (seenIds.has(node['@id'])) problems.dupId.push(`${file} @id 重复：${node['@id']}（${seenIds.get(node['@id'])} 与 ${t}）`);
          else seenIds.set(node['@id'], t);
        }

        for (const [k, v] of Object.entries(node)) {
          if (!URL_PROPS.has(k)) continue;
          for (const u of asArray(v)) {
            if (typeof u !== 'string' || !/^https?:/.test(u)) continue;
            if (/^http:\/\//.test(u) && !/@id$/.test(k)) problems.url.push(`${label} ${k} 用了 http：${u.slice(0, 70)}`);
            else if (/^https:\/\//.test(u) && !u.includes(wantHost) && !u.includes('schema.org') && !u.includes('w3.org'))
              problems.url.push(`${label} ${k} 指向错误域名（应含 ${wantHost}）：${u.slice(0, 70)}`);
          }
        }

        // --- per-type deep checks -------------------------------------------
        if (t === 'ItemList') {
          const els = asArray(node.itemListElement);
          if (node.numberOfItems !== undefined && node.numberOfItems !== els.length)
            problems.numbers.push(`${label} numberOfItems=${node.numberOfItems} 但实际有 ${els.length} 项`);
          for (const e of els) {
            if (e && e['@type'] && e['@type'] !== 'ListItem') problems.type.push(`${label} 的 itemListElement 里有非 ListItem：${e['@type']}`);
          }
        }

        if (t === 'BreadcrumbList') {
          const els = asArray(node.itemListElement);
          els.forEach((e, i) => {
            if (!e) return;
            if (e.position === undefined) problems.breadcrumb.push(`${label} 第 ${i + 1} 项缺 position`);
            else if (e.position !== i + 1) problems.breadcrumb.push(`${label} 第 ${i + 1} 项 position=${e.position}，应为 ${i + 1}`);
            if (!e.item) problems.breadcrumb.push(`${label} 第 ${i + 1} 项（${e.name || '?'}）缺 item URL`);
          });
          if (!els.length) problems.breadcrumb.push(`${label} itemListElement 为空`);
        }

        if (t === 'Event') {
          const s = Date.parse(node.startDate);
          const e = Date.parse(node.endDate);
          if (Number.isNaN(s)) problems.dates.push(`${label} startDate 无法解析：${node.startDate}`);
          if (Number.isNaN(e)) problems.dates.push(`${label} endDate 无法解析：${node.endDate}`);
          if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) problems.dates.push(`${label} endDate 早于 startDate`);
          const loc = node.location;
          if (loc && !loc.name && !loc.address) problems.required.push(`${label} location 既没有 name 也没有 address`);
        }

        if (t === 'FAQPage') {
          const qs = asArray(node.mainEntity);
          if (!qs.length) problems.faq.push(`${label} mainEntity 为空`);
          qs.forEach((q, i) => {
            if (!q) return;
            if (!q.name) problems.faq.push(`${label} 第 ${i + 1} 个问题缺 name`);
            const a = q.acceptedAnswer;
            if (!a) problems.faq.push(`${label} 第 ${i + 1} 个问题（${String(q.name || '').slice(0, 40)}）缺 acceptedAnswer`);
            else if (!a.text) problems.faq.push(`${label} 第 ${i + 1} 个问题的 acceptedAnswer 缺 text`);
          });
        }
      }
    }

    out.push(problems.context.length ? fail(`${dist} @context 有问题`, '', dedupe(problems.context)) : pass(`${dist} 全部节点 @context 正确`));
    out.push(problems.type.length ? warn(`${dist} @type 异常`, '', dedupe(problems.type)) : pass(`${dist} @type 全部在检查表内`));
    out.push(
      problems.required.length
        ? fail(`${dist} 有 ${problems.required.length} 处必填属性缺失`, '', dedupe(problems.required).slice(0, 15))
        : pass(`${dist} 各类型必填属性齐全`),
    );
    out.push(
      problems.dupId.length
        ? fail(`${dist} @id 在同一页内重复`, '', dedupe(problems.dupId).slice(0, 10))
        : pass(`${dist} 页内 @id 唯一`),
    );
    out.push(
      problems.url.length
        ? fail(`${dist} 有 ${problems.url.length} 处 URL 域名/协议不对`, '', dedupe(problems.url).slice(0, 12))
        : pass(`${dist} 结构化数据中的 URL 均为本站 https 绝对地址`, `域名 ${wantHost}`),
    );
    out.push(problems.numbers.length ? fail(`${dist} ItemList 声明数量与实际不符`, '', dedupe(problems.numbers)) : pass(`${dist} ItemList 数量自洽`));
    out.push(problems.breadcrumb.length ? fail(`${dist} 面包屑结构有误`, '', dedupe(problems.breadcrumb).slice(0, 12)) : pass(`${dist} 面包屑 position 连续且都有 item`));
    out.push(problems.dates.length ? fail(`${dist} 活动日期有问题`, '', dedupe(problems.dates).slice(0, 12)) : pass(`${dist} Event 日期合法且顺序正确`));
    out.push(problems.faq.length ? fail(`${dist} FAQPage 结构有误`, '', dedupe(problems.faq).slice(0, 12)) : pass(`${dist} FAQPage 每题都有 name 与 acceptedAnswer.text`));

    // --- cross-check against the data the pages were rendered from ----------
    const dataChecks = [];
    const cityList = blocks.find((b) => !b.error && b.data?.['@type'] === 'ItemList' && b.data?.name?.includes('service cities'));
    if (cityList) {
      const els = asArray(cityList.data.itemListElement).length;
      if (els !== D.CITIES.length) dataChecks.push(`城市列表 ItemList 有 ${els} 项，CITIES 有 ${D.CITIES.length} 个`);
    }
    const faqPage = blocks.find((b) => !b.error && b.data?.['@type'] === 'FAQPage');
    if (faqPage) {
      const qs = asArray(faqPage.data.mainEntity).length;
      if (qs !== D.FAQ.length) dataChecks.push(`FAQPage 有 ${qs} 道题，数据里有 ${D.FAQ.length} 道`);
    }
    // Finished events are deliberately absent from the page, so this compares against what is
    // still upcoming rather than against every row in the data file.
    const expectedEvents = D.upcomingEvents().length;
    // The same event intentionally appears twice: once in the /events/ calendar and once on
    // its own detail page. Count unique events, not JSON-LD blocks, or any published event
    // looks like a duplicate the moment it gets a detail page.
    const eventKeys = new Set(
      blocks
        .filter((b) => !b.error && b.data?.['@type'] === 'Event')
        .map((b) => `${b.data.name || ''}|${b.data.startDate || ''}`),
    );
    const eventCount = eventKeys.size;
    if (expectedEvents > 0 && eventCount !== expectedEvents)
      dataChecks.push(`Event 节点对应 ${eventCount} 场活动，应渲染的未结束活动有 ${expectedEvents} 场（可能少渲染了活动）`);
    if (expectedEvents === 0 && eventCount > 0)
      dataChecks.push(`日历上已无未结束的活动，却仍渲染了 ${eventCount} 个 Event 节点`);
    out.push(
      dataChecks.length
        ? fail(`${dist} 结构化数据与源数据数量不一致`, '', dataChecks)
        : pass(`${dist} 结构化数据数量与应渲染数据一致`, `城市 ${D.CITIES.length} / FAQ ${D.FAQ.length} / 活动 ${eventCount}`),
    );

    out.push(pass(`${dist} JSON-LD 类型分布`, [...typeCount.entries()].map(([k, v]) => `${k}×${v}`).join(' ')));
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

/** Keys whose values are themselves schema.org nodes rather than plain data. */
const NESTED_KEYS = ['@graph', 'mainEntity', 'itemListElement', 'step', 'acceptedAnswer', 'location', 'offers', 'address', 'geo'];

/** Flatten a block into { node, depth } so roots can be told apart from nested nodes. */
function flatten(data, depth = 0) {
  if (Array.isArray(data)) return data.flatMap((d) => flatten(d, depth));
  if (!data || typeof data !== 'object') return [];
  const out = [{ node: data, depth }];
  for (const key of NESTED_KEYS) {
    if (data[key]) out.push(...flatten(data[key], depth + 1));
  }
  return out;
}

function groupByFile(blocks) {
  const m = new Map();
  for (const b of blocks) {
    if (!m.has(b.file)) m.set(b.file, []);
    m.get(b.file).push(b);
  }
  return m;
}

const dedupe = (l) => [...new Set(l)];

function pageDirs(dist) {
  try {
    return loadDist(dist);
  } catch {
    return [];
  }
}
