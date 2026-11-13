# 候选实现

两个候选实现面向同一份需求（《软件需求规格说明书 V2.1》），用于验证技术路线。

| | [`app/`](app) | [`campus-trade/`](campus-trade) |
|---|---|---|
| 定位 | 第一版 Node 单体，已被 ADR-001 替代 | **现行路线**：Spring Boot + Vue 重写版 |
| 技术栈 | Node.js 22（`node:sqlite`）+ Express 4；前端原生 ES Module，零构建 | Spring Boot 3.5 + MyBatis-Plus + MySQL 8；Vue 3 + Vite + Element Plus |
| 外部依赖 | 只需 Node.js ≥ 22.5 | JDK 17+、Maven、MySQL 8、Node.js 18+ |
| 数据库 | 单文件 SQLite（`app/data/`，不入库） | 独立 MySQL 实例，端口 3307（`campus-trade/.mysql/`，不入库） |
| 入口 | <http://127.0.0.1:3081> | 后端 <http://127.0.0.1:8080> / 前端 <http://localhost:5173> |
| 自测 | UC 238 项、场景 127 项、前端渲染 29 项 | 后端冒烟 72 项、浏览器 e2e 20 项、压测抽样 |

选型依据见 [`campus-trade/架构确认与决策记录.md`](campus-trade/架构确认与决策记录.md) 的 ADR-001。
`app/` 保留为**零依赖演示与回退方案**，不再作为实现主线。

## app：零依赖运行

```bash
cd app
npm install --cache ./.npm-cache
npm run seed        # 灌入演示数据
npm start           # http://127.0.0.1:3081
```

- 演示账号：`lin@campus.edu` / `Test@12345`（学生），`ADM-001` / `Admin@12345`（管理员）。
- Windows 可直接双击 `app/启动.bat`。

## campus-trade：完整环境运行

```bash
cd campus-trade
# 1) 建库（见 README.md 的建库语句）  2) 启动后端  3) 启动前端
cd backend  && mvn spring-boot:run     # 8080
cd frontend && npm install && npm run dev   # 5173
```

- Windows 可直接双击 `campus-trade/启动数据库.bat`、`启动后端.bat`、`启动前端.bat`。
- 数据库、接口与验收说明分别见 `campus-trade/docs/` 与 `campus-trade/README.md`。
