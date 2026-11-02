/**
 * 幂等脚本：把全站会员口径统一改成「付费会员尚未开放」。
 *
 * 背景：社群目前只有创始人在运营，所有群免费。但站上有多处把会员写成现在时 ——
 * 教人怎么付款、承诺退款、"已终身制"。这些都属于「把没发生的事写成正在进行时」。
 * 老郑 2026-10-05 拍板：会员口径整体改成未开放。
 *
 * 涉及两处数据（faq / plans），每处都是「代码兜底 + generated」双端。
 * 页面里的硬编码（membership.astro / faq.astro / llms*.ts）不在这个脚本里，走 Edit。
 *
 * ⚠️ 刻意不改 FAQ 的 `q`（问题文本）：云端 `cms_list` 按 slugify(q) 匹配条目，
 *    改 q 会让 slug 变化，同步时会变成「新增 1 条 + 旧条目留着」的重复。
 *    所以只改答案，不改问题。「How do I pay the membership fee?」作为问题本身是合理的。
 *
 * 用法：node scripts/_membership-not-open.mjs [--write]
 * 幂等：已经是新文案就跳过，复跑应输出「0 处」。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

// 引号内的内容级替换 —— 源码用单引号、generated json 用双引号，同一份 from/to 两处都能命中。
const EDITS = [
  {
    name: 'FAQ｜「和别的群有什么不同」答尾：Membership is lifetime → 将来时',
    from: 'Membership is lifetime, and there are no commercial advertisements inside the crew.',
    to: 'When paid membership opens it will be lifetime rather than a fee per meetup, and there are no commercial advertisements inside the crew.',
  },
  {
    name: 'FAQ｜「多少钱」答：陈述价格 → 未开放 + 预告价格',
    from: 'Lifetime membership is RMB 288 (USD 42) for the National Group, RMB 688 (USD 98) for a City Group and RMB 2,888 (USD 420) for the Business Group. It is a one-time fee, not a subscription.',
    to: 'Paid membership has not opened yet, so joining costs nothing today. These are the prices it will use when it does: RMB 288 (USD 42) for the National Group, RMB 688 (USD 98) for a City Group and RMB 2,888 (USD 420) for the Business Group. Each is a single payment rather than a subscription.',
  },
  {
    name: 'FAQ｜「能退款吗」答：现在时承诺 → 开放后适用',
    from: 'Yes. Members who have not participated in any activities within a week of joining the crew and have not violated the community rules may receive a full refund of their membership fee if they leave.',
    to: 'Yes, once paid membership opens. Anyone who has not joined an activity in their first week and has not broken the community rules will be able to leave and get the fee back in full. Until then there is no fee to refund, because every group is free.',
  },
  {
    name: 'FAQ｜「怎么付款」答：教人付款 → 现在免费 + 以后怎么办',
    from: 'Message us on WeChat (DN8117) and we send payment instructions by WeChat Pay or Alipay. Once payment is confirmed you are added to the relevant city group within 24 hours.',
    to: 'There is nothing to pay yet, because paid membership has not opened. Add WeChat ID DN8117, say which group you are after, and we add you, normally within 24 hours. When membership does open we will take payment by WeChat Pay or Alipay, and we will set out the steps here before anything is charged.',
  },
  {
    name: 'FAQ｜「能推广生意吗」答：Business Group is for → will cover once it opens',
    from: 'Business visibility is what the Business Group membership (RMB 2,888) is for, and partner events are planned for later',
    to: 'Business visibility is what the Business Group (RMB 2,888) will cover once it opens, and partner events are planned for later',
  },
  {
    name: 'plans｜REFUND_TERMS：现在时退款承诺 → 开放后条款',
    from: 'Members who have not participated in any activities within a week of joining the crew and have not violated the community rules may receive a full refund of their membership fee if they leave.',
    to: 'Once paid membership opens: anyone who has not joined an activity in their first week and has not broken the community rules can leave and get the fee back in full. There is no fee to refund today, because every group is free to join.',
  },
];

// ⚠️ 同一段文案在站上有多份冗余副本，别只改一处：
//    REFUND_TERMS 既存在于 plans.*（page 用它渲染），也存在于 generated/site.json（后台 site 集合带出来的）。
//    两者都要改，否则 pull → import 会把云端旧值写回来。
const FILES = [
  path.join(root, 'src', 'data', 'faq.js'),
  path.join(root, 'src', 'data', 'generated', 'faq.json'),
  path.join(root, 'src', 'data', 'plans.js'),
  path.join(root, 'src', 'data', 'generated', 'plans.json'),
  path.join(root, 'src', 'data', 'generated', 'site.json'),
];

// 自检：改完之后不该再有「现在就能买 / 已经在收费」的措辞
const BAN = [
  'Membership is lifetime',
  'Lifetime membership is RMB',
  'we send payment instructions',
  'Once payment is confirmed you are added',
  'may receive a full refund of their membership fee',
  'membership fee?', // q 不改，所以这个一定会命中 —— 见下方白名单处理
];
const BAN_ALLOW = ['membership fee?']; // q 文本刻意保留（云端按 slugify(q) 匹配）

let totalApplied = 0;
let totalSkipped = 0;
const problems = [];

for (const file of FILES) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  let text = fs.readFileSync(file, 'utf8');
  let applied = 0;
  let skipped = 0;

  for (const edit of EDITS) {
    const countFrom = text.split(edit.from).length - 1;
    const countTo = text.split(edit.to).length - 1;

    if (countTo > 0 && countFrom === 0) {
      skipped += 1;
      continue; // 已改过
    }
    // from 在某些文件里本来就不存在（比如 REFUND_TERMS 只在 plans.* 里），静默跳过
    if (countFrom === 0) continue;
    if (countFrom !== 1) {
      problems.push(`${rel}｜${edit.name}：命中 ${countFrom} 次（应为 1）`);
      continue;
    }
    text = text.replace(edit.from, edit.to);
    applied += 1;
  }

  for (const ban of BAN) {
    if (BAN_ALLOW.includes(ban)) continue;
    const n = text.split(ban).length - 1;
    if (n > 0) problems.push(`${rel}：残留旧文案「${ban}」×${n}`);
  }

  if (applied > 0 && WRITE) fs.writeFileSync(file, text, 'utf8');
  console.log(`${rel}：应用 ${applied} 处，跳过 ${skipped} 处${WRITE ? '（已写入）' : '（dry-run）'}`);
  totalApplied += applied;
  totalSkipped += skipped;
}

console.log(`\n合计：应用 ${totalApplied} 处，已应用跳过 ${totalSkipped} 处`);
if (problems.length) {
  console.log('\n⚠ 问题：');
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('✓ 自检通过，无「现在已经收费」的措辞残留');
}
