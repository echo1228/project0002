#!/usr/bin/env sh
set -eu

backup_path=${1:-}
if [ -z "$backup_path" ] || [ ! -f "$backup_path/manifest.json" ]; then
  echo "用法：./ops/restore.sh ./backups/<timestamp>" >&2
  exit 1
fi

printf "恢复会替换当前数据库与幻灯片。输入 RESTORE 继续："
read -r confirmation
if [ "$confirmation" != "RESTORE" ]; then
  echo "已取消。"
  exit 1
fi

docker compose stop app worker
docker compose run --rm --no-deps -v "$(cd "$backup_path" && pwd):/restore:ro" app pnpm restore -- /restore --confirm
docker compose up -d app worker caddy
echo "恢复完成；请执行 docker compose ps 并验证关键幻灯片。"
