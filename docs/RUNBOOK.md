# 部署与故障处理手册

## 发布目标

- 单台云服务器，预期个人使用或小规模分享。
- App 可用性目标：月度 99.5%。
- 上传构建不影响当前已发布 revision。
- 每次部署前至少保留一个宿主机外备份。

## 部署与验证

```bash
./ops/backup.sh                    # 已有数据时
git pull --ff-only
./ops/deploy.sh
docker compose ps
curl -fsS https://admin.example.com/healthz
```

部署后人工验证：管理登录、上传一份两页 Markdown、等待状态变为“可访问”、在展示域输入密码、打开幻灯片、修改展示密码后确认旧浏览器被要求重新登录。

## 日志与状态

```bash
docker compose ps
docker compose logs --since=15m app
docker compose logs --since=15m worker
docker compose logs --since=15m caddy
docker stats --no-stream
```

构建失败优先查看管理后台的构建日志。若 Worker 显示离线：

```bash
docker compose restart worker
docker compose logs -f --tail=200 worker
```

交换任务在 Worker 异常退出 15 分钟后会自动重新认领；已发布版本不受影响。

## 常见故障

### Caddy 无法申请证书

确认两个 DNS A/AAAA 记录指向服务器，TCP 80/443 未被其他服务占用，并查看 `docker compose logs caddy`。

### App 启动失败

执行 `docker compose logs app`。首次启动最常见原因是 `.env` 缺失或初始密码长度不足。已有数据库时环境中的初始密码不会覆盖现有密码。

### 构建持续超时

确认服务器能访问 npm Registry，检查内存与磁盘：

```bash
docker stats --no-stream
df -h
docker system df
```

不要在未备份时执行 Docker volume prune。

### 数据库故障

先停止写入并备份当前卷：

```bash
docker compose stop app worker
docker compose run --rm --no-deps app pnpm backup -- /data/backups/emergency
```

然后选择最近验证过的宿主机备份执行 `ops/restore.sh`。

## 回滚

应用代码回滚：

```bash
git log --oneline -10
git switch --detach <known-good-commit>
docker compose up -d --build --remove-orphans
```

如果新版本包含不兼容数据迁移，必须同时恢复该部署前的备份。1.0 只有向前创建 schema 的初始迁移，尚无破坏性迁移。

## 备份策略

- 每日运行 `ops/backup.sh`。
- 至少保留 7 个日备份和 4 个周备份。
- 将 `./backups` 同步到服务器外的加密存储。
- 每月至少在临时服务器执行一次恢复演练，并记录登录、列表和幻灯片访问验证结果。
