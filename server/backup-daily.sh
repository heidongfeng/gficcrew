#!/usr/bin/env bash
# 每日数据快照。由 install-server.sh 安装到 $DATA_DIR/backup-daily.sh 并加入 cron。
#
# 与写接口的"写前备份"互补：写前备份防的是单次误保存，每日快照防的是
# 一整天没动数据、或数据文件被直接删掉/损坏的情况。
#
# 用法：DATA_DIR=/www/gfic-data bash backup-daily.sh

set -euo pipefail

DATA_DIR="${DATA_DIR:-/www/gfic-data}"
SRC="$DATA_DIR/data.json"
DEST_DIR="$DATA_DIR/backups"

[ -f "$SRC" ] || { echo "ERROR: 找不到 $SRC" >&2; exit 1; }
mkdir -p "$DEST_DIR"

# 先验证源文件是合法 JSON 且 7 个集合齐全，坏文件不值得备份，也不该顶掉好备份。
PHP_BIN="${PHP_BIN:-$(command -v php || true)}"
if [ -n "$PHP_BIN" ]; then
  "$PHP_BIN" -r '
    $d = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($d)) { fwrite(STDERR, "ERROR: 数据文件不是合法 JSON\n"); exit(1); }
    foreach (["site","contact","cities","events","faq","plans","guides"] as $c) {
      if (!isset($d[$c]) || !is_array($d[$c])) { fwrite(STDERR, "ERROR: 集合 $c 缺失\n"); exit(1); }
    }
  ' "$SRC" || exit 1
fi

DEST="$DEST_DIR/daily-$(date +%Y%m%d).json"
cp -f "$SRC" "$DEST"
chmod 640 "$DEST" 2>/dev/null || true

# 保留 30 天。写前备份（data-*.json）由 PHP 接口自己清理，这里只管每日快照。
find "$DEST_DIR" -maxdepth 1 -type f -name 'daily-*.json' -mtime +30 -delete 2>/dev/null || true

echo "[$(date '+%F %T')] 已备份到 $DEST（$(stat -c %s "$DEST" 2>/dev/null || echo '?') 字节）"
