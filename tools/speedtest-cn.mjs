#!/usr/bin/env node
// Measure time-to-first-byte from THIS machine to the hosts we are choosing between.
//
// Run it on a mainland-China connection with VPN and proxy OFF. The numbers are only
// meaningful from there: this measures a network path, and a proxy replaces that path.
//
//   node tools/speedtest-cn.mjs        7 samples per host (default)
//   node tools/speedtest-cn.mjs 15     15 samples per host
//   node tools/speedtest-cn.mjs --csv  3 samples per host, append one row to today's CSV
//                                      and print a single line instead of the full report
//   node tools/speedtest-cn.mjs --report
//                                      aggregate the collected CSV files into one readable
//                                      table (cold start + steady state per host)
//   node tools/speedtest-cn.mjs --report=2026-10-03    just one day
//   node tools/speedtest-cn.mjs --report --md          markdown table, for pasting
//
// Read the MEDIAN and the SPREAD, not the fastest run. For overseas hosts seen from
// China, instability matters more than the average: a host that answers in 300ms every
// single time is better than one that answers in 150ms half the time and times out the
// rest, because the second one is what users experience as "sometimes it just won't load".
//
// Also worth knowing: TTFB is the network metric that matters here. It is DNS + TCP + TLS
// + the server's own think time, and it does NOT depend on page weight - so comparing a
// small site against a big one is still fair.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve data paths from this file, not from process.cwd(). A scheduler (Windows Task
// Scheduler in particular) does not set a working directory, so cwd-relative paths would
// scatter the CSV somewhere unpredictable or fail outright.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(SCRIPT_DIR);
const relRoot = (p) => path.relative(PROJECT_ROOT, p) || '.';

const args = process.argv.slice(2);
const CSV_MODE = args.includes('--csv');
const reportArg = args.find((a) => a === '--report' || a.startsWith('--report='));
const REPORT_MODE = Boolean(reportArg);
// --report=2026-10-03 limits the aggregate to one day; bare --report uses every CSV.
const REPORT_FILTER = reportArg && reportArg.includes('=') ? reportArg.split('=')[1] : '';
const MD_MODE = args.includes('--md');
// In CSV mode this runs from a scheduler every few minutes, so keep each round short.
const explicitSamples = args.find((a) => /^\d+$/.test(a));
const SAMPLES = explicitSamples ? Math.max(1, Number(explicitSamples)) : CSV_MODE ? 3 : 7;
const TIMEOUT_MS = 20000;

// Two of these are stand-ins. Cloudflare and GitHub Pages cannot be tested as *our*
// deployment yet (the Cloudflare Worker has no hostname, GitHub Pages is not set up), but
// both providers serve these hosts from the same edge network our site would land on, so
// they measure the path rather than the product.
const TARGETS = [
  { label: 'gficcrew.com', url: 'https://gficcrew.com/', note: 'GitHub Pages，当前线上' },
  { label: 'workbuddy.host', url: 'https://gficcrew.app.workbuddy.host/', note: 'WorkBuddy 托管，当前兜底' },
  { label: 'pages.github.com', url: 'https://pages.github.com/', note: 'GitHub Pages 边缘（代表站点）' },
  { label: 'cloudflare.com', url: 'https://www.cloudflare.com/', note: 'Cloudflare 边缘（代表站点）' },
];

const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];
const proxyInUse = PROXY_VARS.filter((v) => process.env[v]);

// Checking env vars for a proxy would be a false alarm here: Node's fetch does not read
// them (verified - pointing them at a dead port still succeeds). What actually matters is
// whether the traffic leaves the machine through a VPN or a system-wide proxy, and the
// only honest way to know is to look at where the traffic comes out. Cloudflare's trace
// endpoint reports the egress IP, its country, and which edge datacenter answered.
async function egress() {
  try {
    const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(10000) });
    const body = await res.text();
    const field = (k) => (body.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1] || '';
    // colo is recorded in the CSV: if latency moves during the day, the edge we landed on
    // is the first explanation to check.
    return { ip: field('ip'), loc: field('loc'), colo: field('colo') };
  } catch {
    return null;
  }
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)}` : '-');

// One sample: time until response headers arrive, which is time-to-first-byte. The body's
// *content* is not what we want - the network path is.
//
// But the body must still be CONSUMED, not cancelled. Measured 2026-10-04, same host, 5 runs:
//   res.body.cancel() -> 663, 575, 584, 575, 584 ms   (a full TCP+TLS handshake every time)
//   res.arrayBuffer() -> 586, 203, 202, 200, 200 ms   (connection reused from sample 2 on)
// Cancelling destroys the socket instead of returning it to undici's pool, which silently made
// every "warm" sample pay the handshake again - inflating the stable column by ~380 ms and
// making it impossible to tell a slow path from an expensive TLS handshake. `ttfb` is read
// before the body either way, so consuming it does NOT contaminate the measurement.
async function sample(url) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'gficcrew-speedtest/1.0', 'Cache-Control': 'no-cache' },
    });
    const ttfb = performance.now() - started;
    await res.arrayBuffer().catch(() => {});
    return { ok: res.status < 400, status: res.status, ttfb };
  } catch (err) {
    return { ok: false, status: 0, ttfb: NaN, error: err?.cause?.code || err?.name || err.message };
  }
}

async function measure(target) {
  // The first request is what a brand-new visitor actually experiences: nothing is pooled
  // yet, so it pays DNS + TCP + TLS before the server even starts answering. Every later
  // request reuses the connection and drops to roughly one round trip. Mixing the two is
  // why a 3-sample run and a 12-sample run can disagree by 6x, so keep them apart.
  const cold = await sample(target.url);
  const warm = [];
  const failures = [];
  if (!(Number.isFinite(cold.ttfb) && cold.ok)) failures.push(cold.error || `HTTP ${cold.status}`);

  for (let i = 1; i < SAMPLES; i += 1) {
    const r = await sample(target.url);
    if (Number.isFinite(r.ttfb) && r.ok) warm.push(r.ttfb);
    else failures.push(r.error || `HTTP ${r.status}`);
  }
  return {
    target,
    cold: cold.ttfb,
    warm,
    failures,
    med: median(warm),
    min: warm.length ? Math.min(...warm) : NaN,
    max: warm.length ? Math.max(...warm) : NaN,
  };
}

// ---------------------------------------------------------------------------
// CSV mode
// ---------------------------------------------------------------------------
// The scheduler runs this every 10 minutes for a day, so each run appends one row
// instead of printing a wall of prose. One file per day:
//   tools/_speedtest/2026-10-03.csv
// A row per run (rather than one summary at the end) means a run that dies halfway
// still leaves whatever it managed to collect.
const CSV_DIR = path.join(SCRIPT_DIR, '_speedtest');
const CN_TZ = 'Asia/Shanghai';

function csvColumns() {
  const cols = ['time', 'samples', 'egress_loc', 'egress_colo', 'egress_ip'];
  for (const t of TARGETS) {
    cols.push(`${t.label}_cold`, `${t.label}_stable`, `${t.label}_worst`, `${t.label}_fail`);
  }
  return cols;
}

const csvCell = (v) => {
  const s = Number.isFinite(v) ? String(v) : v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvNum = (n) => (Number.isFinite(n) ? Math.round(n) : '');

function appendCsv(results, e) {
  fs.mkdirSync(CSV_DIR, { recursive: true });
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: CN_TZ }).format(now);
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CN_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(now);
  const file = path.join(CSV_DIR, `${date}.csv`);
  const header = csvColumns().join(',');

  // If the column set ever changes (a target added or removed) appending to the old file
  // would silently misalign every later row against the old header. Move it aside rather
  // than destroy it.
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    const firstLine = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
    if (firstLine !== header) {
      const aside = `${file}.old-${Date.now()}`;
      fs.renameSync(file, aside);
      console.error(`列定义变了，旧文件已改名为 ${path.basename(aside)}，今天重新开始记录。`);
    }
  }

  const fresh = !fs.existsSync(file) || fs.statSync(file).size === 0;
  const row = [stamp, SAMPLES, e?.loc || '', e?.colo || '', e?.ip || ''];
  for (const r of results) {
    row.push(csvNum(r.cold), csvNum(r.med), csvNum(r.max), `${r.failures.length}/${SAMPLES}`);
  }
  fs.appendFileSync(file, (fresh ? `${header}\n` : '') + row.map(csvCell).join(',') + '\n');
  return { file, stamp };
}

// ---------------------------------------------------------------------------
// Report mode
// ---------------------------------------------------------------------------
// A day of 10-minute samples is ~144 rows, which nobody is going to read by eye. This
// collapses each host to the two numbers that actually decide the question:
//   - cold start, the range across the whole collection, because that is what a first-time
//     visitor from WeChat or search results pays (DNS + TCP + TLS before any content)
//   - steady-state median, also as a range, because the spread between runs is the jitter
// The ranges are min-max across runs, not a confidence interval: with this few runs the
// honest summary of "it varied" is the spread itself.

// CJK glyphs occupy two terminal columns, so padEnd() misaligns every table with Chinese
// in it. Width has to be computed, not assumed.
const wcwidth = (str) =>
  [...str].reduce((n, ch) => {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1f9ff);
    return n + (wide ? 2 : 1);
  }, 0);
const padW = (s, width, align = 'left') => {
  const gap = ' '.repeat(Math.max(0, width - wcwidth(s)));
  return align === 'right' ? gap + s : s + gap;
};

// Minimal CSV reader. The writer already quotes anything containing a comma or a quote, so
// the reader has to unquote it - timestamps are safe, but a label could change later.
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const numOrNull = (s) => {
  if (s === undefined || s === null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function listCsvFiles() {
  if (!fs.existsSync(CSV_DIR)) return [];
  return fs
    .readdirSync(CSV_DIR)
    .filter((f) => f.endsWith('.csv'))
    .filter((f) => !REPORT_FILTER || f.startsWith(REPORT_FILTER))
    .sort()
    .map((f) => path.join(CSV_DIR, f));
}

function readSamples(files) {
  const per = new Map();
  const times = [];
  let rows = 0;
  let loc = '';
  let colo = '';

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) continue;
    const header = splitCsvLine(lines[0]);
    const labels = [...new Set(header.filter((h) => h.endsWith('_cold')).map((h) => h.slice(0, -'_cold'.length)))];

    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      // Look columns up by name, not position: an older file may predate a column being added.
      const at = (name) => {
        const i = header.indexOf(name);
        return i >= 0 ? cells[i] ?? '' : '';
      };
      if (at('time')) times.push(at('time'));
      if (!loc && at('egress_loc')) loc = at('egress_loc');
      if (!colo && at('egress_colo')) colo = at('egress_colo');
      rows += 1;

      for (const label of labels) {
        const b =
          per.get(label) || { label, cold: [], med: [], worst: [], fails: 0, samples: 0 };
        const cold = numOrNull(at(`${label}_cold`));
        const med = numOrNull(at(`${label}_stable`));
        const worst = numOrNull(at(`${label}_worst`));
        if (cold !== null) b.cold.push(cold);
        if (med !== null) b.med.push(med);
        if (worst !== null) b.worst.push(worst);
        const failCell = at(`${label}_fail`);
        if (failCell.includes('/')) {
          const [f, d] = failCell.split('/').map((x) => Number(x.trim()));
          if (Number.isFinite(f)) b.fails += f;
          if (Number.isFinite(d)) b.samples += d;
        }
        per.set(label, b);
      }
    }
  }

  // Keep the target order from TARGETS so the report always reads the same way.
  const order = [...TARGETS.map((t) => t.label), ...[...per.keys()].filter((k) => !TARGETS.some((t) => t.label === k))];
  const stats = order
    .filter((label) => per.has(label))
    .map((label) => {
      const b = per.get(label);
      return {
        label,
        note: TARGETS.find((t) => t.label === label)?.note || '',
        coldMin: b.cold.length ? Math.min(...b.cold) : null,
        coldMax: b.cold.length ? Math.max(...b.cold) : null,
        medMin: b.med.length ? Math.min(...b.med) : null,
        medMax: b.med.length ? Math.max(...b.med) : null,
        medAll: median(b.med),
        worstMax: b.worst.length ? Math.max(...b.worst) : null,
        fails: b.fails,
        samples: b.samples,
      };
    });

  return { stats, rows, times, loc, colo, fileCount: files.length };
}

const msRange = (lo, hi) => {
  if (lo === null) return '—';
  return lo === hi ? `${Math.round(lo)} ms` : `${Math.round(lo)}–${Math.round(hi)} ms`;
};

function printReport() {
  const files = listCsvFiles();
  if (!files.length) {
    console.log(REPORT_FILTER ? `没找到 ${REPORT_FILTER} 的采样数据。` : '还没有任何采样数据。');
    console.log(`数据目录：${path.relative(PROJECT_ROOT, CSV_DIR)}`);
    console.log('先采集：node tools/speedtest-cn.mjs --csv');
    return;
  }

  const { stats, rows, times, loc, colo, fileCount } = readSamples(files);
  if (!stats.length) {
    console.log('CSV 里没有可解析的采样行。');
    return;
  }

  const span = times.length ? `${times[0]} → ${times[times.length - 1]}` : '?';
  const scope = REPORT_FILTER ? `${REPORT_FILTER}.csv` : `${fileCount} 个文件`;
  console.log(`实测结果（${scope}，${rows} 轮采样，${span}${loc ? `，出口 ${loc}${colo ? `/${colo}` : ''}` : ''}）`);

  const head = ['目标', '冷启动（首次访问）', '稳定态中位', '最差', '失败'];
  const body = stats.map((s) => [
    s.note ? `${s.label}（${s.note}）` : s.label,
    msRange(s.coldMin, s.coldMax),
    msRange(s.medMin, s.medMax),
    s.worstMax === null ? '—' : `${Math.round(s.worstMax)} ms`,
    `${s.fails}/${s.samples}`,
  ]);

  if (MD_MODE) {
    console.log('');
    console.log(`| ${head.join(' | ')} |`);
    console.log(`|${head.map(() => '---').join('|')}|`);
    for (const r of body) console.log(`| ${r.join(' | ')} |`);
  } else {
    const widths = head.map((h, i) => Math.max(wcwidth(h), ...body.map((r) => wcwidth(r[i]))));
    const render = (cells) =>
      cells.map((c, i) => padW(c, widths[i], i === 0 ? 'left' : 'right')).join('  ');
    console.log('');
    console.log(render(head));
    console.log('─'.repeat(widths.reduce((a, b) => a + b, 0) + 2 * (head.length - 1)));
    for (const r of body) console.log(render(r));
  }

  const withStable = stats.filter((s) => Number.isFinite(s.medAll));
  if (withStable.length >= 2) {
    const fast = withStable.reduce((a, b) => (b.medAll < a.medAll ? b : a));
    const slow = withStable.reduce((a, b) => (b.medAll > a.medAll ? b : a));
    console.log(
      `\n结论：稳定态最快 ${fast.label}（${Math.round(fast.medAll)} ms），` +
        `最慢 ${slow.label}（${Math.round(slow.medAll)} ms），差 ${(slow.medAll / fast.medAll).toFixed(1)} 倍。`
    );
    const jitter = withStable
      .filter((s) => s.worstMax !== null && s.medAll > 0)
      .map((s) => ({ s, ratio: s.worstMax / s.medAll }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    if (jitter && jitter.ratio > 1.5) {
      console.log(
        `　　　抖动最大 ${jitter.s.label}：最差 ${Math.round(jitter.s.worstMax)} ms，` +
          `是中位数的 ${jitter.ratio.toFixed(1)} 倍 —— 这一列比平均快慢更影响"能不能打开"的体感。`
      );
    }
  }

  const failed = stats.filter((s) => s.fails > 0);
  if (failed.length) {
    console.log(`　　　有失败样本：${failed.map((s) => `${s.label} ${s.fails}/${s.samples}`).join('，')}。`);
  }

  if (!MD_MODE) {
    console.log('\n  cold  = 全新访客的首次访问，含 DNS + TCP + TLS 握手');
    console.log('  stable= 连接复用后的中位值；区间是各轮之间的波动，不是误差范围');
    console.log('  区间用「最小–最大」而不是平均值：这几次跑下来它确实会变，把波动藏起来才是误导');
  }
}

async function main() {
  if (REPORT_MODE) {
    printReport();
    return;
  }

  if (!CSV_MODE) {
    console.log(`从本机到各主机的首字节时间（TTFB），每个目标 ${SAMPLES} 次`);
    console.log(`时间：${new Date().toLocaleString('zh-CN', { timeZone: CN_TZ })}\n`);
  }

  const e = await egress();

  if (!CSV_MODE) {
    if (e && e.loc) {
      console.log(`本机出口：IP ${e.ip || '?'}   归属 ${e.loc}   命中 Cloudflare 节点 ${e.colo || '?'}`);
      if (e.loc === 'CN') {
        console.log('→ 出口在中国大陆，测试条件正确。\n');
      } else {
        console.log(`!! 出口归属不是中国大陆（${e.loc}），说明 VPN 或系统代理还开着。`);
        console.log('!! 现在测出来的是那条线路的速度，不能代表大陆用户的体验。关掉后重跑。\n');
      }
    } else {
      console.log('（探测不到本机出口，跳过这项校验。请自行确认 VPN 与系统代理已关闭。）\n');
    }
    if (proxyInUse.length) {
      console.log('提示：检测到代理环境变量 ' + proxyInUse.join(', ') + '。');
      console.log('     Node 的 fetch 不读这些变量，所以本脚本不受影响；');
      console.log('     但若你改用答案里的 curl 命令，curl 会读它们，测之前记得清掉。\n');
    }
  }

  const results = [];
  for (const target of TARGETS) {
    if (!CSV_MODE) process.stdout.write(`  测试 ${target.label} ...`);
    const r = await measure(target);
    results.push(r);
    if (!CSV_MODE) console.log(' 完成');
  }

  if (CSV_MODE) {
    const cells = results
      .map((r) => `${r.target.label} ${ms(r.cold)}/${ms(r.med)}/${ms(r.max)} 失败${r.failures.length}`)
      .join(' | ');
    try {
      const { file, stamp } = appendCsv(results, e);
      console.log(`${stamp} 出口=${e?.loc || '?'}/${e?.colo || '?'} | ${cells} | 已写入 ${path.relative(PROJECT_ROOT, file)}`);
    } catch (err) {
      // A failed write is the one outcome worth surfacing as an error: the samples are
      // gone and the dataset has a hole in it.
      console.error(`${new Date().toISOString()} 写入 CSV 失败：${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  const w = Math.max(...results.map((r) => r.target.label.length));
  // ASCII headers on purpose: CJK glyphs are double-width, so a Chinese header row would
  // not line up with the data rows underneath it.
  console.log(
    '\n' +
      'host'.padEnd(w + 4) +
      'cold(1st)'.padStart(11) +
      'stable'.padStart(10) +
      'worst'.padStart(9) +
      'fail'.padStart(9)
  );
  console.log('-'.repeat(w + 43));
  for (const r of results) {
    console.log(
      r.target.label.padEnd(w + 4) +
        `${ms(r.cold)} ms`.padStart(11) +
        `${ms(r.med)} ms`.padStart(10) +
        ms(r.max).padStart(9) +
        `${r.failures.length}/${SAMPLES}`.padStart(9)
    );
  }
  console.log('\n  cold(1st) = 全新访客的首次访问，含 DNS + TCP + TLS 握手');
  console.log('  stable    = 连接复用后的中位值（回访，或同页后续请求）');
  console.log('  worst     = 稳定态里最慢的一次；它与中位的差距就是链路抖动');

  console.log('\n说明：');
  for (const r of results) console.log(`  ${r.target.label.padEnd(w + 2)} = ${r.target.note}`);

  const dead = results.filter((r) => r.failures.length);
  if (dead.length) {
    console.log('\n有失败样本的目标及其错误原因：');
    for (const r of dead) console.log(`  ${r.target.label}: ${[...new Set(r.failures)].join(', ')}`);
  }

  console.log('\n怎么读这张表：');
  console.log('  1. 先看 cold。你们的访客基本是从微信或搜索结果点进来的新用户，他们感受到的就是这一列。');
  console.log('  2. 再看 fail。国内访问国际站，失败和超时比"慢"更能说明问题。');
  console.log('  3. 然后看 worst 与 stable 的差距，那就是链路抖动。平均快但偶尔卡两秒，体验比一直慢更差。');
  console.log('  4. 最后才比 stable。都落在几百毫秒量级时，稳定性比那 100ms 的差距重要得多。');
  console.log('  5. 换时段再跑一次（尤其晚上 20:00-23:00），国际出口质量随时间变化很大。');
  console.log('  6. 有条件在电信/联通/移动三种线路上各跑一次 —— 国际路由差别很大。');
  console.log('     本脚本只能测你当前这一条线路，代表不了全国。多城市数据请看 itdog.cn 的"网站测速"。');
}

main();
