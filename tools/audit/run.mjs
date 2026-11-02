// Audit runner. `node tools/audit/run.mjs [check-id ...]`
//
// Each check is an independent method aimed at a different class of bug:
// source-data invariants, build-to-build differential, link crawling, structured data,
// markup hygiene, static analysis of the admin code, live cloud permission probing,
// and property tests on pure functions. Same contract for all of them, so a new method
// is one new file.
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

register('./_loader.mjs', import.meta.url);
globalThis.__GFIC_AUDIT_ENV__ = {
  PUBLIC_SITE_URL: 'https://gficcrew.com',
  PUBLIC_VARIANT: 'global',
  PUBLIC_ICP: '',
  MODE: 'global',
  DEV: false,
  PROD: true,
};

const DIR = path.join(import.meta.dirname, 'checks');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.mjs'))
  .sort();

const checks = [];
for (const f of files) {
  // pathToFileURL, not path.join: on Windows a bare absolute path is read as a
  // `c:` URL scheme and the default loader rejects it.
  const mod = await import(pathToFileURL(path.join(DIR, f)).href);
  if (!only.length || only.includes(mod.id)) checks.push({ file: f, ...mod });
}

const ICON = { fail: '\u2718', warn: '!', pass: '\u2713' };
let counts = { fail: 0, warn: 0, pass: 0 };
const results = [];

for (const check of checks) {
  process.stdout.write(`\n[${check.id}] ${check.name}\n`);
  let findings;
  try {
    findings = await check.run();
  } catch (err) {
    findings = [{ level: 'fail', title: '检查自身崩了', detail: `${err.message}`, evidence: [String(err.stack).split('\n')[1] || ''] }];
  }
  for (const f of findings) {
    counts[f.level] += 1;
    process.stdout.write(`  ${ICON[f.level]} ${f.title}${f.detail ? ' — ' + f.detail : ''}\n`);
    for (const e of f.evidence || []) process.stdout.write(`      ${e}\n`);
  }
  results.push({ id: check.id, name: check.name, findings });
}

const total = counts.fail + counts.warn + counts.pass;
process.stdout.write(`\n${'='.repeat(72)}\n`);
process.stdout.write(`共 ${checks.length} 个检查、${total} 条结论：${counts.fail} 失败 / ${counts.warn} 警告 / ${counts.pass} 通过\n`);
if (counts.fail) {
  process.stdout.write('\n失败项：\n');
  for (const r of results) for (const f of r.findings) if (f.level === 'fail') process.stdout.write(`  [${r.id}] ${f.title}\n`);
}

// Machine-readable copy so a report can be generated without re-running everything.
fs.mkdirSync(path.join(import.meta.dirname, '_out'), { recursive: true });
fs.writeFileSync(
  path.join(import.meta.dirname, '_out', 'audit.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), counts, results }, null, 2),
);

process.exitCode = counts.fail ? 1 : 0;
