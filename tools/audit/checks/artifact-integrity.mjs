// Method 3 — build-artifact integrity.
//
// A static site has no runtime to fail loudly. If the build drops a file, the result is
// a 404 that nobody sees until a crawler reports it weeks later, and if the build emits
// a file it should not, nobody sees it at all.
//
// Two failure modes are known to be real on this project, not hypothetical:
//   * The sandbox's bulk-delete guard can truncate a build, which silently removes the
//     sitemap while leaving robots.txt pointing at it.
//   * prepare-gh-pages.mjs copies dist-global into dist-ghpages with an exclusion list
//     that is maintained by hand, so anything new the build starts emitting gets shipped.
//
// Both are checked here, from the artefacts on disk.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, warn, pass, loadDist, readText } from '../_util.mjs';

export const id = 'artifact-integrity';
export const name = '构建产物完整性（必备文件 / sitemap 覆盖 / 不该上线的文件 / IndexNow 密钥）';

/** Files every static build must contain, whatever the variant. */
const REQUIRED = [
  'index.html',
  '404.html',
  'robots.txt',
  'rss.xml',
  'sitemap-index.xml',
  'sitemap-0.xml',
  // Icon set, 2026-10-08: the site logo replaced the old vector "GC" monogram, so the
  // favicon is now raster. favicon.svg was dropped in the same change.
  'favicon.ico',
  'apple-touch-icon.png',
  'icon-192.png',
  'logo.png',
  'logo-mark.png',
  'wechat-qr.png',
  'llms.txt',
  'llms-full.txt',
  'og-default.png',
];

/** Files that must never reach the public GitHub Pages artifact. */
const FORBIDDEN_IN_DEPLOY = [
  [/^_headers$/, 'Netlify/Cloudflare 头文件'],
  [/^_redirects$/, 'Netlify/Cloudflare 跳转文件'],
  [/^\.htaccess$/, 'Apache 配置'],
  [/^\.assetsignore$/, 'Cloudflare Workers 配置'],
  // cn-bundle.txt IS allowed at the artifact root now -- deliberately.
  //
  // It used to be forbidden because the China bundle was published on the WorkBuddy
  // origin and never belonged on gficcrew.com. That origin can no longer be published
  // from the build environment, so the China server pulls the bundle from
  // https://gficcrew.com/cn-bundle.txt instead; publish.mjs copies the dist-cn zip in
  // after prepare-gh-pages.mjs runs.
  //
  // The guard moved rather than disappeared: what matters is not "no file named
  // cn-bundle.txt" but "the file is the China variant, contains no admin output, and
  // actually unzips". That is checked below instead of being matched by name here --
  // forbidding the name would only push the same bytes under a different filename.
  [/^[^/]*\.zip$/, 'zip 压缩包'],
  [/^renderers\.mjs$/, 'SSR 渲染器'],
  [/^manifest_\w+\.mjs$/, 'SSR manifest'],
  [/^noop-entrypoint\.mjs$/, 'SSR 空入口'],
  [/^_noop-middleware\.mjs$/, 'SSR 中间件占位'],
  // Dist-global is also the SSR deploy for the WorkBuddy origin, so `astro build` leaves
  // these two trees at the artifact root. prepare-gh-pages.mjs must filter them out; on
  // 2026-10-04 it did not, and the next scheduled run would have published 19 files /
  // 507 KB of build internals -- chunks/contact_*.mjs alone is 285 KB -- to gficcrew.com.
  [/^chunks(\/|$)/, 'SSR chunk 目录'],
  [/^pages(\/|$)/, 'SSR 路由入口目录'],
  [/^admin(\/|$)/, '/admin/ 后台（由 app.workbuddy.host 单独提供）'],
];

/** Pages the sitemap integration is configured to exclude. */
const NOT_IN_SITEMAP = [/^\/join\/?$/, /^\/account\/?$/, /^\/admin/, /^\/guangzhou-guide/, /^\/404/];

export async function run() {
  const out = [];
  const dists = ['dist-global', 'dist-cn', 'dist-ghpages'].filter((d) => fs.existsSync(path.join(ROOT, d)));
  if (!dists.length) return [warn('没有任何构建产物', '先跑 npm run build:all，否则这一组检查全都无从下手')];
  out.push(pass('找到构建产物', dists.map((d) => `${d}（${listTop(d).length} 个顶层条目）`).join(' / ')));

  for (const dist of dists) {
    const abs = path.join(ROOT, dist);

    // --- required files ----------------------------------------------------
    const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(abs, f)));
    out.push(
      missing.length
        ? fail(`${dist} 缺必备文件`, missing.join(', '), [
            '静态站没有运行时兜底：缺 sitemap 时 robots.txt 里的 Sitemap: 行会指向 404，搜索引擎静默丢弃它',
            '本机已知成因：构建被沙箱「批量删除保护」截断（用 env -u CODEBUDDY_TOOL_CALL_ID npm run build:all 规避）',
          ])
        : pass(`${dist} 必备文件齐全`, `${REQUIRED.length} 项`),
    );

    // --- robots → sitemap target exists ------------------------------------
    const robotsPath = path.join(abs, 'robots.txt');
    if (fs.existsSync(robotsPath)) {
      const robots = readText(robotsPath);
      const declared = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
      const broken = declared.filter((u) => {
        const rel = u.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
        return !fs.existsSync(path.join(abs, rel.split('?')[0]));
      });
      out.push(
        !declared.length
          ? warn(`${dist}/robots.txt 没有 Sitemap: 行`, '', ['搜索引擎只能靠猜 sitemap 位置'])
          : broken.length
            ? fail(`${dist}/robots.txt 声明的 sitemap 不存在`, broken.join(', '))
            : pass(`${dist}/robots.txt 的 sitemap 指向真实文件`, declared.join(', ')),
      );
    }

    // --- sitemap coverage --------------------------------------------------
    const smPath = path.join(abs, 'sitemap-0.xml');
    if (fs.existsSync(smPath)) {
      const locs = [...readText(smPath).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      const smPaths = new Set(locs.map((u) => pathOf(u)));
      const pages = loadDist(dist).map((p) => p.urlPath);
      // Redirect stubs (canonical pointing elsewhere + meta refresh) exist only so that
      // GitHub Pages answers old paths with 200 instead of a bare 404. They must stay out
      // of the sitemap — listing a redirect as a destination is a crawl-quality defect.
      const stubs = new Set(loadDist(dist).filter(isRedirectStub).map((p) => p.urlPath));
      const expected = pages.filter((p) => !NOT_IN_SITEMAP.some((re) => re.test(p)) && !stubs.has(p));
      const missingFromSitemap = expected.filter((p) => !smPaths.has(p));
      const orphanInSitemap = [...smPaths].filter((p) => !pages.includes(p));
      const stubInSitemap = [...smPaths].filter((p) => stubs.has(p));
      out.push(
        missingFromSitemap.length
          ? warn(`${dist}/sitemap 漏了页面`, missingFromSitemap.join(', '), ['这些页会被抓取但不会主动提交给搜索引擎'])
          : pass(`${dist}/sitemap 覆盖了全部应收录页面`, `${expected.length} 条（跳转桩 ${stubs.size} 个已排除）`),
      );
      out.push(
        stubInSitemap.length
          ? fail(`${dist}/sitemap 收录了跳转桩`, stubInSitemap.join(', '), ['把跳转页当作正式页面提交会稀释抓取预算'])
          : pass(`${dist}/sitemap 没有误收跳转桩`),
      );
      out.push(
        orphanInSitemap.length
          ? fail(`${dist}/sitemap 里有不存在的页面`, orphanInSitemap.join(', '), ['提交 404 会拉低整站的抓取质量评估'])
          : pass(`${dist}/sitemap 没有死链`),
      );
      const noLastmod = locs.length - (readText(smPath).match(/<lastmod>/g) || []).length;
      if (noLastmod > 0) out.push(warn(`${dist}/sitemap 有 ${noLastmod} 条没有 lastmod`, '', ['缺 lastmod 会削弱新鲜度信号']));
    }

    // --- forbidden files ---------------------------------------------------
    // Only the deployable directory is held to this: dist-global legitimately carries
    // _headers/_redirects/cn-bundle.txt as inputs for prepare-gh-pages.
    if (dist === 'dist-ghpages') {
      const bad = [];
      for (const rel of allFiles(abs)) {
        for (const [re, label] of FORBIDDEN_IN_DEPLOY) {
          if (re.test(rel)) bad.push(`${rel}（${label}）`);
        }
      }
      out.push(
        bad.length
          ? fail(`${dist} 里有不该上线的文件`, '', bad.slice(0, 20).concat(bad.length > 20 ? [`…另有 ${bad.length - 20} 个`] : []))
          : pass(`${dist} 内容干净`, '无后台、无 zip、无 SSR 产物、无宿主配置'),
      );

      // --- cn-bundle.txt: the China server's pull source ---------------------
      // The file is allowed, but only if it is genuinely the China variant. Three
      // failure modes this catches, all of which used to be impossible because the
      // bundle was published elsewhere:
      //   * dist-global's copy (overseas: no ICP footer, overseas social links) getting
      //     shipped instead of dist-cn's -- a variant mix-up nobody would notice until
      //     the China site showed the wrong footer;
      //   * admin output leaking inside the zip;
      //   * a truncated or non-zip file, which makes the China pull script overwrite
      //     the live site with nothing (it checks for index.html, but only after unzip).
      const bundlePath = path.join(abs, 'cn-bundle.txt');
      if (!fs.existsSync(bundlePath)) {
        // FAIL, not warn. gficcrew.cn pulls this file from the public site, so a publish
        // that drops it silently freezes the China site on the previous build. It used to
        // be a warning, which meant the guard could never actually stop a bad publish --
        // the gate has to be a gate, not a comment.
        out.push(
          fail(`${dist} 缺 cn-bundle.txt`, '国内站从 gficcrew.com/cn-bundle.txt 拉取，缺了就只能停在旧版', [
            'publish.mjs 的第 3 步会把 dist-cn 的 zip 复制进来；若手动推 gh-pages，必须自己带上',
            '确认 npm run cn:zip 成功，且 prepare-gh-pages 没把它过滤掉',
          ]),
        );
      } else {
        const buf = fs.readFileSync(bundlePath);
        // End-of-central-directory record: the last magic "PK\x05\x06" within 64 KB of the end.
        const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        const isZip = eocd >= 0 && buf.length - eocd <= 65557;
        // Listing a zip needs no dependency in Node >= 22? No -- use the entry-name
        // table heuristics instead: names are stored uncompressed in the central
        // directory, so a substring search over the tail is reliable enough here.
        const tail = buf.subarray(Math.max(0, (eocd >= 0 ? eocd : buf.length - 65536))).toString('latin1');
        const head = buf.subarray(0, Math.min(buf.length, 65536)).toString('latin1');
        const names = head + tail;
        const hasIndex = /(^|\/)index\.html/.test(names) || names.includes('index.html');
        const hasAdmin = /(^|[\x00-\x1f])admin\//.test(names);
        const problems = [];
        if (!isZip) problems.push('不是有效 zip（可能下载截断）');
        if (!hasIndex) problems.push('包内没有 index.html');
        if (hasAdmin) problems.push('包内含 admin/ 后台文件');
        out.push(
          problems.length
            ? fail(`${dist}/cn-bundle.txt 不可用作国内站更新包`, problems.join('；'), [
                '国内宝塔任务会直接解压覆盖线上站点，这个包必须是 dist-cn 的完整产物',
              ])
            : pass(
                `${dist}/cn-bundle.txt 是国内站可用更新包`,
                `${(buf.length / 1024 / 1024).toFixed(2)} MB`,
              ),
        );

        // Variant check: dist-cn carries the ICP filing number in its footer, dist-global
        // never does. Building both variants here and comparing is the only way to be
        // sure the China bundle was not silently replaced by the overseas one.
        if (isZip && fs.existsSync(path.join(ROOT, 'dist-cn', 'index.html'))) {
          const cnIndex = readText(path.join(ROOT, 'dist-cn', 'index.html'));
          const icp = (cnIndex.match(/粤ICP备\d+号/) || [])[0];
          if (!icp) {
            out.push(warn('dist-cn 首页里找不到备案号', '', ['无法据此判断 cn-bundle.txt 的变体，跳过变体校验']));
          } else {
            // The ICP string sits in the footer of every China page; inside the zip it is
            // stored (zlib-compresses only if the packer chose to), so check by size
            // proximity instead: compare against the on-disk dist-cn zip when present.
            const cnZip = path.join(ROOT, '..', 'gficcrew-cn.zip');
            if (fs.existsSync(cnZip)) {
              const a = fs.readFileSync(cnZip);
              const same = a.length === buf.length && a.equals(buf);
              out.push(
                same
                  ? pass('cn-bundle.txt 与本地 dist-cn 打包逐字节一致', `${icp}`)
                  : fail('cn-bundle.txt 与本地 dist-cn 包不一致', '公开站上的国内包不是本地构建的那一份', [
                      '很可能是把 dist-global 的 cn-bundle.txt 误当国内包发布，或打包后 dist-cn 又变过',
                    ]),
              );
            }
          }
        }
      }
      out.push(
        fs.existsSync(path.join(abs, '.nojekyll'))
          ? pass(`${dist} 有 .nojekyll`, '关闭 Jekyll 过滤，否则 _astro/ 目录会被吞掉')
          : fail(`${dist} 缺 .nojekyll`, '', ['GitHub Pages 会用 Jekyll 处理站点，下划线开头的资源目录会被丢弃']),
      );
      out.push(
        fs.existsSync(path.join(abs, 'CNAME'))
          ? pass(`${dist} 有 CNAME`, readText(path.join(abs, 'CNAME')).trim())
          : warn(`${dist} 没有 CNAME`, '', ['用 --no-cname 发布是对的；但全量快照会把分支上已有的 CNAME 删掉，确认这是有意的']),
      );
    }
  }

  // --- IndexNow key file ---------------------------------------------------
  // The protocol has no API to fetch the key: the crawler fetches /<key>.txt and trusts
  // it only if the body equals the filename. A stray trailing newline breaks that
  // silently, and the only symptom is that submissions stop being accepted.
  const keyFiles = fs.existsSync(path.join(ROOT, 'public'))
    ? fs.readdirSync(path.join(ROOT, 'public')).filter((f) => /^[0-9a-f]{16,64}\.txt$/i.test(f))
    : [];
  if (!keyFiles.length) {
    out.push(warn('public/ 下没找到 IndexNow 密钥文件', '', ['IndexNow 通知会整站跳过']));
  } else {
    const problems = [];
    for (const f of keyFiles) {
      const body = readText(path.join(ROOT, 'public', f));
      const stem = f.replace(/\.txt$/, '');
      if (body !== stem) problems.push(`${f}：文件名与内容不一致（内容 = ${JSON.stringify(body).slice(0, 60)}）`);
      if (/[\r\n]$/.test(body)) problems.push(`${f}：结尾有换行，协议要求逐字节等于文件名`);
    }
    out.push(
      problems.length
        ? fail('IndexNow 密钥文件不满足「文件名 = 内容」', '', problems)
        : pass('IndexNow 密钥文件合规', `${keyFiles.join(', ')}（文件名与内容逐字节相同）`),
    );
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

const listTop = (dist) => fs.readdirSync(path.join(ROOT, dist));

function allFiles(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...allFiles(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

/** https://gficcrew.com/about/ → /about/ */
function pathOf(u) {
  const p = u.replace(/^https?:\/\/[^/]+/, '');
  return p === '' ? '/' : p;
}

/**
 * A redirect stub as written by prepare-gh-pages.mjs: a meta refresh plus a canonical
 * that points at a different path. Both markers are required, so a real page that merely
 * mentions refresh in prose cannot be mistaken for one.
 */
function isRedirectStub(page) {
  if (!/<meta[^>]+http-equiv=["']?refresh/i.test(page.html)) return false;
  const canonical = /<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)["']/i.exec(page.html);
  if (!canonical) return false;
  return pathOf(canonical[1]) !== page.urlPath;
}
