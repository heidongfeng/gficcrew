// A fingerprint of everything that can change the built output.
//
// Why this exists:
//   On 2026-11-01 a publish ran against a dist-ghpages/ that had been produced
//   hours earlier, before several source edits. The artifact passed the file
//   count check (it had 40+ files), so nothing objected, and an outdated site
//   replaced the live one. Every check we had asked "is the artifact complete?";
//   none asked "is the artifact CURRENT?".
//
//   This module answers the second question. prepare-gh-pages.mjs writes a stamp
//   after it builds the artifact; the publish step recomputes the same
//   fingerprint and refuses to run if anything in src/ or public/ changed since.
//   The consequence is deliberately blunt: you cannot publish stale output, you
//   have to rebuild first.
//
// The fingerprint is (relative path, size, mtime in ms) for every file that
// feeds the build. Content hashing would be safer against timestamp games but
// would cost a full read of the source tree on every publish for no real gain:
// the failure mode we are defending against is forgetting to rebuild, not
// someone deliberately faking mtimes.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-global', 'dist-cn', 'dist-app', 'dist-ghpages']);

function walk(abs, rel, out) {
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const childAbs = path.join(abs, e.name);
    const childRel = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(childAbs, childRel, out);
      continue;
    }
    if (!e.isFile()) continue;
    const st = fs.statSync(childAbs);
    out.push(`${childRel}\t${st.size}\t${Math.floor(st.mtimeMs)}`);
  }
}

/**
 * @param {string} root project root
 * @returns {{hash: string, files: number, newest: number}}
 */
export function sourceFingerprint(root) {
  const lines = [];
  for (const dir of ['src', 'public', 'scripts', 'tools']) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs, dir, lines);
  }
  // Files that sit at the root and still change the output.
  for (const f of ['astro.config.mjs', 'package.json', 'github-pages.config.json']) {
    const abs = path.join(root, f);
    if (fs.existsSync(abs)) {
      const st = fs.statSync(abs);
      lines.push(`${f}\t${st.size}\t${Math.floor(st.mtimeMs)}`);
    }
  }
  lines.sort();
  const hash = crypto.createHash('sha1').update(lines.join('\n'), 'utf8').digest('hex').slice(0, 16);
  const newest = lines.reduce((m, l) => Math.max(m, Number(l.split('\t')[2]) || 0), 0);
  return { hash, files: lines.length, newest };
}

export function stampPath(root) {
  return path.join(root, '.publish-stamp.json');
}

export function writeStamp(root, extra = {}) {
  const fp = sourceFingerprint(root);
  const body = {
    sourceHash: fp.hash,
    sourceFiles: fp.files,
    sourceNewest: fp.newest,
    builtAt: new Date().toISOString(),
    ...extra,
  };
  fs.writeFileSync(stampPath(root), JSON.stringify(body, null, 2) + '\n');
  return body;
}

export function readStamp(root) {
  const p = stampPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Throw the publish away if the artifact predates the source.
 * @returns {{ok: boolean, reason?: string, stamp?: object, current?: object}}
 */
export function checkStamp(root) {
  const stamp = readStamp(root);
  const current = sourceFingerprint(root);
  if (!stamp) {
    return {
      ok: false,
      reason:
        '找不到 .publish-stamp.json —— 这份产物不知道是什么时候、由哪份源码构建的。' +
        '先跑 npm run ghpages:prepare 让它落章，再发布。',
      current,
    };
  }
  if (stamp.sourceHash !== current.hash) {
    return {
      ok: false,
      reason:
        `产物已过期：构建时的源码指纹 ${stamp.sourceHash}，现在是 ${current.hash}。` +
        'src/ 或 public/ 在构建之后被改过，直接发布会把旧版本推上线。先跑 npm run build:all && npm run cn:zip && npm run ghpages:prepare。',
      stamp,
      current,
    };
  }
  return { ok: true, stamp, current };
}
