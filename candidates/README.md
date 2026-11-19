# 候选实现

现行实现（Spring Boot + Vue）已移到仓库根目录：`backend/`、`frontend/`、`tools/`，
运行方法见根目录 [README.md](../README.md)。

`candidates/` 只保留第一版 Node 单体 `app/`，用途是**零依赖演示与回退方案**：
机器上没有 JDK 17 / Maven / MySQL 时，仍可完整演示同一份需求。

| | [`app/`](app) |
|---|---|
| 定位 | 第一版 Node 单体，已被 ADR-001 替代，不再作为实现主线 |
| 技术栈 | Node.js 22（`node:sqlite`）+ Express 4；前端原生 ES Module，零构建 |
| 外部依赖 | 只需 Node.js ≥ 22.5 |
| 数据库 | 单文件 SQLite（`app/data/`，不入库） |
| 入口 | <http://127.0.0.1:3081> |
| 自测 | UC 238 项、场景 127 项、前端渲染 29 项 |

选型依据见 [`../docs/architecture/架构确认与决策记录.md`](../docs/architecture/架构确认与决策记录.md) 的 ADR-001。

## app：零依赖运行

```bash
cd app
npm install --cache ./.npm-cache
npm run seed        # 灌入演示数据
npm start           # http://127.0.0.1:3081
```

- 演示账号：`lin@campus.edu` / `Test@12345`（学生），`ADM-001` / `Admin@12345`（管理员）。
- Windows 可直接双击 `app/启动.bat`。

## 现行实现

```bash
# 在仓库根目录
cd backend  && mvn spring-boot:run            # 8080
cd frontend && npm install && npm run dev     # 5173
```

- 完整环境：JDK 17+、Maven、MySQL 8（3307）、Node.js 18+。
- Windows 可直接双击根目录的 `启动数据库.bat`、`启动后端.bat`、`启动前端.bat`。
- 数据库、接口、测试与验收说明见根目录 [README.md](../README.md) 与 [`../docs/`](../docs/)。
