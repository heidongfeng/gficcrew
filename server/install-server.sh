#!/usr/bin/env bash
# gficcrew.cn 内容后台 + 数据接口 一键部署/自检脚本
#
# 用法（在服务器上执行）：
#   1. 把 dist-cn-admin 里的 admin/ admin-assets/ api/ 上传到网站根目录
#   2. 把迁移数据 data.json 上传为 /www/gfic-data/seed.json
#   3. bash install-server.sh
#
# 可重复执行：已初始化过就只跑自检，不会覆盖口令或数据。
# 环境变量：SITE（网站根目录）、DATA_DIR（数据目录）、GFIC_ADMIN_PW（首次初始化口令）

set -euo pipefail

SITE="${SITE:-/www/wwwroot/gficcrew.cn}"
DATA_DIR="${DATA_DIR:-/www/gfic-data}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# 宝塔的 PHP CLI 常常不在 PATH 里，按版本号挑一个最高的。
find_php() {
  if command -v php >/dev/null 2>&1; then command -v php; return; fi
  local candidate
  candidate=$(ls -1d /www/server/php/*/bin/php 2>/dev/null | sort -V | tail -1 || true)
  [ -n "$candidate" ] && { echo "$candidate"; return; }
  return 1
}

PHP_BIN=$(find_php) || fail "找不到 PHP CLI。请在宝塔「软件商店」安装 PHP 7.4+，或把 php 加入 PATH。"
log "PHP: $PHP_BIN ($($PHP_BIN -r 'echo PHP_VERSION;'))"

[ -f "$SITE/api/install.php" ] || fail "未找到 $SITE/api/install.php，请先上传部署包里的 api/ 目录"
[ -f "$SITE/admin/index.html" ] || fail "未找到 $SITE/admin/index.html，请先上传部署包里的 admin/ 目录"
[ -d "$SITE/admin-assets" ] || fail "未找到 $SITE/admin-assets，请先上传部署包里的 admin-assets/ 目录"

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/config.php" ]; then
  log "首次初始化：写入数据与配置"
  SEED="$DATA_DIR/seed.json"
  [ -f "$SEED" ] || fail "首次部署需要 $SEED（从云端导出的 data.json），请上传后重试"

  if [ -z "${GFIC_ADMIN_PW:-}" ]; then
    read -r -s -p "请设置后台口令（沿用现在的 24 位口令即可，输入不回显）：" GFIC_ADMIN_PW
    echo
  fi
  [ ${#GFIC_ADMIN_PW} -ge 12 ] || fail "口令至少 12 位"

  export GFIC_DATA_DIR="$DATA_DIR"
  export GFIC_ADMIN_PW
  export GFIC_SEED="$SEED"
  # 导出 token 留空，由 install.php 生成随机值。
  "$PHP_BIN" "$SITE/api/install.php" || fail "初始化失败"
  unset GFIC_ADMIN_PW

  EXPORT_TOKEN=$($PHP_BIN -r 'echo (include $argv[1])["exportToken"];' "$DATA_DIR/config.php")
  echo
  echo "=============================================================="
  echo "内容导出 token（只读，给 GitHub Actions 用），请立即保存："
  echo
  echo "  $EXPORT_TOKEN"
  echo
  echo "它只出现这一次。之后也可以随时在 $DATA_DIR/config.php 里查看。"
  echo "需要配置到 GitHub：仓库 Settings → Secrets and variables → Actions"
  echo "  名称：GFIC_EXPORT_TOKEN"
  echo "=============================================================="
  echo
else
  log "已初始化过，跳过配置写入（口令与数据保持不变）"
fi

# 权限：PHP-FPM/Apache 以 www 运行，数据目录必须可写，但不能被其他用户读。
chown -R www:www "$DATA_DIR" 2>/dev/null || chown -R apache:apache "$DATA_DIR" 2>/dev/null || true
find "$DATA_DIR" -type d -exec chmod 750 {} + 2>/dev/null || true
find "$DATA_DIR" -type f -exec chmod 640 {} + 2>/dev/null || true
chown -R www:www "$SITE/admin" "$SITE/admin-assets" "$SITE/api" 2>/dev/null || true

# 每日备份：写接口自身有"写前备份"，这里再补一份每日快照，防止误删后整天丢失。
install -m 755 "$(dirname "$0")/backup-daily.sh" "$DATA_DIR/backup-daily.sh" 2>/dev/null || \
  cp "$(dirname "$0")/backup-daily.sh" "$DATA_DIR/backup-daily.sh"
CRON_LINE="17 3 * * * root DATA_DIR=$DATA_DIR PHP_BIN=$PHP_BIN bash $DATA_DIR/backup-daily.sh >> $DATA_DIR/backup.log 2>&1"
if [ -d /etc/cron.d ]; then
  echo "$CRON_LINE" > /etc/cron.d/gfic-data-backup
  log "每日备份任务已写入 /etc/cron.d/gfic-data-backup（每天 03:17，保留 30 天）"
else
  ( crontab -l 2>/dev/null | grep -v 'gfic-data-backup\|backup-daily.sh'; echo "$CRON_LINE" ) | crontab -
  log "每日备份任务已写入 crontab（每天 03:17，保留 30 天）"
fi

log "开始自检"
export GFIC_DATA_DIR="$DATA_DIR"
BASE="https://gficcrew.cn"

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/admin/" || echo 000)
[ "$code" = "200" ] || fail "后台页面 $BASE/admin/ 返回 $code"
log "  后台页面可访问"

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/api/export.php" || echo 000)
[ "$code" = "403" ] || fail "导出接口不带 token 应返回 403，实际 $code"
log "  导出接口未授权访问被拦截"

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/api/data.php" || echo 000)
[ "$code" = "401" ] || fail "数据接口不带票据应返回 401，实际 $code"
log "  数据接口未授权访问被拦截"

for path in data.json config.php seed.json backups/latest.json ../gfic-data/data.json; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/$path" || echo 000)
  [ "$code" = "404" ] || fail "数据文件可能可被下载：$BASE/$path 返回 $code"
done
log "  数据文件无法通过网站下载"

DATA_DIR="$DATA_DIR" PHP_BIN="$PHP_BIN" bash "$DATA_DIR/backup-daily.sh" || fail "每日备份脚本执行失败"
log "  每日备份脚本已实测执行一次"

echo
log "部署完成。后台地址：$BASE/admin/"
echo "接下来："
echo "  1. 用浏览器打开后台，登录并改一条内容，保存后刷新确认还在"
echo "  2. 把上面的导出 token 配到 GitHub Secret GFIC_EXPORT_TOKEN"
echo "  3. 观察一周后再停用 WorkBuddy 云服务，云端数据在此之前不要动"
