#!/usr/bin/env node
// Turns a content export from /admin/ ("导出内容 JSON") into the generated data files
// the site build reads. Run:
//   node scripts/import-content.mjs [path-to-export.json]
// Default input: ./content-export.json
// If that is missing, the newest ./gfic-content-*.json in the project root is used, so the
// downloaded file does not have to be renamed first.
//
// The generated files are what actually feed the site: src/data/*.js falls back to the
// checked-in content only when a generated file is empty. Deleting src/data/generated/*.json
// therefore reverts the site to the repo content.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// The admin names its download gfic-content-<date>.json; pick the newest one when there is
// no explicit path and no content-export.json present.
function newestExport() {
  return fs
    .readdirSync(root)
    .filter((f) => /^gfic-content-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(root, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.f)[0] || null;
}

const implicit = fs.existsSync(path.resolve(root, 'content-export.json'))
  ? 'content-export.json'
  : newestExport();
const input = path.resolve(root, process.argv[2] || implicit || 'content-export.json');
const outDir = path.join(root, 'src/data/generated');

if (!fs.existsSync(input)) {
  console.error(`找不到导出文件：${input}`);
  console.error('在后台点「导出内容 JSON」，把下载的文件放到项目根目录后重试。');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const data = (key) => (Array.isArray(raw[key]) ? raw[key].map((d) => d.data) : []);

// Collections that hold exactly one document (站点内容 / 联系与关注) export as a single
// record; the generated file is the document body itself.
const single = (key) => {
  const doc = Array.isArray(raw[key]) ? raw[key][0] : null;
  return doc && doc.data ? doc.data : {};
};

const site = single('site');
const refundTerms = typeof site.refundTerms === 'string' ? site.refundTerms : '';

const files = {
  'cities.json': data('cities'),
  'events.json': data('events'),
  'faq.json': data('faq'),
  'guides.json': data('guides'),
  'plans.json': { plans: data('plans'), refundTerms },
  'site.json': site,
  'contact.json': single('contact'),
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, value] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
  const n = Array.isArray(value) ? value.length : Object.keys(value).length;
  console.log(`  ${name.padEnd(14)} ${n} 项`);
}

// Images edited in the admin (currently the WeChat QR) travel inside the export as data
// URIs. Decode them back into the files the pages actually reference.
const QR_TARGET = path.join(root, 'public', 'wechat-qr.png');
const qr = typeof single('contact').wechatQr === 'string' ? single('contact').wechatQr : '';
if (qr.startsWith('data:image/png;base64,')) {
  fs.writeFileSync(QR_TARGET, Buffer.from(qr.slice('data:image/png;base64,'.length), 'base64'));
  console.log(`  wechat-qr.png  ${Math.round(fs.statSync(QR_TARGET).size / 1024)} KB（来自后台上传）`);
} else if (qr) {
  console.log('  wechat-qr.png  跳过：后台存的不是 PNG 图片');
}

const counts = Object.entries(files)
  .map(([k, v]) => `${k.replace('.json', '')}=${Array.isArray(v) ? v.length : '-'}`)
  .join(' ');
console.log(`\n已写入 src/data/generated/（${counts}）`);
console.log('来源：' + path.relative(root, input));
console.log('下一步：npm run build:all');
