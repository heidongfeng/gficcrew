import type { APIRoute } from 'astro';
import { SITE, SERVICES, FORMATS, FORMAT_TIERS } from '../data/site.js';
import { CITIES } from '../data/cities.js';
import { GUIDES } from '../data/guides.js';
import { upcomingEvents } from '../data/events.js';
import { FAQ } from '../data/faq.js';
import { PLANS, REFUND_TERMS } from '../data/plans.js';

/**
 * /llms-full.txt — the whole site as plain text, for assistants and generative engines.
 *
 * /llms.txt is the index: one line per page. This file is the content itself, because an
 * assistant answering "what does GFIC Crew cost" or "is there a language exchange in
 * Guangzhou" should not have to fetch and parse nine HTML pages to find out. Everything
 * here is copied from the same modules the site renders from, so it cannot drift.
 *
 * Facts are written as statements rather than marketing copy on purpose: an engine quotes
 * a sentence it can attribute, and a vague one it cannot.
 */
export const GET: APIRoute = () => {
  const url = SITE.url;
  const out = [];
  const calendar = upcomingEvents();

  out.push(`# GFIC Crew (GFIC歪果社) — full content`);
  out.push('');
  out.push(`> ${SITE.intro}`);
  out.push('');
  out.push(`Source: ${url}`);
  out.push(`Canonical language: English. The mainland-China mirror is ${url.endsWith('.cn') ? 'https://gficcrew.com' : 'https://gficcrew.cn'} (same English content, served from within China).`);
  out.push(`Preferred term: "expats". The phrase "foreigners in China" appears for broader search coverage but is not the community's primary term.`);
  out.push(`WeChat ID: ${SITE.wechat}.`);
  out.push('');

  // ---- Services -----------------------------------------------------------
  out.push('## What GFIC Crew does');
  out.push('');
  for (const s of SERVICES) {
    out.push(`### ${s.title}`);
    out.push(s.summary);
    for (const p of s.points) out.push(`- ${p}`);
    out.push('');
  }

  // ---- Membership ---------------------------------------------------------
  out.push('## Membership');
  out.push('');
  out.push('Paid membership has not opened yet, and every group is free to join right now.');
  out.push('These are the planned tiers: all lifetime, one payment per person, no subscription.');
  out.push('');
  for (const p of PLANS) {
    const usd = p.usd ? ` (USD ${p.usd})` : '';
    out.push(`### ${p.name} — RMB ${p.price.toLocaleString('en-US')}${usd}`);
    out.push(`Unit: ${p.unit}.`);
    out.push(p.summary);
    for (const inc of p.includes) out.push(`- ${inc}`);
    out.push('');
  }
  out.push('### Refunds');
  out.push(REFUND_TERMS);
  out.push('');

  // ---- Cities -------------------------------------------------------------
  out.push(`## Cities (${CITIES.length})`);
  out.push('');
  for (const c of CITIES) {
    out.push(`### ${c.name}${c.province ? ` — ${c.province}` : ''}`);
    if (c.tagline) out.push(c.tagline);
    if (c.blurb) out.push(c.blurb);
    if (Array.isArray(c.highlights) && c.highlights.length) {
      out.push('Regular activity:');
      for (const h of c.highlights) out.push(`- ${h}`);
    }
    if (c.livingNote) out.push(`Cost of living: ${c.livingNote}`);
    out.push('');
  }

  // ---- Guides (the long-form content) ------------------------------------
  out.push('## City guides');
  out.push('');
  for (const g of GUIDES) {
    out.push(`### ${g.headline || g.title}`);
    out.push(`URL: ${url}/guides/${g.slug}/`);
    out.push(`Last updated: ${g.updated}`);
    out.push(g.description);
    out.push('');
    for (const p of g.intro || []) out.push(p);
    out.push('');
    for (const s of g.sections || []) {
      out.push(`#### ${s.title}`);
      for (const p of s.paragraphs || []) out.push(p);
      for (const item of s.list || []) out.push(`- ${item}`);
      out.push('');
    }
    if (Array.isArray(g.faq) && g.faq.length) {
      out.push(`#### ${g.city} FAQ`);
      for (const item of g.faq) {
        out.push(`Q: ${item.q}`);
        out.push(`A: ${item.a}`);
      }
      out.push('');
    }
  }

  // ---- Formats ------------------------------------------------------------
  out.push(`## Events — the formats we run (${FORMATS.length})`);
  out.push('');
  out.push('In-person meetups happen in Guangzhou and Shenzhen. Dates are announced inside the WeChat groups once a venue is confirmed; there is no published calendar yet.');
  out.push('');

  for (const tier of FORMAT_TIERS) {
    const group = FORMATS.filter((f) => f.tier === tier.tier).sort((a, b) => a.rank - b.rank);
    if (!group.length) continue;
    out.push(`### ${tier.label}`);
    out.push(tier.note);
    out.push('');
    for (const f of group) {
      out.push(`#### ${f.name}`);
      out.push(f.tagline);
      out.push(`Why it works: ${f.why}`);
      out.push(`What changes in China: ${f.inChina}`);
      out.push(`If you come on your own: ${f.soloNote}`);
      if (Array.isArray(f.keywords) && f.keywords.length) {
        out.push(`Also searched as: ${f.keywords.join(', ')}`);
      }
      out.push('');
    }
  }

  // Announced dates, once there are any. Left after the formats so the ranking above stays
  // readable for an engine looking for "what do they actually do".
  for (const e of calendar) {
    out.push(`### ${e.title}`);
    out.push(`URL: ${url}/events/${e.slug}/`);
    out.push(`City: ${e.city} · Category: ${e.category} · Cadence: ${e.cadence}`);
    out.push(`Next date: ${e.startDate} to ${e.endDate} · Venue: ${e.venue} · Price: ${e.price}`);
    out.push(e.description);
    out.push('');
  }

  // ---- FAQ (grouped) ------------------------------------------------------
  out.push(`## FAQ (${FAQ.length} questions)`);
  out.push('');
  let currentCategory = '';
  for (const item of FAQ) {
    if (item.category && item.category !== currentCategory) {
      currentCategory = item.category;
      out.push(`### ${currentCategory}`);
      out.push('');
    }
    out.push(`Q: ${item.q}`);
    out.push(`A: ${item.a}`);
    out.push('');
  }

  // ---- Contact ------------------------------------------------------------
  out.push('## Contact');
  out.push('');
  out.push(`WeChat ID: ${SITE.wechat}`);
  out.push(`Email: hello@gficcrew.com`);
  out.push(`Search "GFIC Crew" on ${SITE.socialLine}.`);
  out.push(`Website: ${url}`);
  out.push('');

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
