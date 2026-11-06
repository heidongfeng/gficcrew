# GFIC Crew 官网（gficcrew.com / gficcrew.cn）

一份代码构建 global / cn 两个内容变体，并生成三个部署产物：

| 发布端 | 域名 | 部署方式 | 输出目录 |
| --- | --- | --- | --- |
| 公开主站 | gficcrew.com | GitHub Pages，不含后台 | `dist-ghpages/` |
| 管理端与国内包源 | gficcrew.app.workbuddy.host | WorkBuddy「发布为应用」，保留后台和 `cn-bundle.txt`，全站禁止收录 | `dist-app/` |
| 国内站 | gficcrew.cn | 腾讯云宝塔定时从管理端拉取国内包 | `dist-cn/` |

Astro 静态站 + WorkBuddy 云数据库。全站英文内容，中文品牌名保留。三个产物必须来自同一轮构建，不能单独发布其中一端后就视为完成。

## 1. 本地开发

```bash
cd gficcrew-site
npm install
npm run dev        # http://localhost:4321（默认 global 版）
npm run build:global
npm run build:cn
```

Windows 上 npm 的 optional dependencies 有已知 bug：若报 `@rollup/rollup-win32-x64-msvc` 缺失，
单独补装一次即可（版本跟 rollup 对齐）：

```bash
npm install --no-save @rollup/rollup-win32-x64-msvc@$(node -p "require('./node_modules/rollup/package.json').version")
```

## 2. 两个版本的差异点

`astro.config.mjs` 根据 mode 决定 `site` 与 `outDir`，并把三个常量注入前端：

- `__GFIC_SITE_URL__` → `https://gficcrew.com` / `https://gficcrew.cn`
- `__GFIC_VARIANT__` → `global` / `cn`
- `__GFIC_ICP__` → 空 / 备案号

`.env.global` 与 `.env.cn` 再各自定义 `PUBLIC_SITE_URL`、`PUBLIC_VARIANT`、`PUBLIC_ICP`（CI 里也能用
`SITE_VARIANT=cn npm run build` 强制指定）。

国内版（cn）会自动：
- 页脚显示备案号（`.env.cn` 的 `PUBLIC_ICP`，上线前必须换成真实号码）；
- 正文只提国内可达的平台：微信公众号、视频号、小红书；不出现 X / YouTube / Instagram；
- `robots.txt` 与 `llms.txt` 里的 Sitemap、链接全部指向 gficcrew.cn。

境外版保留全部六个平台，页脚无备案号。

## 3. 目录结构

```
src/
  data/        # 内容源：site.js cities.js events.js faq.js plans.js
               # guides.js（城市指南注册表）guangzhou.js（广州指南正文）schema.js
  layouts/     # BaseLayout.astro
  components/  # Header Footer CtaBand FaqList JoinDropdown（微信二维码下拉）
  pages/       # index about cities/ events guides/ guides/[slug] faq contact membership 404
               # robots.txt.ts llms.txt.ts（按版本动态生成）
  scripts/     # cloud.js（云 SDK + 表单提交）app-shell.js（主题/移动端导航）
  styles/      # global.css
public/        # favicon.ico icon-192.png apple-touch-icon.png logo.png logo-mark.png
               # wechat-qr.png og-default.png og-default.svg _headers
.github/workflows/  # 历史/备用工作流；当前发布链路见「7. 部署」
```

## 4. 加入社群的方式

没有注册登录。点任何 **Join the Crew** 按钮，下拉面板里是微信二维码，底部文字 `WeChat: DN8117`。
二维码图片在 `public/wechat-qr.png`（当前内容编码的是字符串 `DN8117`）。
**上线前请用微信官方名片二维码替换同名文件**，路径不变即可。

## 5. 新增一个城市指南

只改一个文件：`src/data/guides.js`。

```js
// 1. 新建 src/data/shenzhen.js，导出 GUIDE_SECTIONS / GUIDE_FAQ
// 2. 在 GUIDES 数组里加一项
{
  slug: 'shenzhen',
  city: 'Shenzhen',
  citySlug: 'shenzhen',      // 必须等于 CITIES[].slug
  title: 'Shenzhen Expat Living Guide',
  updated: '2026-10-01',
  description: '...',
  intro: ['...'],
  sections: GUIDE_SECTIONS,
  faq: GUIDE_FAQ,
}
```

`/guides/shenzhen/` 会自动生成，`/cities/` 里深圳卡片会自动出现「Guide available」标记和入口，
`/guides/` 列表、页脚导航、llms.txt 全部自动同步。

## 6. 云数据库

| 表 | 用途 | 权限 |
| --- | --- | --- |
| `cms_docs` | 后台内容：`collection` + `doc_id` + `data`(jsonb) | 不开 RLS 策略，只允许经 SECURITY DEFINER 函数访问 |
| `cms_admin` | 后台管理口令哈希（bcrypt，带口令拉伸） | 同上 |
| `crew_requests` | 早期表单提交（已停用，表单已全站移除） | anon 可写 |

后台通过 5 个 RPC 访问数据库，每个都先校验口令：

| 函数 | 作用 |
| --- | --- |
| `cms_login(p_password)` | 校验口令 |
| `cms_list(p_password, p_collection)` | 读取某个集合的全部条目 |
| `cms_save(p_password, p_collection, p_doc_id, p_data, p_sort_order)` | 新增 / 更新 |
| `cms_delete(p_password, p_collection, p_doc_id)` | 删除 |
| `cms_set_password(p_password, p_new_password)` | 改口令 |

前端配置在 `src/scripts/cloud.js` 的 `PUBLIC_CONFIG`：`endpoint` 必须等于应用发布域名
（`gficcrew.app.workbuddy.host`），否则服务端 Origin 校验会拒绝请求。
**后台必须从 `https://gficcrew.app.workbuddy.host/admin/` 打开**，从 gficcrew.com 或
gficcrew.cn 打开会因为 Origin 不匹配而被拒绝（页面顶部会显示黄色提示条）。

## 6.1 内容管理后台（/admin/）

一个后台管两个版本。境外版和国内版用的是**同一份云端内容**，只有域名、备案号、
社交平台列表按构建版本分叉，所以后台改一次，两个站点同时更新。

### 登录

打开 `https://gficcrew.app.workbuddy.host/admin/`，输入管理口令。**不需要邮箱、不需要验证码。**
初始口令为 `Admin@2026`（与社群小程序后台一致），**首次登录后务必改掉**（顶部「修改口令」，至少 8 位）。
口令存在 `sessionStorage`，关掉标签页即失效。口令哈希存在云端 `cms_admin`，只有哈希落库，明文不留任何地方。

> 本地跑端到端脚本时口令从环境变量读，不要写进代码：
> `ADMIN_PW=你的口令 node tools/admin-e2e.cjs`

### 一键发布

保存内容后，点后台顶部的 **「发布上线」** 就会触发 GitHub Actions，不需要再等人手动跑命令。
页面会显示排队、构建中、成功或失败，并给出运行日志入口。

首次使用要在左下角 **「发布设置」** 里粘贴一个 GitHub fine-grained token：

1. Repository access 只选 `heidongfeng/gficcrew`。
2. Permissions 只给 **Actions: Read and write**，不要给代码或 Secrets 权限。
3. 令牌用当前后台口令加密后存在该浏览器的 localStorage，不上传云端，也不进仓库。
4. 后台口令通过「改口令」轮换时，页面会自动用新口令重新加密已保存的令牌。

按钮触发的是 `.com` 发布；`.cn` 仍由腾讯云服务器的拉包任务同步，所以后台会显示
“国内站会在下一次拉包任务后同步”。如果 `.cn` 的 cron 没配好，它不会自动更新。

### 能改什么

| 集合 | 内容 | 删除 |
| --- | --- | --- |
| 站点内容 | **首页全部文案** / 品牌名 / 微信号 / 简介 / SEO 描述 / 关键词 / 导航 / 四大服务 / 为什么加入 / 社群规则 / 活动组织方式 / 活动分类 / 退款条款 | 不可删（单一文档，删了站点就没有品牌信息了） |
| 联系与关注 | Contact 页面的全部文案 + About 页「Find us」和页脚「Find us」+ 微信二维码 | 不可删（单一文档） |
| 城市 | 14 个城市的名称、介绍、亮点、生活成本提示 | 列表行内删除 |
| 活动 | 活动的标题、分类（可点选）、城市、频率、时间（选择器）、地点、费用、介绍 | 列表行内删除 |
| FAQ | 38 条问答，按分类分组 | 列表行内删除 |
| 会员套餐 | 三档套餐的名称、价格、包含内容、退款条款 | 列表行内删除 |
| 城市指南 | 指南正文的章节与 FAQ | 列表行内删除 |

列表类集合的每一行右侧都有「删除」按钮（悬停出现），点后有确认框。删除只影响云端内容，
要同步到官网仍需导出 → 导入 → 重新构建。

### 首页文案在「站点内容」里改

打开「站点内容」，最前面就是**首页（/）**和**首页各区块小标题**两组。

- **首页（/）** —— 顶部小标题、主标题 H1、开头段落、主标题下面那几条亮点（截图里那 6 条就在这里）
- **首页各区块小标题** —— 「四大服务」「城市与指南」「活动日历」「会员」「为什么加入」五个区块各自的小标题、标题和引言

亮点是「一行一条」：**改某一行＝改内容，删某一行＝删条目，在最后补一行＝新增一条**，
从上到下按顺序显示，建议 4–6 条。

两个占位符：

- `{brand}` → 自动渲染成**加粗的品牌名**（「GFIC Crew (GFIC歪果社)」）。改品牌名请到下面的「品牌」分组，这里不用手写
- `{cityCount}` → 自动换成城市总数，增删城市后不用回来改数字

首页之外的大部分站点文案（四大服务的具体内容、为什么加入的条目、社群规则等）在同一页的
「四大服务」「条款与条目」分组里。

### 活动分类在哪里增删改

活动编辑页「分类」旁边的可点选项，来自**站点内容 → 活动分类**（一行一个）。改行＝改名，
删行＝删除该分类，补一行＝新增分类，保存后到活动页就能选到。已经有活动在用的分类被删掉后，
那些活动仍保留原分类，只是活动列表页的筛选栏不再显示它。
另外，活动里已经用过的分类也会自动出现在可点选项里，防止手滑打错。

### 活动时间和指南日期直接选

活动的「开始时间 / 结束时间」用浏览器自带的日期时间选择器（`datetime-local`），指南的
「更新日期」用日期选择器（`date`），点输入框右侧的日历图标即可，不用再手打
`2026-10-07T19:30` 这种格式。旧数据存的文本值不受影响。

### Contact 页面与 Find us 在「联系与关注」里改

Contact 页面（小标题、H1、开头段落、三个分块、聚会说明）和 About 页「Find us」、
全站页脚「Find us」都搬进了后台的单一文档。文案里可以写占位符：

- `{wechat}` → 自动替换成微信号（站点内容里的「微信号」字段）
- `{socialLine}` → 自动替换成当前版本的平台名单（境外版含 X / Instagram / YouTube，国内版只有微信系）
- `{name}` / `{site}` → 品牌名 / 不带协议的官网域名

这样改微信号或平台名单时不用一个个去改文案。

### 微信二维码怎么换

「联系与关注」页面最底下有一个**微信二维码**块，预览当前用的图，点「选择文件」上传新图、
「移除图片」恢复默认。上传的图会压到最长边 1200px、转成 PNG 存进云端，所以手机相册里的大图
也能直接传。

替换要走完整内容流程：后台保存 → 导出 JSON → `npm run content:import`
（导入脚本会把图解码回 `public/wechat-qr.png`）→ `npm run build:all` → 发布。
`npm run content:reset` 会把二维码还原成默认那张（原件存在 `scripts/assets/wechat-qr.default.png`）。

### 城市指南的正文与 FAQ 用纯文本编辑

「正文章节」和「指南 FAQ」在云端是嵌套 JSON，手写太折磨，所以后台默认给**纯文本**编辑框，
右上角可以一键切到 JSON 再切回来，内容不丢。

正文章节的写法：

```
## Why expats choose Guangzhou | why-guangzhou

第一段正文。一个空行代表新的一段。

第二段正文。

- 列表项一
- 列表项二
```

- `## ` 开头是新章节；标题后面可以写 `| 锚点id`（页面锚点用），不写会自动生成
- 空行分段；`- ` 开头是列表项；纯中文标题也会自动生成稳定的锚点 id

指南 FAQ 的写法：

```
Q: Is Guangzhou a good city for expats?
A: Yes. Guangzhou combines a lower cost of living than Beijing or Shanghai ...

Q: How much does it cost to live in Guangzhou?
A: A single expat typically spends RMB 6,000–10,000 per month ...
```

编解码逻辑在 `src/scripts/guide-codec.js`，往返测试：`node tools/test-codec.mjs`
（用真实的广州指南数据校验逐字一致）。

### 首次使用

点顶部「导入初始数据」，把代码里现有的内容写进云端数据库（已存在的条目会被覆盖）。
之后就可以自由增删改了。

### 让改动在官网上生效

云端内容**不会**直接被官网读取——官网是静态站，必须在构建时把内容写进代码。

完整发布前必须先拉取并导入云端内容，避免本地兜底数据覆盖较新的后台内容：

```bash
npm run content:pull     # 云端 → content-export.json
npm run gate             # 判断云端内容或代码是否变化
npm run content:import   # 有变化才继续
npm run release:all      # build:all → cn:zip → app:prepare → 发布 .com → 三端核验
npm run gate:mark        # 三端全部核验通过后再记录基线
```

`release:all` 会生成 `dist-app/`，但它不能代替 WorkBuddy 的「发布为应用」操作。必须把 `dist-app/` 发布到 `.app`，再运行 `npm run release:verify`；只有 `.com`、`.app`、`.cn` 均与本地一致才算完成。部署 `.app` 前若未先执行 `cn:zip`，脚本会因缺少国内包而提示。

`content:pull` 读项目根目录 `.adminpw` 里的后台口令（已加 `.gitignore`），也可以用
`GFIC_ADMIN_PW` 环境变量代替。不想让脚本自动读口令就删掉 `.adminpw`，届时手动导出流程仍然可用。

下面是全手动版的五步（自动模式失效时的兜底）：

1. 后台点「导出内容 JSON」，浏览器会下载 `gfic-content-<日期>.json`。
2. 把下载的文件放进项目根目录（不用改名）。也可以直接拖成 `content-export.json`。
3. `npm run content:import`（没有指定路径时，优先读 `content-export.json`，否则自动挑根目录里最新的 `gfic-content-*.json`）。
   跑完会打印每个文件写了多少项，以及实际用的是哪个来源文件。
4. `npm run build:all && npm run cn:zip && npm run app:prepare` 重新构建并打包。
5. 发布 `dist-ghpages/` 到 `.com`、发布 `dist-app/` 到 `.app`，等待 `.cn` 拉包后执行 `npm run release:verify`。

改错了想回到代码内的原始内容：`npm run content:reset` 清空 `src/data/generated/`，再重新构建。
注意 `src/data/*.js` 是「Generated 优先、代码兜底」：某个集合的生成文件有内容才用它，为空就回退到
代码里写死的那份。所以只导出了一部分集合时，其余部分仍然用代码里的旧内容，不会变空。

发布这一步不能省：静态资源是整包覆盖的，只构建不发布，线上还是旧的。

```text
.com  ← dist-ghpages/（公开站，无后台）
.app  ← dist-app/（唯一后台入口 + cn-bundle.txt，robots 全站 Disallow）
.cn   ← 服务器运行 scripts/server-pull.sh，从 .app 拉取并校验国内包
```

### 三种改动场景，各自的发布步骤

**A. 只在后台改内容（不碰代码）**

后台保存只修改云端，静态官网不会立即变化。需要立即发布时：

1. 后台改 → 保存（自动写进云端 `cms_docs`）
2. `npm run content:pull && npm run content:import`
3. `npm run release:all`
4. 将 `dist-app/` 通过 WorkBuddy「发布为应用」部署
5. 等国内服务器拉包后运行 `npm run release:verify`，三端通过才算完成

**B. 只改代码（后台不动）**

1. 先 `content:pull` / `content:import`，确认不会用旧云端内容回退本地修改
2. 改代码并运行 `node tools/audit/run.mjs` 等回归检查
3. 按上面的 `release:all` + `dist-app/` 流程发布三端

补充一条：**如果改的是 `src/data/*.js` 里的文案 / 城市 / 活动 / FAQ，`dist-app` 必须发布。**
后台是打进 `dist-app/admin/` 的一个静态页面，它里面「导入初始数据」用的种子是构建时烘进去的。
不发的话，在后台点一次导入就会把旧内容写回云端（今天 FAQ 被还原成 38 条就是这么来的）。

**C. 两边同时改**

可以，不会互相破坏文件。但决定「谁的改动生效」的是这条规则：

> `src/data/*.js` 是 **generated 优先、代码兜底**：某个集合的 `src/data/generated/*.json` 有内容
> 就用它，代码里那份完全不生效；为空才回退到代码。
> 而且覆盖是**整个集合**的，不是逐条合并——云端 33 条 FAQ，导入后网站就是 33 条，
> 代码里新加的那几条会被直接丢掉。

推论：

- 后台改了但**没导出导入** → 网站完全不受影响，改动只是挂在云端，等下次导入才进来
- 一旦导入过 → 我再改 `src/data/*.js` 的默认值**看不到效果**（不是坏了，是被覆盖了）

想让代码重新说话：`npm run content:reset` 清空 `src/data/generated/`，再重新构建。

**推荐分工**：内容一律走后台，代码只管结构、样式、模板、脚本。两条路就永远不打架。

### 国内版落点：腾讯云轻量（CentOS 7.6 + 宝塔，Apache）

国内版不是走 CloudBase 静态托管，而是部署在已有的腾讯云轻量服务器（广州三区）上，和社群小程序
后端共用一台机器：

- **Web 服务是 Apache（httpd），不是 Nginx**——这台机器上没装 Nginx
- 按 `server_name` 分流：同一个 443 上，`gficcrew.cn` 走静态目录，小程序域名走它自己的后端，互不干扰
- 站点根目录 `/www/wwwroot/gficcrew.cn/`，纯静态，不建数据库、PHP 选「纯静态」
- `public/.htaccess` 会随构建进包：后台目录及其客户端资源返回 404；旧路由返回真实 301；
  `/404.html` 作为品牌错误页；同时设置 UTF-8、安全响应头和 HTML 不缓存。**Apache 的 mod_dir 会自动把
  `/about` 301 到 `/about/`，所以不需要 Nginx 那套 `try_files`。** `public/_headers` 只被兼容该约定的
  托管平台读取；GitHub Pages 会忽略它，不能把文件存在误当成响应头已经生效。
- 证书用宝塔「SSL → Let's Encrypt」申请，打开「强制 HTTPS」

### 国内版自动同步（2026-10-02 起）

`npm run cn:zip` 会把国内包复制成 `dist-global/cn-bundle.txt`，随后 `npm run app:prepare`
将它一并复制到 `dist-app/` 并随管理端发布（**CDN 会 403 拦截 .zip 下载，所以必须用 txt 名字**，
unzip 只认内容不认扩展名）。服务器端在宝塔计划任务里跑 `scripts/server-pull.sh`：
从 `https://gficcrew.app.workbuddy.host/cn-bundle.txt` 拉包、解压、
rsync 覆盖 `/www/wwwroot/gficcrew.cn/`（保留 `.well-known` 和 `.user.ini`，不碰证书续签）。
**建议宝塔任务频率与构建同频（每小时或每 30 分钟），否则国内站 gficcrew.cn 会比境外版滞后数小时。**

`scripts/server-pull.sh` 已加固：写 `/tmp/gfic-pull.log`、先报 HTTP 状态、清理旧后台文件，
并在同步后逐字节比对 `index.html`、`sitemap-0.xml`、`404.html`，防止文件存在但内容未更新仍假成功。
国内包由 `scripts/package-cn.mjs` 用**纯 Node** 生成、
条目一律 `/` 分隔——早期用 PowerShell `Compress-Archive` 会产生 `\` 分隔，CentOS 7 缺 `unzip` 时走 `python`
回退会把目录树压平，导致国内站更新失败（2026-10-02 踩过，已改）。

### 备案号怎么填

`.env.cn` 的 `PUBLIC_ICP` 留空时页脚不显示备案号——**备案批下来之前就该留空**，挂一个占位号或
别的网站的号（哪怕同主体的 `-1`）都属于套用，被抽查到要整改。

批下来后填**完整的号（含 `-N` 后缀）**，页脚会自动渲染成指向 `beian.miit.gov.cn` 的链接
（工信部要求必须可点）。

> `astro.config.mjs` 曾经有个坑：`process.env.PUBLIC_ICP || '粤ICP备XXXXXXXX号'` 会把假号塞回构建，
> 因为 Astro 不把 `.env.<mode>` 注入 `process.env`。已改为 `readModeEnv()` 直接读 `.env.cn`，空值不再回落。

导入结果写在 `src/data/generated/*.json`。想回到代码内的内容，跑 `npm run content:reset`
再重新构建即可。

### 为什么不是改完立刻生效

官网的每个页面都是预先生成的静态 HTML，这是 GEO 的前提——AI 爬虫抓到的必须是带完整
内容的页面，不能靠浏览器运行时再去取数据。代价就是内容变更需要重新构建。

## 7. 部署

### 标准发布顺序

1. 同步云端内容并导入，确认本地没有未评估的内容回退。
2. `npm run release:all`：构建双变体、打国内包、生成 `dist-app/`、准备并发布 GitHub Pages。
3. 用 WorkBuddy「发布为应用」将 **`dist-app/`** 发布到 `gficcrew.app.workbuddy.host`；不要选 `dist-global/`。
4. 国内服务器运行 `scripts/server-pull.sh`，或等待宝塔定时任务执行。
5. `npm run release:verify` 核验三端；任何一项不一致都不能视为发布完成。

`.com` 的公开包由 `scripts/prepare-gh-pages.mjs` 生成，后台和后台客户端资源不会进入该包。
`.app` 是唯一可用后台入口，也是 `cn-bundle.txt` 的唯一下载源；它的 robots 策略是全站 `Disallow: /`，
避免管理端镜像与公开主站竞争收录。`.cn` 不包含后台，Apache 配置负责旧路由 301、品牌 404 和安全响应头。

### 网络与验收

- GitHub API / gh-pages 推送等境外 API 可按环境使用代理。
- 对自家三端做线上验收时优先 `curl --noproxy '*'`，避免代理或 CDN 缓存造成“假通过”。
- `release:verify` 会比较关键 HTML、后台 JS 哈希、国内包大小和 `.cn` sitemap；失败时先补齐对应发布端，不要跳过检查。

`.github/workflows/deploy-cn.yml` 的 CloudBase 路线仅作备用；当前国内站由腾讯云轻量服务器主动拉包，不经过 GitHub。

## 8. GEO / SEO

- `robots.txt`（动态生成）：显式放行 GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、Claude-User、
  anthropic-ai、PerplexityBot、Google-Extended、Googlebot、Applebot(-Extended)、Bytespider、
  Baiduspider、CCBot、Amazonbot、DuckAssistBot、meta-externalagent、YouBot、Diffbot。
- `llms.txt`（动态生成）：品牌一句话定义 + 各页直达链接，内容与域名随版本变化。
- `sitemap-index.xml`：按版本生成对应域名。
- 结构化数据：Organization、WebSite、WebPage、BreadcrumbList、FAQPage（FAQ 页 + 各城市指南）、
  ItemList（城市 / 活动形式 / 指南 / 服务 / 会员方案）、Event（只为真实且未结束的活动生成详情页）、Article（每个城市指南，组织署名）。
- 页脚固定提示 + 全站自然覆盖关键词：expat community China、living in China、Guangzhou expat、
  Chinese visa、WeChat Pay、apartment rental China、Cantonese food、language exchange、expat events。
- 术语口径：首选 expats，"foreigners in China" 仅作搜索覆盖补充。

## 9. 合规

官网可放微信号与官网链接；小红书 / 视频号 / 公众号正文不出现微信号与外链，只打品牌名 `GFIC Crew`。
国内版正文不出现国内不可访问的平台名称。
