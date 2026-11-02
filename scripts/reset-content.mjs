#!/usr/bin/env node
// Clears the generated content files so the site falls back to the content checked into
// src/data/*.js. Use this to undo a bad import from the admin backend.

import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(import.meta.dirname, '../src/data/generated');
const empty = {
  'cities.json': [],
  'events.json': [],
  'faq.json': [],
  'guides.json': [],
  'plans.json': { plans: [], refundTerms: '' },
  'site.json': {},
  'contact.json': {},
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, value] of Object.entries(empty)) {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
}

// The admin can replace the WeChat QR; resetting puts the pristine one back.
const qrDefault = path.resolve(import.meta.dirname, 'assets/wechat-qr.default.png');
const qrTarget = path.resolve(import.meta.dirname, '../public/wechat-qr.png');
if (fs.existsSync(qrDefault)) {
  fs.copyFileSync(qrDefault, qrTarget);
  console.log('已还原 public/wechat-qr.png 为默认二维码。');
}

console.log('已清空 src/data/generated/，站点将回退到代码内的内容。重新构建才会生效。');
