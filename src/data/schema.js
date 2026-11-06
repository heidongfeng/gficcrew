import { SITE, SLOGAN, IS_CN } from './site.js';

export function orgSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: 'GFIC Crew',
    alternateName: 'GFIC歪果社',
    legalName: 'GFIC Crew (GFIC歪果社)',
    url: SITE.url,
    description: SITE.description,
    disambiguatingDescription:
      'A social community for expats with in-person meetups in Guangzhou and Shenzhen, China, and online groups elsewhere in China. GFIC Crew is a community, not a competition.',
    slogan: SLOGAN,
    // Google's Organization rich result requires a logo of at least 112x112. It was
    // missing entirely. Raster, because SVG is not accepted for the logo or the images
    // below — same reason the og:image moved off SVG.
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE.url}/#logo`,
      url: `${SITE.url}/logo.png`,
      contentUrl: `${SITE.url}/logo.png`,
      width: 512,
      height: 512,
      caption: 'GFIC Crew',
    },
    image: { '@id': `${SITE.url}/#logo` },
    areaServed: { '@type': 'Country', name: 'China' },
    knowsAbout: [
      'expat community China',
      'living in China',
      'Guangzhou expat',
      'expat events China',
      'WeChat Pay',
      'apartment rental China',
      'Cantonese food',
      'language exchange',
    ],
    // Only brand-owned profiles, never personal accounts. The mainland variant omits
    // unreachable platforms rather than declaring them in JSON-LD while hiding them in copy.
    ...(IS_CN
      ? {}
      : {
          sameAs: [
            'https://www.youtube.com/@GFICCrew',
            'https://x.com/GFICCrew',
            'https://www.instagram.com/gficcrew',
          ],
        }),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'hello@gficcrew.com',
        availableLanguage: ['English', 'Chinese'],
        name: 'WeChat DN8117',
      },
    ],
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url,
    name: 'GFIC Crew',
    alternateName: 'GFIC歪果社',
    description: SITE.description,
    publisher: { '@id': `${SITE.url}/#organization` },
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/faq/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function webPageSchema({ url, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { '@id': `${SITE.url}/#website` },
    about: { '@id': `${SITE.url}/#organization` },
    inLanguage: 'en',
  };
}

export function breadcrumbSchema(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqSchema(items, url = `${SITE.url}/faq/`) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    // Derived from the page, not hardcoded to /faq/. The guide pages embed their own FAQ
    // block, and a fixed @id made every one of them claim to be the /faq/ entity.
    '@id': `${url}#faqpage`,
    url,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

/**
 * A city chapter is a community, not a business premises. Organization + areaServed is
 * accurate without inventing a street address for LocalBusiness markup.
 */
export function localCommunitySchema({ url, city, description, areaServed }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${url}#community`,
    name: `GFIC Crew ${city}`,
    alternateName: `GFIC歪果社 ${city}`,
    description,
    url,
    logo: { '@id': `${SITE.url}/#logo` },
    image: `${SITE.url}/og-default.png`,
    parentOrganization: { '@id': `${SITE.url}/#organization` },
    areaServed: areaServed.map((name) => ({ '@type': 'City', name })),
    knowsLanguage: ['en', 'zh-Hans', 'yue'],
  };
}

export function itemListSchema({ id, name, description, items }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': id,
    name,
    description,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url,
      ...(item.description ? { description: item.description } : {}),
    })),
  };
}

export function eventSchema(event, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${url}#${event.slug}`,
    name: event.title,
    description: event.summary || event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url,
    image: `${SITE.url}/og-default.png`,
    organizer: { '@id': `${SITE.url}/#organization` },
    location: {
      '@type': 'Place',
      name: event.venue,
      address: { '@type': 'PostalAddress', addressLocality: event.city, addressCountry: 'CN' },
    },
    offers: {
      '@type': 'Offer',
      price: event.price.replace(/[^0-9]/g, '') || '0',
      priceCurrency: 'CNY',
      availability: 'https://schema.org/InStock',
      url,
    },
    isAccessibleForFree: /free/i.test(event.price),
  };
}

export function howToSchema({ url, id, name, description, totalTime, steps }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${url}#howto-${id}`,
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      url: s.url,
    })),
  };
}

export function articleSchema({ url, headline, description, datePublished, dateModified, city = 'China' }) {
  const about = [
    { '@type': 'Thing', name: `Living in ${city} as an expat` },
    { '@type': 'Thing', name: 'China visa and residence permit' },
    { '@type': 'Thing', name: 'Apartment rental in China' },
  ];
  if (city === 'Guangzhou') about.push({ '@type': 'Thing', name: 'Cantonese food and culture' });
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: `${SITE.url}/og-default.png`,
    datePublished,
    dateModified: dateModified || datePublished,
    inLanguage: 'en',
    author: { '@id': `${SITE.url}/#organization` },
    publisher: { '@id': `${SITE.url}/#organization` },
    about,
  };
}
