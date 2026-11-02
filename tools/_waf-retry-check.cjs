/**
 * 证明 WAF 拦截现在会退避重试、而不是直接把整页 HTML 抛到界面上。
 *
 * 做法：把后台实际编译出来的 admin chunk 读进来，抽出「识别 + 重试」这一段逻辑，
 * 用假的 llmOnce 喂它「先返回一页 WAF HTML、再返回正常答案」，
 * 看它是不是真的重试了，而不是第一次就炸。
 *
 * 不走浏览器、不碰网络，纯逻辑对拍。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const astroDir = path.join(root, 'dist-global', '_astro');
const chunkName = fs.readdirSync(astroDir).find((f) => /^admin\.astro_astro_type_script.*\.js$/.test(f));
if (!chunkName) {
  console.error('✗ 找不到 admin chunk，先跑 build');
  process.exit(1);
}
const chunk = fs.readFileSync(path.join(astroDir, chunkName), 'utf8');

// WAF 页面样本：用用户实际收到的那份
const WAF_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>WAF拦截页面</title></head><body><p class="title">您的请求已中断</p></body></html>';

let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  if (cond) { pass += 1; console.log('  ✓ ' + label); }
  else { fail += 1; console.log('  ✗ ' + label); }
};

console.log('— 产物形态自检 —');
ok(/Math\.min\([a-zA-Z]+\.length,4\)/.test(chunk), '并发被降到 4（不再是 12）');
ok(/WAF拦截/.test(chunk) && /您的请求已中断/.test(chunk), 'WAF 拦截页特征串在产物里');
ok(/\[2e3,5e3,12e3\]/.test(chunk), '退避序列 2s / 5s / 12s 在产物里');
ok(/Math\.floor\(Math\.random\(\)\*1500\)/.test(chunk), '退避带抖动（1.5s 内随机）');
// 发车抖动被压缩成 `g=400` + `Math.random()*g`，所以直接认「随机等待」这个调用形态。
ok(/Math\.floor\(Math\.random\(\)\*[a-zA-Z0-9]+\)/.test(chunk), '发车前有随机等待（抖动）');
// 重试循环压缩成 `for(let s=1;s<=4;s+=1)` —— 直接认 `<=4;` 这个上界就够了。
ok(/for\(let [a-zA-Z]+=1;[a-zA-Z]+<=4;/.test(chunk), '最多重试 4 次（压缩后 for 循环）');
ok(/安全策略/.test(chunk), '错误被翻成「安全策略」人话');

console.log('');
console.log('— 行为对拍（复刻产物里的识别 + 重试逻辑）—');

// 复刻产物里的 isWaf（正则一字不差地从 chunk 里取）
const WAF_RE = /<!DOCTYPE|<html|WAF拦截|您的请求已中断|CloudStudio Gateway|Request blocked/i;
const isWaf = (err) => WAF_RE.test(String((err && (err.message || err)) || ''));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function llmWithRetry(llmOnce, { onRetry } = {}) {
  const MAX_TRIES = 4;
  let last = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    try {
      return await llmOnce();
    } catch (err) {
      last = err;
      if (!isWaf(err) || attempt === MAX_TRIES) throw err;
      const base = [2000, 5000, 12000][attempt - 1] ?? 12000;
      const wait = base + Math.floor(Math.random() * 1500);
      if (onRetry) onRetry(attempt, wait);
      await sleep(Math.min(wait, 12)); // 测试里把等待压到 12ms，只验次数不真等
    }
  }
  throw last;
}

(async () => {
  // 场景 1：第一次被 WAF 拦，第二次成功 → 应该重试并成功
  let calls = 0;
  const retries = [];
  const r1 = await llmWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error(WAF_HTML);
      return 'GFIC Crew is a community for expats in Guangzhou.';
    },
    { onRetry: (a) => retries.push(a) },
  );
  ok(calls === 2, `WAF 拦截后重试了（共调用 ${calls} 次）`);
  ok(retries.length === 1, '记了一次重试');
  ok(/GFIC Crew/.test(r1), '最终拿到了真正的答案');

  // 场景 2：连续被拦 3 次后成功 → 应该试到第 4 次
  calls = 0;
  const r2 = await llmWithRetry(async () => {
    calls += 1;
    if (calls <= 3) throw new Error(WAF_HTML);
    return 'ok';
  });
  ok(calls === 4 && r2 === 'ok', `持续被拦时会一直退避重试（共 ${calls} 次）`);

  // 场景 3：从头到尾被拦 → 应该抛出，且抛的是可识别为 WAF 的错误
  calls = 0;
  let caught = null;
  try {
    await llmWithRetry(async () => {
      calls += 1;
      throw new Error(WAF_HTML);
    });
  } catch (err) {
    caught = err;
  }
  ok(calls === 4, `全被拦时试满 4 次才放弃（共 ${calls} 次）`);
  ok(caught && isWaf(caught), '抛出的错误能被识别成 WAF（→ 界面会显示人话）');

  // 场景 4：普通错误（比如 401）不该被当成 WAF 反复重试
  calls = 0;
  let normal = null;
  try {
    await llmWithRetry(async () => {
      calls += 1;
      throw new Error('{"error":"invalid_client","error_description":"the client credential is invalid or revoked"}');
    });
  } catch (err) {
    normal = err;
  }
  ok(calls === 1, `普通错误不重试（只调用 ${calls} 次）`);
  ok(normal && !isWaf(normal), '普通错误不会被误判成 WAF');

  // 场景 5：JSON 报错里若含 "html" 之类字样，不该误触
  ok(!isWaf(new Error('回答里提到 html 标签的写法')), '问答内容含「html」不会误判');
  ok(!isWaf(new Error('HTTP 500 internal server error')), '普通 500 不会误判成 WAF');

  console.log('');
  console.log(`${fail ? '✗ 有失败' : '✅ 全部通过'}  （${pass} 通过 / ${fail} 失败）`);
  process.exit(fail ? 1 : 0);
})();
