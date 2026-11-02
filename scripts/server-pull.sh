#!/bin/bash
# GFIC 国内站自动同步 —— 在腾讯云服务器（宝塔计划任务）上运行。
# 拉取源：公开主站 gficcrew.com 上的 cn-bundle.txt（国内包，由发布流程推送）。
# 同步方式：rsync --checksum，按「内容」判定变化。
#   原因：打包脚本把 ZIP 条目 mtime 固定为 1980（可复现构建），解压后所有文件 mtime 相同；
#   若只用默认的 size+mtime 快速校验，「内容变了但字节数相同」的文件（如恒为 225B 的
#   sitemap-index.xml）会被 rsync 误判为未变而跳过，导致线上一直残留旧版本。
# 安全：只覆盖本站点目录，保留 .well-known（证书续签）与 .user.ini（宝塔防跨站）；
#       同步后强制清理后台 admin/ 与 _astro/admin.*。
set -e
SITE=/www/wwwroot/gficcrew.cn
URL="https://gficcrew.com/cn-bundle.txt"
# 本地包优先：把包上传到服务器后，同步完全不依赖任何远端地址。
# 远端只在本地没有包时才作为兜底。这样 .com 的发布出任何问题都波及不到国内站。
LOCAL=/www/backup/gfic-cn/pkg/cn-bundle.zip
TMP=$(mktemp -d /tmp/gfic-cn.XXXXXX)
# 备份不能放 /tmp：服务器重启会清空，等于没有备份。放 /www 下，跟站点同盘。
BK=/www/backup/gfic-cn
log(){ echo "$(date '+%F %T') $*"; }
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT

log "=== 开始同步 ==="
mkdir -p "$TMP/site"

# 1) 取包：本地优先，其次远端
if [ -f "$LOCAL" ]; then
  cp -f "$LOCAL" "$TMP/bundle"
  log "使用服务器本地包：$LOCAL（$(wc -c < "$TMP/bundle") 字节）"
else
  log "本地无包，回退远端：$URL"
  http=$(curl -sS -o "$TMP/bundle" -w '%{http_code}' --max-time 300 "$URL" || echo 000)
  if [ "$http" != "200" ]; then
    log "ERROR: 拉取失败 HTTP=$http（站点保持上一版，不会被破坏）"; exit 1
  fi
  log "拉取成功 200，$(wc -c < "$TMP/bundle") 字节"
fi

# 2) 校验是不是真 ZIP（404 页面、错误页都是 HTML，解压前先挡掉）
magic=$(head -c 2 "$TMP/bundle" 2>/dev/null || true)
if [ "$magic" != "PK" ]; then
  log "ERROR: 取到的不是 ZIP（文件头 = '$magic'），中止。站点未改动。"; exit 1
fi

# 2) 解压（优先 unzip，否则 python）
if command -v unzip >/dev/null 2>&1; then
  unzip -q -o "$TMP/bundle" -d "$TMP/site" || { log "ERROR: unzip 解压失败（包可能损坏）"; exit 1; }
else
  python -c "import zipfile;zipfile.ZipFile('$TMP/bundle').extractall('$TMP/site')" || { log "ERROR: python 解压失败"; exit 1; }
fi
[ -f "$TMP/site/index.html" ] || { log "ERROR: 包内缺 index.html，中止"; exit 1; }

# 3) 覆盖前备份（保留最近 3 份）
mkdir -p "$BK"
tar -czf "$BK/cn-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$SITE" . 2>/dev/null || true
ls -1t "$BK"/cn-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f

# 4) 覆盖站点（--checksum 按内容比对，避免固定 mtime 造成漏传）
if command -v rsync >/dev/null 2>&1; then
  rsync -a --checksum --delete --exclude='.well-known' --exclude='.user.ini' "$TMP/site/" "$SITE/" || { log "ERROR: rsync 失败"; exit 1; }
else
  log "提示: 无 rsync，改用清空+复制"
  find "$SITE" -mindepth 1 -maxdepth 1 ! -name '.well-known' ! -name '.user.ini' -exec rm -rf {} +
  cp -a "$TMP/site/." "$SITE/"
fi
chown -R www:www "$SITE" 2>/dev/null || true

# 5) 清理后台残留（无论是否走 rsync 都执行，防止旧部署把后台留在公网）
rm -rf "$SITE/admin"
find "$SITE/_astro" -maxdepth 1 -type f -name 'admin.*' -delete 2>/dev/null || true

# 6) 逐字节校验：文件存在 ≠ 内容已更新，必须与发布包比对
for rel in index.html 404.html sitemap-0.xml sitemap-index.xml robots.txt; do
  if [ ! -f "$TMP/site/$rel" ] || [ ! -f "$SITE/$rel" ] || ! cmp -s "$TMP/site/$rel" "$SITE/$rel"; then
    log "ERROR: 同步后 $rel 与发布包不一致，检查 $SITE 权限/所有权"; exit 1
  fi
done
[ ! -d "$SITE/admin" ] || { log "ERROR: 后台目录仍存在，已中止"; exit 1; }
log "SUCCESS: gficcrew.cn 已同步为最新构建；关键文件与发布包逐字节一致（--checksum）"
