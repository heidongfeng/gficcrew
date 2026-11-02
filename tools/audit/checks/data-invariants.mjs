// Method 1 — source-data invariants.
//
// The data modules under src/data are the single source of truth for every page, so a
// defect there is replicated into two build variants, the sitemap, the RSS feed, llms.txt
// and every JSON-LD block at once. These assertions are the cheapest bugs to catch and
// the most expensive to notice by eye, because the wrong value usually looks fine in
// isolation — it only conflicts with a different file.
//
// Everything is imported through the loader hooks, so the objects inspected here are the
// ones the bundler sees.
import { fail, warn, pass, loadData, dataSourceText } from '../_util.mjs';

export const id = 'data-invariants';
export const name = '源数据完整性（唯一性 / 引用 / 日期 / 价格 / 占位符）';

/** Non-city buckets an event is allowed to use in its `city` field. */
const CITY_BUCKETS = new Set(['All cities', 'All Cities', 'Nationwide', 'Online']);

export async function run() {
  const out = [];
  const {
    CITIES,
    EVENTS,
    FAQ,
    PLANS,
    GUIDES,
    REFUND_TERMS,
    NAV,
    SERVICES,
    EVENT_CATEGORIES,
    FORMATS,
    FORMAT_TIERS,
  } = await loadData();

  // --- collection shape ------------------------------------------------------
  // EVENTS 的基线是 0，不是漏填：活动页已改成常青制（只讲「我们办什么」），
  // 15 场带日期的活动全是我编的、从未发生，2026-10-04 全部清空。
  // 日历代码（upcomingEvents）保留，日后真有活动了往里加即可，届时把基线一起改回来。
  // FAQ 基线 2026-10-04 由 35 提到 39：活动形式升级时按十类排序新增了 4 条。
  // CITIES 基线 2026-10-08 由 14 提到 16：原来的 "Yunnan (Kunming, Dali, Lijiang)" 一条
  // 拆成昆明、大理、丽江三条，与品牌知识库「对外写 16、列表也列 16」的口径对齐。
  const expect = [
    ['CITIES', CITIES, 16],
    ['EVENTS', EVENTS, 0],
    ['FAQ', FAQ, 39],
    ['PLANS', PLANS, 3],
  ];
  for (const [label, arr, n] of expect) {
    if (!Array.isArray(arr)) out.push(fail(`${label} 不是数组`, `实际类型 ${typeof arr}`));
    else if (arr.length !== n)
      out.push(
        warn(`${label} 数量变了：${arr.length}（此前基线 ${n}）`, '数量本身可能是正常的，但页面上有硬编码引用数量的文案，需同步核对'),
      );
  }
  if (!out.some((f) => f.level === 'fail')) out.push(pass('四个集合均存在且为数组', `CITIES ${CITIES.length} / EVENTS ${EVENTS.length} / FAQ ${FAQ.length} / PLANS ${PLANS.length}`));

  // --- slug uniqueness -------------------------------------------------------
  const dupSlugs = findDuplicates(CITIES.map((c) => c.slug));
  out.push(
    dupSlugs.length
      ? fail('CITIES 存在重复 slug', dupSlugs.join(', '), ['重复 slug 会让 /cities/<slug>/ 互相覆盖'])
      : pass('CITIES slug 唯一', `${CITIES.length} 个`),
  );

  const dupNames = findDuplicates(CITIES.map((c) => c.name));
  out.push(dupNames.length ? fail('CITIES 存在重复城市名', dupNames.join(', ')) : pass('CITIES 城市名唯一'));

  const dupEventSlugs = findDuplicates(EVENTS.map((e) => e.slug));
  out.push(
    dupEventSlugs.length
      ? fail('EVENTS 存在重复 slug', dupEventSlugs.join(', '))
      : pass('EVENTS slug 唯一', `${EVENTS.length} 个`),
  );

  const dupPlanIds = findDuplicates(PLANS.map((p) => p.id));
  out.push(dupPlanIds.length ? fail('PLANS 存在重复 id', dupPlanIds.join(', ')) : pass('PLANS id 唯一'));

  const dupFaqQ = findDuplicates(FAQ.map((f) => normalize(f.q)));
  out.push(
    dupFaqQ.length
      ? fail('FAQ 存在重复问题', dupFaqQ.join(' | '), ['FAQ 页会出现两条一样的问答，JSON-LD FAQPage 也会重复'])
      : pass('FAQ 问题唯一', `${FAQ.length} 条`),
  );

  const dupFaqPairs = findDuplicates(FAQ.map((f) => normalize(f.q) + '\u0000' + normalize(f.a)));
  if (dupFaqPairs.length) out.push(warn('FAQ 存在问题+答案完全相同的重复条目', dupFaqPairs.length + ' 组'));

  // --- required fields -------------------------------------------------------
  // tagline is deliberately optional: only the four featured chapters carry one, and
  // every consumer either guards on it (cities/index.astro, llms-full.txt.ts) or falls
  // back to blurb (index.astro, cities/index.astro meta). Requiring it would be noise.
  const missingCityFields = CITIES.filter(
    (c) => !c.name || !c.slug || !c.blurb || !c.province || !Array.isArray(c.highlights) || !c.highlights.length || !c.livingNote,
  );
  out.push(
    missingCityFields.length
      ? fail('CITIES 有条目缺字段', missingCityFields.map((c) => c.slug || '(无 slug)').join(', '), ['缺 province / blurb / highlights / livingNote 会让城市页出现空白区块'])
      : pass('CITIES 必备字段齐全', `name, slug, blurb, province, highlights, livingNote（tagline 为可选，仅 ${CITIES.filter((c) => c.tagline).length} 个重点城市填写）`),
  );

  // A featured chapter with no tagline renders a hero card with no one-liner, while its
  // three peers all have one — a visible inconsistency rather than a crash.
  const priorityNoTagline = CITIES.filter((c) => c.priority && !c.tagline);
  out.push(
    priorityNoTagline.length
      ? warn('重点城市没有 tagline', priorityNoTagline.map((c) => c.slug).join(', '), ['首页与城市列表里重点城市会带一句话简介，缺了这一个会显得掉队'])
      : pass('所有重点城市都有 tagline', CITIES.filter((c) => c.priority).map((c) => c.slug).join(', ')),
  );

  const emptyStrings = CITIES.filter((c) => c.tagline !== undefined && (typeof c.tagline !== 'string' || !c.tagline.trim()));
  if (emptyStrings.length) out.push(warn('CITIES 的 tagline 存在空字符串', emptyStrings.map((c) => c.slug).join(', '), ['空字符串会走 truthy 分支渲染出空段落；应删除该字段而不是留空']));

  const missingEventFields = EVENTS.filter(
    (e) => !e.slug || !e.title || !e.city || !e.venue || !e.startDate || !e.endDate || !e.category || !e.price || !e.description,
  );
  out.push(
    missingEventFields.length
      ? fail('EVENTS 有条目缺字段', missingEventFields.map((e) => e.slug || '(无 slug)').join(', '))
      : pass('EVENTS 必备字段齐全'),
  );

  // --- event dates ----------------------------------------------------------
  const badDates = [];
  const reversed = [];
  const past = [];
  const now = Date.now();
  for (const e of EVENTS) {
    const s = parseLocal(e.startDate);
    const t = parseLocal(e.endDate);
    if (Number.isNaN(s) || Number.isNaN(t)) {
      badDates.push(`${e.slug}: start=${e.startDate} end=${e.endDate}`);
      continue;
    }
    if (t < s) reversed.push(`${e.slug}: ${e.startDate} → ${e.endDate}`);
    if (t < now) past.push(`${e.slug} 结束于 ${e.endDate}`);
  }
  out.push(badDates.length ? fail('EVENTS 有无法解析的日期', badDates.join(' ; ')) : pass('EVENTS 日期均可解析'));
  out.push(reversed.length ? fail('EVENTS 结束时间早于开始时间', reversed.join(' ; ')) : pass('EVENTS 起止时间顺序正确'));
  out.push(
    past.length
      ? warn(
          `${past.length} 个活动已结束，已自动下架`,
          past.join(' ; '),
          ['正常现象：活动页与首页都按结束时间过滤，过期不再展示。要在发觉日历变空之前补新日期'],
        )
      : pass('所有活动都在未来或进行中'),
  );

  // How much calendar is left. Since finished events drop off automatically, the failure mode
  // is not a broken page but a slowly emptying one — easy to miss until nothing shows at all.
  const LOW_STOCK = 4;
  const remaining = EVENTS.length - past.length;
  const lastEnd = EVENTS.reduce((latest, e) => {
    const t = parseLocal(e.endDate);
    return Number.isNaN(t) ? latest : Math.max(latest, t);
  }, -Infinity);
  const lastEndText = Number.isFinite(lastEnd) ? new Date(lastEnd).toISOString().slice(0, 10) : '未知';
  // 常青制下「日历空了」不是需要修补的衰减，而是被选择的状态：
  // 与其发布兑现不了的日期，不如只讲活动形式。真要恢复日期制，往 events 里加数据即可。
  const evergreenOnly = EVENTS.length === 0;
  out.push(
    evergreenOnly
      ? pass(
          '活动页走常青制：EVENTS 为空是预期状态',
          '页面讲「我们办什么」而不是「哪天办」；upcomingEvents 仍在，后台加了带日期的活动会自动出现',
        )
      : remaining <= LOW_STOCK
        ? warn(
            `活动日历只剩 ${remaining} 场未结束，最后一场到 ${lastEndText}`,
            `EVENTS 共 ${EVENTS.length} 场，其中 ${past.length} 场已结束`,
            [
              '活动页有空状态兜底，不会显示成坏页面，但对访客和搜索引擎来说等于「没有活动」',
              '在数据里补上新的日期即可恢复',
            ],
          )
        : pass(`活动日历还有 ${remaining} 场未结束的活动`, `最后一场结束于 ${lastEndText}`),
  );

  // --- event → city reference -----------------------------------------------
  const cityNames = new Set(CITIES.map((c) => c.name));
  const orphanCities = [...new Set(EVENTS.map((e) => e.city))].filter((c) => !cityNames.has(c) && !CITY_BUCKETS.has(c));
  out.push(
    orphanCities.length
      ? fail('EVENTS 引用了不存在的城市', orphanCities.join(', '), [`可用城市：${[...cityNames].join(', ')}`])
      : pass('EVENTS 的 city 全部指向存在的城市或合法分组'),
  );

  // --- event category --------------------------------------------------------
  if (Array.isArray(EVENT_CATEGORIES) && EVENT_CATEGORIES.length) {
    const cats = new Set(EVENT_CATEGORIES.map((c) => (typeof c === 'string' ? c : c.name)));
    const orphanCats = [...new Set(EVENTS.map((e) => e.category))].filter((c) => !cats.has(c));
    out.push(
      orphanCats.length
        ? warn('EVENTS 的分类不在分类筛选器里', orphanCats.join(', '), ['这些活动在按分类筛选时会永远筛不出来'])
        : pass('EVENTS 分类均被筛选器覆盖', `${cats.size} 个分类`),
    );
  }

  // --- activity formats (the ranked ten behind /events/) ---------------------
  // 这套数据是 2026-10-04 加的：按「社交自然度 × 文化熟悉度 × 重复参与意愿 × 在华独特性 ×
  // 独自参加门槛」排序的十类活动形式。rank 越小越靠前，是 FAQ / 城市指南 / llms.txt 复述
  // 同一套优先级的依据，所以这里的连续性错了，全站的口径会一起歪。
  const FORMAT_BASELINE = 10;
  if (!Array.isArray(FORMATS) || !FORMATS.length) {
    out.push(fail('FORMATS 为空', '活动页会只剩标题没有条目', ['检查 src/data/generated/site.json 的 formats 键']));
  } else {
    const dupFormatIds = findDuplicates(FORMATS.map((f) => f.id));
    out.push(
      dupFormatIds.length
        ? fail('FORMATS 存在重复 id', dupFormatIds.join(', '), ['同 id 会让页面锚点重复，活动页 id 唯一性检查也会失败'])
        : pass('FORMATS id 唯一', `${FORMATS.length} 个`),
    );

    const FORMAT_FIELDS = ['id', 'tier', 'rank', 'name', 'tagline', 'why', 'inChina', 'soloNote'];
    const missingFormatFields = FORMATS.filter((f) => FORMAT_FIELDS.some((k) => !f[k]));
    out.push(
      missingFormatFields.length
        ? fail('FORMATS 有条目缺字段', missingFormatFields.map((f) => f.id || '(无 id)').join(', '), ['缺字段会让活动页出现空的小标题或空白段落'])
        : pass('FORMATS 字段齐全', FORMAT_FIELDS.join(', ') + '（keywords 可空）'),
    );

    const tiersAvailable = new Set((FORMAT_TIERS || []).map((t) => t.tier));
    const badTier = FORMATS.filter((f) => !tiersAvailable.has(f.tier));
    out.push(
      badTier.length
        ? fail('FORMATS 的 tier 不在 FORMAT_TIERS 里', badTier.map((f) => `${f.id}=${f.tier}`).join(', '), ['这些条目在活动页不会被分组渲染，等于白写'])
        : pass('FORMATS 的 tier 全部有对应分组', '可用 tier ' + [...tiersAvailable].sort().join(', ')),
    );

    const ranks = FORMATS.map((f) => f.rank).sort((a, b) => a - b);
    const expected = FORMATS.map((_, i) => i + 1);
    out.push(
      JSON.stringify(ranks) === JSON.stringify(expected)
        ? pass('FORMATS 的 rank 是 1..N 的连续序列', ranks.join(','))
        : fail('FORMATS 的 rank 有断号或重复', `实际 ${ranks.join(',')}`, ['rank 决定活动页顺序，断号会让某一类凭空排到最前']),
    );

    // 同一 tier 的 rank 必须连续：活动页先按 tier 分组、组内再按 rank 排序，
    // 跨 tier 交错会让「Tier 1 是前三」这句话在页面上不成立。
    const byTier = new Map();
    for (const f of FORMATS) {
      if (!byTier.has(f.tier)) byTier.set(f.tier, []);
      byTier.get(f.tier).push(f.rank);
    }
    const interleaved = [...byTier.entries()].filter(([, rs]) => {
      const s = [...rs].sort((a, b) => a - b);
      return s[s.length - 1] - s[0] !== s.length - 1;
    });
    out.push(
      interleaved.length
        ? fail('同一 tier 内的 rank 不连续', interleaved.map(([t, rs]) => `tier ${t}: ${rs.sort((a, b) => a - b).join(',')}`).join(' | '), ['页面上会出现 Tier 1 里夹着别的层级的条目'])
        : pass('每个 tier 内的 rank 连续', [...byTier.entries()].map(([t, rs]) => `tier ${t} ×${rs.length}`).join(' · ')),
    );

    if (FORMATS.length !== FORMAT_BASELINE) {
      out.push(warn(`FORMATS 数量变了：${FORMATS.length}（此前基线 ${FORMAT_BASELINE}）`, '十类排序是全站内容优先级的依据，增删条目要同步 FAQ、城市指南和 llms 摘要'));
    }
  }

  // --- city slug ↔ guide -----------------------------------------------------
  const citySlugs = new Set(CITIES.map((c) => c.slug));
  const guideSlugs = GUIDES.map((g) => g.slug);
  const dupGuideSlugs = findDuplicates(guideSlugs);
  out.push(dupGuideSlugs.length ? fail('GUIDES 存在重复 slug', dupGuideSlugs.join(', ')) : pass('GUIDES slug 唯一', guideSlugs.join(', ')));
  const orphanGuides = GUIDES.filter((g) => !citySlugs.has(g.slug) && !citySlugs.has(g.citySlug));
  out.push(
    orphanGuides.length
      ? warn('GUIDES 对应的城市在 CITIES 里找不到', orphanGuides.map((g) => `${g.slug} / ${g.citySlug}`).join(', '), ['城市页靠这个关联挂指南链接，对不上就不会互相跳转'])
      : pass('GUIDES 均能对应到城市'),
  );

  // --- plans ----------------------------------------------------------------
  const badPlans = PLANS.filter((p) => typeof p.price !== 'number' || typeof p.usd !== 'number' || !p.name || !p.unit);
  out.push(
    badPlans.length
      ? fail('PLANS 的 price/usd 不是数字或缺 name/unit', badPlans.map((p) => p.id).join(', '))
      : pass('PLANS 价格字段均为数字', PLANS.map((p) => `${p.id} RMB ${p.price} / USD ${p.usd}`).join(' · ')),
  );
  const emptyIncludes = PLANS.filter((p) => !Array.isArray(p.includes) || !p.includes.length);
  out.push(emptyIncludes.length ? fail('PLANS 有档位没有 includes 列表', emptyIncludes.map((p) => p.id).join(', ')) : pass('PLANS 每档都有权益列表'));
  const featured = PLANS.filter((p) => p.featured);
  out.push(
    featured.length === 1
      ? pass('PLANS 恰好一个主推档位', featured[0].id)
      : warn(`PLANS 主推档位有 ${featured.length} 个`, featured.map((p) => p.id).join(', ') || '无', ['既可能是有意调整，也可能是漏改 featured 布尔值']),
  );
  out.push(
    typeof REFUND_TERMS === 'string' && REFUND_TERMS.length > 20
      ? pass('退款条款存在', `${REFUND_TERMS.length} 字符`)
      : fail('REFUND_TERMS 缺失或过短', `实际：${typeof REFUND_TERMS}`),
  );

  // --- nav / services targets exist as pages --------------------------------
  const pages = await builtPagePaths();
  if (pages) {
    const badNav = [];
    for (const item of flattenNav(NAV)) {
      if (!item.href || !item.href.startsWith('/')) continue;
      if (item.href.startsWith('/#')) continue;
      if (!pages.has(item.href.replace(/\/$/, '') || '/')) badNav.push(`${item.label || ''} → ${item.href}`);
    }
    out.push(
      badNav.length
        ? fail('导航里有指向不存在页面的链接', badNav.join(' ; '))
        : pass('导航链接全部有对应页面', `${flattenNav(NAV).length} 项`),
    );
  }

  if (Array.isArray(SERVICES) && SERVICES.length) out.push(pass('SERVICES 已定义', SERVICES.map((s) => s.title || s.name).join(' / ')));

  // --- placeholder / pre-filing residue -------------------------------------
  const residuePatterns = [
    [/粤ICP备X+/i, '备案号占位'],
    [/\bTODO\b/, 'TODO'],
    [/\bFIXME\b/, 'FIXME'],
    [/\{\{\s*[\w.]+\s*\}\}/, '未替换的 {{ }} 模板'],
    [/\blorem ipsum\b/i, 'lorem ipsum'],
    [/example\.com/i, 'example.com'],
  ];
  const residue = [];
  for (const { file, text } of dataSourceText()) {
    for (const [re, label] of residuePatterns) {
      const m = text.match(re);
      if (m) residue.push(`${file}: ${label} → ${m[0].slice(0, 60)}`);
    }
  }
  out.push(residue.length ? fail('源数据里残留占位符', residue.join(' ; ')) : pass('源数据无占位符残留'));

  return out;
}

// --- helpers ---------------------------------------------------------------

function findDuplicates(list) {
  const seen = new Map();
  for (const v of list) seen.set(v, (seen.get(v) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([v, n]) => `${v} ×${n}`);
}

const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * `new Date('2026-10-07T21:30')` is parsed as local time by modern engines, but the
 * spec only guarantees that for date-time forms without a zone; being explicit avoids
 * a silent off-by-hours that would misclassify an event as expired.
 */
function parseLocal(s) {
  if (!s || typeof s !== 'string') return NaN;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return new Date(s).getTime();
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
}

function flattenNav(nav) {
  const out = [];
  const visit = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === 'object') {
      if (v.href) out.push(v);
      for (const k of ['children', 'items', 'links', 'groups']) if (v[k]) visit(v[k]);
    }
  };
  visit(nav);
  return out;
}

/** Set of URL paths the built site actually contains, or null if nothing is built. */
async function builtPagePaths() {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const root = pathMod.resolve(import.meta.dirname, '..', '..', '..');
  for (const dir of ['dist-global', 'dist-cn', 'dist']) {
    const abs = pathMod.join(root, dir);
    if (!fsMod.existsSync(abs)) continue;
    const set = new Set();
    const walk = (d) => {
      for (const e of fsMod.readdirSync(d, { withFileTypes: true })) {
        const p = pathMod.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) {
          const relPath = pathMod.relative(abs, p).split(pathMod.sep).join('/');
          set.add('/' + relPath.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, ''));
        }
      }
    };
    walk(abs);
    return set;
  }
  return null;
}
