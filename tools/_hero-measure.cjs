// 量首页 hero 标题在真实浏览器里占几行。
//
// 为什么要真浏览器：`.hero h1` 的字号是 clamp() + `max-width: 20ch`，而 `ch` 取决于
// 访客本机字体（'Iowan Old Style' → 'Palatino Linotype' → Palatino → Georgia …），
// 各字体 advance 宽度差得不小，用 PIL 量只能给个大概。这里直接在 Chrome 里数行盒。
//
// 用法：node tools/_hero-measure.cjs [dist 目录名，默认 dist-global]
//
// 行数取法：对 h1 的文本节点建 Range，`getClientRects()` 每个行盒返回一个矩形，
// 矩形个数 = 实际行数（比 getBoundingClientRect 高矮判断可靠得多）。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, process.argv[2] || 'dist-global');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json',
};

// 1920/1440/1280 是常见桌面宽度，1183 是 4.6vw 撞上 3.4rem 上限的临界点，860 是断点。
// 后半段是手机/窄屏，用来看 slogan 仍在换行时的表现与有没有横向溢出。
const WIDTHS = [1920, 1600, 1440, 1280, 1183, 1100, 1024, 960, 900, 861, 720, 520, 390, 360];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // --no-proxy-server 必须加：否则 127.0.0.1 会走系统代理，得到 502。
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
  const page = await browser.newPage();

  console.log(`dist = ${path.basename(DIST)}`);
  console.log('宽度   | 字号px | h1可用宽 | 文本宽 | 行数 | 横向溢出 | 行宽');
  console.log('-------|--------|----------|--------|------|----------|------');

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector('.hero h1');
      if (!h1) return { err: 'no .hero h1' };
      const cs = getComputedStyle(h1);
      const range = document.createRange();
      range.selectNodeContents(h1);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      // 每个行盒的文本内容，用来显示在哪断的
      const lines = rects.map((r) => ({ w: Math.round(r.width), top: Math.round(r.top) }));
      const r = h1.getBoundingClientRect();
      return {
        text: h1.textContent.trim(),
        font: Math.round(parseFloat(cs.fontSize) * 10) / 10,
        fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        avail: Math.round(r.width),
        lines: lines.length,
        lineWidths: lines.map((l) => l.w),
        // 整页有没有被撑出横向滚动条（手机上最容易出问题的地方）
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (m.err) { console.log(`${w}  ${m.err}`); continue; }
    const textW = Math.max(...m.lineWidths);
    console.log(
      `${String(w).padEnd(6)} | ${String(m.font).padEnd(6)} | ${String(m.avail).padEnd(8)} | ${String(textW).padEnd(6)} | ${String(m.lines).padEnd(4)} | ${String(m.overflow).padEnd(8)} | 行宽 ${m.lineWidths.join('+')}`,
    );
  }

  await browser.close();
  server.close();
})().catch((e) => {
  console.error('✗', e.message);
  server.close();
  process.exit(1);
});
