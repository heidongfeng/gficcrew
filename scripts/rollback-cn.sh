#!/bin/bash
# GFIC 国内站回滚 —— 在腾讯云服务器（宝塔终端或计划任务）上运行。
#
# 用法：
#   bash rollback-cn.sh --list            # 列出可用备份（新→旧）
#   bash rollback-cn.sh --last            # 回滚到最近一份
#   bash rollback-cn.sh cn-20261101-121335.tar.gz   # 回滚到指定备份
#
# 行为：
#   1. 回滚【之前】先把当前线上状态再备份一份（前缀 pre-rollback），
#      所以回滚本身也是可回滚的，不会出现"回滚错了没有退路"。
#   2. 只覆盖站点目录，保留 .well-known（证书续签）与 .user.ini（宝塔防跨站）。
#   3. 回滚后逐字节校验 index.html，并强制清掉后台残留。
set -e

SITE=/www/wwwroot/gficcrew.cn
BK=/www/backup/gfic-cn
log(){ echo "$(date '+%F %T') $*"; }

usage(){
  echo "用法: bash rollback-cn.sh --list | --last | <备份文件名>"
  exit 1
}

[ -d "$BK" ] || { echo "备份目录不存在: $BK"; exit 1; }

case "${1:-}" in
  --list|"")
    echo "可用备份（新 → 旧）："
    ls -1t "$BK"/cn-*.tar.gz 2>/dev/null | while read -r f; do
      printf '  %-40s %8s  %s\n' "$(basename "$f")" \
        "$(du -h "$f" | cut -f1)" "$(date -r "$f" '+%F %T')"
    done
    exit 0
    ;;
  --last)
    TARGET=$(ls -1t "$BK"/cn-*.tar.gz 2>/dev/null | head -1)
    [ -n "$TARGET" ] || { echo "没有可用备份"; exit 1; }
    ;;
  *)
    TARGET="$BK/$1"
    ;;
esac

[ -f "$TARGET" ] || { echo "备份不存在: $TARGET"; exit 1; }

log "=== 回滚目标：$(basename "$TARGET") ==="

# 回滚前先给当前状态存一份，避免回滚本身不可逆
mkdir -p "$BK"
SAFE="$BK/pre-rollback-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$SAFE" -C "$SITE" . 2>/dev/null || true
log "当前状态已另存：$(basename "$SAFE")"

# 解包到临时目录并校验，确认无损才覆盖线上
TMP=$(mktemp -d /tmp/gfic-rb.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/site"
tar -xzf "$TARGET" -C "$TMP/site"
if [ ! -f "$TMP/site/index.html" ]; then
  echo "备份内缺少 index.html，中止（线上未改动）"
  exit 1
fi

# 覆盖：保留证书目录与宝塔防跨站文件
if command -v rsync >/dev/null 2>&1; then
  rsync -a --checksum --delete --exclude='.well-known' --exclude='.user.ini' "$TMP/site/" "$SITE/"
else
  find "$SITE" -mindepth 1 -maxdepth 1 ! -name '.well-known' ! -name '.user.ini' -exec rm -rf {} +
  cp -a "$TMP/site/." "$SITE/"
fi

# 后台不该出现在公开站点目录
rm -rf "$SITE/admin"
find "$SITE/_astro" -maxdepth 1 -name 'admin.*' -exec rm -f {} + 2>/dev/null || true
chown -R www:www "$SITE" 2>/dev/null || true

# 逐字节校验
if cmp -s "$TMP/site/index.html" "$SITE/index.html"; then
  log "校验通过：index.html 与备份逐字节一致"
else
  log "校验失败：index.html 与备份不一致"
  exit 1
fi

# 只保留最近 6 份（含 pre-rollback），避免长期堆积
ls -1t "$BK"/*.tar.gz 2>/dev/null | tail -n +7 | xargs -r rm -f

log "=== 回滚完成：$(basename "$TARGET") ==="
