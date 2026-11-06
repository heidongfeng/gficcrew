#!/usr/bin/env bash
# 数据恢复演练/真实恢复。
#
#   bash restore-backup.sh                          # 列出可用备份
#   bash restore-backup.sh /www/gfic-data/backups/daily-20261106.json
#
# 恢复前会自动给当前数据留一份备份，所以恢复操作本身也可回退。

set -euo pipefail

DATA_DIR="${DATA_DIR:-/www/gfic-data}"
SRC="$DATA_DIR/data.json"
DEST_DIR="$DATA_DIR/backups"

if [ $# -lt 1 ]; then
  echo "可用备份（最新在前）："
  ls -1t "$DEST_DIR"/*.json 2>/dev/null | head -20 || echo "  暂无备份"
  echo
  echo "用法：bash $0 <备份文件完整路径>"
  exit 0
fi

BACKUP="$1"
[ -f "$BACKUP" ] || { echo "ERROR: 找不到 $BACKUP" >&2; exit 1; }

PHP_BIN="${PHP_BIN:-$(command -v php || true)}"
validate() {
  [ -n "$PHP_BIN" ] || return 0
  "$PHP_BIN" -r '
    $d = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($d)) { fwrite(STDERR, "ERROR: 不是合法 JSON\n"); exit(1); }
    foreach (["site","contact","cities","events","faq","plans","guides"] as $c) {
      if (!isset($d[$c]) || !is_array($d[$c])) { fwrite(STDERR, "ERROR: 集合 $c 缺失\n"); exit(1); }
    }
    $n = 0; foreach ($d as $rows) { $n += count($rows); }
    echo "数据校验通过，共 $n 条记录\n";
  ' "$1"
}

echo "待恢复的备份：$BACKUP"
validate "$BACKUP" || exit 1

if [ -f "$SRC" ]; then
  BEFORE="$DEST_DIR/before-restore-$(date +%Y%m%d-%H%M%S).json"
  cp -f "$SRC" "$BEFORE"
  echo "当前数据已另存为 $BEFORE（如需回退，用它再跑一次本脚本）"
fi

cp -f "$BACKUP" "$SRC"
chmod 640 "$SRC" 2>/dev/null || true
chown www:www "$SRC" 2>/dev/null || true

echo "已恢复。当前数据："
validate "$SRC"
echo "请打开后台刷新，确认内容已回到该备份时点。"
