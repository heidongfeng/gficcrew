// 拍首页 hero 区（大标题 + 正文段落）的「当前状态」截图，用于验收。
// 与 _hero-shot.cjs 的区别：不做 before/after 注入，只如实拍本地构建产物。
//
// 用法：node tools/_hero-verify-shot.cjs [dist] [宽度]
// 输出：.state/hero-shots/hero-current-<宽度>.png
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, process.argv[2] || 'dist-global');
const W = Number(process.argv[3] || 1280);
const OUT = path.join(ROOT, '.state', 'hero-shots');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: W, height: 1200 });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  // 大标题行数：Range.getClientRects() 数行盒，比量元素高度靠谱。
  const lines = await page.evaluate(() => {
    const h1 = document.querySelector('.hero h1');
    const r = document.createRange();
    r.selectNodeContents(h1);
    return [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0).length;
  });
  const leadTail = await page.evaluate(() => {
    const p = document.querySelector('.hero .lead') || document.querySelector('.hero p');
    return p ? p.textContent.trim().slice(-42) : '(未找到正文段落)';
  });

  const box = await page.locator('.hero').boundingBox();
  const file = path.join(OUT, `hero-current-${W}.png`);
  await page.screenshot({
    path: file,
    clip: { x: 0, y: Math.max(0, box.y - 8), width: W, height: Math.min(box.height + 16, 1200 - Math.max(0, box.y - 8)) },
  });
  console.log(`宽度 ${W}：大标题 ${lines} 行`);
  console.log(`hero 正文结尾：${JSON.stringify(leadTail)}`);
  console.log(`→ ${path.relative(ROOT, file)}`);

  await browser.close();
  server.close();
})().catch((e) => { console.error('✗', e.message); server.close(); process.exit(1); });
