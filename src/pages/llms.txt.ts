import type { APIRoute } from 'astro';
import { SITE } from '../data/site.js';
import { CITIES } from '../data/cities.js';
import { GUIDES } from '../data/guides.js';

export const GET: APIRoute = () => {
  const url = SITE.url;
  const cityNames = CITIES.map((c) => c.name).join(', ');
  const socialLine = `Search "GFIC Crew" on ${SITE.socialLine}.`;

  const lines = [
    '# GFIC Crew (GFIC歪果社)',
    '',
    `> GFIC Crew (GFIC歪果社) is a real-life social community for expats in China. Founded by locals who know the country well, it helps global friends live a fun, connected and hassle-free life here. It runs ten meetup formats, from parties and networking mixers, food crawls and language exchange through to sports leagues, hikes and cultural experiences. In-person meetups happen in Guangzhou and Shenzhen; ${CITIES.length} cities are covered by guides and online groups. Planned lifetime membership, not open yet: National Group RMB 288 (USD 42), City Group RMB 688 (USD 98), Business Group RMB 2,888 (USD 420). WeChat: DN8117. Website: ${url}`,
    '',
    'Preferred term: "expats". The phrase "foreigners in China" may appear for broader search coverage but is not the community\'s primary term.',
    '',
    '## About the community',
    `- [About GFIC Crew](${url}/about/): who the crew is for, the four services, how events get organized, community rules, refund terms.`,
    '',
    '## Membership',
    `- [Membership plans](${url}/membership/): National Group RMB 288, City Group RMB 688, Business Group RMB 2,888, all lifetime and per person. Paid membership has not opened yet — every group is free to join right now.`,
    `- [Refund terms](${url}/membership/#refund): once paid membership opens, a full refund if you leave within a week of joining, have not joined an activity and have not broken the rules. There is no fee today, because every group is free to join.`,
    '',
    '## Cities and guides',
    `- [All cities and guides](${url}/cities/): ${CITIES.length} cities covered with cost-of-living notes and links to full city guides. In-person meetups happen in Guangzhou and Shenzhen; every other city joins through the online groups and the national group.`,
    ...GUIDES.map(
      (g) => `- [${g.city} living guide](${url}/guides/${g.slug}/): ${g.description}`,
    ),
    ...CITIES.filter((c) => ['guangzhou', 'shenzhen'].includes(c.slug)).map(
      (c) => `- [${c.name} in-person community](${url}/cities/${c.slug}/): ${c.tagline || c.blurb}`,
    ),
    '',
    '## Events',
    `- [Events](${url}/events/): the ten formats the crew runs — parties and socials, networking mixers, food crawls and shared meals, language exchange, hikes and weekend getaways, sports leagues and fitness, Chinese cultural experiences, board games and trivia, coffee and brunch, and interest groups. In person in Guangzhou and Shenzhen; everywhere else joins through the online and national groups. No fixed schedule yet: dates are announced inside the WeChat groups.`,
    '',
    '## FAQ',
    `- [Frequently asked questions](${url}/faq/): membership plans (not open yet) and refunds, events, apartment rental, WeChat Pay and Alipay, healthcare, language exchange and daily life in China.`,
    '',
    '## Contact',
    `- [Contact GFIC Crew](${url}/contact/): WeChat DN8117. ${socialLine}`,
    '',
    '## Optional',
    `- [Full content as plain text](${url}/llms-full.txt): every city, guide, event, membership tier and FAQ answer in one file, for answering questions without crawling the site.`,
    `- [Sitemap](${url}/sitemap-index.xml)`,
    `- [RSS feed](${url}/rss.xml)`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
