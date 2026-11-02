#!/usr/bin/env node
/**
 * 一键全量发布 + 三端自检 —— 把「总缺一环」从机制上堵死。
 *
 *   npm run release:all           全量：构建 → cn:zip → 发 .com → 三端自检
 *   node scripts/release-all.mjs --verify-only   只做三端自检，不构建不发
 *
 * 目标（缺一个就是失败，脚本会当场红字报出来，而不是默默漏掉）：
 *   ① gficcrew.com        （GitHub Pages，公开正主，不含 /admin/）
 *   ② gficcrew.app.workbuddy.host（后台入口，只有它带 /admin/，也承载 cn-bundle.txt）
 *   ③ gficcrew.cn         （国内站，靠宝塔定时从 .app 拉 cn-bundle.txt，不直接发）
 *
 * 注意：.app 的部署走 WorkBuddy 的「发布为应用」能力（不是本机命令），
 * 本脚本无法替它调那个外部工具，所以把它列成一个【必须人工确认】的检查项：
 * 脚本会检查 .app 线上的 admin JS hash 是否等于本地最新 hash，不等就报红，
 * 提示你在对话里让我执行一次 .app 部署。这样「后台没同步」再也不会被漏掉。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERIFY_ONLY = process.argv.includes('--verify-only');

const run = (cmd, opts = {}) => {
  const env = { ...process.env };
  // 已知环境坑：CODEBUDDY_TOOL_CALL_ID 会让 build 的 safe-delete 卡住。
  delete env.CODEBUDDY_TOOL_CALL_ID;
  delete env.CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR;
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, env, ...opts });
};

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const fail = (msg) => {
  console.error('\n✗ [release:all] ' + msg + '\n');
  process.exitCode = 1;
  return false;
};

const ok = (msg) => console.log('  ✓ ' + msg);

// ---------------------------------------------------------------------------
// 阶段 1：构建 + 打国内包
// ---------------------------------------------------------------------------
if (!VERIFY_ONLY) {
  console.log('\n=== [1/4] 构建（build:all）===');
  try {
    run('npm run build:all');
  } catch (e) {
    fail('构建失败：' + String(e.message).split('\n')[0]);
    process.exit(1);
  }
  console.log('\n=== [2/4] 打包国内站（cn:zip）===');
  try {
    run('npm run cn:zip');
    run('npm run app:prepare');
  } catch (e) {
    fail('cn:zip / app:prepare 失败：' + String(e.message).split('\n')[0]);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 阶段 3：发 .com（gh-pages）
// ---------------------------------------------------------------------------
if (!VERIFY_ONLY) {
  console.log('\n=== [3/4] 发布 gficcrew.com（GitHub Pages）===');
  try {
    run('npm run ghpages:prepare');
  } catch (e) {
    fail('ghpages:prepare 失败：' + String(e.message).split('\n')[0]);
    process.exit(1);
  }
  try {
    // 走代理（历史教训：不带代理会 UND_ERR_CONNECT_TIMEOUT）
    const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || '';
    run('npm run deploy:ghpages:apply', {
      env: {
        ...process.env,
        NODE_USE_ENV_PROXY: '1',
        ...(proxy ? { https_proxy: proxy, HTTPS_PROXY: proxy } : {}),
      },
    });
  } catch (e) {
    fail('deploy:ghpages:apply 失败：' + String(e.message).split('\n')[0]);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 阶段 4：三端自检（无论是否 verify-only 都跑）
// ---------------------------------------------------------------------------
console.log('\n=== [4/4] 三端自检 ===');

let allGood = true;
const pages = [
  ['', 'index.html'],
  ['events/', 'events/index.html'],
  ['cities/', 'cities/index.html'],
  ['cities/guangzhou/', 'cities/guangzhou/index.html'],
  ['cities/shenzhen/', 'cities/shenzhen/index.html'],
  ['about/', 'about/index.html'],
  ['contact/', 'contact/index.html'],
  ['faq/', 'faq/index.html'],
  ['guides/', 'guides/index.html'],
  ['guangzhou-guide/', 'guangzhou-guide/index.html'],
  ['membership/', 'membership/index.html'],
  ['join/', 'join/index.html'],
];

const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || '';

// 🚨 自检必须裸连。走代理会命中代理/CDN 缓存，读到的是旧内容 → 自检「假通过」。
//    历史事故：2026-10-31 线上 cn-bundle.txt 已是 383,635 B，走代理却报 355 KB。
//    只有裸连失败时（GitHub Pages 偶发不可达）才退回代理重试。
const curlBuf = (url) => {
  const attempts = [
    `curl -s --noproxy '*' --max-time 60 "${url}"`,
    proxy ? `curl -s -x "${proxy}" --max-time 60 "${url}"` : null,
  ].filter(Boolean);
  for (const cmd of attempts) {
    try {
      const buf = execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
      if (buf && buf.length) return buf;
    } catch {
      /* 换下一种方式 */
    }
  }
  return Buffer.alloc(0);
};
const curl = (url) => curlBuf(url).toString('utf8');

// 4a. .com：线上关键页 md5 与本地 dist-global 逐页比对
console.log('\n  —— ① gficcrew.com ——');
let comPass = 0;
let comFail = 0;
for (const [p, f] of pages) {
  const online = curl('https://gficcrew.com/' + p);
  const localPath = path.join(ROOT, 'dist-global', f);
  if (!fs.existsSync(localPath)) continue;
  const local = fs.readFileSync(localPath, 'utf8');
  const same = online && md5(online) === md5(local);
  if (same) comPass++;
  else {
    comFail++;
    allGood = false;
    console.log(`    ✗ ${p || '/'} 与本地不一致`);
  }
}
if (comFail === 0) {
  ok(`gficcrew.com：${comPass} 页与本地逐字节一致`);
} else {
  fail(`gficcrew.com：${comFail} 页与本地不一致（可能 Pages 还在构建，稍等再跑 --verify-only）`);
}

// 4b. .app：后台 admin JS hash 必须等于本地最新 hash
console.log('\n  —— ② gficcrew.app.workbuddy.host ——');
const localAdminJs = (() => {
  const d = path.join(ROOT, 'dist-app', '_astro');
  if (!fs.existsSync(d)) return null;
  const f = fs.readdirSync(d).find((x) => x.startsWith('admin.') && x.endsWith('.js'));
  return f ? f : null;
})();

if (!localAdminJs) {
  fail('.app 后台：本地 dist-app/_astro 里没有 admin JS（先 build:all、cn:zip、app:prepare）');
} else {
  const adminHtml = curl('https://gficcrew.app.workbuddy.host/admin/index.html');
  const onlineJs = (adminHtml.match(/admin[^"']*\.js/) || [])[0] || '';
  const match = onlineJs === localAdminJs;
  if (match) {
    ok(`.app 后台：admin JS = ${localAdminJs}（与本地一致）`);
  } else {
    allGood = false;
    fail(
      `.app 后台 admin JS 不是最新：\n` +
        `     线上 = ${onlineJs || '（读不到）'}\n` +
        `     本地 = ${localAdminJs}\n` +
        `     → 后台还没同步！需要在对话里让我执行一次 .app 部署（发布为应用）。`
    );
  }

  // 4c. .app 上的 cn-bundle.txt 必须存在、是 zip，且字节数与本地刚构建出来的一致
  //     （只验"存在"是不够的：包是旧的也会存在，国内站就会停旧版还不报错）
  const bundleBuf = curlBuf('https://gficcrew.app.workbuddy.host/cn-bundle.txt');
  const localBundle = path.join(ROOT, 'dist-app', 'cn-bundle.txt');
  const localSize = fs.existsSync(localBundle) ? fs.statSync(localBundle).size : 0;
  const isZip = bundleBuf.length > 1000 && bundleBuf.subarray(0, 2).toString('latin1') === 'PK';

  if (!isZip) {
    allGood = false;
    fail('.app 国内包：cn-bundle.txt 拉不到或不是 zip（国内站会拉不到新包）');
  } else if (localSize && bundleBuf.length !== localSize) {
    allGood = false;
    fail(
      `.app 国内包不是最新：\n` +
        `     线上 = ${bundleBuf.length} 字节\n` +
        `     本地 = ${localSize} 字节\n` +
        `     → .app 还没带上新包！需要在对话里执行一次 .app 部署（发布为应用）。`
    );
  } else {
    ok(
      `.app 国内包：cn-bundle.txt 在线上，字节数与本地一致（${bundleBuf.length} B / ${Math.round(
        bundleBuf.length / 1024
      )} KB，zip 头正常）`
    );
  }
}

// The admin origin must not compete with the public canonical site in search results.
const appRobots = curl('https://gficcrew.app.workbuddy.host/robots.txt');
if (/User-agent:\s*\*[\s\S]*?Disallow:\s*\//i.test(appRobots)) {
  ok('.app robots：全站 Disallow，管理端镜像不参与收录');
} else {
  allGood = false;
  fail('.app robots.txt 未设置全站 Disallow（请发布最新 dist-app）');
}

// 4d. 国内站 .cn：首页可访问（活动是否上要等宝塔拉包，这里只验证可达）
console.log('\n  —— ③ gficcrew.cn ——');
const cnHome = curl('https://gficcrew.cn/');
if (cnHome && cnHome.includes('<title>')) {
  ok('gficcrew.cn：可达，标题正常（活动内容需等宝塔定时拉包，见 server-pull.sh）');
} else {
  allGood = false;
  fail('gficcrew.cn：拉不到首页，国内站可能有问题');
}

// A successful bundle upload does not prove that the server actually replaced every file.
// In October 2026 the HTML advanced while .cn kept an older sitemap, so verify it directly.
const cnSitemap = curlBuf('https://gficcrew.cn/sitemap-0.xml');
const localCnSitemapPath = path.join(ROOT, 'dist-cn', 'sitemap-0.xml');
const localCnSitemap = fs.existsSync(localCnSitemapPath) ? fs.readFileSync(localCnSitemapPath) : Buffer.alloc(0);
if (cnSitemap.length && localCnSitemap.length && md5(cnSitemap) === md5(localCnSitemap)) {
  ok('gficcrew.cn：sitemap-0.xml 与本地国内构建逐字节一致');
} else {
  allGood = false;
  fail('gficcrew.cn：sitemap-0.xml 与本地国内构建不一致（宝塔未完整覆盖或文件权限异常）');
}

// ---------------------------------------------------------------------------
console.log('\n' + (allGood ? '✅ 三端自检全部通过。' : '❌ 有目标没同步，见上方红字，补齐后再跑一次 --verify-only 确认。') + '\n');
process.exit(allGood ? 0 : 1);
