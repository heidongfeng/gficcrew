// 把 public/og-default.svg 栅格化成 public/og-default.png（社交卡片的 og:image）。
//
// 为什么需要它：社交平台不渲染 SVG 的 og:image，所以线上真正被读到的是那张 PNG。
// 之前这张 PNG 是一次性用无头 Chrome 手工出的，SVG 一改就会和线上不一致，而且没有
// 任何检查能看出来 —— 属于「改了 SVG 却忘了重新栅格化」这一类静默错误。
//
// 用法：node tools/_rasterize-og.cjs
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'og-default.svg');
const OUT = path.join(ROOT, 'public', 'og-default.png');
const W = 1200;
const H = 630;

(async () => {
  const svg = fs.readFileSync(SRC);
  const meta = await sharp(svg).metadata();
  if (meta.width !== W || meta.height !== H) {
    throw new Error(`SVG 尺寸是 ${meta.width}x${meta.height}，应为 ${W}x${H}`);
  }
  await sharp(svg, { density: 72 }).resize(W, H).png({ compressionLevel: 9 }).toFile(OUT);
  const { width, height } = await sharp(OUT).metadata();
  console.log(`✓ ${path.relative(ROOT, OUT)}  ${width}x${height}  ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
})().catch((e) => {
  console.error('✗ 栅格化失败：', e.message);
  process.exit(1);
});
