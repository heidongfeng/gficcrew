// Method 9 — static analysis of client-side code.
//
// The client scripts are the only part of this project with real imperative logic:
// admin.astro alone is 3,000 lines of DOM wiring, and guide-codec.js converts between
// plain text and JSON in both directions. None of it is covered by the build, because a
// bundler only cares that the code is syntactically valid, not that it is correct —
// and it will happily drop a shadowed import rather than complain.
//
// The AST comes from acorn (already in node_modules via Astro) rather than regexes:
// scope shadowing, whether a catch is genuinely empty, and whether a promise chain
// terminates are all things a regex cannot see.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, rel, fail, warn, pass, walk, parseHtml, findAll, attr, rawTextOf } from '../_util.mjs';

export const id = 'client-static';
export const name = '客户端脚本静态分析（语法 / 重复声明 / 未用导入 / 空 catch / innerHTML / Promise）';

const require = createRequire(import.meta.url);
const acorn = require('acorn');

/**
 * Keys holding child nodes. acorn ships no walker, so this doubles as the traversal spec.
 *
 * Two entries are easy to miss and both cause silent under-traversal: `local` carries the
 * bound identifier of an import specifier, and `declaration` carries the subtree of an
 * export. Omitting them makes every default import look unused.
 */
const CHILD_KEYS = [
  'body', 'declarations', 'declaration', 'init', 'expression', 'callee', 'arguments',
  'left', 'right', 'consequent', 'alternate', 'handler', 'block', 'param', 'params',
  'object', 'property', 'value', 'elements', 'properties', 'test', 'update', 'argument',
  'quasi', 'expressions', 'element', 'source', 'specifiers', 'local', 'imported',
  'attributes', 'superClass', 'decorators', 'directives', 'id', 'key', 'tag', 'labels', 'cases',
];

export async function run() {
  const out = [];
  const sources = collectSources();
  const skippedTs = walk(path.join(ROOT, 'src'), (p) => p.endsWith('.ts')).map(rel);
  out.push(
    pass(
      '客户端脚本已收集',
      `${sources.length} 个内联脚本 / JS 模块${skippedTs.length ? `（另有 ${skippedTs.length} 个 .ts 未纳入：acorn 不解析 TypeScript）` : ''}`,
    ),
  );

  const syntaxErrors = [];
  const duplicateFindings = [];
  const unusedImports = [];
  const emptyCatch = [];
  const htmlSinks = [];
  const loosePromises = [];
  const storageKeys = new Map();
  const unresolvedKeys = [];
  for (const src of sources) {
    const comments = [];
    // Report against the real file, not against the extracted fragment.
    const absLine = (node) => node.loc.start.line + (src.lineOffset || 0);
    let ast;
    try {
      ast = acorn.parse(src.code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments });
    } catch (err) {
      const msg = err.message.split('\n')[0];
      syntaxErrors.push(`${src.label}：${msg}`);
      const dup = /Identifier '([^']+)' has already been declared/.exec(msg);
      if (dup) {
        const name = dup[1];
        const importLine = findLine(src.code, new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`), src.lineOffset || 0);
        const declLine = findLine(src.code, new RegExp(`^\\s*(?:export\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`, 'm'), src.lineOffset || 0);
        duplicateFindings.push(
          `${src.label}：「${name}」被重复声明` +
            (importLine ? `，${importLine}` : '') +
            (declLine ? `，${declLine}` : '') +
            ' — 打包器会静默丢掉被遮蔽的 import，所以线上能跑，但这个脚本块本身不是合法 JS',
        );
      }
      continue;
    }

    // Constants holding storage keys, so `localStorage.getItem(THEME_KEY)` is resolvable.
    const consts = new Map();
    walkAst(ast, (node) => {
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init?.type === 'Literal' && typeof node.init.value === 'string') {
        consts.set(node.id.name, node.init.value);
      }
    });

    // One interprocedural hop, so a helper that already swallows its own errors is not
    // reported as a loose promise. selfCheck() in admin.astro is the case that forced this:
    // it is `async` and wraps everything in try/catch, returning a discriminated result, so
    // it cannot reject — a purely local reading of `selfCheck().then(…)` cannot see that.
    const guardedFns = new Set();
    const noteGuarded = (name, fnNode) => {
      const body = fnNode?.body;
      if (!name) return;
      const stmts = body?.type === 'BlockStatement' ? body.body : body ? [body] : [];
      if (stmts.some((s) => s.type === 'TryStatement')) guardedFns.add(name);
    };
    walkAst(ast, (node) => {
      if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') noteGuarded(node.id.name, node);
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && /Function(Expression)?$/.test(node.init?.type || '')) {
        noteGuarded(node.id.name, node.init);
      }
    });

    walkAst(ast, (node, ancestors) => {
      if (node.type === 'ImportDeclaration') {
        for (const spec of node.specifiers) {
          const local = spec.local.name;
          if (countUses(ast, local) === 0) {
            unusedImports.push(`${src.label} 导入了 ${local}（来自 ${node.source.value}）但全文未使用`);
          }
        }
      }

      if (node.type === 'CatchClause') {
        const stmts = node.body.body || [];
        const isEmpty = !stmts.length || stmts.every((s) => s.type === 'EmptyStatement');
        if (isEmpty) {
          const documented = comments.some((c) => c.loc.start.line >= node.loc.start.line && c.loc.end.line <= node.loc.end.line);
          emptyCatch.push({ where: `${src.label} 第 ${absLine(node)} 行 catch`, documented });
        }
      }

      if (node.type === 'AssignmentExpression' && /^(innerHTML|outerHTML)$/.test(memberName(node.left))) {
        const tainted = interpolationNames(node.right);
        if (tainted.length) htmlSinks.push(`${src.label} 第 ${absLine(node)} 行 ${memberName(node.left)} 拼入了变量 ${tainted.slice(0, 5).join(', ')}`);
      }
      if (node.type === 'CallExpression' && memberName(node.callee) === 'insertAdjacentHTML') {
        const tainted = interpolationNames(node.arguments[1]);
        if (tainted.length) htmlSinks.push(`${src.label} 第 ${absLine(node)} 行 insertAdjacentHTML 拼入变量 ${tainted.slice(0, 5).join(', ')}`);
      }

      // A .then() is only safe if the chain ends in .catch(), or lives inside a try, or
      // its result is awaited. Anything else turns a rejection into silence.
      if (node.type === 'CallExpression' && memberName(node.callee) === 'then') {
        // `x.then(…)` has a MemberExpression callee, so the guarded callee is the *object*
        // of that member, not the callee itself — `selfCheck().then(…)` is CallExpression
        // -> MemberExpression(.then) -> object = CallExpression(selfCheck).
        const obj = node.callee.object;
        const calleeGuarded =
          (node.callee.type === 'Identifier' && guardedFns.has(node.callee.name)) ||
          (node.callee.type === 'MemberExpression' &&
            obj?.type === 'CallExpression' &&
            obj.callee?.type === 'Identifier' &&
            guardedFns.has(obj.callee.name));
        const guarded =
          calleeGuarded ||
          ancestors.some((a) => a.type === 'TryStatement') ||
          ancestors.some((a) => a.type === 'CallExpression' && memberName(a.callee) === 'catch') ||
          ancestors.some((a) => a.type === 'AwaitExpression') ||
          ancestors.some((a) => a.type === 'ReturnStatement');
        if (!guarded) loosePromises.push(`${src.label} 第 ${absLine(node)} 行 .then(...) 既没有 .catch，也不在 try 里，结果也没被 await`);
      }

      // --- storage keys --------------------------------------------------
      // Keys are often held in a constant (THEME_KEY = 'gfic_admin_theme'), so the
      // literal alone is not enough. sessionStorage and localStorage have separate
      // namespaces, and an admin key in sessionStorage is a deliberate choice: it
      // survives a reload but not a tab close.
      if (node.type === 'CallExpression' && /^(local|session)Storage\.(get|set|remove)Item$/.test(memberName(node.callee))) {
        const [store, op] = memberName(node.callee).split('.');
        const key = resolveString(node.arguments[0], consts);
        if (key) {
          if (!storageKeys.has(key)) storageKeys.set(key, new Set());
          storageKeys.get(key).add(`${src.file}（${store}.${op}）`);
        } else {
          unresolvedKeys.push(`${src.label} 第 ${absLine(node)} 行 ${store}.${op}Item 的键不是可静态解析的字符串`);
        }
      }
    });
  }

  out.push(
    syntaxErrors.length
      ? fail(
          `有 ${syntaxErrors.length} 个脚本无法解析为合法 ES 模块`,
          '直接解析这些文件会报错；目前只有经过打包器时才被容忍',
          syntaxErrors,
        )
      : pass('全部脚本可作为 ES 模块解析', `${sources.length} 个`),
  );
  out.push(
    duplicateFindings.length
      ? fail(`有 ${duplicateFindings.length} 处标识符重复声明`, '', duplicateFindings)
      : pass('没有 import 与本地声明同名的冲突'),
  );
  if (syntaxErrors.length) {
    out.push(
      warn(
        `有 ${syntaxErrors.length} 个脚本因解析失败未参与后续分析`,
        '未使用导入、空 catch、innerHTML、Promise、存储键这些结论都没有覆盖到它们 —— 这是解析失败的实际代价',
        syntaxErrors.map((e) => e.split('：')[0]),
      ),
    );
  }
  out.push(
    unusedImports.length
      ? warn(`有 ${unusedImports.length} 个未使用的导入`, '', unusedImports.slice(0, 12))
      : pass('没有未使用的导入'),
  );

  const undocumented = emptyCatch.filter((c) => !c.documented);
  out.push(
    undocumented.length
      ? fail(
          `有 ${undocumented.length} 处 catch 静默吞错且无注释`,
          '失败会无声消失，用户看不到任何反馈，也违背「任何失败都要有可见反馈」的项目约定',
          undocumented.map((c) => c.where),
        )
      : pass(
          'catch 都不会静默失败',
          emptyCatch.length ? `${emptyCatch.length} 处空 catch 均带注释说明` : '没有空 catch',
        ),
  );
  out.push(
    htmlSinks.length
      ? warn(`有 ${htmlSinks.length} 处把变量拼进 innerHTML`, '若变量来自用户输入或云端返回，需确认已转义', htmlSinks.slice(0, 12))
      : pass('没有把变量拼进 innerHTML 的写法'),
  );
  out.push(
    loosePromises.length
      ? warn(`有 ${loosePromises.length} 条 Promise 链缺少兜底`, '', loosePromises.slice(0, 12))
      : pass('Promise 链都有兜底'),
  );

  const keys = [...storageKeys.entries()];
  if (keys.length) {
    out.push(
      pass(
        'Web Storage 键位清单',
        keys.map(([k, ops]) => `${k} ⇐ ${[...ops].join(' + ')}`).join('；'),
      ),
    );
    // localStorage and sessionStorage are separate namespaces, so a repeated key name
    // across the two is not a collision; two files in the *same* namespace is.
    const collisions = [];
    for (const [k, ops] of keys) {
      const byStore = new Map();
      for (const op of ops) {
        const file = op.split('（')[0];
        const store = op.split('.')[1]?.split('）')[0] || '';
        const namespace = op.includes('sessionStorage') ? 'session' : 'local';
        if (!byStore.has(namespace)) byStore.set(namespace, new Set());
        byStore.get(namespace).add(file);
      }
      for (const [ns, files] of byStore) if (files.size > 1) collisions.push(`${k}（${ns}）被 ${[...files].join(' 和 ')} 同时读写`);
    }
    out.push(
      collisions.length
        ? warn('有键被多个文件在同一命名空间内读写', '同键不同用途会互相覆盖', collisions)
        : pass('同一命名空间内没有键被多个文件共用'),
    );
  } else {
    out.push(warn('没有检测到 Web Storage 使用'));
  }
  out.push(
    unresolvedKeys.length
      ? warn(`有 ${unresolvedKeys.length} 处存储键无法静态解析`, '', unresolvedKeys.slice(0, 8))
      : pass('存储键全部可静态解析'),
  );

  // --- the shipped bundles must parse -------------------------------------
  const builtErrors = [];
  let builtCount = 0;
  for (const dist of ['dist-global', 'dist-cn']) {
    const dir = path.join(ROOT, dist, '_astro');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      builtCount += 1;
      try {
        acorn.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
      } catch (e) {
        builtErrors.push(`${dist}/_astro/${f}：${e.message.split('\n')[0]}`);
      }
    }
  }
  out.push(builtErrors.length ? fail('产物中的 JS 有语法错误', '', builtErrors) : pass('产物中的 JS 全部可解析', `${builtCount} 个文件`));

  return out;
}

// --- helpers ---------------------------------------------------------------

function collectSources() {
  const sources = [];
  for (const file of walk(path.join(ROOT, 'src'), (p) => p.endsWith('.astro'))) {
    const tree = parseHtml(fs.readFileSync(file, 'utf8'));
    let i = 0;
    for (const s of findAll(tree, 'script')) {
      const type = (attr(s, 'type') || '').toLowerCase();
      if (type === 'application/json' || type === 'application/ld+json') continue;
      if (attr(s, 'src')) continue;
      // rawTextOf, not textOf: collapsing whitespace would turn every `//` comment into a
      // comment that runs to the end of the script, and the parse would still succeed.
      const code = rawTextOf(s);
      if (!code) continue;
      i += 1;
      // An inline script's line 1 is the line its <script> tag sits on, so findings can be
      // reported against the .astro file instead of against a fragment nobody can locate.
      const startLine = s.sourceCodeLocation?.startLine ?? 1;
      sources.push({
        file: rel(file),
        label: `${rel(file)} script#${i}`,
        code,
        lineOffset: startLine - 1,
      });
    }
  }
  for (const file of walk(path.join(ROOT, 'src'), (p) => p.endsWith('.js'))) {
    sources.push({ file: rel(file), label: rel(file), code: fs.readFileSync(file, 'utf8'), lineOffset: 0 });
  }
  return sources;
}

/** Depth-first traversal that carries the ancestor chain, which is what makes
 *  "is this promise inside a try?" answerable. */
function walkAst(ast, visit) {
  const stack = [{ node: ast, ancestors: [] }];
  while (stack.length) {
    const { node, ancestors } = stack.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node, ancestors);
    const next = ancestors.concat(node);
    for (const key of CHILD_KEYS) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i -= 1) if (v[i] && typeof v[i].type === 'string') stack.push({ node: v[i], ancestors: next });
      } else if (v && typeof v.type === 'string') {
        stack.push({ node: v, ancestors: next });
      }
    }
  }
}

function countUses(ast, name) {
  let n = 0;
  walkAst(ast, (node, ancestors) => {
    if (node.type === 'Identifier' && node.name === name && !ancestors.some((a) => a.type === 'ImportSpecifier')) n += 1;
  });
  return n;
}

function memberName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const obj = memberName(node.object);
    const prop = node.computed ? (node.property.value ?? '') : memberName(node.property);
    return obj ? `${obj}.${prop}` : String(prop);
  }
  if (node.type === 'ThisExpression') return 'this';
  return '';
}

function interpolationNames(node) {
  const names = new Set();
  const collect = (n) => {
    if (!n) return;
    if (n.type === 'Identifier') names.add(n.name);
    else if (n.type === 'CallExpression') collect(n.callee);
    else if (n.type === 'MemberExpression') collect(n.object);
    else if (n.type === 'ConditionalExpression') {
      collect(n.consequent);
      collect(n.alternate);
    } else if (n.type === 'LogicalExpression') {
      collect(n.left);
      collect(n.right);
    }
  };
  const visit = (n) => {
    if (!n) return;
    if (n.type === 'TemplateLiteral') n.expressions.forEach(collect);
    else if (n.type === 'BinaryExpression' && n.operator === '+') {
      visit(n.left);
      visit(n.right);
    } else collect(n);
  };
  visit(node);
  return [...names].filter((n) => !['undefined', 'null', 'true', 'false', 'this'].includes(n));
}

/** Resolve a node to a string, following one level of `const NAME = 'literal'`. */
function resolveString(node, consts) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'Identifier' && consts && consts.has(node.name)) return consts.get(node.name);
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis.map((q) => q.value.cooked).join('');
  return null;
}

/** 'line 12: import { slugify } from …' — enough to point a human at the spot. */
function findLine(code, re, offset = 0) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i])) return `第 ${i + 1 + offset} 行「${lines[i].trim().slice(0, 70)}」`;
  }
  return '';
}
