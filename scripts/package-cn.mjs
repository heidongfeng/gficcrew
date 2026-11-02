#!/usr/bin/env node
// Packages dist-cn into ../gficcrew-cn.zip (and copies it to
// dist-global/cn-bundle.txt for the Tencent Cloud Lighthouse server to pull).
//
// IMPORTANT: the zip is built in pure Node with FORWARD-SLASH entry names.
// Do NOT switch back to `Compress-Archive` (PowerShell) — it writes Windows
// backslash separators, which CentOS 7's `python` zipfile fallback keeps as
// literal characters and mangles the directory tree, breaking the domestic site.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist-cn');
const zip = path.resolve(root, '..', 'gficcrew-cn.zip');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist-cn 里没有 index.html，先跑 npm run build:all。');
  process.exit(1);
}

// ---- CRC32 (standard table-based) -------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Minimal ZIP writer (deflate, forward-slash arcnames) --------------------
function buildZip(dir) {
  const parts = [];        // local headers + data
  const central = [];      // central directory headers + names
  let offset = 0;

  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(dir, full).split(path.sep).join('/'); // forward slash!
      // The public-site bundle must never contain the CMS client or its hashed assets.
      // .app is the only admin origin; shipping these files to .cn exposes internal field
      // names and RPC contracts for no operational benefit.
      if (/^admin(?:\/|$)/.test(rel) || /^_astro\/admin[.-]/.test(rel)) continue;
      const data = fs.readFileSync(full);
      const comp = zlib.deflateRawSync(data);
      const crc = crc32(data);
      const nameBuf = Buffer.from(rel, 'utf8');

      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); // local file header sig
      lh.writeUInt16LE(20, 4);          // version needed
      lh.writeUInt16LE(0, 6);           // flags
      lh.writeUInt16LE(8, 8);           // method = deflate
      lh.writeUInt16LE(0, 10);          // mod time
      lh.writeUInt16LE(0, 12);          // mod date
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(comp.length, 18);
      lh.writeUInt32LE(data.length, 22);
      lh.writeUInt16LE(nameBuf.length, 26);
      lh.writeUInt16LE(0, 28);          // extra len
      parts.push(lh, nameBuf, comp);

      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);  // central dir sig
      ch.writeUInt16LE(20, 4);          // version made by
      ch.writeUInt16LE(20, 6);          // version needed
      ch.writeUInt16LE(0, 8);           // flags
      ch.writeUInt16LE(8, 10);          // method
      ch.writeUInt16LE(0, 12);          // mod time
      ch.writeUInt16LE(0, 14);          // mod date
      ch.writeUInt32LE(crc, 16);
      ch.writeUInt32LE(comp.length, 20);
      ch.writeUInt32LE(data.length, 24);
      ch.writeUInt16LE(nameBuf.length, 28);
      ch.writeUInt16LE(0, 30);          // extra len
      ch.writeUInt16LE(0, 32);          // comment len
      ch.writeUInt16LE(0, 34);          // disk number
      ch.writeUInt16LE(0, 36);          // internal attrs
      ch.writeUInt32LE(0, 38);          // external attrs
      ch.writeUInt32LE(offset, 42);     // local header offset
      central.push(ch, nameBuf);

      offset += lh.length + nameBuf.length + comp.length;
    }
  };
  walk(dist);

  const localBuf = Buffer.concat(parts);
  const centralBuf = Buffer.concat(central);
  const entries = central.length / 2;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);     // end of central dir sig
  end.writeUInt16LE(0, 4);              // disk number
  end.writeUInt16LE(0, 6);              // disk with central dir
  end.writeUInt16LE(entries, 8);       // entries on this disk
  end.writeUInt16LE(entries, 10);      // total entries
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  end.writeUInt16LE(0, 20);             // comment len

  return Buffer.concat([localBuf, centralBuf, end]);
}

const buf = buildZip(dist);
fs.writeFileSync(zip, buf);
if (fs.existsSync(path.join(root, 'dist-global', 'cn-bundle.txt'))) {
  fs.rmSync(path.join(root, 'dist-global', 'cn-bundle.txt'));
}
fs.copyFileSync(zip, path.join(root, 'dist-global', 'cn-bundle.txt'));
const stale = path.join(root, 'dist-global', 'gficcrew-cn.zip');
if (fs.existsSync(stale)) fs.rmSync(stale);

console.log(`\n已打包 ${zip}（${Math.round(buf.length / 1024)} KB，条目 ${path.relative(root, dist).split(path.sep).join('/')} 用 / 分隔，Linux 服务器可正常解压）`);
console.log('已复制到 dist-global/cn-bundle.txt（随境外版发布，服务器定时拉取）');
