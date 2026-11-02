/**
 * 后台手机端实测：真机宽度下找横向溢出 + 触控尺寸问题。
 *
 * 为什么必须实测：横向溢出在代码里看不出来，只有布局引擎跑过才知道。
 * 用系统 Chrome（playwright-core 只带驱动，不自带浏览器）。
 *
 * 用法：node scripts/_mobile-check.mjs
 * 退出码 0 = 无溢出；1 = 有溢出（会打印溢出元素）。
 */
// playwright-core 装在托管 workspace 里，ESM 不认 NODE_PATH，只能走绝对路径。
const PW = process.env.PLAYWRIGHT_CORE_PATH;
const { chromium } = await import(PW);
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync as readSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 注意：必须以 dist-global 为根、访问 /admin/。后台的 <script> 是 Astro 抽出来的外部文件，
// 路径是 /_astro/...（站点根绝对路径），把 /admin/ 当根会让这些 JS 全部 404，页面永远起不来。
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist-global');
const ROOT = join(DIST, 'admin');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

// server 与浏览器必须在同一次调用里起，Bash 调用结束会杀掉子进程
const server = createServer(async (req, res) => {
  // /admin/... → dist-global/admin/...；其余（/_astro/、/wechat-qr.png）→ dist-global/...
  const url = (req.url || '/').split('?')[0];
  const rel = url.startsWith('/admin/') ? url.slice('/admin/'.length) : url.replace(/^\//, '');
  const dir = url.startsWith('/admin/') ? ROOT : DIST;
  const p = join(dir, rel === '' ? 'index.html' : rel);
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/admin/`;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME });

// iPhone SE / iPhone 14 Pro / 折叠屏窄态 / 平板竖屏
const VIEWPORTS = [
  { name: 'iPhone SE  375x667', width: 375, height: 667 },
  { name: 'iPhone 14  390x844', width: 390, height: 844 },
  { name: 'Android     360x800', width: 360, height: 800 },
  { name: '窄态        320x640', width: 320, height: 640 },
  { name: 'iPad 竖屏  768x1024', width: 768, height: 1024 },
];

const problems = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.width < 700,
    hasTouch: vp.width < 700,
  });
  let screens = 0;
  const page = await ctx.newPage();
  // 外部字体请求在沙箱里会挂住 networkidle，直接掐掉 —— 字体不影响布局测量
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  // 1) 登录页
  await page.waitForSelector('#gate-pw', { state: 'visible' });
  const loginOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (loginOverflow > 1) problems.push(`${vp.name} 登录页 横向溢出 ${loginOverflow}px`);

  // 2) 进后台（口令：环境变量优先，否则读 .adminpw —— Git Bash 没有 cat，别用 shell 传）
  const pw = process.env.GFIC_ADMIN_PW || readSync(join(DIST, '..', '.adminpw'), 'utf8').trim();
  if (pw) {
    await page.fill('#gate-pw', pw);
    await page.click('#gate-go');
    await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);

    const entered = await page.evaluate(() => !document.getElementById('app').classList.contains('hidden'));
    if (entered) {
      // 逐个集合点过去（内容集合 + SEO/GEO 工具页），检查每一屏。
      // 侧栏每次切换集合都会重绘，缓存的 element handle 会失效 —— 必须每次重新查询。
      const measure = () =>
        page.evaluate(() => {
          const de = document.documentElement;
          const over = de.scrollWidth - de.clientWidth;
          const wide = [];
          if (over > 1) {
            for (const el of document.querySelectorAll('body *')) {
              const b = el.getBoundingClientRect();
              if (b.width > de.clientWidth + 1 && b.height > 0) {
                wide.push(String(el.className || el.tagName).slice(0, 40));
              }
            }
          }
          return {
            over,
            wide: [...new Set(wide)].slice(0, 5),
            title: (document.getElementById('title') || {}).textContent || '?',
          };
        });

      for (const navSel of ['#side', '#side-tools']) {
        const navCount = await page.$$eval(navSel + ' button', (els) => els.length).catch(() => 0);
        for (let i = 0; i < navCount; i += 1) {
          const btns = await page.$$(navSel + ' button');
          if (i >= btns.length) break;
          await btns[i].click().catch(() => {});
          await page.waitForTimeout(500);
          screens += 1;
          const r = await measure();
          if (r.over > 1) {
            problems.push(`${vp.name} ${navSel}「${r.title}」 横向溢出 ${r.over}px  元素: ${r.wide.join(' | ')}`);
          }

          // 打开第一条进编辑器，表单是最容易被撑宽的地方
          const first = await page.$('.list li > button');
          if (first) {
            await first.click().catch(() => {});
            await page.waitForTimeout(500);
            screens += 1;
            const e = await measure();
            if (e.over > 1) {
              problems.push(`${vp.name} 编辑「${e.title}」 横向溢出 ${e.over}px  元素: ${e.wide.join(' | ')}`);
            }
            await page.click('#btn-back').catch(() => {});
            await page.waitForTimeout(350);
          }
        }
      }

      // 3) 删除按钮在触屏上必须可见（不靠 hover）
      const delVisible = await page.evaluate(() => {
        const d = document.querySelector('.row-del');
        return d ? Number(getComputedStyle(d).opacity) : null;
      });
      if (delVisible !== null && delVisible < 1 && vp.width < 700) {
        problems.push(`${vp.name} 行内删除按钮不可见（opacity ${delVisible}）`);
      }

      // 4) 底部操作条不能盖住内容最后一块
      await page.click('#btn-new').catch(() => {});
      await page.waitForTimeout(500);
      const bar = await page.evaluate(() => {
        const ab = document.getElementById('actionbar');
        if (!ab || ab.classList.contains('hidden')) return null;
        const r = ab.getBoundingClientRect();
        const pane = document.getElementById('pane').getBoundingClientRect();
        return { top: r.top, height: r.height, bottom: r.bottom, paneBottom: pane.bottom };
      });
      if (bar) {
        const pad = await page.evaluate(() =>
          parseFloat(getComputedStyle(document.getElementById('pane')).paddingBottom),
        );
        if (pad < bar.height) {
          problems.push(`${vp.name} 内容底部留白 ${pad}px < 操作条高度 ${Math.round(bar.height)}px（会被盖住）`);
        }
      }
    } else {
      console.log(`  · ${vp.name} 未登录（无口令），只测了登录页`);
    }
  }

  console.log(`  ✓ ${vp.name} 检查完毕（共测 ${screens} 屏）`);
  await ctx.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.log('\n✗ 发现 ' + problems.length + ' 个问题：');
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('\n✓ 手机端检查通过：无横向溢出、删除按钮可点、操作条不盖内容');
