#!/usr/bin/env sh
set -eu

stamp=$(date -u +%Y-%m-%d_%H-%M-%S)
container_path="/data/backups/$stamp"
host_path="./backups/$stamp"

mkdir -p ./backups
docker compose exec -T app pnpm backup -- "$container_path"
docker compose cp "app:$container_path/." "$host_path"
echo "备份已复制到 $host_path"
