// Method 10 — property tests on the pure functions.
//
// guide-codec.js is the one piece of logic in this project that is both pure and
// load-bearing: the admin edits guide sections and FAQ entries as plain text, converts
// them to JSON to store, and converts them back to text on the next open. A defect here
// does not throw — it quietly eats a paragraph or reshuffles an entry on every save.
//
// Assertions on hand-picked examples would not find that. These are properties: they must
// hold for *every* input, and the inputs are generated, including adversarial ones.
import { fail, warn, pass, loadData, ROOT } from '../_util.mjs';
import path from 'node:path';

export const id = 'pure-functions';
export const name = '纯函数性质测试（编解码往返 / slug 幂等 / 模糊输入不崩）';

export async function run() {
  const out = [];
  // checks/ → audit/ → tools/ → 项目根
  const codec = await import(new URL('../../../src/scripts/guide-codec.js', import.meta.url).href);
  const { slugify, sectionId, codecToText, codecFromText } = codec;
  const D = await loadData();

  const failures = [];

  // --- 1. slug properties ---------------------------------------------------
  const samples = [
    'Guangzhou Expat Living Guide',
    '   Leading and trailing   ',
    'Visa — Housing & Banking!',
    '医生与医院',
    '🏠 Housing',
    '----',
    '',
    'a'.repeat(300),
    'MixedCASE with_underscores and   spaces',
    '123 456',
    '研究：跨文化沟通（第一辑）',
  ];
  for (const s of samples) {
    const a = slugify(s);
    if (typeof a !== 'string') failures.push(`slugify(${JSON.stringify(s.slice(0, 30))}) 返回了非字符串`);
    else {
      if (/^-|-$/.test(a)) failures.push(`slugify(${JSON.stringify(s.slice(0, 30))}) 结果首尾带连字符：${a}`);
      if (/[^a-z0-9-]/.test(a)) failures.push(`slugify(${JSON.stringify(s.slice(0, 30))}) 结果含非 [a-z0-9-] 字符：${a}`);
      if (a.length > 80) failures.push(`slugify(${JSON.stringify(s.slice(0, 30))}) 超过 80 字符：${a.length}`);
      if (slugify(a) !== a) failures.push(`slugify 不幂等：${a} → ${slugify(a)}`);
    }
  }
  out.push(
    failures.length
      ? fail('slugify 违反基本性质', '', failures.slice(0, 12))
      : pass('slugify 输出合法、≤80 字符、且幂等', `${samples.length} 个样本`),
  );

  // --- 2. sectionId must never be empty ------------------------------------
  // slugify strips non-ASCII, so a Chinese heading yields ''. sectionId is supposed to
  // fall back to a stable hash; if that fallback ever regresses, every Chinese section
  // gets an empty anchor and they all collapse onto one id.
  const emptyIds = samples.filter((s) => s.trim() && !sectionId(s)).map((s) => JSON.stringify(s.slice(0, 30)));
  out.push(
    emptyIds.length
      ? fail('sectionId 对非空标题返回空串', '', emptyIds)
      : pass('sectionId 对任何非空标题都返回非空 id', `含中文与 emoji 样本`),
  );
  const idSamples = samples.filter((s) => s.trim()).map((s) => sectionId(s));
  const dupIds = idSamples.filter((v, i) => idSamples.indexOf(v) !== i);
  out.push(
    dupIds.length
      ? fail('sectionId 生成重复 id', '', [...new Set(dupIds)])
      : pass('sectionId 在不同标题间不重复', `${idSamples.length} 个`),
  );

  // --- 3. round-trips on the real data -------------------------------------
  const guide = D.GUIDES[0];
  const rtFails = [];

  if (guide?.sections?.length) {
    const text = codecToText(guide.sections, 'sections');
    const back = codecFromText(text, 'sections');
    if (back.length !== guide.sections.length) rtFails.push(`sections 条数变了：${guide.sections.length} → ${back.length}`);
    guide.sections.forEach((s, i) => {
      const b = back[i];
      if (!b) return;
      if (b.title !== s.title) rtFails.push(`第 ${i + 1} 段标题变了：「${s.title}」→「${b.title}」`);
      if (b.id !== s.id) rtFails.push(`第 ${i + 1} 段锚点变了：${s.id} → ${b.id}`);
      const inParas = (s.paragraphs || []).join(' ').replace(/\s+/g, ' ').trim();
      const outParas = (b.paragraphs || []).join(' ').replace(/\s+/g, ' ').trim();
      if (inParas !== outParas) rtFails.push(`第 ${i + 1} 段正文不一致（${inParas.length} → ${outParas.length} 字符）`);
      const inList = (s.list || []).length;
      const outList = (b.list || []).length;
      if (inList !== outList) rtFails.push(`第 ${i + 1} 段列表项数变了：${inList} → ${outList}`);
    });
  }
  if (guide?.faq?.length) {
    const text = codecToText(guide.faq, 'faq');
    const back = codecFromText(text, 'faq');
    if (back.length !== guide.faq.length) rtFails.push(`faq 条数变了：${guide.faq.length} → ${back.length}`);
    guide.faq.forEach((f, i) => {
      const b = back[i];
      if (!b) return;
      if (b.q.replace(/\s+/g, ' ').trim() !== f.q.replace(/\s+/g, ' ').trim()) rtFails.push(`第 ${i + 1} 条问题不一致：「${f.q.slice(0, 40)}」→「${(b.q || '').slice(0, 40)}」`);
      if (b.a.replace(/\s+/g, ' ').trim() !== f.a.replace(/\s+/g, ' ').trim()) rtFails.push(`第 ${i + 1} 条答案不一致（${f.a.length} → ${(b.a || '').length} 字符）`);
    });
  }
  // Everything on the public site that can hold sections/faq, not just the first guide
  for (const [label, arr, kind] of [
    ['GUIDES[0].sections', D.GUIDES[0]?.sections, 'sections'],
    ['广州指南 faq', D.GUANGZHOU?.faq, 'faq'],
  ]) {
    if (!Array.isArray(arr) || !arr.length) continue;
    const text = codecToText(arr, kind);
    const back = codecFromText(text, kind);
    if (back.length !== arr.length) rtFails.push(`${label} 往返后条数变了：${arr.length} → ${back.length}`);
  }
  out.push(
    rtFails.length
      ? fail(`真实数据经「数据 → 文本 → 数据」往返后发生变化（${rtFails.length} 处）`, '后台每次保存都会走这条路径，不一致意味着内容被静默改动', rtFails.slice(0, 15))
      : pass('真实数据编解码往返无损', `sections ${guide?.sections?.length ?? 0} 段 / faq ${guide?.faq?.length ?? 0} 条`),
  );

  // --- 4. text round-trip stability ---------------------------------------
  // Text → data → text must be a fixed point: opening a guide in the admin and saving it
  // without editing must not rewrite the text box.
  const textFails = [];
  for (const kind of ['sections', 'faq']) {
    const canonical =
      kind === 'faq'
        ? 'Q: How much is membership?\nA: RMB 288, one time.\n\nQ: Is it refundable?\nA: Yes, within a week.'
        : '## Housing | housing\n\nRent is paid monthly.\n\n- Deposit: one month\n- Agent fee: half a month\n\n## Banking\n\nOpen an account with your passport.';
    const once = codecToText(codecFromText(canonical, kind), kind);
    const twice = codecToText(codecFromText(once, kind), kind);
    if (once !== twice) textFails.push(`${kind}：文本 → 数据 → 文本 不是不动点，第二次转换结果不同`);
  }
  out.push(
    textFails.length
      ? warn('编解码在文本形式上不是不动点', '每次打开再保存都会重写文本框内容（数据未必错，但会产生无关 diff）', textFails)
      : pass('文本 → 数据 → 文本 是不动点', '未编辑时保存不会产生额外改动'),
  );

  // --- 5. fuzz: never throw, never lose the entry count --------------------
  const rand = mulberry32(20261004);
  const alphabet = ['#', 'Q:', 'A:', '|', '-', '*', '\n', '\r\n', ' ', '\t', '中文', '🏠', '```', '<script>', '\\', '"', '{{}}'];
  const fuzzFails = [];
  for (let i = 0; i < 400; i += 1) {
    let s = '';
    const n = Math.floor(rand() * 40);
    for (let j = 0; j < n; j += 1) s += alphabet[Math.floor(rand() * alphabet.length)];
    for (const kind of ['sections', 'faq', 'unknown']) {
      try {
        const parsed = codecFromText(s, kind);
        if (!Array.isArray(parsed)) fuzzFails.push(`codecFromText(${JSON.stringify(s.slice(0, 25))}, '${kind}') 返回非数组`);
        codecToText(parsed, kind);
      } catch (e) {
        fuzzFails.push(`codecFromText(${JSON.stringify(s.slice(0, 25))}, '${kind}') 抛错：${e.message.slice(0, 60)}`);
      }
      if (fuzzFails.length > 8) break;
    }
    if (fuzzFails.length > 8) break;
  }
  out.push(
    fuzzFails.length
      ? fail('模糊输入让编解码抛错或返回非数组', '', fuzzFails)
      : pass('400 组模糊输入下编解码不抛错、始终返回数组', '含 ## / Q: / 表格 / 脚本片段 / 中文'),
  );

  // --- 6. FAQ codec must not silently drop questions ------------------------
  // A "Q:" line without a matching "A:" is the realistic mistake a human makes while
  // editing; it should either survive or be visibly wrong, not vanish.
  const qOnly = 'Q: Will this be dropped?\n\nQ: Real question\nA: Real answer';
  const parsedQOnly = codecFromText(qOnly, 'faq');
  out.push(
    parsedQOnly.some((x) => /Will this be dropped/.test(x.q))
      ? pass('只有问题没有答案的条目会被保留', `解析出 ${parsedQOnly.length} 条`)
      : warn(
          '只有问题、没有答案的条目会被静默丢弃',
          `「Q: Will this be dropped?」在解析结果里找不到（共解析出 ${parsedQOnly.length} 条）；编辑时漏写 A: 行会导致该条无声消失`,
        ),
  );

  return out;
}

/** Deterministic PRNG so a fuzz failure is reproducible from the seed alone. */
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
