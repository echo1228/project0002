#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "缺少 .env；请先复制 .env.example 并填写域名与初始密码。" >&2
  exit 1
fi

docker compose config >/dev/null
docker compose up -d --build --remove-orphans

attempt=0
until docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "应用未能在预期时间内就绪。" >&2
    docker compose ps
    exit 1
  fi
  sleep 2
done

docker compose ps
echo "部署完成。"
