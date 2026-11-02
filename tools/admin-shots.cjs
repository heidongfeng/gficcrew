// Captures screenshots of the admin UI for design review.
//   ADMIN_PW=... node tools/admin-shots.cjs
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://gficcrew.app.workbuddy.host';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = path.resolve(__dirname, '_shots');

(async () => {
  if (!process.env.ADMIN_PW) { console.error('缺少 ADMIN_PW'); process.exit(1); }
  fs.mkdirSync(DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(DIR, '1-login.png') });
  console.log('1-login.png');

  await page.fill('#gate-pw', process.env.ADMIN_PW);
  await page.click('#gate-go');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  await page.waitForSelector('.card', { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(DIR, '2-site-editor.png') });
  console.log('2-site-editor.png');

  // 站点内容 now opens on 首页 — the two homepage groups come first.
  await page.locator('.card').nth(0).screenshot({ path: path.join(DIR, '13-home-hero-fields.png') });
  console.log('13-home-hero-fields.png');
  await page.locator('.card').nth(1).screenshot({ path: path.join(DIR, '14-home-section-titles.png') });
  console.log('14-home-section-titles.png');

  const openCollection = async (nth, label) => {
    await page.click(`#side button:nth-child(${nth})`);
    await page.waitForFunction((t) => document.getElementById('title').textContent.trim() === t, label, { timeout: 20000 });
    await page.waitForFunction(() => !/载入中/.test(document.getElementById('msg').textContent || ''), null, { timeout: 30000 });
    await page.waitForTimeout(300);
  };

  await openCollection(3, '城市');
  await page.hover('.list li:nth-child(3)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, '3-cities-list.png') });
  console.log('3-cities-list.png');

  // 站点内容 scrolled down to the managed event-category list.
  await openCollection(1, '站点内容');
  await page.waitForSelector('[data-key="eventCategories"]', { timeout: 20000 });
  await page.locator('.field', { has: page.locator('[data-key="eventCategories"]') }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, '9-event-categories.png') });
  console.log('9-event-categories.png');

  // Event editor: category chips + native date/time pickers.
  await openCollection(4, '活动');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="startDate"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, '10-event-editor.png') });
  console.log('10-event-editor.png');

  await openCollection(2, '联系与关注');
  await page.waitForSelector('[data-key="lead"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, '11-contact-editor.png'), fullPage: true });
  console.log('11-contact-editor.png');

  // Same page, scrolled to the QR uploader.
  const qrField = page.locator('.field', { has: page.locator('[data-key="wechatQr"]') });
  await qrField.scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(DIR, '12-qr-upload.png') });
  console.log('12-qr-upload.png');

  await openCollection(7, '城市指南');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="sections"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(DIR, '6-guide-plaintext.png'), fullPage: true });
  console.log('6-guide-plaintext.png');
  await page.locator('.field', { has: page.locator('[data-key="sections"]') }).locator('.seg button[data-mode="json"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, '7-guide-json.png') });
  console.log('7-guide-json.png');
  await openCollection(5, 'FAQ');
  await page.click('#btn-new');
  await page.waitForSelector('[data-key="q"]', { timeout: 20000 });
  await page.fill('[data-key="q"]', 'How do I join the crew?');
  await page.fill('[data-key="a"]', 'Add us on WeChat DN8117 and tell us which city you are in.');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, '8-faq-editor.png') });
  console.log('8-faq-editor.png');

  await openCollection(3, '城市');

  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="blurb"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, '4-city-editor.png'), fullPage: true });
  console.log('4-city-editor.png');

  await page.click('#btn-theme');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DIR, '5-dark.png') });
  console.log('5-dark.png');

  await browser.close();
  console.log('截图目录：', DIR);
})().catch((e) => { console.error('失败：', e.message); process.exit(1); });
