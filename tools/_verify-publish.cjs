// 线上验收：逐文件把线上页面的字节与本地构建产物对拍（本机没有 gh CLI，用 md5 代替查 Pages workflow）。
//
// 用法：node tools/_verify-publish.cjs
// 需要 NODE_USE_ENV_PROXY=1 与 https_proxy（原生 fetch 不认 https_proxy）。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const HOSTS = [
  ['https://gficcrew.com', 'dist-ghpages'],
  ['https://gficcrew.app.workbuddy.host', 'dist-global'],
];
// 托管层元文件：线上不一定以同样字节回吐，单独列出不参与对拍。
const SKIP = new Set(['.nojekyll', 'CNAME', '.assetsignore', '.htaccess', '_headers', '_redirects']);

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

(async () => {
  let total = 0;
  let ok = 0;
  const bad = [];
  for (const [origin, dirName] of HOSTS) {
    const dir = path.join(ROOT, dirName);
    if (!fs.existsSync(dir)) { console.log(`\n=== ${origin}  ✗ 本地缺 ${dirName}/`); continue; }
    const files = walk(dir).filter((f) => !SKIP.has(f) && !SKIP.has(path.basename(f)));
    console.log(`\n=== ${origin}  ←  ${dirName}/  ${files.length} 个文件`);
    for (const rel of files) {
      total += 1;
      const local = fs.readFileSync(path.join(dir, rel));
      const want = md5(local);
      let got = null;
      let code = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`${origin}/${rel}`, { redirect: 'follow' });
          code = r.status;
          if (r.ok) { got = md5(Buffer.from(await r.arrayBuffer())); }
        } catch (e) { code = 'ERR:' + e.message; }
        if (got === want) break;
        await new Promise((s) => setTimeout(s, 4000)); // Pages / CDN 可能还在预热
      }
      if (got === want) { ok += 1; }
      else { bad.push({ origin, rel, code, want, got }); }
    }
    console.log(`  一致 ${files.filter((f) => !bad.some((b) => b.origin === origin && b.rel === f)).length} / ${files.length}`);
  }

  console.log(`\n=============== 汇总 ===============`);
  console.log(`字节一致：${ok} / ${total}`);
  if (bad.length) {
    console.log('\n✗ 不一致：');
    for (const b of bad) console.log(`   ${b.origin}/${b.rel}  http=${b.code}  本地=${b.want.slice(0, 8)}  线上=${b.got ? b.got.slice(0, 8) : '(取不到)'}`);
  } else {
    console.log('✓ 全部逐字节一致');
  }
})();
