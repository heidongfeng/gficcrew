import { GUIDE_SECTIONS, GUIDE_FAQ } from './guangzhou.js';

/**
 * City guides. One entry per city — the page at /guides/<slug>/ is generated automatically,
 * so adding a new city guide means adding one object here (plus its own content module).
 *
 * Required fields: slug, city, citySlug (must match CITIES[].slug), title, description,
 * updated, intro (array of paragraphs), sections, faq.
 */
import genGuides from './generated/guides.json';

const LOCAL_GUIDES = [
  {
    slug: 'guangzhou',
    city: 'Guangzhou',
    citySlug: 'guangzhou',
    title: 'Guangzhou Expat Living Guide',
    headline: 'Guangzhou Expat Living Guide — Visas, Housing, Food & Social Life',
    updated: '2026-09-30',
    description:
      'A practical living guide for expats in Guangzhou: visas and residence permits, apartment rental and district prices, banking and WeChat Pay, healthcare, transport, Cantonese food, language and a social scene built on ten meetup formats, from parties and networking mixers, food crawls and language exchange through to hikes, sports leagues and cultural experiences.',
    intro: [
      'Guangzhou is our home base and the city we live in. This guide covers what you actually need to sort out in your first month — visa, apartment, bank account, WeChat Pay, healthcare, transport — and then how to enjoy the city: Cantonese food, language and the social scene, built around ten meetup formats: parties and socials, networking mixers, food crawls and language exchange, sports leagues, hikes and cultural experiences.',
    ],
    sections: GUIDE_SECTIONS,
    faq: GUIDE_FAQ,
  },

  // To add the next city: create src/data/<city>.js exporting GUIDE_SECTIONS / GUIDE_FAQ,
  // then duplicate the block above with its slug, citySlug and copy. Nothing else changes.
];

export const GUIDES = Array.isArray(genGuides) && genGuides.length > 0 ? genGuides : LOCAL_GUIDES;

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) || null;
}

export function guideForCity(citySlug) {
  return GUIDES.find((g) => g.citySlug === citySlug) || null;
}

export function guideUrl(slug) {
  return `/guides/${slug}/`;
}

/**
 * Per-guide <meta name="description">, keyed by slug for the same reason STEP_SECTIONS is:
 * once content has been imported from the admin backend the guides come from
 * generated/guides.json, so anything stored on the guide object is silently discarded.
 *
 * `guide.description` is written for the page and runs to ~210 characters — a search snippet
 * is cut at about 155, mid-list. The meta tag therefore gets its own line and the CMS value
 * keeps feeding the JSON-LD node and the city cards. A guide without an entry here falls
 * back to its own description rather than to nothing.
 */
const META_DESCRIPTIONS = {
  guangzhou:
    'A practical living guide for expats in Guangzhou: visas, apartment rental, banking and WeChat Pay, healthcare, transport, Cantonese food and social life.',
};

export function metaDescriptionFor(guide) {
  return META_DESCRIPTIONS[guide.slug] || guide.description;
}

/**
 * Sections whose list is an ordered sequence rather than a set of options.
 *
 * Two consequences. In the copy they render as <ol>, so the order is explicit to a reader
 * and to a crawler. In the markup they become HowTo steps, derived from the same visible
 * items — never authored twice, so the markup cannot describe steps the page does not show.
 *
 * Keyed by section id, deliberately not stored on the guide object: guides come from
 * generated/guides.json once content has been imported from the admin backend, and
 * anything added to LOCAL_GUIDES is silently discarded at that point. Section ids are the
 * stable identifier across that boundary. If a section is renamed or removed the entry
 * simply stops matching, which degrades to a plain list rather than to wrong markup.
 *
 * Worth stating plainly: HowTo rich results were removed from Google Search in September
 * 2023 and FAQ rich results followed. None of this earns a SERP enhancement any more. It
 * is here because answer engines read schema.org, and because ordered steps are the thing
 * Google's current guidance actually points at — clear structure in the visible copy.
 */
const STEP_SECTIONS = {
  visa: {
    name: 'How to convert a Z visa into a work permit and residence permit in Guangzhou',
    description:
      'The sequence most expats in Guangzhou follow after accepting a job offer, from work permit notification letter to the residence permit sticker in your passport.',
    totalTime: 'P30D',
  },
  money: {
    name: 'How to set up a phone number, bank account and WeChat Pay in Guangzhou',
    description:
      'Daily life in Guangzhou runs on mobile payment, and mobile payment needs a Chinese phone number and a bank account first. This is the order that works.',
    totalTime: 'P7D',
  },
};

export function isStepSection(sectionId) {
  return Object.prototype.hasOwnProperty.call(STEP_SECTIONS, sectionId);
}

export function howtosForGuide(guide, url) {
  return (guide.sections || [])
    .filter((s) => isStepSection(s.id) && Array.isArray(s.list) && s.list.length >= 2)
    .map((s) => ({
      id: s.id,
      name: STEP_SECTIONS[s.id].name,
      description: STEP_SECTIONS[s.id].description,
      totalTime: STEP_SECTIONS[s.id].totalTime,
      steps: s.list.map((item) => {
        const text = String(item);
        const [head, ...rest] = text.split(' — ');
        return {
          // "Bank account — passport, visa, phone number" splits into a short step name
          // plus the detail, which is the shape HowToStep expects.
          name: rest.length ? head.trim() : text,
          text,
          url: `${url}#${s.id}`,
        };
      }),
    }));
}
