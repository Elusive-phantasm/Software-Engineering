# 部署与运行指南（待补）

> 状态：**待补**。本目录暂未成文，运行方法目前分散在两处候选实现的 README 中。

补写时按以下四节组织，避免重复维护：

1. **环境要求**：JDK 17+ / Maven / MySQL 8 / Node.js 18+（仓库根目录的 `backend/`、`frontend/`），Node.js ≥ 22.5（`candidates/app`）。
2. **首次部署**：建库与账号、`schema.sql` 自动执行、演示数据灌入、前后端启动顺序。
3. **配置项**：`application.yml`（后端）与 `config/default.json`（app），含数据库连接、邮件 SMTP、演示工具开关。
4. **部署检查单**：端口占用、数据库连通性、`/api/dev/*` 在生产环境必须关闭。

现状参考：

- `README.md` —— 快速开始、演示账号、接口调试。
- `candidates/app/README.md`、`candidates/app/docs/05-部署与运行手册.md` —— Node 方案的运行与排错。
