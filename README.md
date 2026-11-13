# 拾光二手 · 校园二手交易与物品流转平台

> 《软件工程》课程项目 · 第 3 组 · 林初仁（组长）、赵俊豪、吕锦浩、马歆远、过振宇

面向校内学生之间的二手物品买卖，含发布、审核、下单成交、评价、举报处置与站内私信。
平台**不涉及资金与交付**：「成交」只表示下单成功，不代表已付款或已收货。

---

## 一、仓库当前状态：探索期

本仓库处于**探索期**：需求已定稿，架构基线还在确认，两条候选实现用来验证技术路线，**尚未进入正式编码**。

| 阶段 | 状态 | 结论与依据 |
|---|---|---|
| 需求分析 | ✅ 已定稿 | 《软件需求规格说明书 V2.1》（2026-11-05）：24 个用例、22 条业务规则 |
| 需求质量验证 | ✅ 已归档 | A 报告《需求分析质量验证报告》（提交版本 V1.2.1，2026-11-01） |
| AI 使用验证 | ✅ 已归档 | B 报告《AI 智能体使用验证报告》（2026-11-01） |
| 架构设计 | 🟡 基线草案 | 《软件架构设计说明书》v1.0（2026-11-12）：ADR-001～006 已接受待补签，Q-01～Q-06 待业务确认 |
| 实现 | ⬜ 未开始 | S1～S3 阶段计划已排定，S1 待准入 |

**下一步**：Q-01～Q-06 由业务确认人签字、ADR 由架构负责人与交叉审查人补签后，S1 才可开工。
开工前先看 [docs/基线索引.md](docs/基线索引.md)——它登记每类文档的当前版本与能否开工，是项目的唯一入口页。

## 二、候选方案一览

| | [`candidates/app`](candidates/app) | [`candidates/campus-trade`](candidates/campus-trade) |
|---|---|---|
| 定位 | 第一版 Node 单体（已被替代） | **现行路线**：Spring Boot + Vue 重写版 |
| 技术栈 | Node.js 22（内置 `node:sqlite`）+ Express 4；前端原生 ES Module，零构建、零 CDN | Spring Boot 3.5 + MyBatis-Plus + MySQL 8；Vue 3 + Vite + Element Plus |
| 数据存储 | 单文件 SQLite，无需安装数据库 | 独立 MySQL 实例（端口 3307），需建库与账号 |
| 启动后地址 | <http://127.0.0.1:3081> | 后端 <http://127.0.0.1:8080>　前端 <http://localhost:5173> |
| 自测覆盖 | UC 238 项、场景 127 项、前端渲染 29 项 | 后端冒烟 72 项、浏览器 e2e 20 项、压测抽样 |
| 保留理由 | 机器无 JDK 17 / Maven / MySQL 时仍可完整演示，可作回退方案 | 生态主流、贴近生产；架构文档与阶段计划均围绕它组织 |

**选型结论**：ADR-001 已决定用 `campus-trade`（Spring Boot + Vue）替代 Node 单体。
`app` 保留为**零依赖演示与回退方案**，不再作为实现主线。运行方法见 [candidates/README.md](candidates/README.md)。

## 三、目录结构

```text
Software-Engineering/
├── README.md                  # 本文件：探索状态 + 候选方案一览
├── .gitignore
├── candidates/                # 候选实现（代码）
│   ├── README.md
│   ├── app/
│   └── campus-trade/
└── docs/                      # 项目文档（详见 docs/README.md）
    ├── README.md              # 文档索引
    ├── 基线索引.md             # 每类文档的当前版本 + 是否可开工
    ├── requirements/          # SRS.md、需求覆盖矩阵.md
    ├── architecture/          # 架构设计说明书、架构确认与决策记录、接口所有权表
    ├── design/                # 接口与关键设计说明书、数据库设计
    ├── test/                  # 验收与测试记录、走查记录
    ├── process/               # 分阶段实现与测试计划、分工通知、分工成果
    ├── reports/               # A/B 报告、成员 AI 使用报告
    ├── course/                # 课程下发的模板与操作指引
    └── deployment/            # 部署与运行指南（待补）
```

## 四、从哪里开始读

| 想了解 | 直接打开 |
|---|---|
| 需求到底定了什么 | [docs/requirements/SRS.md](docs/requirements/SRS.md) |
| 现在能不能开工、卡在哪 | [docs/基线索引.md](docs/基线索引.md) |
| 技术选型与架构决策 | [docs/architecture/架构确认与决策记录.md](docs/architecture/架构确认与决策记录.md) |
| 接口契约与数据模型 | [docs/design/接口与关键设计说明书.md](docs/design/接口与关键设计说明书.md) |
| 需求阶段怎么验的 | [docs/reports/A报告/需求分析质量验证报告.md](docs/reports/A报告/需求分析质量验证报告.md) |
| AI 用在哪、怎么核验 | [docs/reports/B报告/AI%20智能体使用验证报告.md](docs/reports/B报告/AI%20智能体使用验证报告.md) |

## 五、写作与提交约定

- 文档用 Markdown 为主格式，图件保留 `.drawio` 可编辑源文件与导出的 `.png`/`.svg`。
- **只保留当前有效版本**：版本号写在文件头，旧版不留在目录里，用 `git log` / `git show` 回溯。
- 需求基线以 [docs/requirements/SRS.md](docs/requirements/SRS.md) 为准；改动走新提交，不覆盖历史。
- 默认值、建议值、待确认项在正文中显式标注，**AI 生成的内容不作为确认依据**。
- 本地数据库、`node_modules`、构建产物与压缩包不入库，见 [.gitignore](.gitignore)。
