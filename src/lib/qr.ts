import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Build-time content hash of the WeChat QR image. Appended as a query string to
// the <img> src so the URL changes whenever the QR changes — this busts browser
// and CDN caches (the filename itself is stable, so without this a new QR would
// never be re-fetched). Computed at build time from public/wechat-qr.png.
function qrHash(): string {
  try {
    const p = path.resolve(process.cwd(), 'public', 'wechat-qr.png');
    if (!fs.existsSync(p)) return '';
    const buf = fs.readFileSync(p);
    return crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
  } catch {
    return '';
  }
}

const h = qrHash();
export const qrSrc = h ? `/wechat-qr.png?v=${h}` : '/wechat-qr.png';
