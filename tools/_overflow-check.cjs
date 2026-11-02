// 查横向溢出到底是谁撑出来的。
//
// 用法：node tools/_overflow-check.cjs [dist] [宽度]
// 输出：每个页面的 scrollWidth-clientWidth，以及所有右边界超出视口的元素（取最外层几个）。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, process.argv[2] || 'dist-global');
const WIDTH = Number(process.argv[3] || 861);

const PAGES = ['/', '/about/', '/cities/', '/contact/', '/events/', '/faq/', '/guides/', '/guides/guangzhou/', '/membership/', '/join/', '/404.html'];
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
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: WIDTH, height: 900 });

  console.log(`${path.basename(DIST)} @ ${WIDTH}px`);
  for (const p of PAGES) {
    await page.goto(base + p, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate((vw) => {
      const de = document.documentElement;
      const over = de.scrollWidth - de.clientWidth;
      const bad = [];
      if (over > 0) {
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0) continue;
          if (b.right > vw + 0.5) {
            // 只记最外层：父元素也没超的才算起点
            const pb = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
            if (pb && pb.right > vw + 0.5) continue;
            bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')} right=${b.right.toFixed(1)} w=${b.width.toFixed(1)}`);
          }
        }
      }
      return { over, bad: bad.slice(0, 4) };
    }, WIDTH);
    const tag = r.over > 0 ? `溢出 ${r.over}px  ← ${r.bad.join(' | ')}` : 'ok';
    console.log(`  ${p.padEnd(22)} ${tag}`);
  }

  await browser.close();
  server.close();
})().catch((e) => { console.error('✗', e.message); server.close(); process.exit(1); });
