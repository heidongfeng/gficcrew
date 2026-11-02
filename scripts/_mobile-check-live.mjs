/**
 * 线上后台手机端实测：直接打 https://gficcrew.app.workbuddy.host/admin/，
 * 在真机宽度下量横向溢出，并确认修复确实生效（而不是只有本地生效）。
 *
 * 用法：
 *   node scripts/_mobile-check-live.mjs
 * 退出码 1 = 有问题。
 */
const PW = process.env.PLAYWRIGHT_CORE_PATH;
const { chromium } = await import(PW);
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = 'https://gficcrew.app.workbuddy.host/admin/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME });
const VIEWPORTS = [
  { name: 'iPhone SE  375x667', width: 375, height: 667 },
  { name: 'iPhone 14  390x844', width: 390, height: 844 },
  { name: 'Android     360x800', width: 360, height: 800 },
  { name: '窄态        320x640', width: 320, height: 640 },
];
const problems = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-pw', { state: 'visible', timeout: 30000 });

  const over0 = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (over0 > 1) problems.push(`${vp.name} 线上登录页 横向溢出 ${over0}px`);

  const pw = process.env.GFIC_ADMIN_PW || readFileSync(join(ROOT, '.adminpw'), 'utf8').trim();
  await page.fill('#gate-pw', pw);
  await page.click('#gate-go');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const entered = await page.evaluate(() => !document.getElementById('app').classList.contains('hidden'));
  if (!entered) {
    problems.push(`${vp.name} 线上登录失败：${await page.textContent('#gate-msg')}`);
    await ctx.close();
    continue;
  }

  const measure = () =>
    page.evaluate(() => {
      const de = document.documentElement;
      const over = de.scrollWidth - de.clientWidth;
      const wide = [];
      if (over > 1) {
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (b.width > de.clientWidth + 1 && b.height > 0) wide.push(String(el.className || el.tagName).slice(0, 40));
        }
      }
      return { over, wide: [...new Set(wide)].slice(0, 4), title: document.getElementById('title').textContent };
    });

  let screens = 0;
  for (const navSel of ['#side', '#side-tools']) {
    const n = await page.$$eval(navSel + ' button', (e) => e.length).catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      const btns = await page.$$(navSel + ' button');
      if (i >= btns.length) break;
      await btns[i].click().catch(() => {});
      await page.waitForTimeout(600);
      screens += 1;
      const r = await measure();
      if (r.over > 1) problems.push(`${vp.name} ${navSel}「${r.title}」 溢出 ${r.over}px  元素: ${r.wide.join(' | ')}`);
      const first = await page.$('.list li > button');
      if (first) {
        await first.click().catch(() => {});
        await page.waitForTimeout(600);
        screens += 1;
        const e = await measure();
        if (e.over > 1) problems.push(`${vp.name} 编辑「${e.title}」 溢出 ${e.over}px  元素: ${e.wide.join(' | ')}`);
        await page.click('#btn-back').catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  }

  // 修复是否真的生效：侧栏宽度必须等于视口宽度，删除按钮必须可见
  const fix = await page.evaluate(() => {
    const de = document.documentElement;
    const sb = document.querySelector('.sidebar');
    const nav = document.querySelector('.nav');
    const del = document.querySelector('.row-del');
    return {
      sidebarW: sb ? Math.round(sb.getBoundingClientRect().width) : null,
      viewport: de.clientWidth,
      navScrollable: nav ? nav.scrollWidth > nav.clientWidth + 1 : null,
      delOpacity: del ? Number(getComputedStyle(del).opacity) : null,
    };
  });
  if (fix.sidebarW !== null && fix.sidebarW > fix.viewport + 1) {
    problems.push(`${vp.name} 侧栏宽 ${fix.sidebarW}px > 视口 ${fix.viewport}px（min-width:0 没生效）`);
  }
  if (fix.delOpacity !== null && fix.delOpacity < 1) {
    problems.push(`${vp.name} 删除按钮 opacity ${fix.delOpacity}（触屏不可用）`);
  }
  console.log(
    `  ✓ ${vp.name}  共 ${screens} 屏 ｜ 侧栏 ${fix.sidebarW}px / 视口 ${fix.viewport}px` +
      ` ｜ 导航可横滑 ${fix.navScrollable} ｜ 删除按钮 opacity ${fix.delOpacity}`,
  );
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.log('\n✗ ' + problems.length + ' 个问题：');
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('\n✓ 线上后台手机端通过');
