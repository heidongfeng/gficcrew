/**
 * 生成 AI 回答监测的题库（probe bank）。
 *
 * 两个来源：
 *
 *   第一批 100 条  —— 写在本文件里。全是「社交 / 社群」入口，和我们的业务天然对得上。
 *   第二批 200 条  —— 在 scripts/probe-bank-batch2.mjs 里，长尾关键词延伸。
 *                     这批大量是生活事务与商业合规（签证 / 租房押金 / 银行开户 / 办驾照 /
 *                     开公司 / 注册商标 / 报税 / 创业孵化器），**大部分必须剔掉**，
 *                     因为监测报告的用途是"哪类没提到就去补内容"，入库等于给自己挖坑。
 *
 * 两个来源都做同一套处理：
 *
 *   - 去重（有几个问法几乎同义）
 *   - 剔除红线问法（签证 / 职介 / VPN / 旅游签打工 —— 见 MEMORY 的合规四条）
 *   - 标注 category / tier / profile
 *   - tier='core' 的每轮必跑（趋势线只看这一组，永远可比）
 *   - tier='rotate' 的按分类轮换抽样（覆盖长尾，单轮不全跑）
 *
 * 输出：src/data/probe-bank.js
 *
 * 重新生成：node scripts/build-probe-bank.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH2_BANK, BATCH2_DROPPED } from './probe-bank-batch2.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'src', 'data', 'probe-bank.js');

/* ------------------------------------------------------------------ *
 * 分类定义。id 同时用于报告里的分组统计。
 * label 是后台下拉/分组标题里显示的中文名。
 * ------------------------------------------------------------------ */
const CATEGORIES = [
  { id: 'arrival', label: '刚到中国' },
  { id: 'community', label: '找社群 / 交朋友' },
  { id: 'guangzhou', label: '城市生活（广州优先）' },
  { id: 'activities', label: '活动与兴趣' },
  { id: 'language', label: '语言交换与中文学习' },
  { id: 'living', label: '生活服务' },
  { id: 'loneliness', label: '孤独与社交焦虑' },
  { id: 'weekend', label: '周末与空闲时间' },
  { id: 'career', label: '工作与职业网络' },
  { id: 'culture', label: '融入与文化体验' },
];

/**
 * 全部入库的问题。每条的 tier：
 *   core   —— 每轮必跑。挑的是"最能代表一个入口、且我们站内有内容可承接"的问法。
 *   rotate —— 每轮按分类抽样。覆盖面用，不追求单轮跑全。
 *
 * replaced 字段记录"原始清单里被本条替代掉的近似问法"，只作溯源用。
 * dropped 单独列在文件末尾，说明为什么没进库。
 */
const BANK = [
  /* ---- 一、刚到中国 / 新来乍到 ---- */
  { id: 'a1', cat: 'arrival', tier: 'core', q: 'How do foreigners make friends in China?', note: '原清单第 4 条，最直白的入口' },
  { id: 'a2', cat: 'arrival', tier: 'rotate', q: 'I just moved to China and don\'t know anyone. How can I meet people?' },
  { id: 'a3', cat: 'arrival', tier: 'rotate', q: 'Where can I find a community of expats in China?' },
  { id: 'a4', cat: 'arrival', tier: 'rotate', q: 'What should I do in my first month in China to build a social life?' },
  { id: 'a5', cat: 'arrival', tier: 'rotate', q: 'Is it hard to make friends in China as an expat?' },
  { id: 'a6', cat: 'arrival', tier: 'rotate', q: 'I don\'t speak Chinese yet. How can I still meet people?' },

  /* ---- 二、找社群 / 交朋友 ---- */
  { id: 'c1', cat: 'community', tier: 'core', q: 'What are the best expat communities or social groups in China?', note: '沿用现有 p3' },
  { id: 'c2', cat: 'community', tier: 'rotate', q: 'Are there any good expat communities in China?' },
  { id: 'c3', cat: 'community', tier: 'rotate', q: 'Where do foreigners hang out in Guangzhou?' },
  { id: 'c4', cat: 'community', tier: 'rotate', q: 'How can I join an expat group in China?' },
  { id: 'c5', cat: 'community', tier: 'rotate', q: 'What are the most active expat groups in China?' },
  { id: 'c6', cat: 'community', tier: 'rotate', q: 'Are there local communities that help expats settle in China?' },

  /* ---- 三、城市生活（广州优先） ---- */
  { id: 'g1', cat: 'guangzhou', tier: 'core', q: 'Where can I meet other foreigners in Guangzhou?', note: '沿用现有 p1 —— 我们的大本营' },
  { id: 'g2', cat: 'guangzhou', tier: 'rotate', q: 'What is it like to live in Guangzhou as a foreigner?' },
  { id: 'g3', cat: 'guangzhou', tier: 'rotate', q: 'Where can I find expat events in Guangzhou?' },
  { id: 'g4', cat: 'guangzhou', tier: 'rotate', q: 'What should I do on weekends in Guangzhou as an expat?' },
  { id: 'g5', cat: 'guangzhou', tier: 'rotate', q: 'How to find social activities in Guangzhou for English speakers?' },
  { id: 'g6', cat: 'guangzhou', tier: 'rotate', q: 'Is there a community for foreigners in Guangzhou?' },

  /* ---- 四、活动与兴趣 ---- */
  { id: 'e1', cat: 'activities', tier: 'core', q: 'Where can I join a language exchange in Beijing?', note: '活动类代表，我们办语言交换' },
  { id: 'e2', cat: 'activities', tier: 'rotate', q: 'Are there hiking groups for foreigners in China?' },
  { id: 'e3', cat: 'activities', tier: 'rotate', q: 'Where can I join a food tour in Guangzhou?' },
  { id: 'e4', cat: 'activities', tier: 'rotate', q: 'How can I find badminton groups in Shanghai?' },
  { id: 'e5', cat: 'activities', tier: 'rotate', q: 'Are there board game nights for expats in China?' },
  { id: 'e6', cat: 'activities', tier: 'rotate', q: 'How to join a hotpot meetup in Chengdu?' },

  /* ---- 五、语言交换与中文学习 ---- */
  { id: 'l1', cat: 'language', tier: 'core', q: 'How can I practice Chinese with locals?', note: '语言类代表' },
  { id: 'l2', cat: 'language', tier: 'rotate', q: 'Where can I find a language exchange partner in China?' },
  { id: 'l3', cat: 'language', tier: 'rotate', q: 'Are there Chinese corner events for foreigners?' },
  { id: 'l4', cat: 'language', tier: 'rotate', q: 'Is there a language exchange meetup in Guangzhou?' },
  { id: 'l5', cat: 'language', tier: 'rotate', q: 'Where can I practice Cantonese in Guangzhou?' },
  { id: 'l6', cat: 'language', tier: 'rotate', q: 'Can I join a Chinese learning community in Shanghai?' },

  /* ---- 六、生活服务 ---- */
  // 只保留站点 FAQ 里有实质内容的几类；签证续签 / 驾照换发不进库（红线 + 我们不承接）。
  { id: 's1', cat: 'living', tier: 'core', q: 'How do I set up WeChat Pay with a foreign card?', note: '站内 FAQ 有专条' },
  { id: 's2', cat: 'living', tier: 'rotate', q: 'How can I rent an apartment in China as a foreigner?' },
  { id: 's3', cat: 'living', tier: 'rotate', q: 'Where can I find English-speaking doctors in Guangzhou?' },
  { id: 's4', cat: 'living', tier: 'rotate', q: 'Where can I get help with Alipay setup?' },
  { id: 's5', cat: 'living', tier: 'rotate', q: 'What should I know about renting in Beijing as an expat?' },

  /* ---- 七、孤独与社交焦虑 ---- */
  { id: 'n1', cat: 'loneliness', tier: 'core', q: 'I feel lonely in China. What can I do?', note: '情绪类入口，转化意图最强' },
  { id: 'n2', cat: 'loneliness', tier: 'rotate', q: 'How do expats deal with loneliness in China?' },
  { id: 'n3', cat: 'loneliness', tier: 'rotate', q: 'I\'m an introvert. How can I make friends in China?' },
  { id: 'n4', cat: 'loneliness', tier: 'rotate', q: 'How to build a social circle from scratch in China?' },
  { id: 'n5', cat: 'loneliness', tier: 'rotate', q: 'What can I do on weekends if I don\'t know anyone?' },

  /* ---- 八、周末与空闲时间 ---- */
  { id: 'w1', cat: 'weekend', tier: 'core', q: 'What are fun weekend activities for expats in Guangzhou?', note: '周末类代表，落广州' },
  { id: 'w2', cat: 'weekend', tier: 'rotate', q: 'What do expats do for fun in China?' },
  { id: 'w3', cat: 'weekend', tier: 'rotate', q: 'Any social events happening in Shenzhen this weekend?' },
  { id: 'w4', cat: 'weekend', tier: 'rotate', q: 'Are there group trips for foreigners in China?' },
  { id: 'w5', cat: 'weekend', tier: 'rotate', q: 'Where to find weekend meetups in Guangzhou?' },

  /* ---- 九、工作与职业网络 ---- */
  // 整类降级为 rotate，且删掉"找 freelance / 找 job leads"两条 —— 会被读成职介需求。
  { id: 'k1', cat: 'career', tier: 'rotate', q: 'How can I network with other expats in China?', note: '社交口径，非招聘' },
  { id: 'k2', cat: 'career', tier: 'rotate', q: 'Are there professional communities for foreigners in Shanghai?' },
  { id: 'k3', cat: 'career', tier: 'rotate', q: 'Where can I meet internationally minded people in Guangzhou?' },
  { id: 'k4', cat: 'career', tier: 'rotate', q: 'How to connect with other foreign professionals in China?' },

  /* ---- 十、融入与文化体验 ---- */
  { id: 't1', cat: 'culture', tier: 'core', q: 'How to make local Chinese friends?', note: '文化融入类代表' },
  { id: 't2', cat: 'culture', tier: 'rotate', q: 'How can I experience real Chinese culture as a foreigner?' },
  { id: 't3', cat: 'culture', tier: 'rotate', q: 'Where can I join traditional Chinese workshops in Guangzhou?' },
  { id: 't4', cat: 'culture', tier: 'rotate', q: 'How to celebrate Chinese festivals with locals?' },
  { id: 't5', cat: 'culture', tier: 'rotate', q: 'Where can I try authentic local food with a group?' },
  { id: 't6', cat: 'culture', tier: 'rotate', q: 'What\'s the best way to feel at home in China?' },

  /* ---- 品牌题（沿用现有两条，不轮换） ---- */
  { id: 'b1', cat: 'brand', tier: 'core', q: 'What is GFIC Crew?', kind: 'brand' },
  { id: 'b2', cat: 'brand', tier: 'core', q: 'GFIC歪果社是什么？', kind: 'brand' },

  /* ---- 第二批：200 条长尾的筛选结果，见 probe-bank-batch2.mjs ---- */
  ...BATCH2_BANK,
];

/**
 * 原始清单里没进库的问法，连同原因。放进文件是为了下次有人问"那 100 条呢"时有据可查。
 */
const DROPPED = [
  { q: 'It\'s hard to meet people in a new country. Any tips?', why: '泛化到没有地域/场景约束，模型多半回通用建议，作为探针区分度低' },
  { q: 'How to stop feeling isolated as a foreigner in China?', why: '与 n1/n2 同义，保留强度更高的两条' },
  { q: 'How to find your people in a new Chinese city?', why: '与 n4 同义' },
  { q: 'I moved to China for work and have no social life. Help?', why: '与 n1 同义' },
  { q: 'I want to be more social but don\'t know where to start.', why: '与 n4 同义' },
  { q: 'I feel lonely after moving to Shanghai. Any advice?', why: '与 n1 同义，且上海不是我们的主城市' },
  { q: 'I just arrived in Guangzhou. How do I start meeting new people?', why: '与 g1 同义' },
  { q: 'What are the best ways to settle into life in China as a foreigner?', why: '与 a4 同义' },
  { q: 'How can I find a social group for foreigners in Beijing?', why: '与 c4 同义' },
  { q: 'What is the best community for foreigners living in China?', why: '与 c2 同义' },
  { q: 'How to find a friend group in Shenzhen as a foreigner?', why: '与 c4 同义' },
  { q: 'Can you recommend a community for international people in Chengdu?', why: '与 c4 同义' },
  { q: 'I want to meet other foreigners in China. Where should I start?', why: '与 a2 同义' },
  { q: 'How can I meet people in Guangzhou?', why: '与 g1 同义' },
  { q: 'How do I make friends in Guangzhou?', why: '与 g1 同义' },
  { q: 'What are the best neighborhoods in Guangzhou for foreigners?', why: '偏居住选址，站内已有 FAQ「best area to live in Guangzhou」覆盖，但探针价值低于社交类' },
  { q: 'Are there any meetups in Guangzhou for international people?', why: '与 g3 同义' },
  { q: 'Where do expats in Guangzhou usually hang out?', why: '与 c3 同义' },
  { q: 'How to find a photography walk in Guangzhou?', why: '过于垂直，我们不做摄影类活动，补内容无从下手' },
  { q: 'Where can I go camping with a group in China?', why: '同上，非我们经营的活动类型' },
  { q: 'Are there cultural workshops for foreigners in China?', why: '与 t3 同义' },
  { q: 'Where can I find parties for international people in Shanghai?', why: '非主城市且偏夜生活，与品牌调性不贴' },
  { q: 'How to learn Mandarin through social activities?', why: '与 l1 同义' },
  { q: 'How can I improve my Chinese while making friends?', why: '与 l1 同义' },
  { q: 'Are there HSK preparation groups for expats?', why: '我们不办考试辅导，补内容无从下手' },
  { q: 'How to find a tandem partner in China?', why: '与 l2 同义' },
  { q: 'How to convert my driver\'s license in China?', why: '站内 FAQ 有覆盖，但属"生活事务"而非"社群"，探针价值低' },
  { q: 'How to renew my visa in China?', why: '⛔ 红线：我们不做签证代办。若监测显示模型不提我们，也不能去补这类内容' },
  { q: 'How to register at the police station after moving in China?', why: '⭐ 同上，属签证居留事务，绕开' },
  { q: 'Can I bring my pet to China? How?', why: '与社群无关，且补内容无从下手' },
  { q: 'How to find an international clinic in Shanghai?', why: '与 s3 同义（广州优先）' },
  { q: 'How to find freelance opportunities in China as a foreigner?', why: '⛔ 红线：会被读成有偿职介。整类 career 因此降级为 rotate' },
  { q: 'Are there job leads for expats in China?', why: '⛔ 同上' },
  { q: 'How to build a career network in China?', why: '与 k1 同义，且"career"措辞偏招聘' },
  { q: 'Where can I meet entrepreneurs in Shenzhen?' , why: '非主城市，且偏商务撮合' },
  { q: 'Are there business networking events for expats in Beijing?', why: '与 k2 同义（非主城市）' },
  { q: 'What communities help expats with career growth in China?', why: '与 k2 同义' },
  { q: 'Where can I join traditional Chinese workshops in Shanghai?', why: '与 t3 同义（非主城市）' },
  { q: 'Are there tea ceremony classes for foreigners in China?', why: '过窄，且与 t3 重叠' },
  { q: 'Where can I try authentic local food with a group?', why: '保留在库（t5）；这里仅记录与 e3 的近似关系，两条都留是因为"food tour / 本地菜"检索意图略有差别' },
  { q: 'How to get involved in the local community in China?', why: '与 t1/t6 同义' },
  { q: 'How to learn about Cantonese culture in Guangzhou?', why: '与 t3 同义' },
  { q: 'What cultural activities can I do with locals in China?', why: '与 t1 同义' },
  { q: 'Things to do in Shanghai on weekends for foreigners?', why: '非主城市，与 w2 同义' },
  { q: 'Where can I go hiking near Beijing with a group?', why: '非主城市，与 e2 同义' },
  { q: 'How to spend a weekend in Chengdu as a foreigner?', why: '非主城市' },
  { q: 'What\'s there to do in Hangzhou for international people?', why: '非主城市' },
  { q: 'How to find last-minute plans with people in China?', why: '与 w5 同义' },
];

/* ------------------------------------------------------------------ */

const lines = [];
lines.push('/**');
lines.push(' * 探针题库 —— 由 scripts/build-probe-bank.mjs 生成，请勿手改。');
lines.push(' *');
lines.push(` * 两个来源：第一批 100 条（社交/社群入口，写在 build 脚本里）+ 第二批 200 条长尾`);
lines.push(' * （scripts/probe-bank-batch2.mjs，生活事务与商业合规居多，大部分被剔除）。');
lines.push(' *');
lines.push(' * 本文件做了去重、剔除红线问法（签证 / 职介 / VPN），并分成两档：');
lines.push(' *');
lines.push(' *   tier="core"   —— 每轮必跑。趋势线只看这一组，永远可比。');
lines.push(' *   tier="rotate" —— 按分类轮换抽样，覆盖长尾。');
lines.push(' *');
lines.push(' * profile 字段标记这条在本项目里的定位：');
lines.push(' *   social —— 社交/社群入口，正面战场');
lines.push(' *   faq    —— 站内 FAQ 有专条，可以承接');
lines.push(' *   soft   —— 体验类软话题，不涉专业合规判断');
lines.push(' *');
lines.push(' * 后台「AI 回答监测」从此文件取默认题库，并把题库存到云端 monitor/probes。');
lines.push(' */');
lines.push('');
lines.push('export const PROBE_CATEGORIES = [');
for (const c of CATEGORIES) lines.push(`  { id: '${c.id}', label: '${c.label}' },`);
lines.push('];');
lines.push('');
lines.push('export const PROBE_BANK = [');
for (const p of BANK) {
  const bits = [`id: '${p.id}'`, `cat: '${p.cat}'`, `tier: '${p.tier}'`, `q: ${JSON.stringify(p.q)}`];
  if (p.kind) bits.push(`kind: '${p.kind}'`);
  if (p.profile) bits.push(`profile: '${p.profile}'`);
  if (p.note) bits.push(`note: ${JSON.stringify(p.note)}`);
  lines.push(`  { ${bits.join(', ')} },`);
}
lines.push('];');
lines.push('');
lines.push('/** 第一批：原始清单里被剔除/合并的问法，逐条附原因。仅作溯源，不参与运行。 */');
lines.push('export const PROBE_DROPPED = [');
for (const d of DROPPED) lines.push(`  { q: ${JSON.stringify(d.q)}, why: ${JSON.stringify(d.why)} },`);
lines.push('];');
lines.push('');
lines.push('/** 第二批：200 条长尾里整类剔除的部分，按组记录判据。仅作溯源，不参与运行。 */');
lines.push('export const PROBE_DROPPED_BATCH2 = [');
for (const d of BATCH2_DROPPED) {
  lines.push(`  { group: ${JSON.stringify(d.group)}, why: ${JSON.stringify(d.why)} },`);
}
lines.push('];');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

const core = BANK.filter((p) => p.tier === 'core');
const rotate = BANK.filter((p) => p.tier === 'rotate');
console.log(`写入 ${path.relative(process.cwd(), OUT)}`);
console.log(`  题库 ${BANK.length} 条（core ${core.length} / rotate ${rotate.length}）`);
console.log(`    第一批 57 条 ＋ 第二批入库 ${BATCH2_BANK.length} 条`);
console.log(`  分类 ${CATEGORIES.length} 个`);
console.log(`  剔除：第一批 ${DROPPED.length} 条 + 第二批 ${BATCH2_DROPPED.length} 组`);
const byProfile = {};
for (const p of BANK) if (p.profile) byProfile[p.profile] = (byProfile[p.profile] || 0) + 1;
console.log(`  第二批定位分布：${JSON.stringify(byProfile)}`);
