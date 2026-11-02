// Editable copy for the Contact page, the "Find us" block on About, and the footer's
// "Find us" column. Everything here can be changed from the admin backend (联系与关注).
//
// {wechat} / {socialLine} / {name} are filled in at build time from site.js, so the copy
// never hardcodes the WeChat ID or the per-variant platform list.
import genContact from './generated/contact.json';
import { SITE } from './site.js';

const LOCAL_CONTACT = {
  // --- /contact/ -------------------------------------------------------------
  // `eyebrow` is no longer rendered: the page header now shows the breadcrumb (which already
  // ends in "Contact") followed straight by the h1. Kept in the data so the admin field does
  // not break; simply ignored by the template.
  eyebrow: 'Contact',
  title: 'Get in touch',
  lead: 'WeChat is the channel we check every day. Add {wechat} and tell us which city you are in, and we will take it from there.',
  waysTitle: 'Other ways to find us',
  websiteTitle: 'Official website',
  socialsTitle: 'Social accounts',
  socialsNote:
    'Search the account name or handle shown below rather than clicking links from third-party sites.',
  askTitle: 'What to tell us',
  askItems: [
    'Which city you are in, or planning to move to',
    'How long you have been in China',
    'Whether you want events, practical help, or both',
  ],
  meetTitle: 'Where we meet',
  meetNote:
    'Outside Guangzhou and Shenzhen, the national WeChat group is the easy way in: it is open wherever you are in China.',

  // --- "Find us" on /about/ and in the footer --------------------------------
  findUsTitle: 'Find us',
  findUsText:
    'Search “GFIC Crew” on {socialLine}. The name is the same everywhere. WeChat ID: {wechat}.',
  footerFindUs: 'Search “GFIC Crew” on {socialLine}.',
  footerWebsiteLabel: 'Website:',
  footerWechatLabel: 'WeChat ID:',
};

export const CONTACT = { ...LOCAL_CONTACT, ...(genContact && typeof genContact === 'object' ? genContact : {}) };

/** Replaces the supported {token} placeholders with the current site values. */
export function fill(text) {
  return String(text == null ? '' : text)
    .replaceAll('{wechat}', SITE.wechat)
    .replaceAll('{socialLine}', SITE.socialLine)
    .replaceAll('{name}', SITE.name)
    .replaceAll('{site}', SITE.url.replace(/^https?:\/\//, ''));
}
