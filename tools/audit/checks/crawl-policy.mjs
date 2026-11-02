// Method 8 — crawl policy (robots.txt) invariants.
//
// robots.txt matching is "the most specific user-agent group wins", and a crawler matches
// exactly one group — it does not merge with `*`. That asymmetry makes an innocent-looking
// pattern dangerous: writing
//
//     User-agent: *
//     Disallow: /admin/
//
//     User-agent: GPTBot
//     Allow: /
//
// does not "add" GPTBot to the wildcard's rules, it *replaces* them, and GPTBot may now
// crawl /admin/. The more crawlers you name in order to be friendly, the more of them lose
// the restrictions. So this check asserts the property that actually matters: every group
// that grants access must carry the same restrictions as the wildcard group.
import { fail, warn, pass, loadDist, readText } from '../_util.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../_util.mjs';

export const id = 'crawl-policy';
export const name = 'robots.txt 策略（命名分组不得丢失通配限制 / 变体方向 / sitemap 声明）';

export async function run() {
  const out = [];
  const dists = ['dist-global', 'dist-cn'].filter((d) => fs.existsSync(path.join(ROOT, d, 'robots.txt')));
  if (!dists.length) return [warn('没有 robots.txt 可检查', '先跑 npm run build')];

  for (const dist of dists) {
    const text = readText(path.join(ROOT, dist, 'robots.txt'));
    const groups = parseRobots(text);
    const wildcard = groups.find((g) => g.agents.includes('*'));
    const wildcardDisallows = wildcard ? wildcard.rules.filter((r) => r.type === 'disallow' && r.path) : [];

    // --- the core invariant ------------------------------------------------
    if (!wildcard) {
      out.push(fail(`${dist}/robots.txt 没有 User-agent: * 分组`, '', ['没有兜底分组时，未列名的爬虫无规则可循']));
    } else {
      const offenders = [];
      for (const g of groups) {
        if (g.agents.includes('*')) continue;
        const allows = g.rules.some((r) => r.type === 'allow' && r.path === '/');
        const disallowsAll = g.rules.some((r) => r.type === 'disallow' && r.path === '/');
        if (!allows || disallowsAll) continue; // a group that blocks everything has nothing to lose
        const own = new Set(g.rules.filter((r) => r.type === 'disallow').map((r) => r.path));
        const lost = wildcardDisallows.filter((r) => !own.has(r.path)).map((r) => r.path);
        if (lost.length) offenders.push(`${g.agents.join(', ')} 丢掉了 ${lost.join('、')}`);
      }
      out.push(
        offenders.length
          ? fail(
              `${dist}/robots.txt 有 ${offenders.length} 个命名分组丢失了通配分组的 Disallow`,
              'robots 规则是「最具体分组胜出」而非合并：一旦单独命名某爬虫，该爬虫就不再继承 User-agent: * 的限制',
              offenders.slice(0, 8),
            )
          : pass(`${dist}/robots.txt 每个命名分组都保留了通配分组的限制`, `通配 Disallow：${wildcardDisallows.map((r) => r.path).join('、') || '无'}`),
      );
    }

    // --- contradictory rules ----------------------------------------------
    const contradictions = [];
    for (const g of groups) {
      const allow = new Set(g.rules.filter((r) => r.type === 'allow').map((r) => r.path));
      for (const r of g.rules) {
        if (r.type === 'disallow' && allow.has(r.path)) contradictions.push(`${g.agents.join(', ')} 对 ${r.path} 同时 Allow 与 Disallow`);
      }
    }
    out.push(contradictions.length ? warn(`${dist}/robots.txt 存在自相矛盾的规则`, '', contradictions) : pass(`${dist}/robots.txt 无自相矛盾规则`));

    // --- sitemap declaration ----------------------------------------------
    const smLine = /^Sitemap:\s*(\S+)\s*$/im.exec(text);
    out.push(
      smLine
        ? pass(`${dist}/robots.txt 声明了 sitemap`, smLine[1])
        : warn(`${dist}/robots.txt 没有 Sitemap: 行`, '', ['搜索引擎将只能靠默认位置猜测']),
    );

    // --- variant direction -------------------------------------------------
    if (dist === 'dist-cn') {
      const gb = groups.find((g) => g.agents.some((a) => /^googlebot$/i.test(a)));
      const blocked = gb && gb.rules.some((r) => r.type === 'disallow' && r.path === '/');
      out.push(
        blocked
          ? pass('.cn 变体正确拒绝 Googlebot')
          : fail('.cn 变体没有拒绝 Googlebot', '', ['两个域名同内容，双站收录只会产生重复内容']),
      );
      const baidu = groups.find((g) => g.agents.some((a) => /baiduspider/i.test(a)));
      const baiduBlocked = baidu && baidu.rules.some((r) => r.type === 'disallow' && r.path === '/');
      out.push(
        baiduBlocked
          ? fail('.cn 变体拒绝了 Baiduspider', '', ['国内站的搜索流量来自百度，拒绝它等于放弃收录'])
          : pass('.cn 变体未拒绝 Baiduspider'),
      );
    }
    if (dist === 'dist-global') {
      const gb = groups.find((g) => g.agents.some((a) => /^googlebot$/i.test(a)));
      const blocked = gb && gb.rules.some((r) => r.type === 'disallow' && r.path === '/');
      out.push(blocked ? fail('.com 变体拒绝了 Googlebot', '', ['境外站的收录与 AI 摘要依赖 Google']) : pass('.com 变体放行 Googlebot'));
    }

    out.push(pass(`${dist}/robots.txt 分组统计`, `${groups.length} 个分组、覆盖 ${groups.reduce((n, g) => n + g.agents.length, 0)} 个 user-agent`));
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

/** Parse robots.txt into [{ agents: [...], rules: [{type, path}] }] preserving group order. */
function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const ua = /^user-agent:\s*(.*)$/i.exec(line);
    if (ua) {
      const agent = ua[1].trim();
      // Consecutive User-agent lines share one rule block.
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(agent);
      continue;
    }
    const rule = /^(allow|disallow):\s*(.*)$/i.exec(line);
    if (rule && current) current.rules.push({ type: rule[1].toLowerCase(), path: rule[2].trim() });
  }
  return groups;
}
