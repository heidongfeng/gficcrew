/**
 * 一次性迁移：清除「绝对化用语」（A 类全清）＋ 门面页 A 档 em dash ＋ 内部排序外露。
 *
 * 背景（老郑 2026-10-08 拍板）：
 *   ① em dash 走 A 档 —— 只清门面页 9 个页面（首页/About/FAQ/Events/Cities/Contact/Join/
 *      Membership/Guides 索引）正文里的 36 处；广州指南正文的 21 处保留；页面标题 12 处不动。
 *   ② 绝对化用语走 A 类全清 —— 品牌／城市／服务的最高级断言全部换成可验证的具体表述。
 *      （旧口径只报 15 处，因为扫描正则漏了 -est 系与所有格最高级，补全后 33 处。）
 *   ③ 内部排序外露 3 处一起清（rank fifth / sits lower / a close third + come next）。
 *
 * 每条编辑都同时作用在 `src/data/*.js`（代码兜底）与 `src/data/generated/*.json`（generated-first
 * 的实际生效值）—— 只改一端 = 静默不生效，或在 content:pull 之后回退。
 *
 * 用法：
 *   node scripts/_apply-claim-cleanup.mjs            # 预览，只报每条命中几次
 *   node scripts/_apply-claim-cleanup.mjs --write    # 落盘
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

const FILES = [
  'src/data/site.js',
  'src/data/cities.js',
  'src/data/faq.js',
  'src/data/contact.js',
  'src/data/guides.js',
  'src/data/guangzhou.js',
  'src/data/generated/site.json',
  'src/data/generated/cities.json',
  'src/data/generated/faq.json',
  'src/data/generated/contact.json',
  'src/data/generated/guides.json',
  'src/pages/faq.astro',
  'src/pages/events.astro',
  'src/pages/about.astro',
  'src/pages/join.astro',
  'src/pages/membership.astro',
  'src/pages/guides/index.astro',
  'src/pages/guides/[slug].astro',
  'src/pages/cities/index.astro',
  'src/pages/contact.astro',
];

/** [分组, 说明, from, to] */
const EDITS = [
  // ---------------------------------------------------------------- A 档 em dash
  ['em-dash', '首页 lead + site.intro', 'meetups — everything from rooftop parties', 'meetups: everything from rooftop parties'],
  ['em-dash', '首页 servicesLead', 'after a week — a real-life community', 'after a week. A real-life community'],
  ['em-dash', '服务 1 summary', 'Ten formats sit on the board — from rooftop parties', 'Ten formats sit on the board: from rooftop parties'],
  ['em-dash', '服务 4 summary', 'daily life in China — housing, healthcare, banking', 'daily life in China: housing, healthcare, banking'],
  ['em-dash', '首页 membershipLead', 'right now — paid membership has not opened yet. When it does', 'right now. Paid membership has not opened yet. When it does'],
  ['em-dash', 'About CtaBand', 'join right now — paid membership has not opened yet."', 'join right now. Paid membership has not opened yet."'],
  ['em-dash', 'events mixers.why', 'before you have one — work, a side project', 'before you have one: work, a side project'],
  ['em-dash', 'events parties.why', 'no structured activity to sit through — a party does the work for you', 'no structured activity to sit through, so the party does the work for you'],
  ['em-dash', 'FAQ 关于广州', 'grounded in — visas, housing, banking', 'grounded in: visas, housing, banking'],
  ['em-dash', 'FAQ 会员分层', 'for when paid membership opens — every group is free', 'for when paid membership opens. Every group is free'],
  ['em-dash', 'FAQ 租金', 'ask inside the group — members post', 'ask inside the group: members post'],
  ['em-dash', 'FAQ 手机号', 'for almost everything — bank accounts', 'for almost everything: bank accounts'],
  ['em-dash', 'FAQ 黄金周做什么', 'what everyone is doing — plenty of members', 'what everyone is doing; plenty of members'],
  ['em-dash', 'FAQ 黄金周开放', 'a few days ahead — and for anything time-sensitive', 'a few days ahead. For anything time-sensitive'],
  ['em-dash', 'FAQ 酒吧夜', 'Yes — club nights and pub crawls', 'Yes. Club nights and pub crawls'],
  ['em-dash', 'FAQ 分类标签 ×4', 'Living in China — Housing', 'Living in China · Housing'],
  ['em-dash', 'FAQ 分类标签 ×4', 'Living in China — Money', 'Living in China · Money'],
  ['em-dash', 'FAQ 分类标签 ×4', 'Living in China — Healthcare', 'Living in China · Healthcare'],
  ['em-dash', 'FAQ 分类标签 ×4', 'Living in China — Daily Life', 'Living in China · Daily Life'],
  ['em-dash', 'FAQ 页首导语', 'practical life in China — housing, WeChat Pay', 'practical life in China: housing, WeChat Pay'],
  ['em-dash', 'About expats 释义', '<strong>expats</strong> —', '<strong>expats</strong>:'],
  ['em-dash', 'Join 页导语', 'Joining the crew happens on WeChat now — add', 'Joining the crew happens on WeChat now. Add'],
  ['em-dash', 'Events 招募段', 'what you are after — we', 'what you are after, and we'],
  ['em-dash', 'Events 报名方式', 'Sign-ups happen on WeChat — that is where', 'Sign-ups happen on WeChat, which is where'],
  ['em-dash', 'Cities 索引导语', 'no local team yet — those cities join us', 'no local team yet. Those cities join us'],
  // 这里 em dash 处在行尾，下一行开头是 "there"，所以连换行一起换，顺带把句首大写。
  ['em-dash', 'Membership 申请段', 'we add you —\n        there is nothing to pay', 'we add you.\n        There is nothing to pay'],
  ['em-dash', 'Guides 索引导语', 'lives there — the same things we walk', 'lives there, and the same things we walk'],
  ['em-dash', 'Contact 社交列表分隔符', '` — ${s.note}`', '` · ${s.note}`'],

  // ---------------------------------------------------------------- A 类绝对化：城市
  ['claim', '广州 tagline（含 em dash）', 'Our home base — Cantonese food, riverfront nights and the easiest city to make friends in.', 'Our home base, with Cantonese food, riverfront nights and a small expat scene that is easy to join.'],
  ['claim', '广州 blurb（×2 渲染位）', 'Guangzhou is our home base, and it is one of the most expat-friendly cities in China: affordable rent, world-class Cantonese food, a subtropical climate and a deeply international business community.', 'Guangzhou is our home base. Rent sits below Beijing and Shanghai, Cantonese food is cheap enough to eat out often, the climate is subtropical and the trade community is deeply international.'],
  ['claim', '上海 tagline（含 em dash）', 'China’s most international city — the biggest expat crowd and the widest choice of things to do.', 'A large, long-established expat community and a wide choice of international restaurants and bars.'],
  ['claim', '上海 blurb', 'Shanghai has the largest expat community in mainland China, plus the widest choice of international restaurants, bars and professional networks,', 'Shanghai has a large, long-established expat community, plus a wide choice of international restaurants, bars and professional networks,'],
  ['claim', '上海 highlight：语言交换', 'language exchange: the hardest city in China to get daily Mandarin practice, because English works everywhere', 'language exchange: English works almost everywhere here, so daily Mandarin practice takes deliberate effort'],
  ['claim', '上海 highlight：咖啡早午餐', 'board games, coffee and brunch: the strongest Western holiday calendar anywhere in the country', 'board games, coffee and brunch: a full Western holiday calendar all year round'],
  ['claim', '上海 highlight：英语普及', 'English is spoken more widely here than anywhere else on this list', 'English is spoken widely across the city'],
  ['claim', '深圳 tagline', 'Tech energy, coastline and the youngest crowd in the Pearl River Delta.', 'Tech energy, coastline and a young, mostly newly arrived crowd.'],
  ['claim', '深圳 blurb', 'Shenzhen is China’s tech hub and one of its youngest cities,', 'Shenzhen is China’s tech hub and a city that grew up in a single generation,'],
  ['claim', '成都 highlight：美食', 'food crawls: Sichuan hotpot, skewers and dumplings, arguably the strongest regional food scene on this list', 'food crawls: Sichuan hotpot, skewers and dumplings, and a food scene people move here for'],
  ['claim', '成都 livingNote', 'One of the most affordable big cities in China, with a slower pace', 'Rents and food sit well below the coastal first-tier cities, with a slower pace'],
  ['claim', '重庆 livingNote', 'Among the most affordable major cities, with low rents', 'Low rents by Chinese big-city standards, with'],
  ['claim', '西安 blurb', 'with one of the strongest street-food quarters in the country.', 'with a dense, long-standing street-food scene.'],
  ['claim', '桂林 livingNote', 'One of the cheapest cities here, known for scenery rather than for salaries.', 'Cheap by Chinese big-city standards, known for scenery rather than for salaries.'],
  ['claim', '昆明 livingNote', 'One of the cheapest provincial capitals in China, with a mild climate and low rents.', 'Rents sit well below the coastal cities, with a mild climate all year round.'],
  ['claim', '丽江 blurb', 'and the trailheads for some of the best hiking in the province.', 'and trailheads for serious hiking in the province.'],

  // ---------------------------------------------------------------- A 类绝对化：服务 / 品牌
  ['claim', '国家群入口（cities.js + contact.js）', 'the national WeChat group is the fastest way in:', 'the national WeChat group is the easy way in:'],
  ['claim', 'Contact 页导语（含 em dash）', 'WeChat is the only channel we monitor every day. Add {wechat} and tell us which city you are in — that is the fastest way to reach us.', 'WeChat is the channel we check every day. Add {wechat} and tell us which city you are in, and we will take it from there.'],
  ['claim', 'Find us 文案（含 em dash）', 'Search “GFIC Crew” on {socialLine} — the name is the same everywhere.', 'Search “GFIC Crew” on {socialLine}. The name is the same everywhere.'],
  ['claim', 'Events 分组小标题 tier 1 note', 'The social formats with the lowest barrier. You can arrive alone', 'These are the ones you can turn up to on your own. You arrive alone'],
  ['claim', 'parties.why：easiest way in', 'they are both the easiest way in and the thing people keep coming back to', 'they are both an easy way in and the thing people keep coming back to'],

  // ---------------------------------------------------------------- A 类绝对化 + 排序外露：FAQ
  ['claim', 'FAQ 单人首次参加（排序外露）', 'The ones at the front of the list are the easiest to turn up to on your own.', 'Parties, mixers and food crawls are the ones you can turn up to on your own.'],
  ['claim', 'FAQ 从哪个开始（排序外露）', 'Food crawls come next, because nobody has to be interesting when there is food on the table. Language exchange is a close third and suits people who would rather have a stated reason to be in the room.', 'Food crawls work well too, because nobody has to be interesting when there is food on the table. Language exchange suits people who would rather have a stated reason to be in the room.'],
  ['claim', 'FAQ 标题：住哪个区（云端 q 需同步）', 'What is the best area to live in Guangzhou as an expat?', 'Where do expats usually live in Guangzhou?'],
  ['claim', 'FAQ 为什么选广州：world-class', 'with world-class Cantonese food, a subtropical climate, a huge international trade community', 'with Cantonese food that is cheap enough to eat out often, a subtropical climate, a huge international trade community'],
  ['claim', 'FAQ 为什么选广州：friendliest', 'It is also one of the friendliest Chinese cities for newcomers because the local culture is famously practical', 'It is also a comparatively easy Chinese city to settle into, because the local culture is famously practical'],
  ['claim', 'FAQ 住哪个区答案：best traditional food', 'Yuexiu has the old-city feel, parks and the best traditional food;', 'Yuexiu has the old-city feel, parks and the traditional food most people come for;'],

  // ---------------------------------------------------------------- A 类绝对化 + 排序外露：广州指南
  ['claim', '指南 intro：the city we know best', 'Guangzhou is our home base and the city we know best.', 'Guangzhou is our home base and the city we live in.'],
  ['claim', '指南 why：most liveable', 'Guangzhou is one of the most liveable big cities in China for foreigners.', 'Guangzhou is an easy big city to settle into as a foreigner.'],
  ['claim', '指南 why：最好地区菜系', 'Cantonese food, widely considered the best regional cuisine in China, is cheap enough to eat out often.', 'Cantonese food is cheap enough to eat out often.'],
  ['claim', '指南 housing：best traditional food', 'Yuexiu (old city, parks, best traditional food)', 'Yuexiu (old city, parks, known for traditional food)'],
  ['claim', '指南 food：most celebrated', 'Cantonese cooking is the most celebrated regional cuisine in China and Guangzhou is its home.', 'Cantonese cooking is Guangzhou’s home cuisine, and this is where to try it.'],
  ['claim', '指南 weekends：rank fifth（排序外露）', 'That is why hiking and weekend trips rank fifth even though they are the most trouble to organize.', 'That is also why hiking and weekend trips take more organizing than a night in town.'],
  ['claim', '指南 social：easiest place to start', 'A party is the easiest place to start, and the reason is prosaic', 'A party is an easy place to start, and the reason is prosaic'],
  ['claim', '指南 FAQ：safest megacities', 'Guangzhou has a low rate of violent crime and is one of the safest megacities in the world to walk around at night.', 'Guangzhou has a low rate of violent crime and is a safe city to walk around at night.'],
  ['claim', '指南 FAQ：world-class', 'Yes. Guangzhou combines a lower cost of living than Beijing or Shanghai with world-class Cantonese food,', 'Yes. Guangzhou combines a lower cost of living than Beijing or Shanghai with Cantonese food that is cheap enough to eat out often,'],
  ['claim', '指南 FAQ：friendliest', 'It is one of the friendliest Chinese cities for newcomers.', 'It is also a comparatively easy Chinese city to settle into.'],
  ['claim', '指南 FAQ：best traditional food', 'Yuexiu has the old-city feel, parks and the best traditional food.', 'Yuexiu has the old-city feel, parks and the traditional food most people come for.'],
  ['claim', '指南页兜底句（未渲染，防将来外露）', 'The fastest way to make ${guide.city} feel like home is to show up.', 'What makes ${guide.city} feel like home is showing up.'],
];

// ---------------------------------------------------------------- 执行
const buffers = new Map();
for (const f of FILES) {
  const abs = path.join(root, f);
  if (!fs.existsSync(abs)) {
    console.log(`⚠ 文件不存在，跳过：${f}`);
    continue;
  }
  buffers.set(f, fs.readFileSync(abs, 'utf8'));
}

let okCount = 0;
const misses = [];
const perFile = new Map();

for (const [group, label, from, to] of EDITS) {
  let total = 0;
  for (const [f, text] of buffers) {
    const n = text.split(from).length - 1;
    if (n === 0) continue;
    total += n;
    buffers.set(f, text.split(from).join(to));
    perFile.set(f, (perFile.get(f) || 0) + n);
  }
  if (total === 0) {
    misses.push(`[${group}] ${label}\n      from: ${from}`);
  } else {
    okCount += 1;
    console.log(`  ✓ ${String(total).padStart(2)}× [${group}] ${label}`);
  }
}

console.log('\n================ 汇总 ================');
console.log(`命中：${okCount}/${EDITS.length} 条编辑`);
if (perFile.size) {
  console.log('按文件统计：');
  [...perFile.entries()].forEach(([f, n]) => console.log(`   ${String(n).padStart(2)}×  ${f}`));
}
if (misses.length) {
  console.log('\n❌ 以下编辑一处都没命中（from 写错了？）：');
  misses.forEach((m) => console.log('   ' + m));
}
if (WRITE && misses.length === 0) {
  for (const [f, text] of buffers) fs.writeFileSync(path.join(root, f), text);
  console.log('\n✓ 已落盘。');
} else if (!WRITE) {
  console.log('\n（dry-run，未写盘。加 --write 才执行）');
} else {
  console.log('\n⚠ 有未命中项，未落盘。');
}
