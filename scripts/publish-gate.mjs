#!/usr/bin/env node
// Decides whether a publish is actually needed, so scheduled runs do not churn the
// hosted site when nothing changed.
//
//   node scripts/publish-gate.mjs          -> exit 0 = 需要发布, exit 1 = 无需发布
//   node scripts/publish-gate.mjs --mark   -> 记录"已发布"基线后退出
//
// Two independent triggers:
//   1. cloud content differs from what was published last time (md5 of content-export.json)
//   2. a file under src/ or public/ (or astro.config.mjs / package.json) is newer than the
//      last publish stamp — i.e. code changed in this workspace

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const stateDir = path.join(root, '.state');
const contentFile = path.join(root, 'content-export.json');
const hashFile = path.join(stateDir, 'published-content-hash');
const stampFile = path.join(stateDir, 'published-stamp');

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '');

function newestSourceMtime() {
  let newest = 0;
  let newestFile = '';
  const skip = new Set(['node_modules', '.state', 'dist-global', 'dist-cn', 'generated']);
  const walk = (dir, accept) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, accept);
        continue;
      }
      if (!accept(entry.name)) continue;
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime > newest) {
        newest = mtime;
        newestFile = path.relative(root, full);
      }
    }
  };
  // public/ holds the files that change site *behaviour* rather than content: _redirects,
  // _headers and .assetsignore are read by the host, not by the build, so nothing else
  // notices when they change — and a stale copy fails silently (a dropped 301, a lost
  // security header). Watch the whole directory, not a hand-picked file list.
  walk(path.join(root, 'src'), (name) => /\.(astro|js|mjs|css|json)$/.test(name));
  walk(path.join(root, 'public'), () => true);
  for (const f of ['astro.config.mjs', 'package.json']) {
    const full = path.join(root, f);
    if (fs.existsSync(full) && fs.statSync(full).mtimeMs > newest) {
      newest = fs.statSync(full).mtimeMs;
      newestFile = f;
    }
  }
  return { newest, newestFile };
}

if (process.argv.includes('--mark')) {
  fs.mkdirSync(stateDir, { recursive: true });
  if (fs.existsSync(contentFile)) {
    const hash = crypto.createHash('md5').update(fs.readFileSync(contentFile, 'utf8')).digest('hex');
    fs.writeFileSync(hashFile, hash, 'utf8');
  }
  fs.writeFileSync(stampFile, String(Date.now()), 'utf8');
  console.log('已记录发布基线。');
  process.exit(0);
}

const publishedHash = read(hashFile);
const contentHash = fs.existsSync(contentFile)
  ? crypto.createHash('md5').update(fs.readFileSync(contentFile, 'utf8')).digest('hex')
  : '';
const contentChanged = Boolean(contentHash) && contentHash !== publishedHash;

const { newest, newestFile } = newestSourceMtime();
const stamp = fs.existsSync(stampFile) ? fs.statSync(stampFile).mtimeMs : 0;
const codeChanged = newest > stamp;

console.log(`云端内容：${contentChanged ? '有变化' : '无变化'}`);
console.log(`本机代码：${codeChanged ? `有变化（最新 ${newestFile}）` : '无变化'}`);

if (contentChanged || codeChanged) {
  console.log('\n需要发布。');
  process.exit(0);
}
console.log('\n无需发布。');
process.exit(1);
