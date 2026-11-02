/**
 * Regression test for the AI-answer brand verdict in src/pages/admin.astro.
 *
 * The constants and the scoring function are not copied here on purpose — they are sliced
 * out of the real page and evaluated, so this test cannot silently drift away from the code
 * it is supposed to guard. If a rename breaks the extraction the test fails loudly instead
 * of passing on a stale duplicate.
 *
 * Run: node scripts/test-brand-probe.mjs        (exit 0 = all pass)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'src/pages/admin.astro'), 'utf8');

/** Slice a balanced `[ ... ]` / `{ ... }` literal starting at `marker`. */
function sliceBalanced(src, marker, open, close) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const start = src.indexOf(open, at);
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced literal after: ${marker}`);
}

/** Slice a `const X = ...;` statement. None of the regexes below contain a semicolon. */
function sliceStatement(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const semi = src.indexOf(';', at);
  if (semi < 0) throw new Error(`no terminator after: ${marker}`);
  return src.slice(at, semi + 1);
}

const parts = [
  sliceStatement(SRC, 'const BRAND_RE ='),
  sliceBalanced(SRC, 'const WATCHLIST =', '[', ']') + ';',
  sliceBalanced(SRC, 'const CN_CITIES =', '[', ']') + ';',
  sliceStatement(SRC, 'const countCities ='),
  sliceBalanced(SRC, 'const BRAND_STRONG =', '[', ']') + ';',
  sliceBalanced(SRC, 'const BRAND_GENERIC =', '[', ']') + ';',
  sliceBalanced(SRC, 'const FOREIGN_ENTITY =', '[', ']') + ';',
  sliceStatement(SRC, 'const RELIGIOUS_WORD_RE ='),
  sliceStatement(SRC, 'const NOT_RELIGIOUS_RE ='),
  sliceStatement(SRC, 'const HEDGE_RE ='),
  sliceBalanced(SRC, 'function analyseAnswers(results) {', '{', '}'),
];

const harness = `
  const sentenceAround = (text, idx) => (idx < 0 ? '' : text.slice(Math.max(0, idx - 40), idx + 40));
  ${parts.join('\n')}
  return { analyseAnswers, BRAND_STRONG, BRAND_GENERIC, FOREIGN_ENTITY, HEDGE_RE, BRAND_RE, CN_CITIES };
`;

const { analyseAnswers, BRAND_STRONG, BRAND_GENERIC, FOREIGN_ENTITY, HEDGE_RE, BRAND_RE, CN_CITIES } =
  new Function(harness)();

// The exact answer from the live run that started all this. Verbatim.
const REAL_FAILURE =
  'In an expat/church context, **GFIC Crew** is almost certainly the young-adults group of ' +
  '**Grace Family International Church (GFIC)**, a Guangzhou-based English-speaking church. ' +
  '"Crew" = roughly the **18–35** community: worship, Bible study, discipleship and social events. ' +
  "It's organized mainly through **WeChat** — search \"**GFIC Crew**\" or " +
  '"**Grace Family International Church**" for the current meeting time and venue. ' +
  "If your reference isn't from a church, check the acronym inside that specific group, as names vary.";

// The rule that shipped before this change, reproduced only to show what it used to say.
// Both halves are the old constants — old facts list AND old (narrower) hedge list. Using the
// new hedge list here would understate the bug: the old code did not know "almost certainly"
// was a hedge, which is exactly why the church answer came back as 真认识.
const OLD_BRAND_FACTS = [
  /歪果社/, /DN8117/i, /\bexpat/i, /foreigner|外国人|老外|在华/,
  /广州|Guangzhou/i, /社群|community|social/i, /会员|membership/i, /活动|events|meetup/i,
];
const OLD_HEDGE_RE =
  /通常是|通常指|一般来说|应该是一个|可能是|可能是一个|大概|大致|推测|不确定|无法确认|据我所知|不是很有名|没有公开|未找到|not\s+sure|likely|probably|typically|generally\s+refers|I\s+do\s?n'?t\s+have|no\s+information|couldn'?t\s+find|not\s+familiar|as\s+of\s+my\s+knowledge|unclear|is\s+not\s+widely/i;
const oldVerdict = (a) =>
  OLD_HEDGE_RE.test(a) ? 'guessed' : OLD_BRAND_FACTS.filter((re) => re.test(a)).length >= 3 ? 'known' : 'wrong';

const score = (answer, kind = 'brand') =>
  analyseAnswers([{ id: 't', kind, q: kind === 'brand' ? 'What is GFIC Crew?' : 'Where to meet expats in Guangzhou?', answer }])[0];

const CASES = [
  {
    why: '真实失败样本（截图那条）：被认成 Grace Family International Church',
    answer: REAL_FAILURE,
    expect: 'wrong',
    expectEntity: /Grace Family/i,
  },
  {
    why: '通用词堆砌、无 hedge、无实锤 —— 旧规则算「认识」，现在必须算不认识',
    answer: 'GFIC Crew is an expat social community based in Guangzhou with events and membership for foreigners.',
    expect: 'wrong',
    expectEntity: null,
  },
  {
    why: '真认识：说出我们独有的事实（中文名 + 微信 + 价格 + 城市清单）',
    answer:
      'GFIC Crew（GFIC歪果社）是一个在华外国人社交社群，覆盖 Guangzhou、Shanghai、Beijing、Shenzhen、Chengdu 等 14 城，' +
      '终身会员 RMB 288 / 688 / 2888，微信 DN8117。',
    expect: 'known',
  },
  {
    why: '措辞在推断（likely / not sure）',
    answer: 'GFIC Crew is likely a Guangzhou expat community; I am not sure what the acronym stands for.',
    expect: 'guessed',
  },
  {
    why: '同一条教会答案但问的是中文 —— 中文探测也要能判出来',
    answer: 'GFIC 指广州的 Grace Family International Church，一个英文教会，有 worship 和 Bible study。',
    expect: 'wrong',
    expectEntity: /Grace Family/i,
  },
  {
    why: '正常答案里否认宗教，不能误杀',
    answer:
      'GFIC Crew（GFIC歪果社）不是教会，是一个在华外国人社交社群，覆盖 Guangzhou、Shanghai、Beijing、Shenzhen、Chengdu 五城以上，' +
      '微信 DN8117，会员 RMB 288 起。',
    expect: 'known',
  },
  {
    why: '普通探测题不受品牌判定影响（kind=discovery）',
    answer: 'GFIC Crew is a social community in Guangzhou.',
    kind: 'discovery',
    expectBrand: null,
  },
  {
    why: '只说宗教语境、没点名具体机构 —— 也要判答偏并指出被认成教会',
    answer: 'GFIC Crew is the young-adults group of a Guangzhou-based English-speaking church.',
    expect: 'wrong',
    expectEntity: /church/i,
  },
  {
    why: '句尾带一句否定，但通篇在讲教会 —— 不能被那一句否定洗白',
    answer:
      'GFIC Crew is almost certainly the young-adults group of Grace Family International Church in Guangzhou, ' +
      'with worship and Bible study. It is not affiliated with a student club.',
    expect: 'wrong',
    expectEntity: /Grace Family/i,
  },
];

let fail = 0;
console.log('— 从 admin.astro 实际切出来的常量 —');
console.log(`  品牌名正则   ${BRAND_RE}`);
console.log(`  城市词表     ${CN_CITIES.length} 条`);
console.log(`  强特征       ${BRAND_STRONG.length} 条：${BRAND_STRONG.map((f) => f.label).join(' / ')}`);
console.log(`  通用词       ${BRAND_GENERIC.length} 条：${BRAND_GENERIC.map((f) => f.label).join(' / ')}`);
console.log(`  误认机构     ${FOREIGN_ENTITY.length} 条：${FOREIGN_ENTITY.map((f) => f.name).join(' / ')}`);
console.log('');
console.log('— 用例 —');
for (const c of CASES) {
  const row = score(c.answer, c.kind || 'brand');
  const ok = c.expectBrand === null ? row.brand === null : row.brand === c.expect;
  const entityOk = !c.expectEntity || c.expectEntity.test(row.brandEntity || '');
  const noEntityOk = c.expectEntity === null ? !row.brandEntity : true;
  const pass = ok && entityOk && noEntityOk;
  if (!pass) fail += 1;
  console.log(`${pass ? '✅' : '❌'} ${c.why}`);
  console.log(`     现在判定 = ${row.brand}   状态 = "${row.status.label}"`);
  if (row.kind === 'brand') {
    console.log(`     判定依据 = ${row.brandEntity ? '被认成 ' + row.brandEntity : row.brandFacts.length ? row.brandFacts.join('、') : '无（只有通用词 ' + (row.brandGeneric || []).join('、') + '）'}`);
    console.log(`     旧规则会给 = ${oldVerdict(c.answer)}`);
  }
}
console.log('');
console.log(fail ? `❌ ${fail} 个用例未通过` : '✅ 全部通过');
process.exit(fail ? 1 : 0);
