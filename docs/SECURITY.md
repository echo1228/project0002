# 安全模型与发布证据

## 资产与信任边界

需要保护的资产：管理权限、展示密码、服务端 Session、未公开的源项目和构建产物。平台不设计用于存储支付、医疗或其他受监管个人数据。

信任边界：浏览器到 Caddy、Caddy 到 App、App 数据卷到构建交换卷、交换卷到 Worker、Worker 到 npm Registry。

## 五项主要威胁

| 攻击 | 影响 | 可能性 | 控制与恢复 |
|---|---|---|---|
| 暴力猜测管理或展示密码 | 未授权管理或内容泄露 | 中 | Argon2id、按 IP 限速、失败审计、TLS、长密码 |
| 恶意主题在构建时读取数据库 | 密码哈希或历史源泄露 | 中 | Worker 不挂载 `app_data`，只挂载交换卷；容器无秘密、只读根文件系统、无额外 capabilities |
| 自定义 Vue 组件攻击管理会话 | 删除项目、改密码 | 中 | 管理域和展示域分离、Host-only Cookie、管理写 API 校验 Origin、无跨域许可 |
| ZIP 路径穿越、符号链接或解压炸弹 | 覆盖文件、磁盘耗尽 | 中 | 拒绝绝对/父级路径、`.env`、`.git`、`node_modules` 和符号链接；限制上传体积、解压体积和文件数 |
| 只保护 HTML 或密码修改后旧 Session 仍有效 | 绕过访问控制 | 中 | `/slides/**` 每个资源都验证 Session；凭据版本化；改密码事务中删除全部同类 Session |

## 控制检查表

- 身份：管理与展示凭据分离；服务器端授权；管理操作写审计。
- 数据：TLS；密码只保存 Argon2id 哈希；Session 只保存 Token 摘要；秘密不进入仓库。
- 应用：严格 slug、路径和归档验证；登录限速；依赖锁文件；npm lifecycle scripts 禁用。
- 浏览器：`HttpOnly; Secure; SameSite=Strict`；管理 CSP；HSTS；Origin 验证。
- 运行：非 root 容器、只读根文件系统、`no-new-privileges`、CPU/内存/PID 限制、健康检查、备份与恢复手册。

## 可验证证据

| 控制 | 证据位置或命令 |
|---|---|
| 密码哈希与撤销 | `server/utils/password.ts`、`server/utils/auth.ts`、`tests/password.test.ts` |
| 构建数据隔离 | `compose.yaml` 中 Worker 只挂载 `build_exchange` 和 `pnpm_store` |
| ZIP 安全 | `server/utils/archive.ts`、`tests/archive.test.ts` |
| 静态资源鉴权 | `server/utils/serve-deck.ts` |
| 资源限制与最小权限 | `docker compose config` 输出 |
| 备份恢复 | `ops/backup.sh`、`ops/restore.sh`、`docs/RUNBOOK.md` |
| 依赖与秘密检查 | `pnpm audit --prod`、安全扫描脚本、GitHub Dependabot |

## 已接受的剩余风险

- Worker 可以访问同一交换卷中的其他未完成任务和共享 pnpm 缓存。1.0 只有单管理员、单 Worker；若引入不受信任上传者，需要改为每任务一次性容器或独立虚拟机。
- `--ignore-scripts` 不能阻止依赖在 Slidev/Vite 构建阶段执行代码，因此容器隔离仍是必要控制。
- 本地开发默认密码仅供开发；生产环境缺少显式初始密码时启动失败。
