import type { APIRoute } from 'astro';
import { SITE, IS_CN } from '../data/site.js';

/**
 * robots.txt, generated per build variant.
 *
 * The two builds are not the same site as far as crawlers are concerned:
 *
 *   global (gficcrew.com) — everything is welcome, Google very much included. The site is
 *     static precisely so generative engines can read the whole HTML, and search is the
 *     distribution channel. Being readable is the point, not a risk.
 *
 *   cn (gficcrew.cn) — a regional mirror of the same English content, served from inside
 *     China. Google is not usable in mainland China, so the mirror's search traffic comes
 *     from Baidu, which ignores hreflang entirely. Letting Google index both would just be
 *     duplicate content with no upside, so Googlebot is refused here outright.
 *
 * robots.txt matching is "most specific user-agent wins", not "first match wins" and not
 * "last match wins". A `User-agent: Googlebot` group therefore overrides the `*` group
 * regardless of the order they appear in — which is what makes this file work.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Applebot',
  'Applebot-Extended',
  'Bytespider',
  'Baiduspider',
  'CCBot',
  'Amazonbot',
  'DuckAssistBot',
  'meta-externalagent',
  'YouBot',
  'Diffbot',
];

// Domestic engines, named explicitly on the mainland build. They do not need to be listed
// — the `*` group already allows them — but naming them documents the intent, and survives
// anyone later tightening the `*` group.
const CN_SEARCH_ENGINES = ['Bingbot', 'Sogou web spider', '360Spider', 'YisouSpider'];

/**
 * The rules for a group that is meant to be allowed everywhere.
 *
 * The two Disallow lines are not optional. robots.txt uses "the most specific user-agent
 * group wins", and a crawler matches exactly ONE group — it does not merge with `*`. So a
 * named group that only says `Allow: /` does not add an exception, it *replaces* the
 * wildcard group, and that crawler silently loses the /admin/ and /404.html restrictions.
 * Listing crawlers in order to be welcoming therefore has to repeat the restrictions, or
 * every named crawler ends up less restricted than an unnamed one.
 */
const ALLOW_ALL = ['Allow: /', 'Disallow: /404.html', 'Disallow: /admin/'];

export const GET: APIRoute = () => {
  const lines = [
    `# GFIC Crew (GFIC歪果社) — ${SITE.url}`,
    IS_CN
      ? '# 区域镜像：内容与 https://gficcrew.com 一致，从国内节点提供服务。'
      : '# All crawlers, including AI assistants and generative engines, are explicitly welcome.',
    '',
    'User-agent: *',
    ...ALLOW_ALL,
    '',
  ];

  if (IS_CN) {
    lines.push(
      '# ---- Google：本站不参与 Google 收录 ----',
      '# 与 gficcrew.com 是同一份英文内容的镜像，双站收录只会产生重复内容，没有收益；',
      '# 且 Google 在大陆不可用，.cn 的搜索流量来自百度，而百度忽略 hreflang，',
      '# 所以这里直接拒绝，而不是靠 hreflang 去声明对应关系。',
      'User-agent: Googlebot',
      'Disallow: /',
      '',
      'User-agent: Googlebot-Image',
      'Disallow: /',
      '',
      'User-agent: Googlebot-News',
      'Disallow: /',
      '',
      'User-agent: AdsBot-Google',
      'Disallow: /',
      '',
      '# Google-Extended 只决定内容能否用于 Gemini 的训练语料，与搜索收录无关，保持放行。',
      'User-agent: Google-Extended',
      ...ALLOW_ALL,
      '',
      '# ---- 国内搜索引擎 ----',
      ...CN_SEARCH_ENGINES.flatMap((agent) => [`User-agent: ${agent}`, ...ALLOW_ALL, '']),
    );
  } else {
    lines.push(
      '# ---- Google ----',
      '# 境外站就是要被 Google 读到：收录、AI 摘要、Gemini 训练语料全部放行。',
      'User-agent: Googlebot',
      ...ALLOW_ALL,
      '',
      'User-agent: Google-Extended',
      ...ALLOW_ALL,
      '',
    );
  }

  lines.push(
    '# ---- AI assistants and generative engines ----',
    ...AI_CRAWLERS.flatMap((agent) => [`User-agent: ${agent}`, ...ALLOW_ALL, '']),
    `Sitemap: ${SITE.url}/sitemap-index.xml`,
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
