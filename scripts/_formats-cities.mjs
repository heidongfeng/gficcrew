/**
 * 把 13 个城市页改成与广州一致的口径。
 *
 * 为什么做：广州之外的城市还停在旧版本上，有两个问题同时存在。
 *   1. highlights 沿用被替换掉的旧三分类（Social mixers / Food crawls / Hiking & city walks），
 *      与这次的十类 Tier 排序对不上；
 *   2. blurb 里写着 "Our X crew runs..." / "Expect hotpot nights..." 这类第一人称承诺，
 *      等于对外宣称我们在 13 座城市都有分部在办活动 —— 与「广深线下 + 全国线上群」矛盾。
 *
 * 改法：照已发布的广州条目。blurb 讲真实的城市事实，明确线下只在广深，其余城市从全国线上群进来；
 * highlights 换成 Tier 视角 + 该城市真实地理/饮食/地形信息，不再出现"我们办"。
 *
 * 用法：node scripts/_formats-cities.mjs [--write]
 *   不带 --write 只自检（命中数、双端是否同步）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const JS_FILE = path.join(ROOT, 'src', 'data', 'cities.js');
const JSON_FILE = path.join(ROOT, 'src', 'data', 'generated', 'cities.json');

const IN_PERSON = 'the crew meets in person in Guangzhou and Shenzhen';

// 每个城市：新的 blurb 与 6 条 highlights。
// 排序口径来自 src/data/site.js 的 FORMATS：Tier 1 前三（酒吧 / 美食 / 语言交换）优先。
const N = [
  {
    name: 'Shanghai',
    tagline: 'China’s most international city — the biggest expat crowd and the widest choice of things to do.',
    blurb: 'Shanghai has the largest expat community in mainland China, plus the widest choice of international restaurants, bars and professional networks, most of them concentrated in Jing’an, Xuhui and Huangpu. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Shanghai city chat. When people do meet up on our ten formats, the ones at the top of the list are the easy ones: bar nights, food crawls and language exchange.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: rooftop bars along the Bund and through the old French Concession',
      'Tier 1 · food crawls: street stalls and noodle shops in the old lanes, then Shanghainese dishes and tasting menus',
      'Tier 1 · language exchange: the hardest city in China to get daily Mandarin practice, because English works everywhere',
      'Tier 2 · sports, hiking and culture: riverside runs, weekend trips to Hangzhou and Suzhou, and gallery afternoons',
      'Tier 3 · games, holidays and brunch: the strongest Western holiday calendar anywhere in the country',
      'English is spoken more widely here than anywhere else on this list',
    ],
  },
  {
    name: 'Beijing',
    tagline: 'History, hutongs and the Great Wall within reach.',
    blurb: 'Beijing is where Chinese history is most accessible: hutongs, temples and several Great Wall sections are all within a day trip, and Chaoyang and Dongcheng have been the established expat districts for decades. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Beijing city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: Sanlitun and the houhai bar streets, the longest-established expat nightlife in the country',
      'Tier 1 · food crawls: Peking duck, hutong snack streets and skewers in the Muslim-style quarters',
      'Tier 1 · language exchange: plenty of locals who want English practice, and Mandarin closer to the standard you hear on the news',
      'Tier 2 · sports, hiking and culture: Great Wall sections within reach, temple-park walks and calligraphy workshops',
      'Tier 3 · games, holidays and brunch: museum and art-district weekends, especially around 798',
      'The embassy areas in Chaoyang have shaped the city’s international scene for decades',
    ],
  },
  {
    name: 'Shenzhen',
    tagline: 'Tech energy, coastline and the youngest crowd in the Pearl River Delta.',
    blurb: 'Shenzhen is China’s tech hub and one of its youngest cities, and most residents moved here from somewhere else, which makes people unusually open to meeting new arrivals. It is the second city where the crew meets in person, alongside Guangzhou. The same ten formats start here: bar nights, seafood and night-market food crawls, and language exchange for people who have just landed.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: Nanshan and Futian, close to Hong Kong and used to international crowds',
      'Tier 1 · food crawls: Cantonese seafood, night-market stalls and hotpot',
      'Tier 1 · language exchange: heavy demand from both sides, locals in tech and newcomers who have just arrived',
      'Tier 2 · sports, hiking and culture: coastal trails, Wutong Mountain and day trips out to Dapeng',
      'Tier 3 · games, holidays and brunch: board-game nights and coffee meetups suit a city this transient',
      'Mandarin dominates, though Cantonese is still heard in the older districts',
    ],
  },
  {
    name: 'Chengdu',
    blurb: 'Chengdu runs at a slower pace than the coastal cities, and its teahouses, mahjong tables and Sichuan food are local institutions rather than tourist attractions. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Chengdu city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: a dense, cheap nightlife centred on the city centre and the river',
      'Tier 1 · food crawls: Sichuan hotpot, skewers and dumplings, arguably the strongest regional food scene on this list',
      'Tier 1 · language exchange: locals are curious about newcomers and slower to switch into English',
      'Tier 2 · sports, hiking and culture: teahouse afternoons, mahjong lessons and day hikes on Qingcheng Mountain',
      'Tier 3 · games, holidays and brunch: the cafe scene suits a low-commitment first meetup',
      'Panda base trips and the Leshan Giant Buddha are the standard errand when friends visit',
    ],
  },
  {
    name: 'Hangzhou',
    blurb: 'Hangzhou has West Lake, tea hills on the edge of the city and a tech scene that keeps pulling newcomers in, so the crowd here skews young and recently arrived. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Hangzhou city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: lakeside bars and the strips along the river near the CBD',
      'Tier 1 · food crawls: Hangzhou-style dishes and the noodle shops tucked into the old streets',
      'Tier 1 · language exchange: plenty of locals who came for tech work and want English practice',
      'Tier 2 · sports, hiking and culture: running and cycling loops around West Lake, the tea hills above it, and tea-ceremony workshops',
      'Tier 3 · games, holidays and brunch: an easy city for a low-key first coffee',
      'Close enough to Shanghai that the two scenes overlap on weekends',
    ],
  },
  {
    name: 'Chongqing',
    blurb: 'Chongqing is a vertical city of hotpot, fog and river views, where getting around often means stairs rather than blocks. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Chongqing city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: nightlife spread across Jiefangbei and along the riverfront',
      'Tier 1 · food crawls: Chongqing hotpot and the small-noodle shops the city runs on',
      'Tier 1 · language exchange: fewer English speakers than Shanghai, so Mandarin practice goes further',
      'Tier 2 · sports, hiking and culture: stair climbs, hillside walks and karst country out at Wulong',
      'Tier 3 · games, holidays and brunch: night-view photography walks suit this skyline better than most',
      'River cruises on the Yangtze and Jialing are the standard introduction to the city',
    ],
  },
  {
    name: 'Suzhou',
    blurb: 'Suzhou trades on classical gardens, canals and water towns, and sits at the centre of a large international manufacturing community just outside Shanghai. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Suzhou city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: garden-side and canal-side drinking, plus the bar streets in the industrial park',
      'Tier 1 · food crawls: Jiangnan dishes, river crab in season and the old-town snack streets',
      'Tier 1 · language exchange: plenty of demand from engineers and their families, alongside Shanghainese-accented Mandarin',
      'Tier 2 · sports, hiking and culture: lakeside cycling, silk workshops and calligraphy sessions',
      'Tier 3 · games, holidays and brunch: brunch around Jinji Lake is where most first meetings happen',
      'Under half an hour from Shanghai by high-speed rail, so the two scenes overlap heavily',
    ],
  },
  {
    name: 'Qingdao',
    blurb: 'Qingdao has beaches, German-era architecture and the Tsingtao brewery, and fills up with visitors every summer. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Qingdao city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: beach bars and beer halls, including the brewery itself',
      'Tier 1 · food crawls: seafood, street stalls and the night markets running along the coast',
      'Tier 1 · language exchange: a smaller expat pool, which tends to make friendships form faster',
      'Tier 2 · sports, hiking and culture: coastal hikes, Laoshan day trips and old-town walks through the former concession',
      'Tier 3 · games, holidays and brunch: summer carries most of the social year here',
      'Winters are colder than most southern cities, so the calendar thins out after October',
    ],
  },
  {
    name: 'Xi’an',
    blurb: 'Xi’an pairs the Terracotta Army and a walkable Ming-era city wall with one of the strongest street-food quarters in the country. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Xi’an city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: the bar streets inside and just beside the city wall',
      'Tier 1 · food crawls: Muslim Quarter street food, roujiamo and hand-pulled noodles',
      'Tier 1 · language exchange: Mandarin here is close to the standard taught in textbooks',
      'Tier 2 · sports, hiking and culture: walking the city wall, Mount Hua day trips and Tang-dynasty sites',
      'Tier 3 · games, holidays and brunch: courtyard cafes make a quiet place for a first conversation',
      'The centre is compact, so crossing town rarely takes long',
    ],
  },
  {
    name: 'Tianjin',
    blurb: 'Tianjin sits about half an hour from Beijing by high-speed rail, with European-style concessions along the Haihe and a port that keeps pulling in international businesses. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Tianjin city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: concession-era streets and riverside bars along the Haihe',
      'Tier 1 · food crawls: Tianjin breakfast, street stalls and Bohai seafood',
      'Tier 1 · language exchange: the local dialect is famously far from textbook Mandarin',
      'Tier 2 · sports, hiking and culture: riverside walks, concession architecture walks and trips into the northern hills',
      'Tier 3 · games, holidays and brunch: close enough to Beijing that the two overlap socially',
      'A cheaper base than Beijing for people working across both cities',
    ],
  },
  {
    name: 'Xiamen',
    blurb: 'Xiamen is an island city of mild weather, seafood and a creative crowd, with a largely pedestrian centre that makes meeting up straightforward. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Xiamen city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: beachfront bars and the old-villa lanes on Gulangyu',
      'Tier 1 · food crawls: Fujian seafood, night markets and the local peanut-soup breakfasts',
      'Tier 1 · language exchange: Minnan dialect dominates at home, Mandarin is what you use out',
      'Tier 2 · sports, hiking and culture: coastal cycling along Huandao Road and day trips inland to the tulou',
      'Tier 3 · games, holidays and brunch: the cafe culture is established enough to plan a whole day around',
      'Typhoon season aside, people can meet outdoors most of the year',
    ],
  },
  {
    name: 'Guilin',
    blurb: 'Guilin trades on karst mountains and the Li River, and draws teachers, photographers and remote workers looking for somewhere slower. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Guilin city chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: small bar streets around the pedestrian centre',
      'Tier 1 · food crawls: Guilin rice noodles, river fish and the night markets',
      'Tier 1 · language exchange: fewer English speakers, so a little Mandarin goes a long way',
      'Tier 2 · sports, hiking and culture: karst hikes, Li River trips and the cormorant-fishing villages',
      'Tier 3 · games, holidays and brunch: photography walks make more sense here than most formats',
      'Yangshuo downriver is where most of the outdoor options actually are',
    ],
  },
  {
    name: 'Yunnan (Kunming, Dali, Lijiang)',
    blurb: 'Yunnan covers three bases at once — Kunming, Dali and Lijiang — with spring-like weather, minority cultures and one of the strongest remote-work communities in the country. ' + cap(IN_PERSON) + ', so members here join the national online groups and the Yunnan chat.',
    highlights: [
      'Tier 1 · bar nights and pub crawls: Kunming nightlife and the old-town bars in Dali',
      'Tier 1 · food crawls: crossing-the-bridge noodles, wild mushrooms and street skewers',
      'Tier 1 · language exchange: plenty of locals speak a minority language first and Mandarin second',
      'Tier 2 · sports, hiking and culture: Erhai cycling, Jade Dragon Snow Mountain and towns on the old tea-horse road',
      'Tier 3 · games, holidays and brunch: festival parties, since the local calendar here is packed with them',
      'Dali is small enough that people run into each other without planning to',
    ],
  },
];

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * 在 cities.js 里按「城市块」作用域替换，而不是全文件找字符串。
 * 多个城市共用同一条 highlight（比如 9 个城市都写了
 * 'Language exchange and cultural workshops'），全文件替换会改错条目。
 */
function patchCityJs(text, slug, oldCity, newCity) {
  const anchor = `slug: '${slug}',`;
  const start = text.indexOf(anchor);
  if (start === -1) return { text, error: `找不到 ${anchor}` };
  const next = text.indexOf('slug: \'', start + anchor.length);
  const end = next === -1 ? text.length : next;
  let block = text.slice(start, end);

  const swap = (oldStr, newStr, label) => {
    const needle = `'${oldStr}'`;
    const hits = block.split(needle).length - 1;
    if (hits !== 1) return `  ${slug} 的${label}在块内出现 ${hits} 次（应为 1）：${needle.slice(0, 60)}`;
    block = block.replace(needle, () => `'${newStr}'`);
    return null;
  };

  let err = swap(oldCity.blurb, newCity.blurb, 'blurb');
  if (!err && oldCity.tagline && newCity.tagline) err = swap(oldCity.tagline, newCity.tagline, 'tagline');
  if (!err) {
    for (let i = 0; i < oldCity.highlights.length && !err; i += 1) {
      err = swap(oldCity.highlights[i], newCity.highlights[i], `第 ${i + 1} 条 highlight`);
    }
  }
  if (err) return { text, error: err };
  return { text: text.slice(0, start) + block + text.slice(end), error: null };
}

// ---------------------------------------------------------------- 数据层
const gen = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
let jsText = fs.readFileSync(JS_FILE, 'utf8');

// 改之前留一份快照：cities.js 的替换要靠旧字符串精确定位。
const OLD = new Map(
  gen.map((c) => [c.name, { blurb: c.blurb, highlights: [...(c.highlights || [])], tagline: c.tagline }]),
);

const problems = [];
let done = 0;
let skipped = 0;

const BAN = [
  /Social mixers & parties/i,
  /Food crawls & dining/i,
  /Hiking & city walks/i,
  /our (shanghai|beijing|shenzhen|chengdu|hangzhou|chongqing|suzhou|qingdao|xi.?an|tianjin|xiamen|guilin|yunnan) crew/i,
  /our crew/i,
  /\bwe run\b/i,
  /\bExpect \b/i,
  /regularly hosts/i,
];

for (const patch of N) {
  const city = gen.find((c) => c.name === patch.name);
  if (!city) {
    problems.push(`generated/cities.json 里没有 ${patch.name}`);
    continue;
  }
  const already =
    city.blurb === patch.blurb &&
    JSON.stringify(city.highlights) === JSON.stringify(patch.highlights);
  if (already) {
    skipped += 1;
    continue;
  }

  // 1) generated JSON：整体替换
  city.blurb = patch.blurb;
  city.highlights = patch.highlights;
  if (patch.tagline) city.tagline = patch.tagline;

  // 2) cities.js：按城市块作用域替换
  const res = patchCityJs(jsText, city.slug, OLD.get(patch.name), {
    blurb: patch.blurb,
    highlights: patch.highlights,
    tagline: patch.tagline || OLD.get(patch.name).tagline,
  });
  if (res.error) {
    problems.push(res.error);
    continue;
  }
  jsText = res.text;
  done += 1;
}

// ---------------------------------------------------------------- 改写后自检
const leftovers = [];
for (const c of gen) {
  const haystack = [c.blurb, ...(c.highlights || [])].join(' | ');
  for (const re of BAN) {
    if (re.test(haystack)) leftovers.push(`${c.name}: ${haystack.match(re)[0]}`);
  }
}
if (leftovers.length) {
  console.log('\n❌ 改完仍有旧口径残留：');
  leftovers.forEach((l) => console.log('   ✗ ' + l));
  process.exit(1);
}
const langs = ['Guangzhou', 'Shenzhen'].every((n) =>
  (gen.find((c) => c.name === n) || {}).blurb?.includes('meets in person'),
);
if (!langs) problems.push('广州/深圳的 blurb 里没有「线下见面」的表述');
const others = gen.filter((c) => c.name !== 'Guangzhou' && c.name !== 'Shenzhen');
const notAnchored = others.filter((c) => !c.blurb.includes('online groups'));
if (notAnchored.length) problems.push('以下城市没有说明从线上群进来：' + notAnchored.map((c) => c.name).join(', '));
const shortHighlights = gen.filter((c) => (c.highlights || []).length !== 6);
if (shortHighlights.length) problems.push('以下城市 highlights 不是 6 条：' + shortHighlights.map((c) => c.name).join(', '));

// ---------------------------------------------------------------- 写入
console.log(`待改 ${N.length} 个城市 ｜ 本次改写 ${done} ｜ 已是新口径 ${skipped}`);
if (problems.length) {
  console.log('\n❌ 有问题：');
  problems.forEach((p) => console.log('   ✗ ' + p));
  process.exit(1);
}

if (WRITE) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(gen, null, 2) + '\n', 'utf8');
  fs.writeFileSync(JS_FILE, jsText, 'utf8');
  console.log('\n已写入两端');
} else {
  console.log('（dry-run，加 --write 才写）');
}
