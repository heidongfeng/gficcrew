#!/usr/bin/env node
// Prepare the WorkBuddy admin/package origin separately from the public .com artifact.
// The HTML remains byte-identical; only the crawler policy changes. This prevents the
// internal duplicate host from competing with the canonical site in search results.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'dist-global');
const out = path.join(root, 'dist-app');
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('dist-global 里没有 index.html，先跑 npm run build:all 和 npm run cn:zip。');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
// The public Apache rules deliberately return 404 for /admin/. WorkBuddy ignores this
// file today, but shipping it on the sole admin origin would make a future Apache move unsafe.
fs.rmSync(path.join(out, '.htaccess'), { force: true });
// Do NOT ship cn-bundle.txt. gficcrew.cn pulls from https://gficcrew.com/cn-bundle.txt now,
// so a copy here is dead weight -- and worse, it is whatever stale zip happened to sit in
// dist-global, which invites someone to point the pull script back at it later.
fs.rmSync(path.join(out, 'cn-bundle.txt'), { force: true });
const robots = `# Internal WorkBuddy deployment origin. Public canonical: https://gficcrew.com/\n# Do not index this duplicate host; it carries /admin/.\nUser-agent: *\nDisallow: /\n`;
fs.writeFileSync(path.join(out, 'robots.txt'), robots);
console.log('已生成 dist-app：保留后台，robots.txt 全站 Disallow，不带国内包。');
