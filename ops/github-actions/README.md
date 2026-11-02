# 自动发布：它是怎么工作的，坏了怎么办

这两个文件是 **待启用** 状态，放在 `ops/` 下是为了不改动 `.github/workflows/`。
启用就是把它们搬过去，一步：

```bash
git mv ops/github-actions/publish.yml   .github/workflows/publish.yml
git mv ops/github-actions/keepalive.yml .github/workflows/keepalive.yml
git commit -m "ci: 启用定时发布与保活" && git push
```

搬完之前，**什么都不会自动发生**；搬完之后，每 6 小时一次，不成功就保持上一版。

---

## 一条内容的完整旅程

```
你在后台改 FAQ
   ↓  存在云端数据库（cms_docs）
   ↓  每 6 小时，Actions 醒来
content:pull        拉云端 → content-export.json      ← 口令错就停在这里
content:import      写进 src/data/generated/
build:all           生成 dist-global / dist-cn
12 项审计            197 条结论，任何一条 fail 就停
cn:zip              打国内包
ghpages:prepare     生成 dist-ghpages + 落源码指纹章
完整性 + 新鲜度守卫   缺文件 / 产物过期 就停
推 gh-pages          Git Data API，只传变化的文件
触发 Pages 构建       显式调用，因为 GITHUB_TOKEN 推的提交不自动触发
线上逐页核验          裸连、不吃缓存
```

任何一步停下，`gh-pages` 都保持原样。**这种设计下最坏的结果是「内容没更新」，不是「站点变坏」。**

国内站（gficcrew.cn）不在这条链路里。它由腾讯云服务器自己定时从
`https://gficcrew.com/cn-bundle.txt` 拉包落盘。所以：

> Actions 跑通 ≠ 国内站立刻更新。国内站取决于那台服务器上的 cron 有没有配好。

---

## 启用前必须配的东西

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| 名字 | 值 | 不配会怎样 |
|---|---|---|
| `GFIC_ADMIN_PW` | 后台管理口令（就是 `/admin/` 登录那个） | `content:pull` 退 1，本轮不发布 |

`GITHUB_TOKEN` 不用配，Actions 自动注入，权限由 workflow 里的 `permissions:` 决定。

**口令轮换后必须同步这里。** 不同步的后果是干净的失败：拉不到内容 → 不构建 → 不发布 → 站点停在上一版。不会写坏任何东西。

---

## 怎么判断它坏了

| 现象 | 含义 | 怎么办 |
|---|---|---|
| Actions 页面最近几轮都是绿的，但后台改的内容没上线 | 云端有内容，但 `cms_docs` 没写进去，或写进去了但 pull 的口令过期 | 看那一轮的 `拉云端内容` 日志 |
| 某轮红在 `拉云端内容` | 口令不对 / 被锁 | 更新 `GFIC_ADMIN_PW`；别连试，会锁很久 |
| 红在审计 | 代码或数据有问题，审计拦住了 | 日志里有具体哪一条，`0 失败` 才放行 |
| 红在 `构建 · 审计 · 发布` | 构建失败或守卫拦截 | 看是缺文件还是产物过期，两种都会写明要跑什么 |
| 连续几天完全没有运行记录 | schedule 被停用了 | 见下面「60 天规则」 |

**失败会发邮件给仓库所有者**（GitHub 默认只对失败的 workflow 发通知）。前提是账号邮箱通知没关。

---

## 60 天规则

仓库连续 60 天没有任何活动，GitHub 会**静默停用** schedule。不是警告，是停用。

`keepalive.yml` 每月 1 号提交一次 `ops/keepalive.txt`，把这个计时器归零。
如果哪天发现 `ops/keepalive.txt` 三个月没变，说明保活也死了，去看 Actions 页面。

---

## 想手动发一次

Actions → 选 `发布 gficcrew.com` → Run workflow。

后台改完内容急着上线就用这个，不用等 6 小时。

## 想停掉自动发布

删 `.github/workflows/publish.yml` 就行。别只删 `keepalive.yml`——那样发布会在 60 天后自己停，而你以为它还在跑。

---

## 成本

私有库每月 2000 分钟免费额度。

- 实测 `build:all` 约 4 秒
- 单个 job 约 3–4 分钟（大头是 `npm ci` 和等 Pages 构建）
- 一天 4 次 ≈ 360–480 分钟/月，占 **18%–24%**

还有富余，但不要再往这个 workflow 里塞别的定时任务——加一个每天跑 4 次的 job，额度就开始紧张了。
