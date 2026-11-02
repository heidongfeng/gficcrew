// Method 11 — cloud contract.
//
// The database is the one part of this project that is not in the repository, so it is the
// one part no amount of reading the source can verify. What the source *can* be checked
// against is a recorded snapshot of the live schema (tools/audit/fixtures/cloud-schema.json,
// refreshed by hand through the read-only cloud APIs).
//
// Two kinds of assertion come out of that:
//   * drift — the code calls a table, column, RPC or collection that the snapshot says no
//     longer exists (or that exists but the code never mentions);
//   * policy — properties the security model must hold. These are written as properties
//     rather than as "is the config what it was", so a table that starts accepting blanket
//     reads fails the check even if the snapshot is refreshed to match.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, warn, pass } from '../_util.mjs';

export const id = 'cloud-contract';
export const name = '云端契约（表/列/RPC/集合一致性 + 行级安全与口令强度断言）';

const SNAPSHOT = path.join(ROOT, 'tools', 'audit', 'fixtures', 'cloud-schema.json');

export async function run() {
  const out = [];
  if (!fs.existsSync(SNAPSHOT)) return [warn('没有云端契约快照', `期望文件：${SNAPSHOT}`)];
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const code = readCode();

  // How old is the snapshot? Every assertion below inherits that age, so state it
  // rather than burying it in a pass message. A stale snapshot does not make the
  // checks wrong, but it does make them *claims about the past* -- and the FAQ count
  // in here was 40 for a month after the live database had moved to 42, which produced
  // a permanent, unactionable warning. 45 days is arbitrary but honest: long enough
  // not to nag, short enough that nobody reads a green tick off half-year-old data.
  const capturedRaw = String(snap._refresh?.capturedAt || '');
  const capturedDate = (capturedRaw.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
  const ageDays = capturedDate ? Math.floor((Date.now() - Date.parse(capturedDate)) / 86400000) : null;
  const AGE_LIMIT = 45;
  if (ageDays === null) {
    out.push(warn('云端快照没有可解析的抓取日期', `_refresh.capturedAt = ${capturedRaw || '(空)'}`, ['下面的表/函数/RLS 断言无法判断是否过期']));
  } else if (ageDays > AGE_LIMIT) {
    out.push(
      warn(
        `云端快照已 ${ageDays} 天未更新（阈值 ${AGE_LIMIT} 天）`,
        `抓取于 ${capturedDate}`,
        ['下面的结论描述的是那一天的状态，不代表现在', '重新抓取 tools/audit/fixtures/cloud-schema.json 后再看检查结果'],
      ),
    );
  } else {
    out.push(pass('云端快照已载入', `${Object.keys(snap.tables).length} 张表、${snap.functions.length} 个函数，抓取于 ${capturedDate}（${ageDays} 天前）`));
  }

  // --- 1. every table the code writes to must exist -------------------------
  const known = new Set(Object.keys(snap.tables));
  const viaRpc = new Set(
    Object.entries(snap.tables)
      .filter(([, meta]) => (meta.accessedViaRpc || []).length)
      .map(([t]) => t),
  );
  const missing = code.tables.filter((t) => !known.has(t));
  // cms_docs / cms_admin are never named in the front end: they are reached only through
  // the SECURITY DEFINER RPCs, so "not mentioned in code" is not the same as "unused".
  const unused = [...known].filter((t) => !code.tables.includes(t) && !viaRpc.has(t));
  out.push(
    missing.length
      ? fail('代码引用了快照里不存在的表', '', missing)
      : pass('代码引用的表都存在', code.tables.join(', ')),
  );
  out.push(
    unused.length
      ? warn(`快照里有代码从未引用的表（${unused.length} 张）`, '为空且无引用的表属于历史遗留，清理前先确认没有外部写入方', unused.map((t) => `${t}（${snap.tables[t].rows ?? '?'} 行）`))
      : pass(
          '快照里的表都有引用',
          [...viaRpc].map((t) => `${t} → 经 ${(snap.tables[t].accessedViaRpc || []).join('/')} 间接访问`).join('；'),
        ),
  );

  // --- 2. RPCs ---------------------------------------------------------------
  const fnNames = new Set(snap.functions.map((f) => f.name));
  const missingFns = code.rpcs.filter((r) => !fnNames.has(r));
  out.push(
    missingFns.length
      ? fail('代码调用了不存在的 RPC', '', missingFns)
      : pass('代码调用的 RPC 都存在', code.rpcs.join(', ')),
  );
  const anonCallable = snap.functions.filter((f) => (f.executeGrantee || []).includes('anon')).map((f) => f.name);
  out.push(
    pass('RPC 的可执行角色', `anon 可执行：${anonCallable.join(', ')}（鉴权靠 p_password 参数，不是靠角色）`),
  );

  // --- 3. collections --------------------------------------------------------
  const snapCols = new Set(Object.keys(snap.collections));
  const missingCols = code.collections.filter((c) => !snapCols.has(c));
  // events 改常青制后是故意留空的：后台照样列出这个集合，只是里面没有文档。
  // 若哪天它又空了而本意不是如此，这条会重新变成警告。
  const INTENTIONALLY_EMPTY = new Set(['events']);
  const emptyCols = code.collections.filter(
    (c) => snap.collections[c] === 0 && !INTENTIONALLY_EMPTY.has(c),
  );
  const intentional = code.collections.filter(
    (c) => snap.collections[c] === 0 && INTENTIONALLY_EMPTY.has(c),
  );
  out.push(
    missingCols.length
      ? fail('后台的集合在云端没有对应数据', '空的集合会让后台列表页看起来像坏了', missingCols)
      : pass('后台用到的集合云端都有数据', code.collections.map((c) => `${c}×${snap.collections[c]}`).join(' ')),
  );
  out.push(
    emptyCols.length
      ? warn('有集合存在但一条数据都没有', '', emptyCols)
      : pass(
          '已配置的集合都不是空的',
          intentional.length ? `例外：${intentional.join(', ')} — 常青制下故意留空` : '',
        ),
  );

  // --- 4. policy: no blanket read on tables holding personal data -----------
  // `USING (true)` on SELECT means the publishable key — which ships in client JS — is
  // enough to read every row. That is a property, not a snapshot value: it must fail
  // whenever it appears, whatever the snapshot says.
  const blanket = [];
  const unexpected = [];
  for (const [table, meta] of Object.entries(snap.tables)) {
    const selectPolicy = (meta.policies || []).find((p) => p.command === 'SELECT');
    const isBlanket = selectPolicy && String(selectPolicy.using || '').trim() === 'true';
    if (isBlanket) {
      const expected = meta.expect?.blanketSelect;
      if (expected === false) {
        blanket.push(
          `${table}：SELECT 策略 ${selectPolicy.name} 使用 USING (true)，而 anon 持有该表 ${(meta.grantAnon || []).join('/')} 权限 —— 任何拿到 publishable key 的人都能读全部行（现 ${meta.rows ?? '?'} 行）。${meta.expect?.why || ''}`,
        );
      } else if (expected === undefined) {
        unexpected.push(`${table}：SELECT 策略为 USING (true)（快照未声明是否预期如此），现 ${meta.rows ?? '?'} 行`);
      }
    }
  }
  out.push(
    blanket.length
      ? fail(`有 ${blanket.length} 张表对匿名开放整表读`, '', blanket)
      : pass('没有表对匿名开放整表读'),
  );
  if (unexpected.length) out.push(warn('有表的读策略未在快照中声明预期', '', unexpected));

  // --- 5. policy: CMS tables must be locked to RPC access only --------------
  const cmsUnlocked = [];
  for (const table of ['cms_docs', 'cms_admin']) {
    const meta = snap.tables[table];
    if (!meta) continue;
    const permissive = (meta.policies || []).filter((p) => !/^false$/i.test(String(p.using)) && !/^false$/i.test(String(p.withCheck)));
    if (!meta.rls) cmsUnlocked.push(`${table}：RLS 未开启`);
    else if (permissive.length) cmsUnlocked.push(`${table}：存在 ${permissive.length} 条宽松策略 —— ${permissive.map((p) => `${p.name}(${p.command})`).join(', ')}`);
  }
  out.push(
    cmsUnlocked.length
      ? fail('内容表没有锁死到只能经由 RPC 访问', '', cmsUnlocked)
      : pass('cms_docs / cms_admin 均为「RLS 开启 + 零策略」', '对 anon 默认拒绝，读只走 cms_list/cms_login（SECURITY DEFINER）'),
  );

  // --- 6. policy: the admin password must be protected by a stretched KDF ----
  const auth = snap.auth || {};
  const stretched = ['bcrypt', 'scrypt', 'argon2', 'pbkdf2'].some((k) => String(auth.kdf || '').toLowerCase().includes(k));
  out.push(
    stretched
      ? pass('后台口令使用带拉伸的 KDF', auth.kdf)
      : fail(
          '后台口令的 KDF 没有做密钥拉伸',
          `现状：${auth.mechanism || '未知'}`,
          [
            `单轮 ${auth.kdf}，${auth.perPasswordSalt ? '每口令独立盐' : `盐存在 ${auth.saltStorage || '固定处'}，非每口令一盐`}`,
            'GPU 下每秒可试数十亿次，口令强度直接决定安全边界',
            `同库已装 pgcrypto：${(auth.pgcryptoAvailable || []).join(', ')} —— 改用 crypt()（bcrypt）不需要新增依赖`,
          ],
        ),
  );
  // The snapshot's rateLimited/lockout flags are a CLAIM made on 2026-10-04, not an
  // observation. Reporting a green tick off them is the worst kind of check: it
  // reassures where assurance was never earned. On 2026-11-01 the claim was tested
  // directly and did not hold -- 7 consecutive wrong passwords in the admin UI, each
  // returning HTTP 200, then the CORRECT password was still rejected; no lockout
  // message, no cooldown. A correct password failing is not an authentication result,
  // it is the account being locked, so a lockout probably does exist -- but "5 tries,
  // 15 minutes" as written here does not match observed behaviour, so the snapshot
  // cannot be trusted until someone reads cms_login's source.
  //
  // Hence: warn, never pass. This check can only go green when rate limiting has been
  // verified by an actual attempt, which a static snapshot cannot do.
  out.push(
    auth.rateLimited || auth.lockout
      ? warn(
          '登录限流/锁定：快照声称有，但未经实测证实',
          `快照记的是 ${auth.lockoutPolicy || '有锁定'} —— 这是记录，不是观测`,
          [
            '2026-11-01 实测：连续 7 次错误口令均返回 200 且无任何锁定提示，随后正确口令也被拒',
            '正确口令被拒通常意味着账号已被锁，但触发阈值与时长与快照不符',
            '待办：读 cms_login 源码确认实际阈值/时长，实测通过后才可转 pass',
            '在此之前，记住口令强度是唯一可依赖的防线',
          ],
        )
      : fail(
          '登录函数没有限速、没有锁定，且对 anon 可执行',
          '口令是唯一屏障，而它可以被无限次尝试',
          ['cms_login(p_password) 对 anon 开放，无失败计数、无冷却、无验证码', '与弱 KDF 叠加时，暴力破解成本只取决于口令本身'],
        ),
  );
  out.push(
    Number(auth.minNewPasswordLength) >= 8 && auth.enforcedServerSide
      ? pass('改口令时服务端强制最小长度', `≥ ${auth.minNewPasswordLength} 位（前端只是提示，后端 cms_set_password 也会拦）`)
      : warn('改口令的最小长度未在服务端强制', `快照记录：${auth.minNewPasswordLength} 位 / 服务端强制=${auth.enforcedServerSide}`),
  );

  // --- 7. cross-check the cloud content against the shipped data ------------
  const dataCheck = [];
  const dataModuleCounts = await loadDataCounts();
  if (dataModuleCounts) {
    for (const [collection, moduleCount] of Object.entries(dataModuleCounts)) {
      const cloudCount = snap.collections[collection];
      if (cloudCount === undefined) continue;
      if (cloudCount !== moduleCount) dataCheck.push(`${collection}：云端 ${cloudCount} 条，src/data 里 ${moduleCount} 条`);
    }
    out.push(
      dataCheck.length
        ? warn('云端内容与代码里的默认值条数不同', 'generated 优先：线上以云端为准，代码里的默认值不会生效，条数不同通常意味着代码侧已过期', dataCheck)
        : pass('云端内容条数与 src/data 完全一致', Object.entries(dataModuleCounts).map(([k, v]) => `${k}×${v}`).join(' ')),
    );
  }

  return out;
}

// --- helpers ---------------------------------------------------------------

/** Everything the site source actually references from the cloud. */
function readCode() {
  const admin = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'admin.astro'), 'utf8');
  const cloud = fs.existsSync(path.join(ROOT, 'src', 'scripts', 'cloud.js')) ? fs.readFileSync(path.join(ROOT, 'src', 'scripts', 'cloud.js'), 'utf8') : '';

  const tables = new Set();
  for (const m of cloud.matchAll(/:\s*'([a-z_]+)'/g)) if (/^crew_/.test(m[1])) tables.add(m[1]);
  for (const m of admin.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) tables.add(m[1]);

  const rpcs = new Set([...admin.matchAll(/rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1]));

  // The admin's COLLECTIONS map: top-level keys that are plain identifiers.
  const collections = new Set();
  const block = /const COLLECTIONS = \{([\s\S]*?)\n\s*\};/.exec(admin);
  if (block) {
    for (const m of block[1].matchAll(/^\s{8}([a-z][a-z0-9_]*)\s*:/gm)) collections.add(m[1]);
    // Drop entries whose value is not an object (e.g. `counts: {}` is a UI placeholder).
    for (const m of block[1].matchAll(/^\s{8}([a-z][a-z0-9_]*)\s*:\s*\{\s*\}/gm)) collections.delete(m[1]);
  }

  return { tables: [...tables].sort(), rpcs: [...rpcs].sort(), collections: [...collections].sort() };
}

async function loadDataCounts() {
  try {
    const D = await (await import('../_util.mjs')).loadData();
    return {
      cities: D.CITIES.length,
      events: D.EVENTS.length,
      faq: D.FAQ.length,
      plans: D.PLANS.length,
      guides: D.GUIDES.length,
    };
  } catch {
    return null;
  }
}
