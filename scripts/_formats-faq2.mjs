/**
 * 收掉几条还在替我们说话的 FAQ 答案。全部属于同一类问题：把"还没发生的事"写成了正在进行时。
 *
 * 1. 「Some of the formats we run most often started as a member’s one-off idea」
 *    —— 社群目前只有老郑一个人，没有任何由会员发起过的活动。
 * 2. 「our longest-running local knowledge sits」—— 我们没有"长期"历史。
 * 3. 「which is where we have people on the ground」—— 复数暗示已有团队。
 * 4. 粤语那条：写成了"我们的语言交换每场都拆分普通话和粤语"，实际没有在跑的场次。
 * 5. 商务推广：写成"我们也办 partner events"，实际没办过。
 * 6. 酒吧那条的收尾：写成了"我们的 pub crawl 就是这么运作的"。
 *
 * 用法：node scripts/_formats-faq2.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const JS = path.join(ROOT, 'src', 'data', 'faq.js');
const JSONF = path.join(ROOT, 'src', 'data', 'generated', 'faq.json');

const EDITS = [
  {
    label: '广州 = 线下主场（去掉「长期积累」的表述）',
    old: 'Alongside Shenzhen it is where we run offline meetups, and it is where our longest-running local knowledge sits — the Guangzhou living guide on this site covers visas, housing, banking, healthcare and getting around.',
    new: 'Alongside Shenzhen it is where we meet people offline, and it is what this site’s living guide is grounded in — visas, housing, banking, healthcare and getting around.',
  },
  {
    label: '会员自发组局（去掉「已有会员发起过」的说法）',
    old: 'Some of the formats we run most often started as a member’s one-off idea.',
    new: 'We are small enough right now that this offer is open rather than theoretical.',
  },
  {
    label: '覆盖城市（去掉「我们在当地有人」的复数暗示）',
    old: 'We run offline meetups in Guangzhou and Shenzhen, which is where we have people on the ground.',
    new: 'We meet offline in Guangzhou and Shenzhen, which is where we are based.',
  },
  {
    label: '粤语（写成计划而非正在进行的场次）',
    old: 'Our Guangzhou language exchange splits each session between Mandarin and Cantonese, and our dim sum and tea workshops are taught with Cantonese phrases included.',
    new: 'In Guangzhou we plan to split each session between Mandarin and Cantonese, and to run the dim sum and tea sessions with Cantonese phrases included. Nothing is on a calendar yet, so say so in the group if you want it.',
  },
  {
    label: '商务推广（partner events 改成计划）',
    old: 'and we also run partner events where promotion is clearly labelled and agreed in advance.',
    new: 'and partner events are planned for later, with any promotion clearly labelled and agreed in advance.',
  },
  {
    label: '酒吧夜（收尾改成想法而非运作方式）',
    old: 'Our pub crawls work on that: somebody who already knows takes the lead.',
    new: 'That is the idea behind our pub crawls: somebody who already knows takes the lead.',
  },
];

let js = fs.readFileSync(JS, 'utf8');
const data = JSON.parse(fs.readFileSync(JSONF, 'utf8'));
const problems = [];
let jsHits = 0;
let already = 0;
let jsonHits = 0;

for (const e of EDITS) {
  // 已经改过的条目要放行，否则脚本无法重复运行。
  const oldLeft = js.includes(e.old) || data.some((i) => typeof i.a === 'string' && i.a.includes(e.old));
  const newThere = js.includes(e.new) || data.some((i) => typeof i.a === 'string' && i.a.includes(e.new));
  if (!oldLeft) {
    if (newThere) {
      already += 1;
      console.log(`⏭ 已应用：${e.label}`);
      continue;
    }
    problems.push(`faq.js / faq.json 都找不到：${e.old.slice(0, 50)}`);
    continue;
  }

  // --- 代码兜底：替换 ---
  const nJs = js.split(e.old).length - 1;
  if (nJs !== 1) problems.push(`faq.js 里命中 ${nJs} 次（应为 1）：${e.old.slice(0, 50)}`);
  else {
    js = js.split(e.old).join(e.new);
    jsHits += 1;
  }

  // --- generated：逐条替换 ---
  const patches = [];
  for (const item of data) {
    if (typeof item.a === 'string' && item.a.includes(e.old)) {
      item.a = item.a.split(e.old).join(e.new);
      patches.push(item.q.slice(0, 46));
    }
  }
  if (patches.length !== 1) problems.push(`faq.json 里命中 ${patches.length} 条（应为 1）：${e.old.slice(0, 50)}`);
  else jsonHits += 1;

  console.log(`✓ ${e.label}`);
  if (patches.length === 1) console.log(`    落在：${patches[0]}`);
}

if (problems.length) {
  console.log('\n❌ 有问题：');
  problems.forEach((p) => console.log('   ✗ ' + p));
  process.exit(1);
}

console.log(`\njs 端替换 ${jsHits} 处 ｜ json 端替换 ${jsonHits} 处`);

if (WRITE) {
  fs.writeFileSync(JS, js, 'utf8');
  fs.writeFileSync(JSONF, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('已写入两端');
} else {
  console.log('（dry-run，加 --write 才写）');
}
