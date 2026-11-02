#!/usr/bin/env node
// Compliance cleanup (idempotent, re-runnable).
//
// Removes content that operates unlicensed visa / employment intermediary services for
// foreigners, and strips illegal-adjacent claims (unauthorized-VPN promotion, visa-agency
// referrals). Legal basis:
//   - 《因私出入境中介活动管理办法》: visa intermediary needs official qualification + licence.
//   - 《人力资源市场暂行条例》/《就业服务和就业管理规定》: paid job placement needs 人力资源服务许可证.
//   - 《计算机信息网络国际联网管理暂行规定》: promoting unauthorized VPN (翻墙) is illegal.
//   - 《出境入境管理法》: working in China needs proper work visa; remote work on a non-work
//     visa and bank accounts on a tourist visa are illegal-employment / circumvention risks.
//
// Edits the cloud source of truth so the change survives future admin edits and the hourly
// auto-publish. Cloud is the single source of truth for editable content.
//
//   node scripts/compliance-clean.mjs

import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pw = process.env.GFIC_ADMIN_PW || fs.readFileSync(path.join(root, '.adminpw'), 'utf8').trim();

const cloud = createWorkBuddyCloud({
  endpoint: 'https://gficcrew.app.workbuddy.host',
  publishableKey: 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum',
});

const rpc = (name, args) => cloud.database.rpc(name, args);

async function list(collection) {
  const { data, error } = await rpc('cms_list', { p_password: pw, p_collection: collection });
  if (error) throw new Error(`cms_list ${collection}: ${error.message}`);
  return data || [];
}
async function save(collection, docId, data, sortOrder) {
  const { error } = await rpc('cms_save', {
    p_password: pw,
    p_collection: collection,
    p_doc_id: docId,
    p_data: data,
    p_sort_order: sortOrder || 0,
  });
  if (error) throw new Error(`cms_save ${collection}/${docId}: ${error.message}`);
}
async function del(collection, docId) {
  const { error } = await rpc('cms_delete', { p_password: pw, p_collection: collection, p_doc_id: docId });
  if (error) throw new Error(`cms_delete ${collection}/${docId}: ${error.message}`);
}

// ---------- site (single doc) ----------
function cleanSite(d) {
  if (Array.isArray(d.services)) {
    const daily = d.services.find((s) => s.id === 'daily');
    if (daily) {
      daily.points = (daily.points || []).filter(
        (p) =>
          !/visa renewals|residence permits and work permits/i.test(p) &&
          !/employment:|job leads|part-time gigs|work visa transfers/i.test(p) &&
          !/curated job openings|freelance projects and internships/i.test(p),
      );
      daily.summary =
        'Online groups and forums that act as the go-to lifeline for expat daily life in China — housing, healthcare, banking, mobile payments and everything in between.';
    }
  }
  if (d.home && Array.isArray(d.home.highlights)) {
    d.home.highlights = d.home.highlights.filter(
      (h) => !/^Visa, housing/i.test(h) && !/curated jobs, freelance gigs and internships/i.test(h),
    );
  }
  if (d.home && typeof d.home.servicesLead === 'string') {
    d.home.servicesLead = d.home.servicesLead.replace('your 11pm visa question', 'your 11pm China-life question');
  }
  if (Array.isArray(d.whyJoin)) {
    d.whyJoin = d.whyJoin.map((t) => t.replace(/visa tips,\s*/, '').replace(/visa tips/, ''));
  }
  return d;
}

// ---------- plans (ONE DOC PER PLAN; the doc body is the plan object) ----------
function cleanPlans(d) {
  if (Array.isArray(d.includes)) {
    d.includes = d.includes
      .map((s) =>
        s
          .replace(/^Practical guides: visa, /i, 'Practical guides: ')
          .replace(/Local housing, visa and healthcare/i, 'Local housing and healthcare'),
      )
      .filter((s) => !/curated job, freelance and project leads/i.test(s));
  }
  return d;
}

// ---------- guides (ONE DOC PER CITY; the doc body is the whole guide) ----------
// Strip any employment-intermediary claim; keep the factual visa/life-info sections.
function cleanGuides(d) {
  if (Array.isArray(d.faq)) {
    for (const item of d.faq) {
      if (typeof item.a === 'string') {
        item.a = item.a
          .replace(/ GFIC Crew shares curated openings, freelance projects and internships in the member groups\.?/i, '')
          .replace(/curated job openings, freelance projects and internships/gi, '')
          .replace(/job leads, freelance projects and internships/gi, '');
      }
    }
  }
  if (Array.isArray(d.sections)) {
    for (const s of d.sections) {
      if (Array.isArray(s.list)) {
        s.list = s.list.filter((t) => !/curated openings|freelance projects and internships|job leads/gi.test(t));
      }
      if (Array.isArray(s.paragraphs)) {
        s.paragraphs = s.paragraphs.map((p) =>
          p.replace(/ GFIC Crew shares curated openings, freelance projects and internships in the member groups\.?/i, ''),
        );
      }
    }
  }
  return d;
}

// ---------- faq (ONE DOC PER ITEM; edit illegal-adjacent answers, delete illegal ones) ----------
const REMOVE_FAQ = [/help me find a job in China/i, /help with a Chinese visa/i, /open a Chinese bank account on a tourist visa/i, /work remotely from China for a foreign employer/i];

const FAQ_EDITS = [
  {
    // "How is GFIC Crew different..." — drop the visa-Q&A-as-a-service claim.
    q: /how is gfic crew different from other expat groups/i,
    fix: (a) => a.replace(/visa questions,\s*/i, '').replace(/visa questions and\s*/i, ''),
  },
  {
    // "What is the difference between the National / City / Business Group" — drop visa support.
    q: /difference between the national group, city group and business group/i,
    fix: (a) => a.replace(/housing and visa support/i, 'housing support'),
  },
  {
    // "Which apps do I need to live in China?" — strip the unauthorized-VPN promotion.
    q: /which apps do i need to live in china/i,
    fix: (a) => a.replace(/\s*A VPN arranged before you arrive is also standard practice for expats\.?/i, ''),
  },
];

let removed = 0;
let updated = 0;

// site
{
  const docs = await list('site');
  for (const doc of docs) {
    const before = JSON.stringify(doc.data);
    const after = cleanSite(JSON.parse(JSON.stringify(doc.data)));
    if (JSON.stringify(after) !== before) {
      await save('site', doc.docId, after, doc.sortOrder);
      updated++;
      console.log(`site/${doc.docId}: updated`);
    }
  }
}

// plans
{
  const docs = await list('plans');
  for (const doc of docs) {
    const before = JSON.stringify(doc.data);
    const after = cleanPlans(JSON.parse(JSON.stringify(doc.data)));
    if (JSON.stringify(after) !== before) {
      await save('plans', doc.docId, after, doc.sortOrder);
      updated++;
      console.log(`plans/${doc.docId}: updated`);
    }
  }
}

// faq
{
  const docs = await list('faq');
  for (const doc of docs) {
    const q = (doc.data && doc.data.q) || '';
    const a = (doc.data && doc.data.a) || '';
    if (REMOVE_FAQ.some((re) => re.test(q))) {
      await del('faq', doc.docId);
      removed++;
      console.log(`faq/${doc.docId}: DELETED ("${q}")`);
      continue;
    }
    const edit = FAQ_EDITS.find((e) => e.q.test(q));
    if (edit) {
      const newA = edit.fix(a);
      if (newA !== a) {
        const after = { ...doc.data, a: newA };
        await save('faq', doc.docId, after, doc.sortOrder);
        updated++;
        console.log(`faq/${doc.docId}: edited ("${q}")`);
      }
    }
  }
}

// guides
{
  const docs = await list('guides');
  for (const doc of docs) {
    const before = JSON.stringify(doc.data);
    const after = cleanGuides(JSON.parse(JSON.stringify(doc.data)));
    if (JSON.stringify(after) !== before) {
      await save('guides', doc.docId, after, doc.sortOrder);
      updated++;
      console.log(`guides/${doc.docId}: updated`);
    }
  }
}

console.log(`\nDone. docs updated=${updated}, faq deleted=${removed}`);
