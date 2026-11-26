# 部署与运行指南

> 适用范围：`backend/` + `frontend/` 这套主实现。Node 单体回退方案见
> [candidates/app/docs/05-部署与运行手册.md](../../candidates/app/docs/05-部署与运行手册.md)。
>
> 本文只写**运行与配置**，不改变任何需求。需求基线见
> [../requirements/SRS.md](../requirements/SRS.md)。

## 1. 环境要求

| 组件 | 版本 | 说明 |
|---|---|---|
| JDK | 17+ | `backend/pom.xml` 的 `java.version` / `maven.compiler.release` 均为 **17**，在 JDK 21 上验证 |
| Maven | 3.9+ | 构建后端（`mvn package -DskipTests`） |
| MySQL | 8.0+ | 3306 或 3307 均可，用 `DB_PORT` 指定 |
| Node.js | 18+ | 构建前端；`candidates/app` 需要 ≥ 22.5 |

## 2. 首次部署

1. **建库与账号**

   ```sql
   CREATE DATABASE IF NOT EXISTS campus_trade
     CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER IF NOT EXISTS 'campus'@'%' IDENTIFIED BY '<你的口令>';
   GRANT ALL PRIVILEGES ON campus_trade.* TO 'campus'@'%';
   ```

2. **表结构**：应用启动时执行 `backend/src/main/resources/db/schema.sql`
   （全部 `CREATE TABLE IF NOT EXISTS`，可重复执行，不含破坏性语句）。

3. **演示数据**：`DataSeeder` 仅在 `admins` 表为空时灌入，且受 `app.seed.enabled` 控制。
   正式部署置 `APP_SEED_ENABLED=false`。口令来源见第 3 节。

4. **构建与启动顺序**：数据库 → 后端（8080）→ 前端（5173 / 静态托管）。

   ```bash
   cd backend && mvn package -DskipTests && java -jar target/campus-trade-backend-1.0.0.jar
   cd frontend && npm ci && npm run build   # 产物在 frontend/dist
   ```

## 3. 配置项

后端全部配置集中在 `backend/src/main/resources/application.yml`，可用环境变量覆盖；
完整清单见 [`backend/.env.example`](../../backend/.env.example)。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `APP_ENV` | `dev` | `dev` = 演示/开发；其它值（如 `prod`）= 正式部署，启动时校验并拒绝不安全组合 |
| `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | `3306` / `campus_trade` / `campus` / 演示值 | **正式部署必须注入 `DB_PASSWORD`** |
| `APP_ENABLE_DEV_TOOLS` | `false` | 控制 `/api/dev/**`；开启后仍要求管理员身份 |
| `APP_ENABLE_API_DOCS` | `true` | 控制 `/v3/api-docs` 与 `/swagger-ui.html`；正式部署建议 `false` |
| `APP_SEED_ENABLED` | `true` | 是否灌入演示数据；正式部署必须 `false` |
| `APP_SEED_ADMIN_NO` | `ADM-001` | 演示管理员账号 |
| `APP_SEED_ADMIN_PASSWORD` / `APP_SEED_DEMO_PASSWORD` | 空 | 留空则首次启动随机生成并写入 `APP_SEED_CREDENTIALS_FILE` |
| `APP_SEED_ADMIN_MUST_CHANGE` | `false` | 是否强制管理员首次登录改密（SRS UC-04；正式部署建议 `true`） |
| `APP_SEED_CREDENTIALS_FILE` | `./data/seed-credentials.txt` | 随机口令落盘位置，勿提交仓库 |

前端演示账号预填（可选）：复制 `frontend/.env.example` 为 `.env.local`，
填 `VITE_DEMO_STUDENT_EMAIL` / `VITE_DEMO_STUDENT_PASSWORD` / `VITE_DEMO_ADMIN_NO` / `VITE_DEMO_ADMIN_PASSWORD`。
不填则登录页为空，构建产物中不含任何口令。

## 4. 部署检查单

- [ ] `APP_ENV=prod`
- [ ] `APP_ENABLE_DEV_TOOLS=false`（`/api/dev/**` 已同时要求管理员角色，但开关仍应关闭）
- [ ] `APP_SEED_ENABLED=false`
- [ ] `DB_PASSWORD` 由环境变量注入，且**不是**仓库内演示口令
- [ ] `APP_ENABLE_API_DOCS=false`（如需对外隐藏接口清单）
- [ ] 端口 8080 未被占用；数据库可达；`/uploads` 目录可写
- [ ] 启动日志无「生产环境配置校验未通过」

**启动校验的判定方式**：`APP_ENV` 非 `dev` / `test` 时，`StartupGuard` 在 Bean 初始化阶段
（早于对外服务）检查上面第 2～4 项，任一不满足即抛 `IllegalStateException` 并退出，退出码非 0。
这是**阻断式**校验，不做静默降级。
