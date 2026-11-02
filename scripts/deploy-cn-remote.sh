#!/usr/bin/env bash
# 国内站远程部署：备份 → 上传 → 覆盖 → 权限 → 校验 → 清理
#
# 用法（凭据只走环境变量，不落盘、不进 Git）：
#   CN_HOST=43.139.44.212 CN_PORT=22 CN_USER=root CN_PASS='...' \
#     bash scripts/deploy-cn-remote.sh
#
# 可选：
#   CN_WEB=/www/wwwroot/gficcrew.cn   站点根目录
#   CN_KEEP='.well-known .user.ini'   覆盖时保留的条目
#   CN_DRY=1                          只检查连通与远端现状，不改动
#
# 依赖：ssh / scp（系统自带）。密码通过 SSH_ASKPASS 提供，无需 sshpass。

set -Eeuo pipefail

HOST="${CN_HOST:?缺少 CN_HOST}"
PORT="${CN_PORT:-22}"
USER_NAME="${CN_USER:-root}"
PASS="${CN_PASS:?缺少 CN_PASS}"
WEB="${CN_WEB:-/www/wwwroot/gficcrew.cn}"
KEEP="${CN_KEEP:-.well-known .user.ini}"
DRY="${CN_DRY:-0}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP="$ROOT/../gficcrew-cn.zip"
[ -f "$ZIP" ] || ZIP="$ROOT/dist-global/cn-bundle.txt"
[ -f "$ZIP" ] || { echo "✗ 找不到国内包，先跑 npm run build:all && npm run cn:zip"; exit 1; }

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- SSH 凭据注入
ASKPASS="$(mktemp /tmp/.cn-askpass.XXXXXX)"
cleanup() { rm -f "$ASKPASS"; }
trap cleanup EXIT
printf '#!/bin/sh\nprintf "%%s\\n" "$CN_PASS"\n' > "$ASKPASS"
chmod 700 "$ASKPASS"
export CN_PASS="$PASS" SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0

SSH_OPTS=(-p "$PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20
          -o PreferredAuthentications=password -o PubkeyAuthentication=no
          -o NumberOfPasswordPrompts=1 -o LogLevel=ERROR)
rsh() { ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" "$@"; }

step "1/7 检查本地包"
LOCAL_MD5="$(md5sum "$ZIP" | awk '{print $1}')"
LOCAL_SIZE="$(stat -c%s "$ZIP")"
echo "  包：$(basename "$ZIP")  ${LOCAL_SIZE} 字节  md5=${LOCAL_MD5}"

step "2/7 连接服务器"
if ! rsh 'echo ok' >/dev/null 2>&1; then
  die "SSH 登录失败：请确认端口、用户名、密码；若为宝塔环境，确认未禁用 root 密码登录"
fi
rsh 'echo "  host=$(hostname)  os=$(. /etc/os-release; echo "$PRETTY_NAME")"' || true

step "3/7 远端现状"
rsh "WEB='$WEB'
[ -d \"\$WEB\" ] || { echo '  站点目录不存在'; exit 3; }
echo \"  index.html: \$(stat -c%s \"\$WEB/index.html\" 2>/dev/null || echo 缺失) 字节\"
echo \"  FAQ 条数: \$(grep -o '\\\"@type\\\":\\\"Question\\\"' \"\$WEB/faq/index.html\" 2>/dev/null | wc -l)\"
echo \"  工具: unzip=\$(command -v unzip >/dev/null && echo yes || echo no) python3=\$(command -v python3 >/dev/null && echo yes || echo no)\"
echo \"  磁盘可用: \$(df -h \"\$WEB\" | awk 'NR==2{print \$4}')\""

if [ "$DRY" = "1" ]; then
  step "DRY 模式：只检查，不改动"
  exit 0
fi

step "4/7 备份当前站点"
TS="$(date +%Y%m%d-%H%M%S)"
rsh "WEB='$WEB'; B=/tmp/gfic-cn-backup-$TS.tar.gz
tar -czf \"\$B\" -C \"\$WEB\" . 2>/dev/null
echo \"  备份：\$B  \$(stat -c%s \"\$B\") 字节\"
ls -1t /tmp/gfic-cn-backup-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
echo '  保留最近 5 份备份'"

step "5/7 上传"
REMOTE_ZIP="/tmp/gfic-cn-$TS.zip"
scp -P "$PORT" -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR \
    -o PreferredAuthentications=password -o PubkeyAuthentication=no \
    -o NumberOfPasswordPrompts=1 "$ZIP" "$USER_NAME@$HOST:$REMOTE_ZIP"
REMOTE_MD5="$(rsh "md5sum '$REMOTE_ZIP' | awk '{print \$1}'")"
[ "$REMOTE_MD5" = "$LOCAL_MD5" ] || die "上传校验失败：远端 $REMOTE_MD5 ≠ 本地 $LOCAL_MD5"
echo "  上传完成，md5 一致"

step "6/7 解压覆盖"
KEEP_LIST="$KEEP"
rsh "set -e
WEB='$WEB'; Z='$REMOTE_ZIP'
T=/tmp/gfic-cn-unpack
rm -rf \"\$T\"; mkdir -p \"\$T\"
if command -v unzip >/dev/null 2>&1; then unzip -oq \"\$Z\" -d \"\$T\"
else python3 -c 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' \"\$Z\" \"\$T\"; fi
[ -f \"\$T/index.html\" ] || { echo '解压结果缺 index.html'; exit 4; }
# 清空站点目录，保留续签目录与宝塔防跨站文件
KEEP_ARGS=''
for k in $KEEP_LIST; do KEEP_ARGS=\"\$KEEP_ARGS ! -name '\$k'\"; done
eval \"find \\\"\\\$WEB\\\" -mindepth 1 -maxdepth 1 \$KEEP_ARGS -exec rm -rf {} +\"
cp -a \"\$T/.\" \"\$WEB/\"
OWNER=\$(stat -c '%U:%G' \"\$WEB\" 2>/dev/null || echo www:www)
chown -R \"\$OWNER\" \"\$WEB\" 2>/dev/null || true
find \"\$WEB\" -type d -exec chmod 755 {} + 2>/dev/null || true
find \"\$WEB\" -type f -exec chmod 644 {} + 2>/dev/null || true
rm -rf \"\$T\"
echo \"  已覆盖，属主 \$OWNER\""

step "7/7 远端校验"
rsh "WEB='$WEB'
echo \"  index.html md5: \$(md5sum \"\$WEB/index.html\" | awk '{print \$1}')\"
echo \"  FAQ 条数:     \$(grep -o '\\\"@type\\\":\\\"Question\\\"' \"\$WEB/faq/index.html\" | wc -l)\"
echo \"  广州页:       \$([ -f \"\$WEB/cities/guangzhou/index.html\" ] && echo 有 || echo 无)\"
echo \"  深圳页:       \$([ -f \"\$WEB/cities/shenzhen/index.html\" ] && echo 有 || echo 无)\"
echo \"  后台残留:     \$(find \"\$WEB\" -maxdepth 2 -name 'admin' -o -maxdepth 2 -name '_astro' -type d | grep -c admin || echo 0)\"
echo \"  文件总数:     \$(find \"\$WEB\" -type f | wc -l)\""

LOCAL_INDEX_MD5="$(md5sum "$ROOT/dist-cn/index.html" | awk '{print $1}')"
REMOTE_INDEX_MD5="$(rsh "md5sum '$WEB/index.html' | awk '{print \$1}'")"
printf '\n'
if [ "$LOCAL_INDEX_MD5" = "$REMOTE_INDEX_MD5" ]; then
  echo "✓ 部署完成：远端 index.html 与本地构建逐字节一致"
else
  echo "⚠ 远端 index.html 与本地不完全一致（可能被服务器端注入或缓存），请人工确认"
fi
