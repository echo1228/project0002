# API 契约

所有错误使用 HTTP 4xx/5xx，并在响应中提供稳定的 `data.code` 与用户可读的 `data.message`。管理 API 需要管理 Session，展示 API 只允许从展示域名调用。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/login` | 管理密码登录 |
| POST | `/api/admin/logout` | 注销当前管理 Session |
| GET | `/api/admin/me` | 验证管理 Session |
| GET | `/api/admin/decks` | 按更新时间倒序列出幻灯片 |
| POST | `/api/admin/decks` | Multipart 上传，字段为 `file`、`title`、`slug` |
| POST | `/api/admin/decks/:id/rebuild` | 从最新源 revision 创建重建任务 |
| GET | `/api/admin/decks/:id/logs` | 读取最新 revision 的受限构建日志 |
| DELETE | `/api/admin/decks/:id` | 删除幻灯片及全部版本 |
| PUT | `/api/admin/viewer-password` | 更新展示密码并撤销所有展示 Session |
| PUT | `/api/admin/password` | 校验当前密码后更新管理密码 |
| GET | `/api/admin/system` | Worker 心跳与队列摘要 |
| POST | `/api/viewer/login` | 展示密码登录，返回安全的站内 next 路径 |
| POST | `/api/viewer/logout` | 注销展示 Session |
| GET | `/api/viewer/session` | 验证展示 Session |
| GET | `/slides/:slug/**` | 鉴权后提供全部 Slidev 静态文件 |
| GET | `/healthz` | 进程存活检查 |
| GET | `/readyz` | SQLite 就绪检查 |

可重试语义：上传会为同一个 slug 创建新 revision，因此客户端不应在未确认请求结果时自动重试。重建每次都会创建新 revision。删除是幂等目标，但第二次调用返回 404。
