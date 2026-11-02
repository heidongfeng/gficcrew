// End-to-end smoke test for /admin/.
//   ADMIN_PW=... node tools/admin-e2e.cjs
//
// Uses the system Chrome so no browser download is needed.
// Node on Windows does not understand Git Bash's /c/... prefix, so use a real Windows path.
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');
const path = require('node:path');

const BASE = 'https://gficcrew.app.workbuddy.host';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.resolve(__dirname, '..', 'content-export.json');
const PW = process.env.ADMIN_PW;

// Sidebar order = COLLECTIONS key order in admin.astro:
// 站点内容 / 联系与关注 / 城市 / 活动 / FAQ / 会员套餐 / 城市指南
const COLLECTIONS = [
  [1, '站点内容'],
  [2, '联系与关注'],
  [3, '城市'],
  [4, '活动'],
  [5, 'FAQ'],
  [6, '会员套餐'],
  [7, '城市指南'],
];
// Row counts come from the live cms_docs collections (three modules are single
// documents, not lists). FAQ is 30 here -- the site shows 38 total because the
// Guangzhou guide carries its own 8 Q&A. Verified against the cloud on 2026-10-03.
const EXPECT_ROWS = { 城市: 14, 活动: 15, FAQ: 30, 会员套餐: 3, 城市指南: 1 };

const log = (...a) => console.log(...a);
let failures = 0;
const expect = (name, ok, extra) => {
  if (!ok) failures += 1;
  log(`   ${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
};

(async () => {
  if (!PW) {
    console.error('缺少 ADMIN_PW 环境变量。用法：ADMIN_PW=你的口令 node tools/admin-e2e.cjs');
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log('  [console error]', m.text().slice(0, 160)); });
  page.on('pageerror', (e) => log('  [page error]', String(e).slice(0, 160)));

  const confirmModal = async () => {
    await page.waitForSelector('#modal.is-open', { timeout: 10000 });
    await page.click('#modal-ok');
  };

  // Switching collections is async: the old rows stay in the DOM until the fetch resolves,
  // so waiting on ".list li" alone reads the previous collection. Wait for the title AND
  // for the loading status to clear.
  const openCollection = async (nth, label) => {
    await page.click(`#side button:nth-child(${nth})`);
    await page.waitForFunction(
      (t) => document.getElementById('title').textContent.trim() === t,
      label,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => !/载入中/.test(document.getElementById('msg').textContent || ''),
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(250);
  };

  log('1. 打开 /admin/');
  await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  expect('登录框可见', await page.isVisible('#gate'));

  log('2. 错误口令应被拒绝');
  await page.fill('#gate-pw', 'definitely-wrong');
  await page.click('#gate-go');
  await page.waitForFunction(() => (document.getElementById('gate-msg').textContent || '').trim(), null, { timeout: 15000 });
  expect('提示为「口令不正确」', (await page.textContent('#gate-msg')).includes('口令不正确'));

  log('3. 正确口令登录');
  await page.fill('#gate-pw', PW);
  await page.click('#gate-go');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  expect('进入后台', true);
  log('   侧边栏: ' + (await page.$$eval('#side button', (b) => b.map((x) => x.textContent.replace(/\d+$/, '')))).join(' / '));

  log('4. 导入初始数据');
  await page.click('#btn-seed');
  await confirmModal();
  // waitForFunction(pageFunction, arg, options) — the arg slot must be filled or the
  // options object is swallowed and the default 30s timeout applies.
  await page.waitForFunction(
    () => /初始数据已导入|导入失败/.test(document.getElementById('msg').textContent || ''),
    null,
    { timeout: 240000 },
  );
  const seedMsg = (await page.textContent('#msg')).trim();
  expect('导入成功', seedMsg.includes('初始数据已导入'), seedMsg);

  log('5. 打开「城市」并编辑保存');
  await openCollection(3, '城市');
  const cityRows = await page.$$eval('.list li', (l) => l.length);
  expect('城市 14 条', cityRows === 14, String(cityRows));

  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="tagline"]', { timeout: 20000 });
  const tagBefore = await page.inputValue('[data-key="tagline"]');
  await page.fill('[data-key="tagline"]', tagBefore + ' [e2e-edit]');
  await page.click('#btn-save');
  await page.waitForFunction(
    () => /已保存|保存失败/.test(document.getElementById('msg').textContent || ''),
    null,
    { timeout: 60000 },
  );
  expect('保存成功', (await page.textContent('#msg')).includes('已保存'));

  log('6. 重新载入，确认改动已落到云端');
  await openCollection(3, '城市');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="tagline"]', { timeout: 20000 });
  const tagAfter = await page.inputValue('[data-key="tagline"]');
  expect('回读含 [e2e-edit]', tagAfter.includes('[e2e-edit]'));

  // ⚠️ 必须还原。这里之前漏了还原：跑一次就会把 [e2e-edit] 永久留在云端，
  // 而每 6 小时的自动发布会顺着 content:pull → build → deploy 把它推到线上。
  // 编辑器还开着，直接改回去存一次即可。
  await page.fill('[data-key="tagline"]', tagBefore);
  await page.click('#btn-save');
  await page.waitForFunction(
    () => /已保存|保存失败/.test(document.getElementById('msg').textContent || ''),
    null,
    { timeout: 60000 },
  );
  expect('tagline 已还原', (await page.inputValue('[data-key="tagline"]')) === tagBefore);

  log('7. 导出内容 JSON');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('#btn-export'),
  ]);
  await download.saveAs(OUT);
  log('   已保存: ' + OUT);

  log('8. 行内删除：新建一条 → 列表里删掉 → 条数还原');
  await openCollection(3, '城市');
  const baseCount = await page.$$eval('.list li', (l) => l.length);
  await page.click('#btn-new');
  await page.waitForSelector('[data-key="slug"]', { timeout: 20000 });
  await page.fill('[data-key="slug"]', 'e2e-temp-city');
  await page.fill('[data-key="name"]', '临时城市（测试用）');
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  await openCollection(3, '城市');
  const added = await page.$$eval('.list li', (l) => l.length);
  expect('新建后 +1', added === baseCount + 1, String(added));

  await page.evaluate(() => {
    const li = [...document.querySelectorAll('.list li')].find(
      (x) => x.querySelector('.sub') && x.querySelector('.sub').textContent === 'e2e-temp-city',
    );
    li.querySelector('.row-del').click();
  });
  await confirmModal();
  await page.waitForFunction(() => /已删除/.test(document.getElementById('msg').textContent || ''), null, { timeout: 30000 });
  const afterDel = await page.$$eval('.list li', (l) => l.length);
  const gone = !(await page.$$eval('.list li .sub', (l) => l.map((x) => x.textContent))).includes('e2e-temp-city');
  expect('删除后还原且记录消失', afterDel === baseCount && gone, String(afterDel));

  log('9. 每个列表集合都要有行内删除按钮');
  // slice(2): 站点内容 and 联系与关注 are single-document collections, they open straight
  // into an editor and have no list rows.
  for (const [nth, label] of COLLECTIONS.slice(2)) {
    await openCollection(nth, label);
    const rows = await page.$$eval('.list li', (l) => l.length);
    const dels = await page.$$eval('.list li .row-del', (l) => l.length);
    const expected = EXPECT_ROWS[label];
    expect(`${label}: ${rows} 行 / ${dels} 个删除按钮`, rows === expected && dels === rows, `期望 ${expected} 行`);
  }

  log('10. 城市指南：默认纯文本编辑 + JSON 互切');
  await openCollection(7, '城市指南');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="sections"]', { timeout: 20000 });
  const secText = await page.inputValue('[data-key="sections"]');
  const faqText = await page.inputValue('[data-key="faq"]');
  expect('正文章节以 ## 开头（纯文本）', secText.startsWith('## '), JSON.stringify(secText.slice(0, 30)));
  expect('指南 FAQ 以 Q: 开头（纯文本）', faqText.startsWith('Q: '), JSON.stringify(faqText.slice(0, 30)));
  expect('正文章节不含 JSON 大括号', !/^\s*[[\{]/.test(secText));

  const secField = page.locator('.field', { has: page.locator('[data-key="sections"]') });
  expect('有「纯文本 / JSON」切换', (await secField.locator('.seg button').count()) === 2);
  await secField.locator('.seg button[data-mode="json"]').click();
  await page.waitForTimeout(400);
  const asJson = await page.inputValue('[data-key="sections"]');
  let parsed = null;
  try { parsed = JSON.parse(asJson); } catch (e) { /* reported below */ }
  expect('切到 JSON 后可解析', Array.isArray(parsed), Array.isArray(parsed) ? parsed.length + ' 段' : '');

  await secField.locator('.seg button[data-mode="text"]').click();
  await page.waitForTimeout(400);
  const backToText = await page.inputValue('[data-key="sections"]');
  expect('切回纯文本与原值一致', backToText === secText);

  log('11. FAQ：标识自动生成 / 分类可点选 / 顶栏新增按钮');
  await openCollection(5, 'FAQ');
  const newBtn = await page.isVisible('#btn-new');
  expect('顶栏有「新增」按钮', newBtn, (await page.textContent('#btn-new')).trim());

  await page.click('#btn-new');
  await page.waitForSelector('[data-key="q"]', { timeout: 20000 });
  expect('不再出现手填的 ID 输入框', (await page.locator('#f-docid').count()) === 0);
  const pv0 = (await page.textContent('#id-preview')).trim();
  await page.fill('[data-key="q"]', 'How do I join the crew?');
  await page.waitForTimeout(350);
  const pv1 = (await page.textContent('#id-preview')).trim();
  expect('标识随问题实时生成', pv0 !== pv1 && pv1 === 'how-do-i-join-the-crew', `${pv0} → ${pv1}`);

  const chips = await page.$$eval('.chip-btn', (l) => l.map((x) => x.textContent));
  expect('分类有可点选的已有值', chips.length > 0, chips.length + ' 个：' + chips.slice(0, 3).join(' / '));
  await page.click('.chip-btn');
  const cat = await page.inputValue('[data-key="category"]');
  expect('点分类 chip 能填入输入框', cat.length > 0 && chips.includes(cat), cat);

  log('12. FAQ：新增一条 → 列表里删掉 → 条数还原');
  await page.fill('[data-key="a"]', 'Add us on WeChat DN8117.');
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  await openCollection(5, 'FAQ');
  const faqAdded = await page.$$eval('.list li', (l) => l.length);
  expect('新增后 31 条', faqAdded === 31, String(faqAdded));
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('.list li')].find(
      (x) => x.querySelector('.sub') && x.querySelector('.sub').textContent === 'how-do-i-join-the-crew',
    );
    li.querySelector('.row-del').click();
  });
  await confirmModal();
  await page.waitForFunction(() => /已删除/.test(document.getElementById('msg').textContent || ''), null, { timeout: 30000 });
  const faqAfter = await page.$$eval('.list li', (l) => l.length);
  expect('删除后还原 30 条', faqAfter === 30, String(faqAfter));

  log('13. 活动分类：站点内容里增删改 → 活动编辑页能点选');
  await openCollection(1, '站点内容');
  await page.waitForSelector('[data-key="eventCategories"]', { timeout: 20000 });
  const catBefore = await page.inputValue('[data-key="eventCategories"]');
  expect('分类默认有 6 个', catBefore.split('\n').filter(Boolean).length === 6, JSON.stringify(catBefore));

  await page.fill('[data-key="eventCategories"]', catBefore.trimEnd() + '\nE2ETemp');
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });

  await openCollection(4, '活动');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="category"]', { timeout: 20000 });
  const catChips = await page.$$eval('.chip-btn', (l) => l.map((x) => x.textContent));
  expect('活动分类有可点选 chips', catChips.length >= 6, catChips.join(' / '));
  expect('新增的分类出现在 chips 里', catChips.includes('E2ETemp'));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.chip-btn')].find((b) => b.textContent === 'E2ETemp');
    btn.click();
  });
  expect('点 chip 填入分类输入框', (await page.inputValue('[data-key="category"]')) === 'E2ETemp');

  // Restore the managed category list.
  await openCollection(1, '站点内容');
  await page.fill('[data-key="eventCategories"]', catBefore);
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  expect('分类列表已还原', true);

  log('14. 活动时间是选择器 / 指南日期是选择器');
  await openCollection(4, '活动');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="startDate"]', { timeout: 20000 });
  const startType = await page.getAttribute('[data-key="startDate"]', 'type');
  const endType = await page.getAttribute('[data-key="endDate"]', 'type');
  const startVal = await page.inputValue('[data-key="startDate"]');
  expect('开始时间是 datetime-local', startType === 'datetime-local', startType);
  expect('结束时间是 datetime-local', endType === 'datetime-local', endType);
  expect('原时间值未丢失（2026-10-07T19:30）', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startVal), startVal);

  await openCollection(7, '城市指南');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="updated"]', { timeout: 20000 });
  const upType = await page.getAttribute('[data-key="updated"]', 'type');
  const upVal = await page.inputValue('[data-key="updated"]');
  expect('指南更新日期是 date', upType === 'date', upType);
  expect('原日期值未丢失（2026-09-30）', /^\d{4}-\d{2}-\d{2}$/.test(upVal), upVal);

  log('15. 联系与关注：可编辑并回读');
  await openCollection(2, '联系与关注');
  await page.waitForSelector('[data-key="title"]', { timeout: 20000 });
  const titleBefore = await page.inputValue('[data-key="title"]');
  expect('页面标题来自数据', titleBefore === 'Get in touch', titleBefore);
  expect('Find us 文案有独立字段', (await page.inputValue('[data-key="findUsText"]')).includes('{socialLine}'));
  expect('页脚文案有独立字段', (await page.inputValue('[data-key="footerFindUs"]')).includes('{socialLine}'));

  await page.fill('[data-key="title"]', titleBefore + ' [e2e-edit]');
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  await openCollection(2, '联系与关注');
  await page.waitForSelector('[data-key="title"]', { timeout: 20000 });
  const titleAfter = await page.inputValue('[data-key="title"]');
  expect('回读含 [e2e-edit]', titleAfter.includes('[e2e-edit]'), titleAfter);

  await page.fill('[data-key="title"]', titleBefore);
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  expect('已还原', true);

  log('16. 微信二维码：可上传 → 回读 → 移除');
  await openCollection(2, '联系与关注');
  await page.waitForSelector('[data-key="wechatQr"]', { timeout: 20000, state: 'attached' });
  const qrBefore = await page.inputValue('[data-key="wechatQr"]');
  expect('默认是空（用代码内的图）', qrBefore === '', JSON.stringify(qrBefore.slice(0, 20)));

  await page.setInputFiles(
    'input[type="file"]',
    path.resolve(__dirname, '_fixtures', 'test-qr.png'),
  );
  await page.waitForFunction(
    () => /已读取|太大|失败/.test(document.getElementById('msg').textContent || ''),
    null,
    { timeout: 30000 },
  );
  const qrAfter = await page.inputValue('[data-key="wechatQr"]');
  expect('上传后变成 data URI', qrAfter.startsWith('data:image/png;base64,'), qrAfter.slice(0, 30) + '…');
  expect('预览图已显示', await page.isVisible('.imgprev'));

  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  await openCollection(2, '联系与关注');
  await page.waitForSelector('[data-key="wechatQr"]', { timeout: 20000, state: 'attached' });
  const qrRead = await page.inputValue('[data-key="wechatQr"]');
  expect('云端回读一致', qrRead === qrAfter, qrRead === qrAfter ? '一致' : '不一致');

  // Put it back to empty so the next build keeps using the code-bundled QR.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.imgbox button')].find((b) => b.textContent.includes('移除图片'));
    btn.click();
  });
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  await openCollection(2, '联系与关注');
  await page.waitForSelector('[data-key="wechatQr"]', { timeout: 20000, state: 'attached' });
  expect('已还原为空', (await page.inputValue('[data-key="wechatQr"]')) === '');

  log('17. 首页文案：字段齐全 / 可编辑并回读');
  await openCollection(1, '站点内容');
  await page.waitForSelector('[data-key="home.highlights"]', { timeout: 20000 });
  const homeKeys = await page.$$eval('[data-key]', (l) => l.map((x) => x.dataset.key));
  const need = [
    'home.eyebrow', 'home.title', 'home.lead', 'home.highlights',
    'home.servicesTitle', 'home.citiesLead', 'home.eventsTitle',
    'home.membershipLead', 'home.whyJoinTitle', 'home.whyJoinNote',
  ];
  const missing = need.filter((k) => !homeKeys.includes(k));
  expect('首页字段齐全', missing.length === 0, missing.length ? '缺少 ' + missing.join(', ') : need.length + ' 个');

  const leadBefore = await page.inputValue('[data-key="home.lead"]');
  const hlBefore = await page.inputValue('[data-key="home.highlights"]');
  expect('开头段落含 {brand} 占位', leadBefore.includes('{brand}'));
  expect('城市引言含 {cityCount} 占位', (await page.inputValue('[data-key="home.citiesLead"]')).includes('{cityCount}'));
  expect('亮点列表默认 6 条', hlBefore.split('\n').filter(Boolean).length === 6, String(hlBefore.split('\n').filter(Boolean).length));

  await page.fill('[data-key="home.highlights"]', hlBefore.trimEnd() + '\nE2E temp highlight');
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  await openCollection(1, '站点内容');
  await page.waitForSelector('[data-key="home.highlights"]', { timeout: 20000 });
  const hlAfter = await page.inputValue('[data-key="home.highlights"]');
  expect('回读含新增条目', hlAfter.includes('E2E temp highlight'));
  expect('回读为 7 条', hlAfter.split('\n').filter(Boolean).length === 7, String(hlAfter.split('\n').filter(Boolean).length));

  await page.fill('[data-key="home.highlights"]', hlBefore);
  await page.click('#btn-save');
  await page.waitForFunction(() => /已保存/.test(document.getElementById('msg').textContent || ''), null, { timeout: 60000 });
  expect('已还原', true);

  log('18. 侧栏「SEO / GEO」工具入口：AI 回答监测');
  // 先记下 FAQ 的基数，一会儿比对切回来有没有复原（不写死条数，免得以后加 FAQ 就红）。
  await openCollection(5, 'FAQ');
  const faqBase = await page.$$eval('.list li', (l) => l.length);

  // 工具视图不是内容集合：它没有文档列表，所以搜索框、顶栏「新增」、保存条都必须关掉。
  const toolCount = await page.$$eval('#side-tools button', (l) => l.length);
  expect('侧栏工具分组有 1 个入口', toolCount === 1, String(toolCount));
  await page.click('#side-tools button');
  await page.waitForFunction(
    () => document.getElementById('title').textContent.trim() === 'AI 回答监测',
    null,
    { timeout: 15000 },
  );
  expect('能打开「AI 回答监测」', true);
  // openMonitor() 是异步的：先渲染「正在读取历史报告…」的占位卡，等云端把 monitor
  // 集合读回来才真正渲染面板（实测约 1 秒）。不等这一步，后面几条断言都会在占位卡上判假。
  await page.waitForSelector('#mon-run', { timeout: 30000 });
  expect('工具视图下搜索框被禁用', await page.isDisabled('#search'));
  expect('工具视图下「新增」按钮隐藏', !(await page.isVisible('#btn-new')));
  expect('有「开始监测」按钮', await page.isVisible('#mon-run'));
  expect('有监测日志区', await page.isVisible('#mon-log'));
  expect('有可编辑的问题列表', (await page.$$eval('#mon-probes input', (l) => l.length)) >= 6);

  // 故意不真的跑一轮：一轮 2–4 分钟且每次都消耗模型调用。
  // 这里只确认切开之后能干净地回到内容集合 —— 那才是最容易漏测的地方。
  await openCollection(5, 'FAQ');
  expect('切回集合后搜索框恢复可用', !(await page.isDisabled('#search')));
  expect('切回集合后「新增」按钮恢复', await page.isVisible('#btn-new'));
  expect(`切回集合后列表复原（${faqBase} 条）`, (await page.$$eval('.list li', (l) => l.length)) === faqBase);

  await browser.close();
  log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n异常：', e && e.message);
  process.exit(1);
});
