#!/usr/bin/env node
// Push-discovery notification for the sitemap URLs that changed in the latest build.
//
// IndexNow is a shared ping: one submission is accepted by the endpoint and fanned out to
// every participating engine (Bing, Yandex, Naver, Seznam, Yep). Bing's index in turn feeds
// Copilot, DuckDuckGo and ChatGPT Browse. Google does NOT participate — it still discovers
// us through the sitemap and Search Console. So this complements the sitemap; it does not
// replace it, and it accelerates discovery only. It does not affect ranking.
//
//   node scripts/notify-indexnow.mjs                   submit URLs changed since the last run
//   node scripts/notify-indexnow.mjs --dry-run         print what would be sent, send nothing
//   node scripts/notify-indexnow.mjs --all             ignore the change log, submit everything
//   node scripts/notify-indexnow.mjs --no-verify       skip the live-URL check
//   node scripts/notify-indexnow.mjs --sitemap=dist-cn/sitemap-0.xml
//
// Exit 0 = submitted, nothing to do, or a precondition/transient problem that was recorded
//          for the next run (all of these are reported on stdout, never swallowed).
// Exit 1 = local misconfiguration a human has to fix (no key file, no sitemap, HTTP 403/422).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const stateDir = path.join(root, '.state');
const stateFile = path.join(stateDir, 'indexnow.json');
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS_PER_REQUEST = 10000;
const REQUEST_TIMEOUT_MS = 20000;
const RETRIES = 3;

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const flagValue = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const SUBMIT_ALL = hasFlag('--all');
const VERIFY_LIVE = !hasFlag('--no-verify');

const log = (...a) => console.log(...a);
const fail = (msg) => {
  console.error(`\n[IndexNow] 配置错误：${msg}`);
  process.exit(1);
};

// --- the key ---------------------------------------------------------------------------
// The protocol requires the key file to sit at the site root and be named after its own
// contents: https://<host>/<key>.txt must contain exactly <key>. That identity is the
// protocol's own validation rule, so find the key by looking for the single public/*.txt
// that satisfies it. This keeps one source of truth — nothing to drift out of sync.
function findKey() {
  const fromEnv = (process.env.INDEXNOW_KEY || '').trim();
  if (fromEnv) {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(fromEnv)) fail('INDEXNOW_KEY 不是合法的 IndexNow 密钥（8-128 位十六进制/数字/连字符）。');
    return { key: fromEnv, source: 'INDEXNOW_KEY 环境变量' };
  }
  const dir = path.join(root, 'public');
  if (!fs.existsSync(dir)) fail('找不到 public/ 目录。');
  const matches = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.txt')) continue;
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    const body = fs.readFileSync(full, 'utf8');
    if (body.trim() === path.basename(name, '.txt')) matches.push({ key: body.trim(), file: full });
  }
  if (matches.length === 0) {
    fail(
      'public/ 下没有找到 IndexNow 密钥文件。需要一个名为 <key>.txt、内容正好是 <key> 的文件\n' +
        '         （例如 public/5a83...8f23.txt 内容为 5a83...8f23），或设置 INDEXNOW_KEY 环境变量。'
    );
  }
  if (matches.length > 1) {
    fail(`public/ 下有 ${matches.length} 个可能的密钥文件，无法确定用哪个：\n        ${matches.map((m) => path.relative(root, m.file)).join('\n        ')}`);
  }
  const { key, file } = matches[0];
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) fail(`密钥 ${key} 不是合法格式（8-128 位十六进制/数字/连字符）。`);
  return { key, source: path.relative(root, file) };
}

// --- sitemaps --------------------------------------------------------------------------
function sitemapPaths() {
  const explicit = flagValue('sitemap', null);
  if (explicit) {
    const full = path.resolve(root, explicit);
    if (!fs.existsSync(full)) fail(`指定的 sitemap 不存在：${explicit}（先运行一次构建）。`);
    return [full];
  }
  const candidates = ['dist-global/sitemap-0.xml', 'dist-cn/sitemap-0.xml'].map((p) => path.join(root, p));
  const found = candidates.filter((p) => fs.existsSync(p));
  if (found.length === 0) {
    fail('dist-global/ 和 dist-cn/ 下都没有 sitemap-0.xml。先运行构建（npm run build:all）。');
  }
  return found;
}

function readSitemap(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const buildDir = path.dirname(file);
  const byOrigin = new Map();
  for (const url of urls) {
    const origin = new URL(url).origin;
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(url);
  }
  return { buildDir, byOrigin, count: urls.length };
}

// Map a URL back to the file that produced it, so we can tell changed pages apart.
function builtFileFor(buildDir, url) {
  let pathname = decodeURIComponent(new URL(url).pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  else if (!path.extname(pathname)) pathname += '/index.html';
  return path.join(buildDir, pathname.replace(/^\//, ''));
}

function contentHash(buildDir, url) {
  const file = builtFileFor(buildDir, url);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

// --- state (change log + retry queue) --------------------------------------------------
function readState() {
  if (!fs.existsSync(stateFile)) return { submitted: {}, pending: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return { submitted: parsed.submitted || {}, pending: parsed.pending || {} };
  } catch {
    log('[IndexNow] 状态文件损坏，按全新状态处理。');
    return { submitted: {}, pending: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// --- network ---------------------------------------------------------------------------
async function fetchWithRetry(url, options, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      // Retry only the statuses that can genuinely be transient.
      if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
        lastError = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  log(`[IndexNow] ${label} 网络失败（已重试 ${RETRIES} 次）：${lastError?.cause?.code || lastError?.message}`);
  return null;
}

// HEAD first (cheap); fall back to GET for hosts that dislike HEAD. Only 200 counts as
// "this URL is actually served".
async function isLive(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'User-Agent': 'gficcrew-indexnow/1.0' },
      });
      if (method === 'GET') await res.body?.cancel().catch(() => {});
      return res.status === 200;
    } catch {
      // try the next method
    }
  }
  return false;
}

async function keyFileIsLive(origin, key) {
  const keyUrl = `${origin}/${key}.txt`;
  try {
    const res = await fetch(keyUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': 'gficcrew-indexnow/1.0' },
    });
    if (res.status !== 200) return { ok: false, reason: `${keyUrl} 返回 HTTP ${res.status}` };
    const body = (await res.text()).trim();
    if (body !== key) return { ok: false, reason: `${keyUrl} 的内容不是密钥本身` };
    return { ok: true, url: keyUrl };
  } catch (err) {
    return { ok: false, reason: `${keyUrl} 无法访问（${err?.cause?.code || err.message}）` };
  }
}

// --- main ------------------------------------------------------------------------------
const { key, source } = findKey();
const state = readState();
const sitemaps = sitemapPaths();

log(`[IndexNow] 密钥来源：${source}`);
log(`[IndexNow] 处理 ${sitemaps.length} 个 sitemap${DRY_RUN ? '（--dry-run，不会真的提交）' : ''}`);

let submittedTotal = 0;
let anyFailure = false;

for (const file of sitemaps) {
  const { buildDir, byOrigin, count } = readSitemap(file);
  log(`\n[IndexNow] ${path.relative(root, file).replace(/\\/g, '/')} — ${count} 条 URL，${byOrigin.size} 个站点`);

  for (const [origin, urls] of byOrigin) {
    const host = new URL(origin).host;

    // Precondition: the key file has to be reachable on this origin. Before the new build
    // is deployed there it will not be, and submitting anyway would just earn a 403. That
    // is an expected state during a migration, not an error.
    const keyCheck = await keyFileIsLive(origin, key);
    if (!keyCheck.ok) {
      log(`  ${host}: 跳过 — 密钥文件尚未生效（${keyCheck.reason}）`);
      log(`    → 该域名部署好这一版构建后会自动开始提交，无需人工干预。`);
      continue;
    }

    // IndexNow should carry changes, not the whole inventory every run.
    let candidates = urls.filter((u) => !/\/(admin|404\.html)(\/|$)/.test(new URL(u).pathname));
    if (!SUBMIT_ALL) {
      const changed = candidates.filter((u) => contentHash(buildDir, u) !== state.submitted[u]);
      const pendingForHost = state.pending[host] || [];
      candidates = [...new Set([...changed, ...pendingForHost])].filter((u) => urls.includes(u) || pendingForHost.includes(u));
      if (candidates.length === 0) {
        log(`  ${host}: 无变化，跳过（${urls.length} 条 URL 全部与上次提交一致）。`);
        continue;
      }
      log(`  ${host}: ${candidates.length}/${urls.length} 条有变化${pendingForHost.length ? `（含 ${pendingForHost.length} 条上次失败的补发）` : ''}`);
    } else {
      log(`  ${host}: --all，提交全部 ${candidates.length} 条`);
    }

    // Only submit URLs the live host actually serves. While gficcrew.com still points at
    // the previous build this quietly narrows the list to what exists; after the switch it
    // expands on its own.
    if (VERIFY_LIVE) {
      const checks = await Promise.all(candidates.map(async (u) => [u, await isLive(u)]));
      const dead = checks.filter(([, ok]) => !ok).map(([u]) => u);
      candidates = checks.filter(([, ok]) => ok).map(([u]) => u);
      if (dead.length) log(`    ${host}: ${dead.length} 条当前未上线，本次不发（上线后会自动补）：\n      - ${dead.join('\n      - ')}`);
      if (candidates.length === 0) {
        log(`  ${host}: 可提交的 URL 为 0，跳过。`);
        continue;
      }
    }

    if (candidates.length > MAX_URLS_PER_REQUEST) {
      log(`    ${host}: 超过单次上限 ${MAX_URLS_PER_REQUEST}，只发前 ${MAX_URLS_PER_REQUEST} 条。`);
      candidates = candidates.slice(0, MAX_URLS_PER_REQUEST);
    }

    if (DRY_RUN) {
      log(`    [dry-run] POST ${ENDPOINT}`);
      log(`    [dry-run] host=${host} keyLocation=${keyCheck.url}`);
      log(`    [dry-run] urlList (${candidates.length}):\n      - ${candidates.join('\n      - ')}`);
      continue;
    }

    const payload = { host, key, keyLocation: keyCheck.url, urlList: candidates };
    const res = await fetchWithRetry(
      ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'gficcrew-indexnow/1.0' },
        body: JSON.stringify(payload),
      },
      `POST ${host}`
    );

    if (!res) {
      state.pending[host] = [...new Set([...(state.pending[host] || []), ...candidates])];
      anyFailure = true;
      log(`    ${host}: 网络问题，${candidates.length} 条已存入待补发队列，下次运行会重试。`);
      continue;
    }

    if (res.status === 200 || res.status === 202) {
      for (const u of candidates) state.submitted[u] = contentHash(buildDir, u) || 'unknown';
      state.pending[host] = [];
      submittedTotal += candidates.length;
      log(`    ${host}: 已提交 ${candidates.length} 条 — HTTP ${res.status}${res.status === 202 ? '（密钥校验中，属正常首次提交）' : ''}`);
      continue;
    }

    if (res.status === 400 || res.status === 403 || res.status === 422) {
      const detail =
        res.status === 400
          ? '请求格式非法'
          : res.status === 403
            ? '密钥无效（密钥文件未找到，或文件内容与提交的密钥不一致）'
            : 'URL 不属于该 host，或密钥与协议要求不符';
      fail(`提交被拒绝 — HTTP ${res.status}：${detail}。这是配置问题，需要人工检查。`);
    }

    // 429 and anything else unexpected: keep the URLs for the next run rather than losing them.
    state.pending[host] = [...new Set([...(state.pending[host] || []), ...candidates])];
    anyFailure = true;
    log(`    ${host}: HTTP ${res.status}，${candidates.length} 条已存入待补发队列。`);
  }
}

if (!DRY_RUN) writeState(state);

if (DRY_RUN) {
  log('\n[IndexNow] --dry-run 结束，未提交、未写入状态。');
} else if (submittedTotal > 0) {
  log(`\n[IndexNow] 完成：本次提交 ${submittedTotal} 条 URL。`);
} else if (anyFailure) {
  log('\n[IndexNow] 完成：本次没有成功提交，待补发队列已保留，下次运行会重试。');
} else {
  log('\n[IndexNow] 完成：没有需要提交的变化。');
}
