# Slidev Vault 1.0

一个面向个人使用的自托管 Slidev 展示平台。管理员可以上传单个 Markdown，或上传包含主题、Vue 组件和本地资源的完整 Slidev ZIP；平台在隔离的 Worker 中构建静态 SPA，并通过统一访问密码保护所有幻灯片文件。

## 1.0 功能

- 单独的管理域名和展示域名
- Argon2id 管理密码与展示密码
- 修改展示密码后立即撤销全部旧会话
- 上传 `.md` 或完整 Slidev `.zip`
- 支持 `components/`、`layouts/`、`styles/`、`public/`、本地主题和 npm 依赖
- 单并发构建队列、构建日志、失败保留旧版本、手动重建
- SQLite 版本元数据和审计记录
- Worker 与数据库/历史内容隔离的双卷构建交换区
- Docker Compose、Caddy 自动 HTTPS、健康检查、资源限制
- 在线备份、确认式恢复、CI 与依赖更新配置

## 云服务器快速部署

要求：一台安装了 Docker Engine 与 Docker Compose 的 Linux 服务器，以及两个指向服务器的域名，例如：

```text
admin.example.com   管理后台
slides.example.com  幻灯片访问
```

```bash
git clone https://github.com/echo1228/project0002.git slidev-vault
cd slidev-vault
cp .env.example .env
chmod +x ops/*.sh
```

编辑 `.env`，至少修改：

```dotenv
ADMIN_DOMAIN=admin.example.com
SLIDES_DOMAIN=slides.example.com
INITIAL_ADMIN_PASSWORD=一个至少14字符的唯一管理密码
INITIAL_VIEWER_PASSWORD=一个至少12字符的唯一展示密码
```

然后执行：

```bash
./ops/deploy.sh
```

Caddy 会自动申请并续期 HTTPS 证书。服务器安全组需要开放 TCP `80/443`，若希望使用 HTTP/3，可同时开放 UDP `443`。

初始密码只在数据库第一次初始化时使用。以后在管理后台修改密码，修改 `.env` 不会覆盖数据库中的新密码。

## 上传项目格式

简单 Markdown：

```text
slides.md
```

完整 ZIP 的根目录必须包含 `slides.md`：

```text
deck.zip
├── slides.md
├── package.json          # 可选，scripts 会被移除且安装时禁用 lifecycle scripts
├── components/
├── layouts/
├── styles/
├── public/
│   └── images/
└── theme/
```

平台固定 Slidev、Vue 和内置主题版本。项目可以声明其他依赖，但依赖代码会在构建时执行，因此只有管理员能够上传项目。`.env`、`.git`、`node_modules`、符号链接和越界 ZIP 路径会被拒绝。

## 日常运维

```bash
# 查看状态
docker compose ps

# 查看应用或 Worker 日志
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 worker

# 备份到宿主机 ./backups/<timestamp>
./ops/backup.sh

# 更新并重新部署
git pull --ff-only
./ops/deploy.sh

# 恢复备份（会要求输入 RESTORE）
./ops/restore.sh ./backups/<timestamp>
```

完整故障处理和回滚步骤见 [docs/RUNBOOK.md](docs/RUNBOOK.md)。

## 本地开发

Windows/macOS 本地开发可以暂时不配置域名限制：

```bash
pnpm install
pnpm dev
```

另开一个终端：

```bash
pnpm worker
```

开发环境未设置初始密码时使用：

```text
管理密码：admin-change-me-now
展示密码：slides-change-me
```

生产环境绝不会启用这些开发默认值。

验证命令：

```bash
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

## 文档

- [架构说明](docs/ARCHITECTURE.md)
- [API 契约](docs/API.md)
- [安全模型与证据](docs/SECURITY.md)
- [部署与故障处理手册](docs/RUNBOOK.md)
