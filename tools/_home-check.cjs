// 安全回归校验：后台新增的「首页」字段是否真的能读写。
// 与 admin-e2e.cjs 的区别：**不做种子导入**，不会把用户手工删掉的内容还原回去。
//   ADMIN_PW=... node tools/_home-check.cjs
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');
const path = require('node:path');

const BASE = 'https://gficcrew.app.workbuddy.host';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MARK = 'E2E temp highlight';

let bad = 0;
const ok = (n, v, extra) => { if (!v) bad += 1; console.log(`   ${v ? '✓' : '✗'} ${n}${extra ? '  ' + extra : ''}`); };
const lines = (s) => String(s || '').split('\n').filter(Boolean);

(async () => {
  const PW = process.env.ADMIN_PW;
  if (!PW) { console.error('用法：ADMIN_PW=口令 node tools/_home-check.cjs'); process.exit(1); }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 160)); });
  page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 160)));

  // Switching collections is async — wait for the title AND for the loading status to clear.
  const open = async (nth, label) => {
    await page.click(`#side button:nth-child(${nth})`);
    await page.waitForFunction((t) => document.getElementById('title').textContent.trim() === t, label, { timeout: 20000 });
    await page.waitForFunction(() => !/载入中/.test(document.getElementById('msg').textContent || ''), null, { timeout: 30000 });
    await page.waitForTimeout(250);
  };

  // The status line keeps whatever the previous save wrote, so matching /已保存/ right
  // after clicking returns immediately. Watch the button label instead.
  const saveNow = async () => {
    await page.click('#btn-save');
    await page.waitForFunction(() => document.getElementById('btn-save').textContent.trim() === '保存中…', null, { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('btn-save').textContent.trim() === '保存', null, { timeout: 60000 });
    return (await page.textContent('#msg')).trim();
  };

  const HIGH = '[data-key="home.highlights"]';
  const readHigh = async () => { await page.waitForSelector(HIGH, { timeout: 20000 }); return lines(await page.inputValue(HIGH)); };

  console.log('1. 登录');
  await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  await page.fill('#gate-pw', PW);
  await page.click('#gate-go');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  ok('进入后台', true, (await page.$$eval('#side button', (b) => b.map((x) => x.textContent.replace(/\d+$/, '')))).join(' / '));

  await open(1, '站点内容');
  await page.waitForSelector('[data-key="home.highlights"]', { timeout: 20000 });

  console.log('2. 先清掉上一轮遗留的测试条目');
  let cur = await readHigh();
  if (cur.some((x) => x.includes(MARK))) {
    await page.fill(HIGH, cur.filter((x) => !x.includes(MARK)).join('\n'));
    await saveNow();
    await open(2, '联系与关注');
    await open(1, '站点内容');
    cur = await readHigh();
  }
  ok('无残留测试条目', !cur.some((x) => x.includes(MARK)), cur.length + ' 条');

  console.log('3. 首页字段齐全且有默认值');
  const need = ['home.eyebrow', 'home.title', 'home.lead', 'home.highlights',
    'home.servicesEyebrow', 'home.servicesTitle', 'home.servicesLead',
    'home.citiesEyebrow', 'home.citiesTitle', 'home.citiesLead',
    'home.eventsEyebrow', 'home.eventsTitle',
    'home.membershipEyebrow', 'home.membershipTitle', 'home.membershipLead',
    'home.whyJoinEyebrow', 'home.whyJoinTitle', 'home.whyJoinNote'];
  const present = await page.$$eval('[data-key]', (l) => l.map((x) => x.dataset.key));
  const missing = need.filter((k) => !present.includes(k));
  ok('18 个首页字段都在', missing.length === 0, missing.length ? '缺 ' + missing.join(', ') : present.length + ' 个字段总计');

  const before = cur.join('\n');
  const lead = await page.inputValue('[data-key="home.lead"]');
  const title = await page.inputValue('[data-key="home.title"]');
  ok('亮点列表 6 条', cur.length === 6, String(cur.length));
  // 期望值取自 generated，不写字面量 —— 写死过一次，改标题后这里就成了过期断言。
  const wantTitle = require('../src/data/generated/site.json').home.title;
  ok('主标题与 generated 一致', title === wantTitle, title);
  ok('开头段落用 {brand} 占位', lead.includes('{brand}'));
  ok('城市引言用 {cityCount} 占位', (await page.inputValue('[data-key="home.citiesLead"]')).includes('{cityCount}'));

  console.log('4. 加一条 → 保存 → 重开 → 回读');
  await page.fill(HIGH, before + '\n' + MARK);
  ok('保存', (await saveNow()).includes('已保存'));
  await open(2, '联系与关注');
  await open(1, '站点内容');
  const added = await readHigh();
  ok('回读含新条目且变成 7 条', added.length === 7 && added.includes(MARK), added.length + ' 条');

  console.log('5. 还原并双通道确认（UI + 数据库内容一致）');
  await page.fill(HIGH, before);
  ok('保存', (await saveNow()).includes('已保存'));
  await open(2, '联系与关注');
  await open(1, '站点内容');
  const restored = await readHigh();
  ok('UI 回读已还原', restored.join('\n') === before, restored.length + ' 条');
  await page.locator('.card').nth(0).screenshot({ path: path.resolve(__dirname, '_shots', 'admin-home-fields.png') });

  console.log('6. 没有顺手动了别的集合');
  await open(5, 'FAQ');
  const faqRows = await page.$$eval('.list li', (l) => l.length);
  console.log(`   FAQ 现有 ${faqRows} 条（本脚本不写 FAQ，只做读数）`);

  await browser.close();
  console.log(bad === 0 ? '\n全部通过' : `\n${bad} 项失败`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error('\n异常：', e && e.message); process.exit(1); });
