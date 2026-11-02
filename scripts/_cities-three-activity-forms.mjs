/**
 * 一次性脚本：把 14 城的 highlights 重构为「三类活动固定 + 地域特色」。
 *
 * 背景：老郑指出城市与指南板块都漏掉了社群最大定位 —— 我们是「活动社群」，
 * 而活动主要是三类：① 社交聚会与派对 ② 美食探索 ③ 户外徒步与城市漫步。
 * 要求：**所有城市都要提到这三类**。
 *
 * 结构（每城 6 条 highlights，顺序固定）：
 *   1. Social mixers & parties   —— 写成该城的具体形式
 *   2. Food crawls & dining       —— 写成该城的具体形式
 *   3. Hiking & city walks        —— 写成该城的具体形式
 *   4–6. 该城地域特色（保留原有内容）
 *
 * blurb 同步改写：明确带出三类活动，且保留城市特色。
 *
 * 用法：node scripts/_cities-three-activity-forms.mjs [--write]
 *   不带 --write 只预览（dry-run），带 --write 才落盘到
 *   src/data/generated/cities.json 与 src/data/cities.js 的 LOCAL_CITIES。
 *
 * 幂等：重复跑结果相同（纯函数式重建，不做增量 patch）。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

// ---- 三类活动的统一标签（用于自检与给 AI 的一致性信号）----
const FORMS = {
  social: 'Social mixers & parties',
  food: 'Food crawls & dining',
  outdoor: 'Hiking & city walks',
};

/**
 * 每城 6 条 highlights：前三类固定，后三条地域特色。
 * 三类活动必须写成「该城的具体形式」，不能是空泛套话 —— 这是与城市特色结合的关键。
 */
const CITY_OVERRIDES = {
  guangzhou: {
    blurb: 'Guangzhou is where GFIC Crew is most active, and it is one of the most expat-friendly cities in China: affordable rent, world-class Cantonese food, a subtropical climate and a deeply international business community. Our Guangzhou crew is an events crew first — social mixers and riverfront parties, street-food crawls through Liwan and Yuexiu, and weekend hikes and city walks around Baiyun Mountain, with language exchange and badminton running alongside them all week.',
    highlights: [
      'Social mixers & parties: riverfront pub crawls in Zhujiang New Town, international potluck dinners and rooftop meetups',
      'Food crawls & dining: Liwan, Yuexiu and Haizhu street-food crawls plus Cantonese dim sum and tea ceremony sessions',
      'Hiking & city walks: Baiyun Mountain sunrise hikes, Shamian Island and old-town walks, weekend camping in Conghua',
      'Weekly Cantonese and Mandarin language exchange',
      'Badminton, football and cycling socials',
      'Weekend trips to the surrounding countryside',
    ],
  },
  shanghai: {
    blurb: 'Shanghai has the largest expat community in mainland China. Our Shanghai crew is built around three things: social mixers and rooftop parties, food crawls from street stalls to tasting menus, and city walks that actually explain the city — alongside neighbourhood meetups in Jing’an, Xuhui and Huangpu.',
    highlights: [
      'Social mixers & parties: rooftop mixers, business and freelancer networking nights, pub crawls',
      'Food crawls & dining: night-market and noodle-shop crawls, supper clubs and neighbourhood dining runs',
      'Hiking & city walks: Bund-to-French-Concession walks, art-district strolls and day hikes in the hills outside town',
      'Neighbourhood coffee chats in Jing’an and Xuhui',
      'Art gallery and museum weekends',
      'Weekend trips to Hangzhou and Suzhou',
    ],
  },
  beijing: {
    blurb: 'Beijing offers unmatched access to Chinese history, and our crew explores it on foot. Expect social mixers and hotpot dinners, hutong food crawls, and the hiking this region is famous for — Great Wall treks and city walks that take in temples, hutongs and lakesides.',
    highlights: [
      'Social mixers & parties: embassy-area socials, hotpot nights and international mixers',
      'Food crawls & dining: hutong snack crawls, Peking duck feasts and Muslim-Quarter dining runs',
      'Hiking & city walks: Great Wall trekking days, hutong and temple guided walks, lakeside strolls',
      'Language exchange in Chaoyang and Dongcheng',
      'Museum and art-district weekends',
      'Weekend trips to the surrounding mountains',
    ],
  },
  shenzhen: {
    blurb: 'Shenzhen is China’s tech hub and one of its youngest cities, and the crew here moves outdoors. We run social mixers and startup parties, Cantonese seafood crawls along the coast, and some of the best coastal hikes and city walks in the country.',
    highlights: [
      'Social mixers & parties: startup and tech mixers, beach bonfires and rooftop meetups',
      'Food crawls & dining: Cantonese seafood dinners, night-market crawls and hotpot nights',
      'Hiking & city walks: coastal hikes and beach days, Dapeng cycling and urban-park walks',
      'Language exchange for newcomers',
      'Weekend trips around the Pearl River Delta',
      'Board-game and photography meetups',
    ],
  },
  chengdu: {
    blurb: 'Chengdu is famous for its relaxed pace, teahouse culture and spicy Sichuan food — and our crew leans into all three. Expect hotpot nights and teahouse socials, Sichuan food crawls, and unhurried city walks with the occasional hill hike outside town.',
    highlights: [
      'Social mixers & parties: hotpot nights, teahouse afternoons and Mahjong learning socials',
      'Food crawls & dining: Sichuan cuisine tours, street-skewer crawls and dumpling nights',
      'Hiking & city walks: old-town and riverside walks, with day hikes in the hills around Chengdu',
      'Panda base trips',
      'Language exchange and cultural workshops',
      'Weekend trips to Qingcheng Mountain and nearby towns',
    ],
  },
  hangzhou: {
    blurb: 'West Lake, tea hills and a booming tech scene. Our Hangzhou crew is an outdoor-first group: lakeside socials and weekend brunches, food crawls through the old streets, and walks and runs around West Lake and up into the tea mountains.',
    highlights: [
      'Social mixers & parties: weekend brunch club, lakeside socials and tech-community mixers',
      'Food crawls & dining: Hangzhou-cuisine crawls and Longjing tea-house dining',
      'Hiking & city walks: West Lake walks and runs, tea-hill hikes and old-street strolls',
      'Longjing tea-picking days',
      'Language exchange and cultural workshops',
      'Weekend trips to Shanghai and Wuzhen water town',
    ],
  },
  chongqing: {
    blurb: 'A vertical city of hotpot, fog and river views, and a great place to explore on foot — though "walk" here often means stairs. Our crew runs social mixers and nightlife nights, spicy food crawls, and night-view walks and hill hikes across the city.',
    highlights: [
      'Social mixers & parties: nightlife socials, river-cruise parties and hotpot gatherings',
      'Food crawls & dining: hotpot food crawls and Chongqing small-noodle dining runs',
      'Hiking & city walks: night-view photography walks, hillside stair walks and karst day hikes',
      'River cruises on the Yangtze and Jialing',
      'Language exchange and cultural workshops',
      'Weekend trips to Wulong karst country',
    ],
  },
  suzhou: {
    blurb: 'Classical gardens, water towns and a strong international manufacturing community close to Shanghai. Our Suzhou crew covers all three activity types: garden-side socials and mixers, Jiangnan food crawls, and the canal, garden and water-town walks this city is made for.',
    highlights: [
      'Social mixers & parties: garden-side socials, expat mixers and weekend brunches',
      'Food crawls & dining: Jiangnan cuisine crawls, noodle-shop runs and sweet-shop tastings',
      'Hiking & city walks: classical garden tours, canal-side walks and water-town strolls',
      'Silk and embroidery workshops',
      'Shanghai–Suzhou cycling',
      'Weekend trips to Tongli and Zhouzhuang',
    ],
  },
  qingdao: {
    blurb: 'Beer, beaches and German-era architecture. Our Qingdao crew mixes the three: beach socials and brewery parties, seafood and street-food crawls, and coastal hikes and old-town walks along the German concession.',
    highlights: [
      'Social mixers & parties: beach volleyball socials, brewery parties and seaside mixers',
      'Food crawls & dining: seafood feasts, barbecue-street crawls and beer-hall dining',
      'Hiking & city walks: coastal hiking, Laoshan trails and German-concession architecture walks',
      'Language exchange and cultural workshops',
      'Sailing and water-sports meetups',
      'Weekend trips along the Shandong coast',
    ],
  },
  xian: {
    blurb: 'Terracotta warriors, Muslim Quarter street food and one of the most walkable old cities in China. Our Xi’an crew runs social mixers and courtyard nights, a serious street-food crawl scene, and city walks along the wall and through the old quarters.',
    highlights: [
      'Social mixers & parties: courtyard socials, city-wall sunset meetups and international mixers',
      'Food crawls & dining: Muslim Quarter food walks, biangbiang noodle crawls and dumpling banquets',
      'Hiking & city walks: city-wall cycling and walks, old-quarter strolls and day hikes in the Qinling mountains',
      'Terracotta Army trips',
      'Calligraphy workshops',
      'Language exchange and cultural workshops',
    ],
  },
  tianjin: {
    blurb: 'A port city 30 minutes from Beijing by high-speed rail, with European-style concessions and a growing international community. Our Tianjin crew runs port-area socials and coffee meetups, street-food crawls, and concession-architecture walks along the Hai River.',
    highlights: [
      'Social mixers & parties: port-area coffee meetups, expat mixers and riverside socials',
      'Food crawls & dining: Tianjin street-food nights, goubuli and mahua tastings',
      'Hiking & city walks: concession-architecture walks, Hai River promenades and Panshan day hikes',
      'Beijing–Tianjin day trips',
      'Language exchange and cultural workshops',
      'Weekend trips to the Bohai coast',
    ],
  },
  xiamen: {
    blurb: 'Island life, mild weather and a creative crowd. Our Xiamen crew is beach-and-food driven: social mixers and beach socials, seafood and street-food crawls, and Gulangyu and coastal walks that are the best in the city.',
    highlights: [
      'Social mixers & parties: beach socials, beach clean-up meetups and creative-community mixers',
      'Food crawls & dining: seafood nights, Shacha-noodle crawls and night-market dining',
      'Hiking & city walks: Gulangyu island walks, coastal cycling and seaside promenades',
      'Language exchange and cultural workshops',
      'Photography and art meetups',
      'Weekend trips to Fujian tulou country',
    ],
  },
  guilin: {
    blurb: 'Karst mountains and the Li River, and a slower, nature-first base popular with teachers, photographers and remote workers. Our Guilin crew is outdoors-led: social mixers and photography nights, local food crawls, and karst hiking and river walks.',
    highlights: [
      'Social mixers & parties: photography socials, hostel and coworking mixers, riverside evenings',
      'Food crawls & dining: Guilin rice-noodle crawls and local night-market dining',
      'Hiking & city walks: karst hiking, Li River walks and rural cycling',
      'Language exchange and cultural workshops',
      'Photography weekends',
      'Weekend trips to Yangshuo and Longji rice terraces',
    ],
  },
  yunnan: {
    blurb: 'Spring-like weather, minority cultures and a strong remote-work community across Kunming, Dali and Lijiang. Our Yunnan crew runs social mixers and festival parties, Yunnan food crawls, and the lake, mountain and old-town walks this province is famous for.',
    highlights: [
      'Social mixers & parties: remote-worker mixers, festival parties and old-town socials in Dali and Lijiang',
      'Food crawls & dining: Yunnan cuisine crawls, mushroom-season dining and market tours',
      'Hiking & city walks: Erhai lake cycling and walks, Cangshan hiking and Lijiang old-town strolls',
      'Minority festival trips',
      'Tea mountain visits',
      'Language exchange and cultural workshops',
    ],
  },
};

// ---- 读取当前城市数据（以 generated 为准）----
const genPath = path.join(root, 'src', 'data', 'generated', 'cities.json');
const gen = JSON.parse(fs.readFileSync(genPath, 'utf8'));

const problems = [];
const out = gen.map((city) => {
  const o = CITY_OVERRIDES[city.slug];
  if (!o) {
    problems.push(`未知 slug，未覆盖：${city.slug}`);
    return city;
  }
  if (o.highlights.length !== 6) {
    problems.push(`${city.slug}: highlights 应为 6 条，实际 ${o.highlights.length}`);
  }
  // 前三类必须按顺序出现
  if (!/^Social mixers & parties:/.test(o.highlights[0])) problems.push(`${city.slug}: 第 1 条不是社交聚会与派对`);
  if (!/^Food crawls & dining:/.test(o.highlights[1])) problems.push(`${city.slug}: 第 2 条不是美食探索`);
  if (!/^Hiking & city walks:/.test(o.highlights[2])) problems.push(`${city.slug}: 第 3 条不是户外徒步与城市漫步`);
  return { ...city, blurb: o.blurb, highlights: o.highlights };
});

console.log(`城市数：${out.length}`);
console.log('\n=== 三类活动覆盖自检 ===');
for (const c of out) {
  console.log(`  ${c.slug.padEnd(12)} social=${/^Social mixers & parties:/.test(c.highlights[0]) ? '✓' : '✗'} food=${/^Food crawls & dining:/.test(c.highlights[1]) ? '✓' : '✗'} outdoor=${/^Hiking & city walks:/.test(c.highlights[2]) ? '✓' : '✗'}  | 共 ${c.highlights.length} 条`);
}

if (problems.length) {
  console.log('\n❌ 自检不通过：');
  problems.forEach((p) => console.log('   ' + p));
  process.exit(1);
}
console.log('\n✓ 自检通过：14 城均含三类活动，各 6 条 highlights');

if (!WRITE) {
  console.log('\n（dry-run，未落盘。加 --write 才会写入）');
  process.exit(0);
}

// ---- 落盘 1：generated/cities.json ----
fs.writeFileSync(genPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`\n✓ 已写入 ${path.relative(root, genPath)}`);

// ---- 落盘 2：cities.js 的 LOCAL_CITIES 兜底（保持与 generated 逐字一致）----
const jsPath = path.join(root, 'src', 'data', 'cities.js');
const js = fs.readFileSync(jsPath, 'utf8');

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const block = out
  .map((c) => {
    const lines = [];
    lines.push('  {');
    lines.push(`    slug: ${q(c.slug)},`);
    lines.push(`    name: ${q(c.name)},`);
    lines.push(`    province: ${q(c.province)},`);
    if (c.priority) lines.push('    priority: true,');
    if (c.tagline) lines.push(`    tagline: ${q(c.tagline)},`);
    lines.push(`    blurb: ${q(c.blurb)},`);
    lines.push('    highlights: [');
    c.highlights.forEach((h) => lines.push(`      ${q(h)},`));
    lines.push('    ],');
    lines.push(`    livingNote: ${q(c.livingNote)},`);
    lines.push('  },');
    return lines.join('\n');
  })
  .join('\n');

const start = js.indexOf('const LOCAL_CITIES = [');
const endMarker = '\n];\n';
const end = js.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.error('❌ 找不到 LOCAL_CITIES 数组边界，未改 cities.js');
  process.exit(1);
}
const rebuilt =
  js.slice(0, start) + 'const LOCAL_CITIES = [\n' + block + '\n' + js.slice(end + 1);
fs.writeFileSync(jsPath, rebuilt, 'utf8');
console.log(`✓ 已写入 ${path.relative(root, jsPath)}（LOCAL_CITIES 兜底）`);
