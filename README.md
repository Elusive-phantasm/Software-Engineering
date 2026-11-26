# 拾光二手 · 校园二手交易平台（Spring Boot + Vue）

> 《软件工程》课程项目 · 第 3 组 · 林初仁（组长）、赵俊豪、吕锦浩、马歆远、过振宇
> 依据《软件需求规格说明书 V2.1》实现的前后端分离系统。
> 后端 Spring Boot 3.5 + MyBatis-Plus + MySQL 8；前端 Vue 3 + Vite + Element Plus。

仓库以本实现为主线：`backend/`、`frontend/`、`tools/`、`evidence/` 都在根目录；
`docs/` 放项目文档；`candidates/app/` 是第一版 Node 单体，仅作零依赖演示与回退方案
（见 [candidates/README.md](candidates/README.md)）。

| 项 | 当前状态 |
|---|---|
| 需求 | 《软件需求规格说明书 V2.1》（2026-11-05）已定稿：24 个用例、22 条业务规则 |
| 架构 | 《软件架构设计说明书》v1.0 基线草案；ADR-001～006 已接受待补签，Q-01～Q-06 待业务确认 |
| 实现 | S1～S3 主链已可运行（发布 → 审核 → 在售 → 下单 → 评价 → 举报处置 → 私信） |
| 测试 | 后端冒烟 72 项、浏览器 e2e 20 项通过；NFR 与人工项按 `docs/test/` 的记录继续 |

---

## 一、快速开始

### 1. 环境要求

| 组件 | 版本 | 说明 |
|---|---|---|
| JDK | 17+（`pom.xml` 编译目标为 Java 17，已在 JDK 21 上验证） | 需设置 `JAVA_HOME` |
| Maven | 3.9+ | 构建后端 |
| MySQL | 8.0+ | 本项目使用独立实例（3307 端口），不占用系统默认实例 |
| Node.js | 18+ | 构建前端 |

### 2. 数据库

默认连接 `127.0.0.1:3306/campus_trade`（脚本按 3306 → 3307 自动探测），账号 `campus`。
连接参数全部支持环境变量覆盖：`DB_PORT`、`DB_NAME`、`DB_USERNAME`、`DB_PASSWORD`
（示例见 `backend/.env.example`）。**正式部署必须用 `DB_PASSWORD` 注入独立口令**，
`application.yml` 中的默认值只是本机课程演示值。
仓库根目录的 `.mysql/` 是本机 3307 实例的数据目录（不入库），可直接双击 `启动数据库.bat` 使用。

建库语句：

```sql
CREATE DATABASE IF NOT EXISTS campus_trade
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- 口令请自行设置，并用环境变量 DB_PASSWORD 传给后端
CREATE USER IF NOT EXISTS 'campus'@'%' IDENTIFIED BY '<你的口令>';
GRANT ALL PRIVILEGES ON campus_trade.* TO 'campus'@'%';
```

表结构在应用启动时由 `backend/src/main/resources/db/schema.sql` 自动执行（全部 `CREATE TABLE IF NOT EXISTS`，可重复执行），
演示数据由 `seed/DataSeeder` 在库为空时自动灌入。

### 3. 启动后端

```bash
cd backend
mvn spring-boot:run
```

- 服务地址：<http://127.0.0.1:8080>
- 接口文档（Swagger UI）：<http://127.0.0.1:8080/swagger-ui.html>
- OpenAPI JSON：<http://127.0.0.1:8080/v3/api-docs>

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

- 学生端：<http://localhost:5173/>
- 管理端：<http://localhost:5173/#/admin/login>
- 开发代理把 `/api`、`/uploads` 转发到 8080，无需额外配置跨域

### 5. Windows 一键启动

双击根目录的 **`一键启动.bat`**：它会按「数据库 → 后端 → 前端」的顺序拉起，等端口就绪后自动打开浏览器。
也可以分步双击下面几个脚本（都按自身所在目录定位，移动整个文件夹不受影响）：

| 脚本 | 作用 |
|---|---|
| `一键启动.bat` | 依次启动数据库、后端、前端，并打开 <http://localhost:5173/> |
| `启动数据库.bat` | 用 `.mysql/` 启动 MySQL 8（3307），关闭窗口即停止 |
| `启动后端.bat` | 自动查找 JDK 17+，优先用已构建 jar，否则用 Maven（8080） |
| `启动前端.bat` | 首次自动 `npm install`，然后 `npm run dev`（5173） |

脚本**不写死盘符和安装路径**：JDK、Node、MySQL 都会从 `JAVA_HOME`、`PATH`、`Program Files` 等常见位置自动查找；数据库的 `datadir` 也按脚本所在目录动态传入。

**换一台电脑运行**需要三样环境：

- JDK 17+、Node.js 18+；
- MySQL 8（3306 或 3307）：仓库不带 `.mysql/` 数据目录。按上面「2. 数据库」建好库和账号即可，后端首次启动会自动建表并灌演示数据；
- 后端 jar 不在仓库里（`target/` 被忽略）：装 Maven 后执行 `cd backend && mvn package -DskipTests`，或用 IDEA / Eclipse 直接启动。

**常见问题**：

- 提示数据库未运行：先双击 `启动数据库.bat`（3307），或确认自己的 MySQL 监听 3306 / 3307。
- **市场里只有林同学的商品 / 数据像被测试弄乱**：用管理员登录管理端，在「看板」页底部点「重置演示数据」；
  命令行等价做法是先拿管理员令牌再调用（开发工具默认关闭，需后端以 `APP_ENABLE_DEV_TOOLS=true` 启动）：

  ```bash
  TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/auth/admin/login \
    -H 'Content-Type: application/json' \
    -d "{\"adminNo\":\"$ADMIN_NO\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r .data.token)
  curl -X POST http://127.0.0.1:8080/api/dev/reset -H "Authorization: Bearer $TOKEN"
  ```

  重置后是 **5 件在售、来自 3 个卖家**（林 2 件、赵 1 件、低信用 2 件）。
- **改过 Java 源码后行为没变**：`启动后端.bat` 优先运行 `backend/target` 里的 jar；改完源码要
  `cd backend && mvn package -DskipTests` 重新打包，否则跑的还是旧包。
- 8080 / 5173 已被占用：脚本会检测并跳过已在运行的服务；若是其他程序占用，先关掉它。
- `npm install` 慢或失败：改用 `npm.cmd install --registry=https://registry.npmmirror.com`。
- 想改脚本：`.bat` 文件必须保持 **GBK / ANSI 编码**（VS Code 右下角选 `GBK`）。存成 UTF-8 会让 cmd 解析错位，出现 `'[OK]' 不是内部或外部命令` 之类的怪错。

### 6. 演示账号

**口令不入库。** 仓库与代码里不再保存演示口令，口令只在这两处出现：

1. **环境变量**（推荐，也是正式部署的唯一方式）：`APP_SEED_ADMIN_PASSWORD` / `APP_SEED_DEMO_PASSWORD`；
2. **首次启动自动生成**：两者都未配置时，后端在灌入演示数据时随机生成口令，
   写入 `backend/data/seed-credentials.txt`（已在 `.gitignore` 中忽略），日志只打印该文件路径。

账号本身（与口令无关）：

| 角色 | 账号 | 用途 |
|---|---|---|
| 学生·已认证 | `lin@campus.edu` | 卖家视角：2 件在售（教材、iPad）+ 1 件待审 + 1 件已售出 + 1 件已下架 |
| 学生·已认证 | `zhao@campus.edu` | 买家视角：1 件在售（山地车，可验证「不能买自己的商品」）+ 1 笔成交可评价 |
| 学生·待审核 | `ma@campus.edu` | 演示「核验审核中」拦截 |
| 学生·已驳回 | `guo@campus.edu` | 演示「核验未通过，可重提」 |
| 学生·未提交 | `lv@campus.edu` | 演示「请先上传学生证」 |
| 学生·已封禁 | `ban@campus.edu` | 名下 1 件商品已是「已下架（管理员违规下架）」，演示封禁联动结果 |
| 学生·低信用 | `low@campus.edu` | 2 件在售（台灯、电饭煲），信用分 55，演示发布/下单阈值 |
| 管理员 | `ADM-001` | 审核、处置、看板（账号可用 `APP_SEED_ADMIN_NO` 覆盖） |

> **演示买卖**：首页 5 件在售商品来自 **3 位不同卖家**（林同学、赵同学、低信用同学）。
> 用 `zhao` 登录可以买林同学或低信用同学的；想看「不能买自己的」，就用 zhao 买那辆山地车。

> **前端预填（可选）**：`frontend/.env.example` 复制为 `.env.local` 并填 `VITE_DEMO_STUDENT_*` /
> `VITE_DEMO_ADMIN_*` 后，登录页会预填；不配则输入框为空，构建产物里也没有任何口令。

---

## 二、测试

| 套件 | 命令 | 覆盖 | 结果 |
|---|---|---|---|
| 后端冒烟 | `node tools/smoke.mjs` | 认证、商品全生命周期、交易、私信、通知、主页、举报处置、定时任务、封禁联动、权限面 | 72 项通过 |
| 浏览器冒烟 | `node tools/e2e.mjs` | 首页/搜索/详情/登录/收藏/订单/信用分/通知 + 管理端 7 页 + 控制台零报错 | 20 项通过 |
| 性能抽样 | `node tools/bench.mjs` | NFR-01 列表 50 并发、NFR-02 下单时延 | 最大 385ms / 37ms |
| 开发工具收口 | `node tools/verify-dev-hardening.mjs` | 匿名/学生/管理员三种身份访问 `/api/dev/**`，开关开与关两种形态 | 13 项通过（两种形态各一次） |

> 两个冒烟套件都会先调 `/api/dev/reset` 重置数据，可重复执行。由于开发工具默认关闭，
> 跑这些脚本前需**用 `APP_ENABLE_DEV_TOOLS=true` 启动后端**，并且脚本要能读到演示口令：
> 设 `DEMO_STUDENT_PASSWORD` / `DEMO_ADMIN_PASSWORD`，或依赖首次启动生成的
> `backend/data/seed-credentials.txt`（可用 `DEMO_CREDENTIALS_FILE` 指定位置）。
> 详细记录与证据见 [docs/test/验收与测试记录.md](docs/test/验收与测试记录.md) 与 `evidence/`；
> 测试阶段的场景、分工与判据见 [docs/tasks/分工通知/软件测试阶段分工/](docs/tasks/分工通知/软件测试阶段分工/)。
>
> **前置条件**：后端已启动；浏览器冒烟需要本机安装 Edge 或 Chrome（脚本用 `EDGE_PATH` 可指定路径）。

### 接口调试

启动后端后打开 <http://127.0.0.1:8080/swagger-ui.html>，
先调 `/api/auth/login` 拿 `token`，点右上角 **Authorize** 填入即可调试其他接口。

---

## 三、目录结构

```text
Software-Engineering/
├─ README.md                        # 本文件：快速开始 + 测试 + 文档入口
├─ backend/                         # 后端（Spring Boot）
│  ├─ pom.xml
│  └─ src/main/
│     ├─ java/com/campus/trade/
│     │  ├─ common/                 统一响应、错误码、业务异常、全局异常处理
│     │  ├─ config/                 业务参数、安全、跨域、MyBatis-Plus、OpenAPI
│     │  ├─ security/               令牌过滤器、会话服务、@CurrentUser
│     │  ├─ controller/             接口层（只做参数接收与响应包装）
│     │  ├─ service/                业务规则层（用例与规则的唯一落点）
│     │  ├─ mapper/                 数据访问层（MyBatis-Plus）
│     │  ├─ entity/                 实体（17 张表）
│     │  ├─ constant/               取值闭集（状态、原因、事件类型）
│     │  ├─ dto/ vo/                请求体与对外视图（白名单，防隐私泄露）
│     │  ├─ audit/                  审计日志
│     │  └─ seed/                   演示数据
│     └─ resources/
│        ├─ application.yml         全部业务参数集中配置
│        └─ db/schema.sql           建表 DDL + CHECK 约束 + 生成列唯一索引
├─ frontend/                        # 前端（Vue 3）
│  ├─ vite.config.js
│  └─ src/
│     ├─ api/                       axios 封装与接口定义
│     ├─ router/                    路由与守卫
│     ├─ stores/                    Pinia 状态（登录态、红点）
│     ├─ layouts/                   学生端 / 管理端布局
│     ├─ components/                通用组件（商品卡、状态标签）
│     ├─ views/student/             学生端页面
│     └─ views/admin/               管理端页面
├─ tools/                           smoke.mjs（72 项）/ e2e.mjs（20 项）/ bench.mjs / gen-api-inventory.py
├─ evidence/                        测试与验收证据（命名与清单见该目录 README）
├─ tasks/                           任务卡-TASK-01~06.md
├─ docs/                            项目文档（需求、架构、设计、测试、报告、课程材料）
├─ candidates/app/                  第一版 Node 单体（零依赖演示与回退，见其 README）
├─ .mysql/                          本机 MySQL 3307 数据目录（不入库）
├─ 一键启动.bat / 启动数据库.bat / 启动后端.bat / 启动前端.bat
└─ .gitignore
```

**分层约定**：`controller → service → mapper`，实体不直接暴露给前端（统一经 `vo` 整形）；
鉴权只有一个入口（`PermissionService`），所有业务规则集中在 service 层。

---

## 四、技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Spring Boot 3.5.6 | 生态成熟、自动装配、内嵌 Tomcat |
| 持久层 | MyBatis-Plus 3.5.9 | 条件构造器 + 分页插件，SQL 可控 |
| 数据库 | MySQL 8.0 | CHECK 约束、生成列唯一索引（模拟部分唯一索引） |
| 认证 | 不透明令牌 + 会话表 | 相比 JWT 更容易满足「重置密码后所有会话立即失效」（NFR-10 ⑥） |
| 密码 | BCrypt | 只存不可逆哈希 |
| 接口文档 | SpringDoc OpenAPI | Swagger UI 可直接调试 |
| 前端框架 | Vue 3 + Vite | 组合式 API、秒级热更新 |
| UI | Element Plus | 组件齐全，符合后台/表单场景 |
| 状态管理 | Pinia | 登录态与红点 |
| HTTP | Axios | 统一拦截器处理令牌与错误提示 |

---

## 五、功能范围（对齐 SRS V2.1）

| 用例 | 实现位置 |
|---|---|
| UC-01 注册与登录 / UC-04 管理员登录 / UC-34 找回密码 | `AuthService`、`AuthController` |
| UC-02 提交核验 / UC-03 审核学生证 | `VerificationService`、`AdminVerificationController` |
| UC-05 发布 / UC-07 搜索 / UC-08 分类 / UC-11 下架删除 / UC-17 我的商品 / UC-32 编辑 | `ProductService`、`ProductController` |
| UC-06 审核商品 | `ProductService.approve/reject`、`AdminProductController` |
| UC-09 收藏 | `FavoriteService` |
| UC-10 下单成交 / UC-16 我的订单 / UC-31 撤销与免责判定 | `OrderService`、`OrderController` |
| UC-14 评价 | `ReviewService` |
| UC-12 举报 / UC-13 处置 | `ReportService`、`AdminController` |
| UC-15 信用分 | `CreditService`、`CreditController` |
| UC-18 消息通知 | `NotificationService`、`SocialController` |
| UC-29 联系卖家 / UC-30 我的私信 | `MessageService` |
| UC-33 查看个人主页 | `ProfileService` |

完整的「用例 / 规则 / 状态转换 / 非功能需求 → 代码」映射见
[docs/requirements/需求覆盖矩阵.md](docs/requirements/需求覆盖矩阵.md)。

---

## 六、演示工具（答辩用）

管理端「看板」页底部提供演示按钮，也可直接调接口。

**两道闸门**（缺一不可）：

1. `app.features.enable-dev-tools` 必须为 `true`（环境变量 `APP_ENABLE_DEV_TOOLS=true`）——**默认是 `false`**；
2. 调用方必须是管理员身份。

开关关闭时整组接口返回 403，看板上的演示面板会自动隐藏。

| 接口 | 作用 |
|---|---|
| `POST /api/dev/reset` | 重置演示数据（回到种子状态） |
| `POST /api/dev/time-shift {hours}` | 服务端时间偏移，验证「7 天 / 24 小时」判定 |
| `POST /api/dev/time-reset` | 时间归零 |
| `POST /api/dev/scheduler/run` | 立即执行一轮定时判定 |
| `GET /api/dev/mailbox` | 开发邮箱（查看验证码） |

> 答辩时启动后端前设 `APP_ENABLE_DEV_TOOLS=true`；`GET /api/dev/state` 也已纳入同一闸门
> （曾经匿名可达并暴露各表条数）。
>
> 正式部署请保持 `APP_ENABLE_DEV_TOOLS=false`，并用 `APP_ENV=prod` 启动：启动校验会拒绝
> 「开发工具仍开着」「演示数据仍在灌」「口令还是演示值」这几种组合。
> 注意：业务会话有效期使用**真实时钟**，时间偏移不会把用户踢下线。

---

## 七、已知取舍

1. **订单没有状态机**：平台不涉及资金与交付，只保留「成交状态」与「撤销免责判定」两个标记（SRS §7.1）。
2. **「卖家主动下架」不可直接重新上架**：按 ST-08 的封闭集实现（仅 `审核不通过` / `卖家撤回` 可重提），
   与 UC-17 的笼统表述存在需求内部矛盾，已在 [docs/requirements/需求覆盖矩阵.md](docs/requirements/需求覆盖矩阵.md) 记录。
3. **举报成立即扣 −10**：按 BR-14 ② 的字面口径实现（不依赖管理员是否勾选「扣信用分」）。
4. **管理员初始密码不强制修改**：课程演示默认 `APP_SEED_ADMIN_MUST_CHANGE=false`；正式部署应设为 `true`
   （对齐 SRS UC-04 主事件流第 4 步「首登或重置后强制修改初始密码」）。
5. **演示工具默认关闭**：`enable-dev-tools=false`，且 `/api/dev/**` 全部要求管理员身份；
   `GET /api/dev/state` 已与其它开发接口一样受开关与角色双重保护。
6. **口令不入库**：演示口令由环境变量注入或首次启动随机生成（写入 `backend/data/seed-credentials.txt`，
   已被 `.gitignore` 忽略）；`application.yml` 中的数据库默认口令只用于本机课程演示，
   `APP_ENV=prod` 时会因「使用公开演示口令」被启动校验拒绝。

---

## 八、文档入口

| 想了解 | 直接打开 |
|---|---|
| 文档总索引 | [docs/README.md](docs/README.md) |
| 需求到底定了什么 | [docs/requirements/SRS.md](docs/requirements/SRS.md) |
| 现在能不能开工、卡在哪 | [docs/基线索引.md](docs/基线索引.md) |
| 技术选型与架构决策 | [docs/architecture/架构确认与决策记录.md](docs/architecture/架构确认与决策记录.md) |
| 接口契约与数据模型 | [docs/design/接口与关键设计说明书.md](docs/design/接口与关键设计说明书.md) |
| 分阶段实现与测试计划 | [docs/tasks/分阶段实现与测试计划.md](docs/tasks/分阶段实现与测试计划.md) |
| 测试记录与证据 | [docs/test/验收与测试记录.md](docs/test/验收与测试记录.md) |
| 需求阶段怎么验的 | [docs/reports/A报告/需求分析质量验证报告.md](docs/reports/A报告/需求分析质量验证报告.md) |
| AI 用在哪、怎么核验 | [docs/reports/B报告/AI 智能体使用验证报告.md](<docs/reports/B报告/AI 智能体使用验证报告.md>) |

---

## 九、写作与提交约定

- 文档用 Markdown 为主格式，图件保留 `.drawio` 可编辑源文件与导出的 `.png`/`.svg`。
- **只保留当前有效版本**：版本号写在文件头，旧版不留在目录里，用 `git log` / `git show` 回溯。
- 需求基线以 [docs/requirements/SRS.md](docs/requirements/SRS.md) 为准；改动走新提交，不覆盖历史。
- 默认值、建议值、待确认项在正文中显式标注，**AI 生成的内容不作为确认依据**。
- 本地数据库、`node_modules`、构建产物与压缩包不入库，见 [.gitignore](.gitignore)。
