import type { APIRoute } from 'astro';
import { SITE } from '../data/site.js';
import { GUIDES, guideUrl, metaDescriptionFor } from '../data/guides.js';
import { CITIES } from '../data/cities.js';
import { upcomingEvents } from '../data/events.js';
import { lastmodFor } from '../../scripts/lastmod.mjs';

/**
 * /rss.xml — a change feed.
 *
 * A static site has no other way to say "this changed since you last looked". Search
 * engines and the AI crawlers that read feeds use it to avoid re-fetching nine pages to
 * find one edit, and syndication readers pick it up for free.
 *
 * One item per page a crawler is invited to index, so the feed reads as the site's
 * changelog rather than as a list of news posts. The previous cut listed only "dated"
 * content — guides and events — which after the event calendar was emptied of speculative
 * dates left a single entry, and a one-entry feed is not a feed.
 *
 * <pubDate> is the same value the sitemap carries as <lastmod> (scripts/lastmod.mjs): the
 * commit that last touched that page's sources, falling back to the working-tree mtime for
 * a file edited but not yet committed. Never the build clock — a feed whose every entry
 * shares one timestamp tells a reader nothing, and trains it to ignore the field.
 *
 * ⚠️ title and description are copied verbatim from each page's <BaseLayout> props. The
 * feed should repeat the page's own title and snippet, not a second version of them, so
 * the two have to move together — `node tools/audit/run.mjs feed` fails when they disagree.
 * Two entries are built from data rather than typed out (Contact, which is templated, and
 * the per-city guides, which is why adding a guide needs no edit here).
 */
const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Dates in the content modules are China local time with no offset. Reading them as UTC
// would shift every entry eight hours earlier, so the offset is stated explicitly. The
// values coming back from lastmodFor() already carry one (git gives +08:00, mtime gives Z)
// and pass straight through.
const toRfc822 = (value) => {
  if (!value) return null;
  const raw = String(value);
  const withZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.length === 10 ? `${raw}T00:00` : raw}:00+08:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d.toUTCString();
};

type FeedItem = { path: string; category: string; title: string; description: string };

const PAGES: FeedItem[] = [
  {
    path: '/',
    category: 'Home',
    title: 'GFIC Crew (GFIC歪果社) — Expat Community & Events in China',
    description:
      'GFIC Crew (GFIC歪果社) — a real-life social community for expats in China. Events, city guides and practical help, city by city.',
  },
  {
    path: '/about/',
    category: 'About',
    title: 'About GFIC Crew — Expat Community & Events in China',
    description:
      'GFIC Crew is a real-life social community for expats in China — founded by locals, built on real-world meetups and practical help for newcomers.',
  },
  {
    path: '/cities/',
    category: 'Cities & Guides',
    title: 'Cities & Guides — GFIC Crew Expat Communities Across China',
    description:
      'Cost-of-living notes and expat living guides by city. We meet in Guangzhou and Shenzhen; the national group is open anywhere in China.',
  },
  {
    path: '/events/',
    category: 'Events',
    title: 'GFIC Crew Events — Expat Meetups in Guangzhou & Shenzhen',
    description:
      'Ten expat meetup formats: parties and socials, networking mixers, food crawls, language exchange, hikes, sports leagues and more. In Guangzhou and Shenzhen.',
  },
  {
    path: '/membership/',
    category: 'Membership',
    title: 'Membership — GFIC Crew Plans (Free to Join Now)',
    description:
      'GFIC Crew membership is not open yet. Planned tiers: National RMB 288, City RMB 688, Business RMB 2,888, all lifetime. Every group is free to join right now.',
  },
  {
    path: '/faq/',
    category: 'FAQ',
    title: 'FAQ — GFIC Crew, Expat Community in China',
    description:
      'Answers about GFIC Crew membership plans (not open yet), refunds, events, apartment rental, WeChat Pay, healthcare and language exchange for expats in China.',
  },
  {
    path: '/contact/',
    category: 'Contact',
    title: `Contact ${SITE.name} — WeChat ${SITE.wechat}`,
    description: `Contact ${SITE.name} (${SITE.nameZh}): add WeChat ${SITE.wechat}, or search “${SITE.name}” on ${SITE.socialLine}.`,
  },
  {
    path: '/guides/',
    category: 'City guides',
    title: 'City Guides — Expat Living Guides by City | GFIC Crew',
    description:
      'First-hand expat living guides by city from GFIC Crew: visas, housing, banking, healthcare, transport, food, language and where to meet people.',
  },
  ...GUIDES.map((g) => ({
    path: guideUrl(g.slug),
    category: 'City guides',
    title: `${g.title} | GFIC Crew`,
    description: metaDescriptionFor(g),
  })),
  ...CITIES.filter((c) => ['guangzhou', 'shenzhen'].includes(c.slug)).map((c) => ({
    path: `/cities/${c.slug}/`,
    category: 'City communities',
    title: `${c.name} Expat Community — In Person with GFIC Crew`,
    description: c.tagline || c.blurb,
  })),
  ...upcomingEvents().map((event) => ({
    path: `/events/${event.slug}/`,
    category: 'Events',
    title: `${event.title} — GFIC Crew ${event.city}`,
    description: event.summary || event.description,
  })),
];

export const GET: APIRoute = () => {
  const url = SITE.url;

  const items = PAGES.map((p) => {
    const link = new URL(p.path, url).href;
    return { ...p, link, date: toRfc822(lastmodFor(link)) };
  }).sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));

  // The newest actual content change, not the moment this file was generated: <lastBuildDate>
  // means "when did the channel last change", and a build that changed nothing is not a
  // change. Omitted when nothing resolved rather than filled with a guess.
  const lastBuild = items.find((i) => i.date)?.date || null;

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(`${SITE.name} (${SITE.nameZh})`)}</title>`,
    `    <link>${escapeXml(url)}</link>`,
    `    <description>${escapeXml(SITE.description)}</description>`,
    '    <language>en</language>',
    ...(lastBuild ? [`    <lastBuildDate>${lastBuild}</lastBuildDate>`] : []),
    `    <atom:link href="${escapeXml(`${url}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items.flatMap((i) => [
      '    <item>',
      `      <title>${escapeXml(i.title)}</title>`,
      `      <link>${escapeXml(i.link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(i.link)}</guid>`,
      `      <category>${escapeXml(i.category)}</category>`,
      ...(i.date ? [`      <pubDate>${i.date}</pubDate>`] : []),
      `      <description>${escapeXml(i.description)}</description>`,
      '    </item>',
    ]),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
