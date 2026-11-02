/**
 * 「选择城市」下拉的端到端实测（城市指南新增页）。
 *
 * 为什么必须实测：这段逻辑是纯 DOM —— option 文案、选中后回填哪三个字段、
 * 已存在的城市有没有拦住，只有在真浏览器里跑过才算数。
 * 只读不写：全程不点保存，绝不碰云端内容。
 *
 * 用法：node scripts/_guides-picker-check.mjs
 * 退出码 0 = 全部通过；1 = 有失败项（会打印明细）。
 */
// playwright-core 装在托管 workspace 里（是 CJS），ESM 直接 import 绝对路径会报
// ERR_UNSUPPORTED_ESM_URL_SCHEME，用 createRequire 走 CJS 加载。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js',
);
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 必须以 dist-global 为根、访问 /admin/：后台的 <script> 是 Astro 抽出来的外部文件，
// 路径是 /_astro/...（站点根绝对路径），把 /admin/ 当根会让这些 JS 全部 404。
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist-global');
const ADMIN = join(DIST, 'admin');
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
  const url = (req.url || '/').split('?')[0];
  const underAdmin = url.startsWith('/admin/');
  const rel = underAdmin ? url.slice('/admin/'.length) : url.replace(/^\//, '');
  const p = join(underAdmin ? ADMIN : DIST, rel === '' ? 'index.html' : rel);
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/admin/`;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 200));
});
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

const failures = [];
const check = (name, ok, extra) => {
  if (!ok) failures.push(name);
  console.log(`   ${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
};

const OPEN_GUIDES = async () => {
  // 侧栏第 7 项 = 城市指南（站点内容/联系与关注/城市/活动/FAQ/会员套餐/城市指南）
  await page.click('#side button:nth-child(7)');
  await page.waitForFunction(
    () => document.getElementById('title').textContent.trim() === '城市指南',
    null,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () => !/载入中/.test(document.getElementById('msg').textContent || ''),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(300);
};

try {
  console.log('1. 打开本地后台并登录');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-pw', { state: 'visible' });
  const pw = process.env.GFIC_ADMIN_PW || readFileSync(join(DIST, '..', '.adminpw'), 'utf8').trim();
  await page.fill('#gate-pw', pw);
  await page.click('#gate-go');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  check('已进入后台', true);

  console.log('2. 打开「城市指南」列表');
  await OPEN_GUIDES();
  const guideRows = await page.$$eval('.list li', (l) => l.length);
  check('指南列表有记录（取到云端数据）', guideRows >= 1, guideRows + ' 条');

  console.log('3. 编辑已有指南：下拉应预选它的城市，并把该城市标为已有指南');
  await page.click('.list li:first-child button');
  await page.waitForSelector('[data-key="slug"]', { timeout: 20000 });
  const pickSel = '.field select';
  check('编辑器里出现了「选择城市」下拉', (await page.locator(pickSel).count()) === 1);

  const slugVal = await page.inputValue('[data-key="slug"]');
  let opts = await page.$$eval(`${pickSel} option`, (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
  check('下拉含占位项 + 16 个城市', opts.length === 17, opts.length + ' 项');
  check('城市数正好 16', opts.filter((o) => o.v).length === 16, String(opts.filter((o) => o.v).length));
  let flagged = opts.filter((o) => o.t.includes('已有指南')).map((o) => o.v);
  check('当前这篇（' + slugVal + '）被标为已有指南', flagged.includes(slugVal), '标记：' + (flagged.join(', ') || '（无）'));
  const selected = await page.inputValue(pickSel);
  check('打开时预选到该指南的城市', selected === slugVal, selected || '（空）');

  // 在自己这一篇里重新选自己：不算冲突，不该报红。
  await page.selectOption(pickSel, '');
  await page.selectOption(pickSel, slugVal);
  await page.waitForTimeout(250);
  check('在自己那篇里重选自己 → 不报覆盖警告', !(await page.textContent('#msg')).includes('已经有一篇指南'), (await page.textContent('#msg')).trim());

  console.log('4. 新增一条：下拉默认空，选未占用的城市应回填三个字段');
  await page.click('#btn-new');
  await page.waitForSelector('[data-key="slug"]', { timeout: 20000 });
  check('新增页也有下拉', (await page.locator(pickSel).count()) === 1);
  check('新增页下拉未预选', (await page.inputValue(pickSel)) === '', JSON.stringify(await page.inputValue(pickSel)));

  // 换了记录，选项重算过，重新读一遍
  opts = await page.$$eval(`${pickSel} option`, (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
  flagged = opts.filter((o) => o.t.includes('已有指南')).map((o) => o.v);
  check('新增页里已有指南的城市仍被标出', flagged.length >= 1, flagged.join(', ') || '（无）');

  // 找一个还没写过指南的城市
  const free = opts.find((o) => o.v && !o.t.includes('已有指南'));
  check('存在未被占用的城市', !!free, free ? free.v : '（全被占用）');
  await page.selectOption(pickSel, free.v);
  await page.waitForTimeout(250);
  check('slug 已回填 ' + free.v, (await page.inputValue('[data-key="slug"]')) === free.v);
  const cityVal = await page.inputValue('[data-key="city"]');
  const citySlugVal = await page.inputValue('[data-key="citySlug"]');
  check('city 已回填（' + cityVal + '）', cityVal.length > 0 && citySlugVal === free.v, `city=${cityVal} citySlug=${citySlugVal}`);
  const okMsg = await page.textContent('#msg');
  check('提示为成功语（绿色）', okMsg.includes('已按'), okMsg.trim());

  console.log('5. 在新增页选一个已有指南的城市：必须给出覆盖警告');
  const takenSlug = flagged[0];
  await page.selectOption(pickSel, takenSlug);
  await page.waitForTimeout(250);
  const errMsg = await page.textContent('#msg');
  check('提示为覆盖警告', errMsg.includes('已经有一篇指南'), errMsg.trim());
  const errClass = await page.getAttribute('#msg', 'class');
  check('警告用错误色（msg--err）', /\bmsg--err\b/.test(errClass || ''), errClass || '');
  check('仍按所选城市回填 slug', (await page.inputValue('[data-key="slug"]')) === takenSlug);

  console.log('6. 下拉不会污染提交的数据（它不是 [data-key] 控件）');
  const keys = await page.$$eval('#pane [data-key]', (l) => l.map((x) => x.dataset.key));
  check('没有多出数据键', keys.length === 10, keys.length + ' 个：' + keys.join(','));

  console.log('7. 桌面与窄屏都不横向溢出');
  for (const w of [1280, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${w}px 宽无横向溢出`, over <= 1, over + 'px');
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n✗ ${failures.length} 项失败：\n  ` + failures.join('\n  ') : '\n全部通过');
process.exit(failures.length ? 1 : 0);
