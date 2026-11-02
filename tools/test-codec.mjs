// Round-trip check for the guide plain-text codecs, run against the real Guangzhou guide.
//   node tools/test-codec.mjs
import { GUIDE_SECTIONS, GUIDE_FAQ } from '../src/data/guangzhou.js';
import { codecToText, codecFromText } from '../src/scripts/guide-codec.js';

let failures = 0;
const check = (name, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures += 1;
};

// ---- sections ----
const secText = codecToText(GUIDE_SECTIONS, 'sections');
const secBack = codecFromText(secText, 'sections');

check('sections 条数一致', secBack.length === GUIDE_SECTIONS.length, `${secBack.length}/${GUIDE_SECTIONS.length}`);
check(
  '每段标题一致',
  secBack.every((s, i) => s.title === GUIDE_SECTIONS[i].title),
);
check(
  '每段 id 一致',
  secBack.every((s, i) => s.id === GUIDE_SECTIONS[i].id),
);
check(
  '每段段落数一致',
  secBack.every((s, i) => s.paragraphs.length === GUIDE_SECTIONS[i].paragraphs.length),
  secBack.map((s) => s.paragraphs.length).join(','),
);
check(
  '每段段落文字完全一致',
  secBack.every((s, i) => s.paragraphs.every((p, j) => p === GUIDE_SECTIONS[i].paragraphs[j])),
);
check(
  '列表项一致',
  secBack.every(
    (s, i) => (s.list || []).length === (GUIDE_SECTIONS[i].list || []).length &&
      (s.list || []).every((l, j) => l === GUIDE_SECTIONS[i].list[j]),
  ),
  secBack.map((s) => (s.list || []).length).join(','),
);
check('二次往返稳定', codecToText(secBack, 'sections') === secText);

// ---- faq ----
const faqText = codecToText(GUIDE_FAQ, 'faq');
const faqBack = codecFromText(faqText, 'faq');
check('faq 条数一致', faqBack.length === GUIDE_FAQ.length, `${faqBack.length}/${GUIDE_FAQ.length}`);
check('faq 问题一致', faqBack.every((x, i) => x.q === GUIDE_FAQ[i].q));
check('faq 答案一致', faqBack.every((x, i) => x.a === GUIDE_FAQ[i].a));
check('faq 二次往返稳定', codecToText(faqBack, 'faq') === faqText);

// ---- 手写输入 ----
const hand = codecFromText(
  '## 标题一\n\n第一段。\n第二段还没分段。\n\n新的一段。\n\n- 列表一\n- 列表二\n\n## 标题二 | my-id\n\n只有一段。',
  'sections',
);
check('手写：解析出 2 段', hand.length === 2, JSON.stringify(hand.map((s) => s.id)));
check('手写：第一段 2 个段落', hand[0].paragraphs.length === 2, JSON.stringify(hand[0].paragraphs));
check('手写：第二段 1 个段落', hand[1].paragraphs.length === 1);
check('手写：列表 2 项', (hand[0].list || []).length === 2);
check('手写：自定义 id 保留', hand[1].id === 'my-id');
check('手写：段落内的换行被合并', hand[0].paragraphs[0] === '第一段。 第二段还没分段。');
check('手写：无 id 时自动 slug', hand[0].id.length > 0, hand[0].id);

const handFaq = codecFromText('Q: 问？\nA: 答。\n\nQ: 第二个问题？\nA: 第二个答案。', 'faq');
check('手写 FAQ：2 条', handFaq.length === 2);
check('手写 FAQ：内容正确', handFaq[1].q === '第二个问题？' && handFaq[1].a === '第二个答案。');

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
console.log('\n--- 正文章节纯文本预览（前 600 字）---\n');
console.log(secText.slice(0, 600));
console.log('\n--- 指南 FAQ 纯文本预览（前 300 字）---\n');
console.log(faqText.slice(0, 300));
process.exit(failures === 0 ? 0 : 1);
