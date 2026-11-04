// Build variant: "global" (gficcrew.com, Cloudflare Pages) or "cn" (gficcrew.cn, Tencent Cloud).
// Selected with `astro build --mode global|cnc`, which loads .env.global / .env.cn.
import genSite from './generated/site.json';

const SITE_URL = import.meta.env.PUBLIC_SITE_URL || __GFIC_SITE_URL__ || 'https://gficcrew.com';
export const VARIANT = import.meta.env.PUBLIC_VARIANT || __GFIC_VARIANT__ || (SITE_URL.endsWith('.cn') ? 'cn' : 'global');
export const IS_CN = VARIANT === 'cn';

// 品牌 slogan，取自《GFIC Crew 品牌知识库》。和 SITE.tagline（品牌定位句）是两个不同的资产：
// slogan 用于 JSON-LD 的 slogan 字段；首页大标题在 LOCAL_HOME.title 里以字面量承载同一句，
// 故意不引用这个常量 —— 审计的「兜底文案」扫描只认 AST 里的字符串字面量，换成变量它就扫不到。
export const SLOGAN = 'Life happens face to face.';

const SOCIALS_ALL = [
  { label: 'Personal WeChat', handle: 'DN8117', note: 'Add as a friend to join or contact the crew' },
  { label: 'WeChat Official Account', handle: 'GFIC Crew', note: 'Search the official account name' },
  { label: 'WeChat Channels', labelZh: '视频号', handle: 'GFIC Crew', note: '' },
  { label: 'Xiaohongshu', labelZh: '小红书', handle: 'GFIC歪果社', note: '' },
  { label: 'YouTube', handle: '@GFICCrew', note: '' },
  { label: 'X (Twitter)', handle: '@GFICCrew', note: '' },
  { label: 'Instagram', handle: '@gficcrew', note: '' },
];

// The mainland build drops platforms that are not reachable in China.
const SOCIALS_CN = [
  { label: 'Personal WeChat', handle: 'DN8117', note: 'Add as a friend to join or contact the crew' },
  { label: 'WeChat Official Account', handle: 'GFIC Crew', note: 'Search the official account name' },
  { label: 'WeChat Channels', labelZh: '视频号', handle: 'GFIC Crew', note: '' },
  { label: 'Xiaohongshu', labelZh: '小红书', handle: 'GFIC歪果社', note: '' },
];

// Only the editable text fields are overridable from the admin backend. Domain, variant,
// ICP number and the per-variant social list stay in code — they differ between the
// global (gficcrew.com) and mainland (gficcrew.cn) builds.
const EDITABLE_SITE_KEYS = [
  'name',
  'nameZh',
  'legalName',
  'wechat',
  'tagline',
  'description',
  'intro',
  'keywords',
];

const override = (genSite && typeof genSite === 'object' && genSite.site) || {};
const editableOverride = Object.fromEntries(
  Object.entries(override).filter(([k]) => EDITABLE_SITE_KEYS.includes(k)),
);

const LOCAL_SITE = {
  name: 'GFIC Crew',
  nameZh: 'GFIC歪果社',
  legalName: 'GFIC Crew (GFIC歪果社)',
  url: SITE_URL,
  variant: VARIANT,
  isCn: IS_CN,
  icp: import.meta.env.PUBLIC_ICP || __GFIC_ICP__ || '',
  wechat: 'DN8117',
  // 品牌定位句（《GFIC Crew 品牌知识库》Subline 的首句）。渲染在页脚品牌区，并进 og:image 的 alt。
  // 品牌 slogan 是另一个资产，见下面的 SLOGAN 常量 —— 两者不要混用。
  tagline: 'A real-life social community for expats in China.',
  // Fallback only. At runtime the effective copy comes from src/data/generated/site.json
  // (generated-first, this file is the 兜底), so editing this string alone changes nothing
  // you can see -- and leaving it stale means the wrong sentence reappears the moment the
  // generated snapshot goes missing. Keep the two in sync by hand.
  description:
    'GFIC Crew (GFIC歪果社) is a growing real-life social community for expats in China, founded by locals who know the country well. We meet up in person in Guangzhou and Shenzhen, and we run online groups plus a national group that expats in any Chinese city can join. We organize ten types of meetups, from parties and networking mixers to food crawls, language exchange and weekend getaways.',
  keywords: [
    'expat community China',
    'foreigners in China',
    'living in China',
    'Guangzhou expat',
    'expat events China',
    'WeChat Pay',
    'apartment rental China',
    'Cantonese food',
    'language exchange',
  ],
  socials: IS_CN ? SOCIALS_CN : SOCIALS_ALL,
  searchHint: IS_CN
    ? 'Search “GFIC Crew” on WeChat Official Account, WeChat Channels or Xiaohongshu. WeChat: DN8117'
    : 'Search “GFIC Crew” on X, Instagram, YouTube, Xiaohongshu, or WeChat Official Account. WeChat: DN8117',
  // Which platforms to name in body copy. The mainland build only names platforms reachable in China.
  socialLine: IS_CN
    ? 'WeChat Official Account, WeChat Channels or Xiaohongshu'
    : 'X, Instagram, YouTube, Xiaohongshu or WeChat Official Account',
  intro:
    'GFIC Crew (known in Chinese as GFIC歪果社) is a growing real-life social community for expats in China. Founded by locals who know the country well, we are dedicated to helping global friends live a fun, connected, and hassle-free life here. We\'re starting in Guangzhou and Shenzhen, and expats anywhere in China can join our online groups and our national group. We\'re building a program of social events and meetups, from rooftop parties, BBQs, karaoke nights, wine tastings, and club nights to networking mixers, food crawls, language exchanges, hikes, sports leagues, Chinese cultural experiences, weekend getaways, and more.',
};

export const SITE = { ...LOCAL_SITE, ...editableOverride };

export const NAV = (genSite && Array.isArray(genSite.nav) && genSite.nav.length > 0 && genSite.nav) || [
  { href: '/', label: 'Home' },
  { href: '/about/', label: 'About' },
  { href: '/cities/', label: 'Cities & Guides' },
  { href: '/events/', label: 'Events' },
  { href: '/membership/', label: 'Membership' },
  { href: '/faq/', label: 'FAQ' },
  { href: '/contact/', label: 'Contact' },
];

const LOCAL_SERVICES = [
  {
    id: 'social',
    title: 'Social Events & Meetups',
    summary:
      'We organize and share social events across China, so no expat has to spend a weekend sitting at home. We organize ten types of meetups: from rooftop parties, BBQs, karaoke nights, wine tastings and club nights to networking mixers, food crawls, hikes, sports leagues and weekend getaways. We pick the place, set the time and gather the crew; all you have to do is turn up.',
    points: [
      'Parties and socials: rooftop parties, BBQs, karaoke nights, wine tastings and club nights',
      'Networking mixers, food crawls and shared meals, hikes, sports leagues and weekend getaways',
      'Board games and trivia nights, coffee and brunch, interest groups like books, photography and film',
    ],
  },
  {
    id: 'culture',
    title: 'Chinese Cultural Experiences',
    summary:
      'Culture workshops are the ones that need organizing before anything happens, and that is exactly why they are worth doing with a crew. Interest in Chinese culture is common; acting on it alone is harder, because you have to find someone who teaches it, get to the right part of town and then work out what you are looking at. A workshop handles all three.',
    points: [
      'Chinese cooking sessions, dumplings included',
      'Calligraphy and ink painting',
      'Tea ceremony, explained by someone who grew up with it',
      'Tai chi introductions',
      'Museum and temple visits with somebody explaining what you are actually looking at',
    ],
  },
  {
    id: 'language',
    title: 'Chinese Language Exchange',
    summary:
      'Language exchange puts expats who want Mandarin next to locals who want English, and it gives anyone a stated reason to turn up.',
    points: [
      'Language exchange meetups with tandem partners',
      'Everyday Mandarin for the things you do in your first month',
      'Structured practice rather than an open room where nobody talks to anyone new',
      'Sessions shaped around a topic instead of free-form mingling',
      'Mandarin and Cantonese practice in a supportive environment',
    ],
  },
  {
    id: 'daily',
    title: 'Daily Life & Peer Support',
    summary:
      'Online groups where expats swap first-hand answers about daily life in China: housing, healthcare, banking, mobile payments and everything in between. Peer advice from people who have already done it, not a service desk.',
    points: [
      'Healthcare: comparing international clinics and health insurance with people who use them',
      'Housing: comparing districts, rents and lease terms before you sign',
      'Banking and mobile payments: walking each other through WeChat Pay and Alipay setup',
      'Other paperwork people get stuck on: driving license conversion and moving pets',
    ],
  },
];

export const SERVICES =
  (genSite && Array.isArray(genSite.services) && genSite.services.length > 0 && genSite.services) ||
  LOCAL_SERVICES;

const LOCAL_WHY_JOIN = [
  'Instantly tap into a growing network of expats and globally-minded locals, saying goodbye to loneliness in China.',
  'Experience Chinese culture firsthand with a crew that guides you through food, fun and discovery.',
  'Unlock practical living guides on renting, healthcare, banking setups and mobile payments, written from first-hand experience.',
  'Meet up in person in Guangzhou and Shenzhen, or join the conversation from anywhere in China through our online and national groups.',
  'Build lasting international friendships and a strong sense of belonging with your crew in China.',
  'Be part of a dynamic, open and diverse crew that champions inclusion and celebrates global diversity.',
];

export const WHY_JOIN =
  (genSite && Array.isArray(genSite.whyJoin) && genSite.whyJoin.length > 0 && genSite.whyJoin) ||
  LOCAL_WHY_JOIN;

const LOCAL_RULES = [
  'Show respect for the diverse cultures of all countries and prohibit any discriminatory remarks based on race, gender, religion, or any other grounds.',
  'Prohibit commercial advertisements to ensure a positive and supportive atmosphere within the crew.',
  'Strictly forbid any illegal activities or remarks.',
  "Don't harass or add other crew members as friends without their consent.",
];

export const RULES =
  (genSite && Array.isArray(genSite.rules) && genSite.rules.length > 0 && genSite.rules) || LOCAL_RULES;

const LOCAL_ORG_METHODS = [
  // 只写我们自己的做法，不点名任何第三方机构。
  // （曾误把 GEO 站外投放清单里的候选机构名 + 链接写进来，等于对外宣称一段不存在的关系，
  //   老郑 2026-10-05 指出后删除。候选机构只留在 docs/offsite-targets.md 内部清单里。）
  'Co-creation and execution through third-party partnerships: partner events are planned for later, with the GFIC Crew team providing organizational support.',
  'Initiation and execution by community members: the GFIC Crew team offers organizational support and collaboration.',
  'Initiation, planning and execution by the GFIC Crew team: the team takes the lead in organizing and carrying out events.',
];

export const ORG_METHODS =
  (genSite && Array.isArray(genSite.orgMethods) && genSite.orgMethods.length > 0 && genSite.orgMethods) ||
  LOCAL_ORG_METHODS;

// Event categories used by the /events/ filter buttons. Managed from the admin backend
// (站点内容 → 活动分类) so new formats can be added without touching code.
const LOCAL_EVENT_CATEGORIES = [
  'Parties & Socials',
  'Networking',
  'Food & Dining',
  'Language Exchange',
  'Hikes & Weekends',
  'Sports',
  'Culture',
  'Games & Trivia',
  'Coffee & Brunch',
  'Interest Groups',
];

export const EVENT_CATEGORIES =
  (genSite &&
    Array.isArray(genSite.eventCategories) &&
    genSite.eventCategories.length > 0 &&
    genSite.eventCategories) ||
  LOCAL_EVENT_CATEGORIES;

// Event cadence presets used by the /admin/ 活动 editor's「频率」field. The value is free
// text — an event can be "every Wednesday" or "first weekend of the month" — but these are
// the common ones offered as one-click options. Managed from the admin backend
// (站点内容 → 活动频率), with this array as the generated-first fallback.
// ⚠️ 值必须是英文：cadence 会原样显示到英文公开站（events.astro / index.astro 直接 {event.cadence}）。
//    后台 label「频率」是中文，但选项值不能是中文，否则会混进英文页面。
const LOCAL_EVENT_CADENCES = ['One-time', 'Weekly', 'Biweekly', 'Monthly', 'Irregular'];

export const EVENT_CADENCES =
  (genSite &&
    Array.isArray(genSite.eventCadences) &&
    genSite.eventCadences.length > 0 &&
    genSite.eventCadences) ||
  LOCAL_EVENT_CADENCES;

// Meetup formats, ordered by five things at once: how natural the socialising feels, how
// familiar the format already is to Westerners, whether people come back, how China-specific
// the friction is, and how hard it is to turn up alone.
//
// ⚠️ 这个顺序只是**内部权重**——它决定「先写什么、重点写什么」，不是给用户看的东西。
//    老郑 2026-10-05 明确说过：不要把排序逻辑、也不要把分组术语写进页面文案，
//    用户看到的应该是「有哪些好玩的活动」。改文案时别把 rationale 一起搬上去
//    （历史教训：FORMATS 的 why / inChina / soloNote 曾被整段铺进 /events/ 页）。
//    排序也不等于频次承诺 —— 见 docs/meetup-format-ranking.md。Managed from the admin
// backend (站点内容 → 活动形式).
const LOCAL_FORMATS = [
  {
    id: 'parties',
    tier: 1,
    rank: 1,
    name: 'Parties and socials',
    tagline: 'The format everyone already knows how to enjoy.',
    why: 'No shared hobby and no structured activity to sit through, so the party does the work for you. Rooftop parties, BBQs, karaoke nights, wine tastings, club nights, and themed or holiday nights all put people in the same room with something to do. That is why they are both an easy way in and the thing people keep coming back to.',
    inChina: 'The party is familiar, the surroundings are not. Which venues are used to international crowds, what a night actually costs, how to get home afterwards, and how to find the crowd in the first place. Someone who already knows skips the part where you guess.',
    soloNote: 'Turning up alone is normal here, not awkward: almost everyone at a party is there to meet people. Coming in with the crew means you are never the one left by the door.',
    keywords: ['expat party China', 'rooftop party Guangzhou', 'club night Shenzhen', 'karaoke night expats China', 'wine tasting China', 'themed party China', 'pub crawl Guangzhou'],
  },
  {
    id: 'mixers',
    tier: 1,
    rank: 2,
    name: 'Networking mixers',
    tagline: 'A room where everyone is there to meet someone new.',
    why: 'A mixer gives you a reason to talk to a stranger before you have one: work, a side project, or simply being new in town. It suits people who would rather have a stated purpose than a purely social night, and it is where a lot of the practical help in the community first gets passed around.',
    inChina: 'Industry events happen in every big Chinese city, but they are scattered, often run in Chinese, and hard to find from the outside. A crew mixer pulls the same expat and internationally-minded crowd into one room and handles the introductions.',
    soloNote: 'Everyone arrives alone, so there is nothing to explain. The whole point of the format is that you do not know anyone yet.',
    keywords: ['expat networking China', 'business mixer Guangzhou', 'professional meetup Shenzhen', 'foreigners business network China'],
  },
  {
    id: 'food',
    tier: 1,
    rank: 3,
    name: 'Food crawls and shared meals',
    tagline: 'Nobody has to be interesting when there is food on the table.',
    why: 'Eating together is the one thing every culture already agrees on. You point, you react, and that reaction becomes the conversation. Hands-on food like hotpot or dumplings works better than a formal dinner because everyone is busy doing something.',
    inChina: 'The food is why plenty of people came to China, but ordering it is a separate skill. Pictureless menus, dishes you cannot pronounce, and no reliable way to tell whether you chose well. Having someone order for the table turns a stressful meal into a good one.',
    soloNote: 'Eating alone is normal at home and draws attention in a lot of Chinese restaurants. Going with people removes the stares and gets you more dishes to try.',
    keywords: ['Cantonese food crawl', 'street food Guangzhou expat', 'hotpot with foreigners China'],
  },
  {
    id: 'language',
    tier: 1,
    rank: 4,
    name: 'Language exchange',
    tagline: 'A reason to show up that is easier to say out loud than wanting friends.',
    why: 'Saying you are here to practice Chinese is a much easier sentence than saying you are here to meet people. That is why quieter people turn up to these and never turn up to anything else. It also brings two crowds into one room: expats who want Chinese and locals who want English.',
    inChina: 'Demand is enormous and quality is uneven. Plenty of people have been to one that quietly became a dating event, or an English corner where nobody talks to anyone new. Sessions with a host, a structure and a topic are rare enough that you notice straight away.',
    soloNote: 'Almost nobody feels awkward arriving alone here, because the whole point is that you get paired with someone within minutes.',
    keywords: ['language exchange Guangzhou', 'Mandarin practice foreigners', 'Chinese English tandem partner'],
  },
  {
    id: 'outdoor',
    tier: 2,
    rank: 5,
    name: 'Hikes and weekend getaways',
    tagline: 'A whole day together does more than an evening does.',
    why: 'Time is the thing that turns acquaintances into friends. On a day trip there is room for the conversation to get past where you are from and what you do. People who move here often arrive already liking the outdoors, so there is nothing to sell.',
    inChina: 'There is a lot of scenery within reach of every big Chinese city, and getting to it means tickets, transport, sometimes a night somewhere, and a language gap at each step. Doing that alone on a Saturday is a big ask, which is why most people never do.',
    soloNote: 'Nobody joins a hike to talk to people they already know. Turning up alone is the normal way to do it.',
    keywords: ['expat hiking China', 'weekend trip from Guangzhou', 'camping with foreigners China'],
  },
  {
    id: 'sports',
    tier: 2,
    rank: 6,
    name: 'Sports leagues and fitness',
    tagline: 'You can be useful before your Mandarin is good enough for small talk.',
    why: 'Sport gives you a job on the pitch and something to talk about afterwards, so language stops being the barrier. The repeat factor is what sets it apart though. You see the same faces regularly instead of once, and that is how friendships actually form.',
    inChina: 'Courts and pitches are everywhere in Chinese cities. What eats your time is rounding up enough people, holding a booking, and making sure somebody comes next week. Most informal attempts fade out after two sessions for exactly this reason.',
    soloNote: 'Turning up alone is expected. Teams are short of players far more often than they are full.',
    keywords: ['expat football China', 'foreigner sports league Guangzhou', 'badminton meetup Shenzhen'],
  },
  {
    id: 'culture',
    tier: 2,
    rank: 7,
    name: 'Chinese cultural experiences',
    tagline: 'Curiosity is easy. Acting on it alone is not.',
    why: 'Real interest in Chinese culture is common and hard to follow up on your own. You have to find someone who teaches it, get there, and then work out what you are actually looking at. In a session like this all of that is handled, and there are other people reacting alongside you.',
    inChina: 'Being run by locals is the genuine edge here. A Chinese host explaining dumplings, calligraphy or tea is not putting on a show for visitors, they are explaining something they grew up with, and people pick up on that difference immediately.',
    soloNote: 'These are structured enough that you are never left standing in a corner wondering who to talk to.',
    keywords: ['Chinese cooking class expats', 'calligraphy workshop Guangzhou', 'tea ceremony China experience'],
  },
  {
    id: 'games',
    tier: 3,
    rank: 8,
    name: 'Board games and trivia nights',
    tagline: 'The game supplies the conversation so you do not have to.',
    why: 'Structure is the whole appeal. Nobody has to improvise small talk because there is something on the table that everyone is looking at. It suits people who are new in town, or who are not going to walk up to a stranger and introduce themselves.',
    inChina: 'It needs games in English and most shops stock Chinese versions, so somebody has to bring them. That takes a bit more setup than a night out, so it takes longer to get going.',
    soloNote: 'Good first event. You spend the first twenty minutes learning rules rather than making conversation.',
    keywords: ['board game night expats China', 'trivia night Guangzhou foreigners'],
  },
  {
    id: 'coffee',
    tier: 3,
    rank: 9,
    name: 'Coffee chats and brunch',
    tagline: 'A low-commitment first step rather than the main event.',
    why: 'Brunch is a real cultural touchstone for many newcomers and an easy first meeting. Nobody has to commit their whole evening and nobody has to drink.',
    inChina: 'Coffee here is a fast transaction and brunch crowds exist mainly in the biggest cities, so it carries less weight than it does at home. Useful as a gentle entry, weak as a centerpiece.',
    soloNote: 'Sitting in a cafe with people you have not met yet costs you an hour and nothing else.',
    keywords: ['expat brunch China', 'coffee meetup Guangzhou foreigners'],
  },
  {
    id: 'interests',
    tier: 3,
    rank: 10,
    name: 'Interest groups: books, photography, film',
    tagline: 'What keeps people coming back rather than what brings them in.',
    why: 'Smaller groups, tighter bonds, and much better suited to people who already know a few faces. Photography walks in particular give you something to look at together, which takes the pressure off the conversation.',
    inChina: 'Retention more than recruitment. It matters once somebody has settled in and wants a reason to keep showing up.',
    soloNote: 'Joining alone is fine, though these work better once you already recognize somebody in the room.',
    keywords: ['photography walk expats China', 'book club Guangzhou foreigners'],
  },
];

export const FORMATS =
  (genSite && Array.isArray(genSite.formats) && genSite.formats.length > 0 && genSite.formats) ||
  LOCAL_FORMATS;

export const FORMAT_TIERS = [
  {
    tier: 1,
    label: 'Easy to turn up to on your own',
    note: 'These are the ones you can turn up to on your own. You arrive alone, and there is already something to do and someone to talk to.',
  },
  {
    tier: 2,
    label: 'Worth planning ahead for',
    note: 'Bigger and more organized, and each one takes a bit more setting up than a night out does.',
  },
  {
    tier: 3,
    label: 'Smaller and more specific',
    note: 'Narrower interests, or formats that work best once you already recognize a few faces.',
  },
];

// Homepage copy. Managed from the admin backend (站点内容 → 首页 / 首页各区块标题).
//
// Placeholders resolved at render time:
//   {brand}      -> "<name> (<nameZh>)", rendered bold — keeps the brand name in one place
//   {cityCount}  -> number of cities in the city list
//   {name} / {socialLine} / {wechat} / {site} -> handled by fill() from contact.js
const LOCAL_HOME = {
  // 主视觉区
  eyebrow: 'Expat community in China',
  // 首页大标题。用品牌 slogan 当主标语，关键词由它上方的 eyebrow（Expat community in China）
  // 和紧随的 lead 首句承担，标题本身不必再塞品类词。
  title: 'Life happens face to face.',
  lead:
    'GFIC Crew (known in Chinese as GFIC歪果社) is a growing real-life social community for expats in China. Founded by locals who know the country well, we are dedicated to helping global friends live a fun, connected, and hassle-free life here. We\'re starting in Guangzhou and Shenzhen, and expats anywhere in China can join our online groups and our national group. We\'re building a program of social events and meetups, from rooftop parties, BBQs, karaoke nights, wine tastings, and club nights to networking mixers, food crawls, language exchanges, hikes, sports leagues, Chinese cultural experiences, weekend getaways, and more.',
  highlights: [
    'Parties and socials: rooftop parties, BBQs, karaoke nights and club nights',
    'Networking mixers: a room where everyone is there to meet someone new',
    'Food crawls and language exchange: swap your English for Mandarin over a table of shared dishes',
    'Hikes, sports leagues and cultural experiences: for when an evening together is not enough',
  ],

  // 四大服务
  servicesEyebrow: 'What we do',
  servicesTitle: 'Four things that make life in China work',
  servicesLead:
    'Not a chat group you mute after a week. A real-life community that answers your 11pm China-life question and then meets you for dumplings on Saturday.',

  // 城市与指南
  citiesEyebrow: 'Cities & guides',
  citiesTitle: 'Where the crew meets',
  citiesLead:
    '{cityCount} cities have online groups and city notes. The full living guide currently covers Guangzhou. Guangzhou and Shenzhen are where we meet in person.',

  // 活动日历
  eventsEyebrow: 'Events',
  eventsTitle: 'What is happening next',

  // 会员
  membershipEyebrow: 'Membership',
  membershipTitle: 'Lifetime membership',
  membershipLead: 'Every group is free to join right now. Paid membership has not opened yet. When it does, it is one payment with no subscription. First-week refunds require that you have not joined an activity or broken the community rules.',

  // 为什么加入
  whyJoinEyebrow: 'Why join',
  whyJoinTitle: 'Why expats stick with the crew',
  whyJoinNote: 'Search “{name}” on {socialLine}. Personal WeChat ID: {wechat}.',
};

const genHome = (genSite && typeof genSite.home === 'object' && genSite.home) || {};

export const HOME = {
  ...LOCAL_HOME,
  ...genHome,
  highlights:
    (Array.isArray(genHome.highlights) && genHome.highlights.length > 0 && genHome.highlights) ||
    LOCAL_HOME.highlights,
};
