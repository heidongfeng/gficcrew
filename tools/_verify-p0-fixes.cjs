/*
 * 站头交互回归脚本（2026-10-16 P0 修复时引入，可复用）。
 * 覆盖四件事：
 *   1. :focus-visible 焦点环真的出现在键盘 Tab 聚焦的链接上（计算样式断言）
 *   2. 移动端导航：点按钮展开 → 点外部关闭 → Escape 关闭，aria-expanded 同步
 *   3. 主题按钮是 SVG 且随 data-theme 切换可见性（不再写 glyph）
 *   4. 二维码 img 的 width/height 属性比例 == 图片真实比例（811:1200），且体积不反弹
 * 用法：node tools/_verify-p0-fixes.cjs <port>   （先自行起 http server 服务 dist-global）
 */
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = `http://localhost:${process.argv[2] || 4173}`;
let pass = 0, failCount = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { failCount += 1; console.log(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ---------- 桌面端：焦点可见 + 主题 SVG ----------
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto(BASE + '/', { waitUntil: 'networkidle' });

  console.log('[P0-1] 键盘焦点可见');
  // Tab 到第一个链接（skip-link 之后的第一个是 brand），读 outline 宽度
  const outline = await desktop.evaluate(() => {
    const links = [...document.querySelectorAll('header a, header button')];
    const first = links[0];
    first.focus();
    const s = getComputedStyle(first);
    return { ow: s.outlineWidth, os: s.outlineStyle, oc: s.outlineColor, tag: first.tagName, cls: first.className };
  });
  ok(
    'header 链接聚焦时有可见 outline',
    parseFloat(outline.ow) > 0 && outline.os !== 'none',
    `outline: ${outline.ow} ${outline.os} ${outline.oc} (${outline.tag}.${outline.cls})`,
  );
  // 滚到正文再 Tab 一个正文链接
  const bodyOutline = await desktop.evaluate(() => {
    const a = document.querySelector('.nav a');
    a.focus();
    const s = getComputedStyle(a);
    return { w: s.outlineWidth, st: s.outlineStyle };
  });
  ok('导航链接聚焦时有可见 outline', parseFloat(bodyOutline.w) > 0 && bodyOutline.st !== 'none', `outline-width: ${bodyOutline.w}`);

  console.log('[P0-4] 主题按钮 SVG');
  const theme = await desktop.evaluate(() => {
    const btn = document.querySelector('[data-theme-toggle]');
    const sun = btn.querySelector('.icon-sun');
    const moon = btn.querySelector('.icon-moon');
    const vis = (el) => getComputedStyle(el).display !== 'none';
    return {
      hasSvg: !!(sun && moon),
      lightShowsSun: vis(sun) && !vis(moon),
      label: btn.getAttribute('aria-label'),
    };
  });
  ok('主题按钮内含 sun+moon 两个 SVG', theme.hasSvg);
  ok('浅色主题显示太阳图标', theme.lightShowsSun);
  // 点一下切到深色，可见性应翻转
  await desktop.click('[data-theme-toggle]');
  const darkState = await desktop.evaluate(() => {
    const btn = document.querySelector('[data-theme-toggle]');
    const sun = btn.querySelector('.icon-sun');
    const moon = btn.querySelector('.icon-moon');
    const vis = (el) => getComputedStyle(el).display !== 'none';
    return { dark: document.documentElement.getAttribute('data-theme'), showsMoon: !vis(sun) && vis(moon), label: btn.getAttribute('aria-label') };
  });
  ok('点击后切到深色且月亮图标可见', darkState.dark === 'dark' && darkState.showsMoon, `data-theme=${darkState.dark}, label="${darkState.label}"`);
  await desktop.close();

  // ---------- 移动端：导航交互 ----------
  console.log('[P0-2] 移动端导航折叠菜单');
  const mobile = await browser.newPage({ viewport: { width: 480, height: 800 } });
  await mobile.goto(BASE + '/', { waitUntil: 'networkidle' });
  const expanded0 = await mobile.getAttribute('[data-nav-toggle]', 'aria-expanded');
  await mobile.click('[data-nav-toggle]');
  const openState = await mobile.evaluate(() => ({
    open: document.querySelector('[data-nav]').classList.contains('is-open'),
    expanded: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),
  }));
  ok('点 ☰ 展开，aria-expanded=true', expanded0 === 'false' && openState.open && openState.expanded === 'true');
  // 展开的菜单是全宽 absolute 面板，会盖住 h1 等元素；用坐标点菜单下方的空白，
  // 这正是真实用户「点菜单外面」的动作。
  await mobile.mouse.click(240, 700);
  const closedByOutside = await mobile.evaluate(() => ({
    open: document.querySelector('[data-nav]').classList.contains('is-open'),
    expanded: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),
  }));
  ok('点菜单外部关闭，aria-expanded=false', !closedByOutside.open && closedByOutside.expanded === 'false');
  await mobile.click('[data-nav-toggle]');
  await mobile.keyboard.press('Escape');
  const closedByEsc = await mobile.evaluate(() => document.querySelector('[data-nav]').classList.contains('is-open'));
  ok('按 Escape 关闭', !closedByEsc);
  await mobile.close();

  // ---------- 二维码 ----------
  console.log('[P0-3] 二维码尺寸声明');
  const qrPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await qrPage.goto(BASE + '/membership/', { waitUntil: 'networkidle' });
  const qr = await qrPage.evaluate(async () => {
    const img = document.querySelector('.join-qr');
    if (!img) return null;
    // loading="lazy" 且面板 hidden 时 currentSrc 为空串，读 src 属性才稳。
    const src = img.getAttribute('src');
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const attrRatio = img.width / img.height;
    const realRatio = bmp.width / bmp.height;
    return { w: img.width, h: img.height, realW: bmp.width, realH: bmp.height, attrRatio, realRatio };
  });
  ok('QR img 的 width/height 属性比例 == 图片真实比例', qr && Math.abs(qr.attrRatio - qr.realRatio) < 0.01, `attr ${qr.w}x${qr.h} vs real ${qr.realW}x${qr.realH}`);
  const qrBytes = await qrPage.evaluate(async () => (await (await fetch(document.querySelector('.join-qr').getAttribute('src'))).blob()).size);
  ok('二维码文件 < 40KB（原 206KB）', qrBytes < 40 * 1024, `${(qrBytes / 1024).toFixed(1)} KB`);
  await qrPage.close();

  await browser.close();
  console.log(`\n===== ${pass} 通过 / ${failCount} 失败 =====`);
  process.exit(failCount ? 1 : 0);
})().catch((e) => { console.error('脚本异常:', e.message); process.exit(2); });
