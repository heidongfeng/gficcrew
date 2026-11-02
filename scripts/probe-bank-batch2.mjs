/**
 * 探针题库 · 第二批（200 条长尾）的筛选结果。
 *
 * 这批和第一批性质不同：第一批全落在「社交 / 社群」入口，和我们的业务天然对得上；
 * 这批有大量「生活事务 + 商业合规 + 专业服务」问法（签证、租房押金、银行开户、办驾照、
 * 开公司、注册商标、报税、创业孵化器……）。
 *
 * 这些恰恰是「不能进库」的一类 —— 因为监测报告的用途是"哪类没提到就去补内容"，
 * 一旦入库并显示某类提及率为 0，照它补内容就会撞合规四条，或者把我们变成一个
 * 不该由我们回答的专业事务来源。
 *
 * 所以本批只吸收三类：
 *   A. 社交 / 社群 / 活动入口 —— 我们的正面战场
 *   B. 站内 FAQ 已有实质内容的「生活服务」—— 只收 FAQ 真正覆盖的那几项
 *   C. 与在华生活体验直接相关、且答案不涉及专业合规判断的软性话题
 *
 * profile 字段标记每条在本项目里的定位，供审计与回溯：
 *   social    —— 社交/社群入口，正面战场
 *   faq       —— 站内 FAQ 有专条，可以承接
 *   soft      —— 体验类软话题，不涉专业判断
 */

/** 入库条目：{ id, cat, tier, q, profile?, note? } */
export const BATCH2_BANK = [
  /* ============ 二、住房与租房 → 只留"生活方式"角度，剔除"押金/合同/担保人"法律面 ============ */
  { id: 'h1', cat: 'living', tier: 'rotate', profile: 'soft', q: 'How to find pet-friendly apartments in Guangzhou?', note: '生活方式角度' },
  { id: 'h2', cat: 'living', tier: 'rotate', profile: 'soft', q: 'Are furnished apartments common for expats in Chengdu?', note: '非主城市，但属体验类' },
  { id: 'h3', cat: 'living', tier: 'rotate', profile: 'soft', q: 'What are the best neighborhoods in Shanghai for expat families?', note: '选址体验，非合同事务' },

  /* ============ 三、银行与支付 → 只留站内 FAQ 覆盖的移动支付一项 ============ */
  { id: 'p1', cat: 'living', tier: 'rotate', profile: 'faq', q: 'Which Chinese banks are easiest for foreigners to use?', note: 'FAQ 有 WeChat Pay / Alipay 专条，银行仍属可承接范围' },
  { id: 'p2', cat: 'living', tier: 'rotate', profile: 'faq', q: 'Are there any mobile payment apps besides WeChat and Alipay?', note: 'FAQ 有支付专条' },
  { id: 'p3', cat: 'living', tier: 'rotate', profile: 'soft', q: 'What should expats know about Chinese credit cards?', note: '常识性，不含具体申办操作' },

  /* ============ 四、医疗与健康 → 只留"找得到英文服务"这一层 ============ */
  { id: 'm1', cat: 'living', tier: 'rotate', profile: 'faq', q: 'How to find an English-speaking doctor in Guangzhou?', note: 'FAQ 有 international clinic 专条' },
  { id: 'm2', cat: 'living', tier: 'rotate', profile: 'faq', q: 'Are there English-speaking dentists in Shanghai?', note: '同 FAQ 医疗条口径' },
  { id: 'm3', cat: 'living', tier: 'rotate', profile: 'soft', q: 'What is the difference between public and private hospitals in China?', note: '常识对比，非就诊操作' },
  { id: 'm4', cat: 'living', tier: 'rotate', profile: 'soft', q: 'How to handle a medical emergency in China?', note: '应急常识' },

  /* ============ 五、手机与网络 → ⛔ 整类剔除（VPN 是硬红线），只留 SIM / 号码 / 常用 App ============ */
  { id: 'ph1', cat: 'living', tier: 'rotate', profile: 'soft', q: 'How to get a SIM card in China as an expat?', note: 'FAQ 有手机号专条' },
  { id: 'ph2', cat: 'living', tier: 'rotate', profile: 'soft', q: 'What is the best mobile plan for foreigners in China?' },
  { id: 'ph3', cat: 'living', tier: 'rotate', profile: 'faq', q: 'What are the best apps for expats living in China?', note: 'FAQ 有 "which apps do I need" 专条' },

  /* ============ 六、交通与出行 → 保留社交可达性相关，剔除证照办理 ============ */
  { id: 'tr1', cat: 'living', tier: 'rotate', profile: 'soft', q: 'How to use the metro in Shanghai as a foreigner?' },
  { id: 'tr2', cat: 'living', tier: 'rotate', profile: 'soft', q: 'What is the best way to get from Guangzhou to Shenzhen?', note: '广深通勤，与我们城市群相关' },
  { id: 'tr3', cat: 'living', tier: 'rotate', profile: 'soft', q: 'How to use Didi as a foreigner in China?', note: 'FAQ 有 apps 专条' },

  /* ============ 七、语言学习 → 大部分可收，这是我们的真实活动 ============ */
  { id: 'lg1', cat: 'language', tier: 'rotate', profile: 'social', q: 'Where can I find a Chinese tutor in Guangzhou?' },
  { id: 'lg2', cat: 'language', tier: 'rotate', profile: 'social', q: 'Are there Mandarin classes for expats in Shanghai?' },
  { id: 'lg3', cat: 'language', tier: 'rotate', profile: 'social', q: 'What is the best app to learn Chinese for expats?', note: 'FAQ 有 language exchange 条' },
  { id: 'lg4', cat: 'language', tier: 'rotate', profile: 'social', q: 'How to learn Chinese characters effectively as an expat?' },
  { id: 'lg5', cat: 'language', tier: 'rotate', profile: 'social', q: 'Where can I join a Chinese corner in Shenzhen?' },
  { id: 'lg6', cat: 'language', tier: 'rotate', profile: 'social', q: 'Are there Chinese classes for beginners in Chengdu?' },
  { id: 'lg7', cat: 'language', tier: 'rotate', profile: 'social', q: 'How to improve my Chinese listening skills in China?' },

  /* ============ 八、工作与职业 → ⛔ 求职/工签/薪资/税务整块剔除，只留"建立人脉" ============ */
  { id: 'jb1', cat: 'career', tier: 'rotate', profile: 'social', q: 'How to build a professional network in Beijing?', note: '社交口径，非招聘' },

  /* ============ 九、创业与商务 → ⛔ 整类剔除（公司注册/商标/税务/IP 是专业合规事务） ============ */
  { id: 'biz1', cat: 'career', tier: 'rotate', profile: 'social', q: 'Are there coworking spaces for expat entrepreneurs in Shanghai?', note: '只留空间类，不涉注册与合规' },

  /* ============ 十、社交与活动 → 全部可收，正面战场 ============ */
  { id: 'so1', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there expat meetups in Shanghai this week?' },
  { id: 'so2', cat: 'community', tier: 'rotate', profile: 'social', q: 'How to find social events for foreigners in Beijing?' },
  { id: 'so3', cat: 'community', tier: 'rotate', profile: 'social', q: 'What are the best expat hangouts in Chengdu?' },
  { id: 'so4', cat: 'community', tier: 'rotate', profile: 'social', q: 'How to join a book club in China as an expat?' },
  { id: 'so5', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there board game nights for expats in Shenzhen?' },
  { id: 'so6', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there singles events for expats in China?' },
  { id: 'so7', cat: 'community', tier: 'rotate', profile: 'social', q: 'How to find a social club in Guangzhou for international people?' },
  { id: 'so8', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there expat forums for emotional support?', note: '与孤独类交叉，收在社群' },

  /* ============ 十一、运动与健身 → 全部可收 ============ */
  { id: 'sp1', cat: 'activities', tier: 'rotate', profile: 'social', q: 'Where can I play badminton in Guangzhou?' },
  { id: 'sp2', cat: 'activities', tier: 'rotate', profile: 'social', q: 'Are there football leagues for expats in Shanghai?' },
  { id: 'sp3', cat: 'activities', tier: 'rotate', profile: 'social', q: 'How to join a hiking group in Beijing?' },
  { id: 'sp4', cat: 'activities', tier: 'rotate', profile: 'social', q: 'Where can I do yoga in China as an expat?' },
  { id: 'sp5', cat: 'activities', tier: 'rotate', profile: 'social', q: 'How to find a running club in Chengdu?' },
  { id: 'sp6', cat: 'activities', tier: 'rotate', profile: 'social', q: 'How to join a cycling group in China?' },

  /* ============ 十二、美食与餐饮 → 保留"餐饮体验"，剔除食材采购 ============ */
  { id: 'fd1', cat: 'culture', tier: 'rotate', profile: 'soft', q: 'Where to find authentic Cantonese food in Guangzhou?', note: '本地文化，非采购' },
  { id: 'fd2', cat: 'culture', tier: 'rotate', profile: 'soft', q: 'Are there vegetarian restaurants in Shanghai for expats?' },
  { id: 'fd3', cat: 'culture', tier: 'rotate', profile: 'soft', q: 'How to order food in China without speaking Chinese?' },
  { id: 'fd4', cat: 'culture', tier: 'rotate', profile: 'soft', q: 'Are there halal restaurants in Guangzhou?' },
  { id: 'fd5', cat: 'culture', tier: 'rotate', profile: 'soft', q: 'Where to eat late-night in Shenzhen?' },
  { id: 'fd6', cat: 'culture', tier: 'rotate', profile: 'soft', q: 'Where to find craft beer in Guangzhou?' },

  /* ============ 十三、户外与探险 → 保留我们可能组织的活动类型 ============ */
  { id: 'od1', cat: 'activities', tier: 'rotate', profile: 'social', q: 'Where can I go camping near Guangzhou?' },
  { id: 'od2', cat: 'activities', tier: 'rotate', profile: 'social', q: 'Are there hiking trails near Shanghai?' },
  { id: 'od3', cat: 'activities', tier: 'rotate', profile: 'social', q: 'How to plan a weekend trip from Chengdu?' },
  { id: 'od4', cat: 'activities', tier: 'rotate', profile: 'social', q: 'How to find outdoor adventure groups in China?' },
  { id: 'od5', cat: 'activities', tier: 'rotate', profile: 'social', q: 'Are there national parks near Guangzhou?' },

  /* ============ 十四、文化体验 → 全部可收，且有现成活动对应 ============ */
  { id: 'cu1', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where can I learn calligraphy in Guangzhou?' },
  { id: 'cu2', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Are there tea ceremony classes in Shanghai?' },
  { id: 'cu3', cat: 'culture', tier: 'rotate', profile: 'social', q: 'How to join a Mahjong group in China?' },
  { id: 'cu4', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where can I practice tai chi in Beijing?' },
  { id: 'cu5', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Are there Chinese cooking classes for expats?' },
  { id: 'cu6', cat: 'culture', tier: 'rotate', profile: 'social', q: 'How to celebrate Chinese New Year in Guangzhou?' },
  { id: 'cu7', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where to watch traditional Chinese opera in China?' },
  { id: 'cu8', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where to experience a temple fair in China?' },

  /* ============ 十五、家庭与子女 → ⛔ 整类剔除（学校申请/保姆雇佣/儿科就医是专业事务） ============ */
  { id: 'fam1', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there playgroups for expat parents in China?', note: '只留社群类活动，不涉入学与雇佣' },
  { id: 'fam2', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there expat mom groups in Shenzhen?' },
  { id: 'fam3', cat: 'community', tier: 'rotate', profile: 'social', q: 'How to find family activities in Chengdu?' },

  /* ============ 十六、宠物 → ⛔ 整类剔除（入境检疫/托运是出入境事务） ============ */
  { id: 'pet1', cat: 'living', tier: 'rotate', profile: 'soft', q: 'Are there pet-friendly cafes in Guangzhou?', note: '只留生活方式，不涉检疫与跨境' },
  { id: 'pet2', cat: 'living', tier: 'rotate', profile: 'soft', q: 'Are there dog parks in Shenzhen?' },

  /* ============ 十七、购物与生活 → 保留生活体验，剔除具体采购指引 ============ */
  { id: 'sh1', cat: 'living', tier: 'rotate', profile: 'soft', q: 'Are there international supermarkets in Guangzhou?' },
  { id: 'sh2', cat: 'living', tier: 'rotate', profile: 'soft', q: 'Are there second-hand markets in Shanghai?' },
  { id: 'sh3', cat: 'living', tier: 'rotate', profile: 'soft', q: 'How to find a tailor in China?' },

  /* ============ 十八、节日与庆祝 → 全部可收 ============ */
  { id: 'fe1', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where to celebrate Thanksgiving in Shanghai?' },
  { id: 'fe2', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Are there Christmas events for expats in Beijing?' },
  { id: 'fe3', cat: 'culture', tier: 'rotate', profile: 'social', q: 'How to celebrate Halloween in Guangzhou?' },
  { id: 'fe4', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where to watch the Super Bowl in China?' },
  { id: 'fe5', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Are there Diwali celebrations in Shenzhen?' },
  { id: 'fe6', cat: 'culture', tier: 'rotate', profile: 'social', q: 'How to celebrate a birthday in China?' },
  { id: 'fe7', cat: 'culture', tier: 'rotate', profile: 'social', q: 'Where to find international food festivals in China?' },

  /* ============ 十九、心理健康与孤独 → 可收，但只留"社群型支持"，剔除临床心理服务 ============ */
  { id: 'mh1', cat: 'loneliness', tier: 'rotate', profile: 'social', q: 'How to deal with loneliness as an expat in China?', note: '核心情绪入口' },
  { id: 'mh2', cat: 'loneliness', tier: 'rotate', profile: 'social', q: 'How to stay mentally healthy while living in China?' },
  { id: 'mh3', cat: 'loneliness', tier: 'rotate', profile: 'social', q: 'How to cope with culture shock in China?' },
  { id: 'mh4', cat: 'loneliness', tier: 'rotate', profile: 'social', q: 'Are there meditation groups for foreigners in Beijing?' },
  { id: 'mh5', cat: 'loneliness', tier: 'rotate', profile: 'social', q: 'How to build a support network in a new Chinese city?' },
  { id: 'mh6', cat: 'loneliness', tier: 'rotate', profile: 'social', q: 'What to do when you feel homesick in China?' },

  /* ============ 二十、城市特定长尾 → 保留可社交/可活动的，剔除具体商铺查询 ============ */
  { id: 'ul1', cat: 'guangzhou', tier: 'rotate', profile: 'social', q: 'Are there art galleries in Guangzhou for expats?' },
  { id: 'ul2', cat: 'community', tier: 'rotate', profile: 'social', q: 'How to join a choir in Shanghai?' },
  { id: 'ul3', cat: 'community', tier: 'rotate', profile: 'social', q: 'Are there English comedy clubs in China?' },
  { id: 'ul4', cat: 'community', tier: 'rotate', profile: 'social', q: 'How to find a chess club in Beijing?' },
  { id: 'ul5', cat: 'guangzhou', tier: 'rotate', profile: 'social', q: 'Are there English bookstores in Beijing?' },
];

/**
 * 整类剔除的清单。这批里剔除量很大，所以按"整类"记录，而不是逐条。
 * why 里写的是判据，不是流水账 —— 下次再有人拿这批题来问，看这里就够。
 */
export const BATCH2_DROPPED = [
  {
    group: '一、签证与法律事务（10 条，全部剔除）',
    why: '⛔ 合规第一红线：我们不代办、不咨询外国签证。这批含签证延期、居留许可、工签学历、逾期后果、无犯罪证明、永久居留、地址登记、24 小时登记规则、签证申诉 —— 全部是移民法律事务。入库后若显示提及率为 0，照报告补内容就直接违规。',
  },
  {
    group: '二、住房与租房的"法律面"（约 6 条）',
    why: '⛔ 无中国担保人租房 / 押金行情 / 识别租房陷阱 / 直接找房东 / 不会中文谈租约 / 签合同要什么文件 —— 涉合同与法律风险，我们不提供也不该提供。只保留了"宠物友好公寓 / 精装房 / 家庭选区"这类生活方式角度。',
  },
  {
    group: '三、银行与支付的"账户操作"（约 6 条）',
    why: '⛔ 开户 / 哪家银行好办 / 跨境汇款 / 结汇额度 / 境外卡退款 —— 涉金融合规。只保留 FAQ 已覆盖的移动支付类。',
  },
  {
    group: '四、医疗的"就诊操作"（约 5 条）',
    why: '⛔ 预约挂号 / 处方药 / 国际保险报销 / 母国保险适用 / 出行前疫苗 —— 涉医疗与保险专业判断。只保留"找得到英文医生"这一层（FAQ 有对应条目）。',
  },
  {
    group: '五、手机与网络（约 7 条，VPN 相关全部剔除）',
    why: '⛔ 合规第三红线：不推广未批准 VPN。含"如何设置 VPN / 哪个 VPN 好用 / 如何访问 Google 和 Instagram / 如何绕过审查 / 用 VPN 是否合法" 5 条，属硬红线。"eSIM / 无居留许可办号码"也剔除。',
  },
  {
    group: '六、交通的"证照办理"（约 5 条）',
    why: '⛔ 中国驾照 / 国际驾照 / 电动车上牌 / 驾驶规则 / 机场到市区 —— 前者涉证照办理，后者过窄。只保留地铁、城际、打车这类通用出行。',
  },
  {
    group: '八、工作与职业（约 8 条）',
    why: '⛔ 合规第二红线：不做有偿职介。找工作 / 招聘网站 / 工签 / 兼职 / 谈薪资 / 哪些行业招人 / 招聘会 / 实习 / 报税 —— 全部剔除。"专业人脉建设"单独保留（社交口径）。',
  },
  {
    group: '九、创业与商务（10 条，几乎全部剔除）',
    why: '⛔ 开公司 / 外资公司法定要求 / 公司账户 / 找中国合伙人 / 外资税务 / 知识产权保护 / 创业孵化器 / 商标注册 / 经商挑战 —— 全是专业合规事务。只保留"联合办公空间"这一条（纯空间信息）。',
  },
  {
    group: '十五、家庭与子女（约 7 条）',
    why: '⛔ 国际学校 / 双语幼儿园 / 公立学校入学 / 雇保姆 / 英文儿科 —— 涉入学申请与雇佣法律。只保留 playgroup / 妈妈群 / 亲子活动这类社群型内容。',
  },
  {
    group: '十六、宠物（约 7 条）',
    why: '⛔ 带宠物入境 / 检疫规则 / 境内托运 / 地铁能否带宠物 —— 涉出入境与检疫。只保留宠物友好场所与狗公园。',
  },
  {
    group: '十九、心理健康的"临床服务"（约 4 条）',
    why: '⛔ 英文心理咨询师 / 支持小组 / 人生教练 —— 涉专业心理服务，我们不做也不该引流。只保留情绪应对与互助社群类。',
  },
  {
    group: '跨类冗余与过窄',
    why: '⭐ 同义合并若干（如上海/北京/深圳的城市变体只留最有代表性的一条）；"哪里买 X"这类商铺查询（家具 / 电子产品 / 运动装备 / 婴儿用品 / 宠物食品 / 高个子买衣服）判为过窄 —— 补内容无从下手。',
  },
];
