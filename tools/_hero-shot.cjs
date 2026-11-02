// 给首页 hero 拍前后对比图（离线，拍本地 dist-global）。
//
// 用法：node tools/_hero-shot.cjs [dist] [宽度]
//   "before" 一档是**注入** `.hero h1{max-width:20ch}` 复现旧规则，不是改文件。
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
  await page.setViewportSize({ width: W, height: 900 });

  for (const [tag, css] of [['before', '.hero h1{max-width:20ch !important;text-wrap:auto !important}'], ['after', '']]) {
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (css) await page.addStyleTag({ content: css });
    await page.waitForTimeout(120);
    const n = await page.evaluate(() => {
      const h1 = document.querySelector('.hero h1');
      const r = document.createRange();
      r.selectNodeContents(h1);
      return [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0).length;
    });
    const box = await page.locator('.hero h1').boundingBox();
    const file = path.join(OUT, `hero-${W}-${tag}.png`);
    await page.screenshot({
      path: file,
      clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 46), width: Math.min(W, box.width + 48), height: box.height + 96 },
    });
    console.log(`${tag.padEnd(7)} ${n} 行  -> ${path.relative(ROOT, file)}`);
  }

  await browser.close();
  server.close();
})().catch((e) => { console.error('✗', e.message); server.close(); process.exit(1); });
