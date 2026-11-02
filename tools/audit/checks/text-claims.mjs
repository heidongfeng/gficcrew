// Method 2 — copy-versus-data cross-check.
//
// The data-invariants check proves the data is internally consistent. It cannot prove
// the prose agrees with it. Sentences like "and 11 more cities" or "submit the join
// form on this website" live in free text, pass every structural assertion, and reach
// the user as straightforwardly wrong statements.
//
// So the approach here is different: build a corpus of every sentence the site can show
// (source strings + rendered pages), extract the checkable claims out of it, and verify
// each claim against the data it is describing.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readText, fail, warn, pass, loadDist, loadData, visibleText, collectStrings } from '../_util.mjs';

const acorn = createRequire(import.meta.url)('acorn');

export const id = 'text-claims';
export const name = '文案与数据核对（城市数量 / 价格 / 微信 / 已下线功能 / 主权表述）';

export async function run() {
  const out = [];
  const D = await loadData();
  const { CITIES, PLANS, SITE, FAQ, GUIDES, GUANGZHOU, SCHEMA } = D;
  const cityNames = CITIES.map((c) => c.name);
  const cityCount = CITIES.length;

  // --- corpus ---------------------------------------------------------------
  const corpus = [];
  const fromData = [
    ['FAQ', FAQ],
    ['cities', CITIES],
    ['site', SITE],
    ['plans', PLANS],
    ['guides', GUIDES],
    ['guangzhou', GUANGZHOU],
  ];
  for (const [label, val] of fromData) {
    for (const { text, path } of collectStrings(val)) {
      if (text.trim().length > 12) corpus.push({ src: `src/data ${label}.${path}`, text });
    }
  }
  for (const dir of ['dist-global', 'dist-cn']) {
    for (const page of loadDist(dir)) {
      const t = visibleText(page.html);
      if (t) corpus.push({ src: `${dir}${page.urlPath}`, text: t });
    }
  }
  out.push(pass('文案语料已收集', `${corpus.length} 段文本（源数据 + 两个构建产物）`));

  // --- 1. city-count claims -------------------------------------------------
  // Collected per sentence and merged across sources, so one wrong sentence that ships
  // in the source data and in both builds is reported once with three origins.
  const countG = grouper();
  for (const { src, text } of corpus) {
    for (const sentence of splitSentences(text)) {
      const named = cityNames.filter((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(sentence)).length;

      // "…and 11 more cities" — the named cities plus N must equal the real total.
      const more = /and\s+(\d+)\s+more\s+cities?\b/i.exec(sentence);
      if (more) {
        const n = +more[1];
        if (named && named + n !== cityCount) {
          countG.add(
            `点名 ${named} 个城市 + 另有 ${n} 个 = ${named + n} 个，实际只有 ${cityCount} 个，应为「and ${cityCount - named} more cities」｜${sentence}`,
            src,
          );
        }
        continue;
      }

      // Site-wide total: "14 cities across China", "14 city chapters".
      const total = /(\d+)\s+(?:Chinese\s+)?city\s+chapters?\b|(\d+)\s+(?:Chinese\s+)?cities\s+(?:across|in)\b/i.exec(sentence);
      if (total && /across China|across the country|city chapters/i.test(sentence)) {
        const n = +(total[1] || total[2]);
        if (n !== cityCount) countG.add(`声称 ${n} 个城市，实际 ${cityCount} 个｜${sentence}`, src);
        continue;
      }

      // "…Beijing, Shanghai, … and 14 cities." — names cities and then appends a
      // total-looking number with no "more", so it reads as names + N.
      const andTotal = /and\s+(\d+)\s+cities\b/i.exec(sentence);
      if (andTotal && named >= 2) {
        countG.add(
          `先点名 ${named} 个城市再写「and ${andTotal[1]} cities」，读起来是 ${named}+${andTotal[1]} 个；要表达总数应写「and ${cityCount - named} more cities」｜${sentence}`,
          src,
        );
      }
    }
  }
  const countFindings = countG.list();
  out.push(
    countFindings.length
      ? fail(
          `城市数量的文案与数据对不上（${countFindings.length} 句话、${countFindings.reduce((n, f) => n + f.srcs.length, 0)} 个出处）`,
          '',
          countFindings.flatMap((f) => [`${f.msg}`, ...f.srcs.map((s) => `      ↳ ${s}`)]),
        )
      : pass('所有城市数量表述与 CITIES 一致', `基线 ${cityCount}`),
  );

  // --- 2. price claims ------------------------------------------------------
  const planByRmb = new Map(PLANS.map((p) => [p.price, p]));
  const priceG = grouper();
  for (const { src, text } of corpus) {
    for (const m of text.matchAll(/RMB\s*([\d,]+)\s*\(\s*USD\s*(\d+)\s*\)/gi)) {
      const rmb = +m[1].replace(/,/g, '');
      const usd = +m[2];
      const plan = planByRmb.get(rmb);
      if (!plan) priceG.add(`文案出现 RMB ${rmb}（USD ${usd}），但 PLANS 里没有这个价位`, src);
      else if (plan.usd !== usd) priceG.add(`RMB ${rmb} 在 PLANS 里对应 USD ${plan.usd}，文案写成 USD ${usd}`, src);
    }
  }
  const priced = new Set(
    corpus.flatMap(({ text }) => [...text.matchAll(/RMB\s*([\d,]+)\s*\(\s*USD\s*(\d+)\s*\)/gi)].map((m) => `${+m[1].replace(/,/g, '')}/${+m[2]}`)),
  );
  for (const p of PLANS) {
    if (!priced.has(`${p.price}/${p.usd}`)) priceG.add(`PLANS 档位 RMB ${p.price}（USD ${p.usd}，${p.id}）在全站文案里没有出现`, 'src/data plans');
  }
  const priceFindings = priceG.list();
  out.push(
    priceFindings.length
      ? fail(
          `人民币/美元价格对不上或漏写（${priceFindings.length} 处）`,
          '',
          priceFindings.flatMap((f) => [f.msg, ...f.srcs.map((s) => `      ↳ ${s}`)]),
        )
      : pass('价格表述与 PLANS 完全一致', PLANS.map((p) => `RMB ${p.price}=USD ${p.usd}`).join(' / ')),
  );

  // --- 3. wechat handle -----------------------------------------------------
  const handle = SITE.wechat;
  const badHandles = new Set();
  for (const { src, text } of corpus) {
    for (const m of text.matchAll(/\b[A-Z]{2,4}\d{3,}\b/g)) {
      if (m[0] !== handle) badHandles.add(`${m[0]}（应为 ${handle}）  [${src}]`);
    }
  }
  out.push(
    badHandles.size
      ? fail('文案里出现非公开微信号', '', [...badHandles].slice(0, 10))
      : pass('全站只出现一个微信号', handle),
  );

  // --- 4. claims about features that no longer exist ------------------------
  // The public site collects nothing: the only <form> in either build is the /admin/
  // password gate. Any copy telling a visitor to fill in a form or open an account is
  // describing a site that no longer exists.
  const publicForms = [];
  for (const dir of ['dist-global', 'dist-cn']) {
    for (const page of loadDist(dir)) {
      if (page.urlPath.startsWith('/admin')) continue;
      if (/<form\b/i.test(page.html)) publicForms.push(`${dir}${page.urlPath}`);
    }
  }
  const retiredRe = [
    [/submit (?:the )?(?:join|sign-?up|registration|application) form/i, '要求用户「提交站内表单」'],
    [/create a (?:free )?account on this website/i, '要求用户「在本站创建账号」'],
    [/(?:use|fill in|fill out) the (?:contact|join|sign-?up) form on this website/i, '指向站内表单'],
    [/we confirm by email/i, '承诺邮件确认（站内无此流程）'],
  ];
  const retired = grouper();
  for (const { src, text } of corpus) {
    for (const sentence of splitSentences(text)) {
      for (const [re, label] of retiredRe) {
        if (re.test(sentence)) retired.add(`${label}｜${sentence}`, src);
      }
    }
  }
  const retiredFindings = retired.list();
  out.push(
    publicForms.length
      ? fail('公开页面出现了 <form>', publicForms.join(', '))
      : pass('公开页面 0 个表单', '全站唯一 <form> 是 /admin/ 的口令闸（两个产物各 1 个）'),
  );
  out.push(
    retiredFindings.length
      ? fail(
          `文案仍在描述已下线的功能（${retiredFindings.length} 句话、${retiredFindings.reduce((n, f) => n + f.srcs.length, 0)} 个出处）`,
          'account.astro 已注明「Retired page: there are no member accounts」，join.astro 写明改为微信加好友，站内没有可提交的表单',
          retiredFindings.flatMap((f) => [f.msg, ...f.srcs.map((s) => `      ↳ ${s}`)]),
        )
      : pass('没有指向已下线功能的文案'),
  );

  // --- 5. sovereignty wording ----------------------------------------------
  // Plain city mentions (high-speed rail to Hong Kong) are normal travel copy. The
  // problem is only phrasing that groups them with countries.
  const sovRe = [
    [/\b(?:Hong Kong|Macao|Macau|Taiwan)\b(?!\s*,\s*China\b)/i, '港澳台缺少 ", China" 后缀'],
    [/(?:countries|nations)\s*(?:like|such as|including|:)[^.]{0,80}(Hong Kong|Taiwan|Macao|Macau)/i, '把港澳台与国家并列'],
    [/(Hong Kong|Taiwan|Macao|Macau)[^.]{0,80}\b(?:and other countries|and other nations)\b/i, '把港澳台与国家并列'],
    [/\b(?:Hong Kong|Taiwan|Macao|Macau)\s*,\s*(?:Japan|Korea|Thailand|Vietnam|Singapore|Malaysia)\b/i, '把港澳台与国家并列成列表'],
  ];
  const sov = grouper();
  for (const { src, text } of corpus) {
    for (const sentence of splitSentences(text)) {
      for (const [re, label] of sovRe) if (re.test(sentence)) sov.add(`${label}｜${sentence}`, src);
    }
  }
  const sovFindings = sov.list();
  out.push(
    sovFindings.length
      ? fail('港澳台表述可能被读成独立国家', '', sovFindings.flatMap((f) => [f.msg, ...f.srcs.map((s) => `      ↳ ${s}`)]))
      : pass('未发现把港澳台与国家并列的表述', '仅作为目的地城市出现'),
  );

  // --- 5b. copy defects that must not regress --------------------------------
  const quality = grouper();
  const qualityRe = [
    [/\bwith and\b/i, '孤儿连词 with and'],
    [/\bcenterd\b/i, '拼写错误 centerd（应为 centred/centered）'],
    [/GFIC Crew\s+GFIC歪果社/i, '品牌名重复 GFIC'],
  ];
  for (const { src, text } of corpus) {
    for (const sentence of splitSentences(text)) {
      for (const [re, label] of qualityRe) if (re.test(sentence)) quality.add(`${label}｜${sentence}`, src);
    }
  }
  const qualityFindings = quality.list();
  out.push(
    qualityFindings.length
      ? fail(`发现已知文案硬伤（${qualityFindings.length} 处）`, '', qualityFindings.flatMap((f) => [f.msg, ...f.srcs.map((s) => `      ↳ ${s}`)]))
      : pass('已知语法、拼写与品牌名硬伤均未回归'),
  );

  // --- 6. the hand-written fallbacks ---------------------------------------
  // Everything above reads the *effective* data: loadData() applies generated-first, so
  // SITE.description and FAQ come out of src/data/generated/*.json and the defaults in the
  // sibling .js files are never inspected at all. That is exactly where stale copy survives
  // -- invisible at render time, and the site the moment the generated snapshot goes missing.
  //
  // Three such strings were live on 2026-10-04 and every rendered page was clean, which is
  // why nothing caught them: site.js still said "and 14 cities" (reads as 19), faq.js still
  // said "and 11 more cities", and one FAQ answer still told the visitor to "Create a free
  // account on this website ... submit the sign-up form. We confirm by email" -- an account,
  // a form and an email flow the site retired.
  //
  // Literals come out of the AST, not off the raw file text: on raw text these regexes run
  // across `',\n  },\n  {` boundaries and flag code as if it were copy.
  const fbG = grouper();
  const fallbackLits = [];
  {
    const dir = path.join(ROOT, 'src', 'data');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      const code = readText(path.join(dir, f));
      if (!code) continue;
      let ast;
      try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
      } catch (e) {
        fbG.add(`兜底模块无法解析：${e.message}`, `src/data ${f}`);
        continue;
      }
      walkAst(ast, (n) => {
        if (n.type === 'Literal' && typeof n.value === 'string' && n.value.trim().length > 12) {
          fallbackLits.push({ src: `src/data ${f}（兜底默认值）`, text: n.value });
        }
      });
    }
  }

  for (const { src, text } of fallbackLits) {
    for (const sentence of splitSentences(text)) {
      const named = cityNames.filter((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(sentence)).length;

      const more = /and\s+(\d+)\s+more\s+cities?\b/i.exec(sentence);
      if (more) {
        const n = +more[1];
        if (named && named + n !== cityCount) {
          fbG.add(
            `兜底文案：点名 ${named} 个城市 + 另有 ${n} 个 = ${named + n} 个，实际 ${cityCount} 个，应为「and ${cityCount - named} more cities」｜${sentence}`,
            src,
          );
        }
        continue;
      }

      const andTotal = /and\s+(\d+)\s+cities\b/i.exec(sentence);
      if (andTotal && named >= 2) {
        fbG.add(`兜底文案：点名 ${named} 个城市再写「and ${andTotal[1]} cities」，读起来是 ${named}+${andTotal[1]} 个｜${sentence}`, src);
      }

      for (const [re, label] of retiredRe) {
        if (re.test(sentence)) fbG.add(`兜底文案仍在描述已下线的功能（${label}）｜${sentence}`, src);
      }

      for (const m of sentence.matchAll(/RMB\s*([\d,]+)\s*\(\s*USD\s*(\d+)\s*\)/gi)) {
        const rmb = +m[1].replace(/,/g, '');
        const plan = planByRmb.get(rmb);
        if (plan && plan.usd !== +m[2]) {
          fbG.add(`兜底文案：RMB ${rmb} 在 PLANS 里对应 USD ${plan.usd}，文案写成 USD ${m[2]}`, src);
        }
      }
    }
  }
  const fbFindings = fbG.list();
  out.push(
    fbFindings.length
      ? fail(
          `代码兜底文案与数据不一致（${fbFindings.length} 处）`,
          'generated 优先，这些字符串当前不会渲染；但 generated 快照一旦缺失，它们就是线上文案。改云端或 generated 时必须同步改 src/data/*.js 的默认值',
          fbFindings.flatMap((f) => [f.msg, ...f.srcs.map((s) => `      ↳ ${s}`)]),
        )
      : pass('代码兜底文案与数据一致', `${fallbackLits.length} 条兜底字符串，0 处不一致`),
  );

  return out;
}

// --- helpers ---------------------------------------------------------------

/**
 * Collects findings keyed by message so the same sentence appearing in source data and
 * in both build outputs is reported once, with its origins listed underneath.
 */
function grouper() {
  const map = new Map();
  return {
    add(msg, src) {
      if (!map.has(msg)) map.set(msg, new Set());
      map.get(msg).add(src);
    },
    list() {
      return [...map.entries()].map(([msg, srcs]) => ({ msg, srcs: [...srcs].sort() }));
    },
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Split into sentences, keeping it forgiving about the abbreviations the copy uses. */
function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z“"‘']|\d)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

const dedupe = (list) => [...new Set(list)];

/**
 * Keys holding child nodes. acorn ships no walker, so this doubles as the traversal spec.
 * `declaration` carries the subtree of an export and is the one that matters here: without
 * it every `export const X = [...]` is skipped and the fallback scan sees nothing at all --
 * which would report a clean result rather than an error, the worst possible failure mode.
 */
const CHILD_KEYS = [
  'body', 'declarations', 'declaration', 'init', 'expression', 'callee', 'arguments',
  'left', 'right', 'consequent', 'alternate', 'handler', 'block', 'param', 'params',
  'object', 'property', 'value', 'elements', 'properties', 'test', 'update', 'argument',
  'quasi', 'expressions', 'element', 'source', 'specifiers', 'local', 'imported',
  'attributes', 'superClass', 'decorators', 'directives', 'id', 'key', 'tag', 'labels', 'cases',
];

function walkAst(ast, visit) {
  const stack = [ast];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const key of CHILD_KEYS) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i -= 1) if (v[i] && typeof v[i].type === 'string') stack.push(v[i]);
      } else if (v && typeof v.type === 'string') {
        stack.push(v);
      }
    }
  }
}
