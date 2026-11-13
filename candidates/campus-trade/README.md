# 拾光二手 · 校园二手交易平台（Spring Boot + Vue 重写版）

> 依据《软件需求规格说明书 V2.1》实现的前后端分离系统。
> 后端 Spring Boot 3.5 + MyBatis-Plus + MySQL 8；前端 Vue 3 + Vite + Element Plus。

---

## 一、快速开始

### 1. 环境要求

| 组件 | 版本 | 说明 |
|---|---|---|
| JDK | 17+（本项目在 24 上验证） | 需设置 `JAVA_HOME` |
| Maven | 3.9+ | 构建后端 |
| MySQL | 8.0+ | 本项目使用独立实例（3307 端口），不占用系统默认实例 |
| Node.js | 18+ | 构建前端 |

### 2. 数据库

默认连接 `127.0.0.1:3307/campus_trade`，账号 `campus / Campus@2026`。
如使用自己的 MySQL，改 `backend/src/main/resources/application.yml` 中的 `spring.datasource` 即可。

建库语句：

```sql
CREATE DATABASE IF NOT EXISTS campus_trade
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'campus'@'%' IDENTIFIED BY 'Campus@2026';
GRANT ALL PRIVILEGES ON campus_trade.* TO 'campus'@'%';
```

表结构在应用启动时由 `src/main/resources/db/schema.sql` 自动执行（全部 `CREATE TABLE IF NOT EXISTS`，可重复执行），
演示数据由 `seed/DataSeeder` 在库为空时自动灌入。

### 3. 启动后端

```bash
cd backend
mvn spring-boot:run
```

- 服务地址：<http://127.0.0.1:8080>
- 接口文档（Swagger UI）：<http://127.0.0.1:8080/swagger-ui.html>
- OpenAPI JSON：<http://127.0.0.1:8080/v3/api-docs>

Windows 可直接双击 `启动后端.bat`。

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

- 学生端：<http://localhost:5173/>
- 管理端：<http://localhost:5173/#/admin/login>
- 开发代理把 `/api`、`/uploads` 转发到 8080，无需额外配置跨域

Windows 可直接双击 `启动前端.bat`。

### 5. 演示账号

| 角色 | 账号 | 密码 | 用途 |
|---|---|---|---|
| 学生·已认证 | `lin@campus.edu` | `Test@12345` | 卖家视角：2 件在售（教材、iPad）+ 1 件待审 + 1 件已售出 + 1 件已下架 |
| 学生·已认证 | `zhao@campus.edu` | `Test@12345` | 买家视角：1 件在售（山地车，可验证「不能买自己的商品」）+ 1 笔成交可评价 |
| 学生·待审核 | `ma@campus.edu` | `Test@12345` | 演示「核验审核中」拦截 |
| 学生·已驳回 | `guo@campus.edu` | `Test@12345` | 演示「核验未通过，可重提」 |
| 学生·未提交 | `lv@campus.edu` | `Test@12345` | 演示「请先上传学生证」 |
| 学生·已封禁 | `ban@campus.edu` | `Test@12345` | 名下 1 件商品已是「已下架（管理员违规下架）」，演示封禁联动结果 |
| 学生·低信用 | `low@campus.edu` | `Test@12345` | 2 件在售（台灯、电饭煲），信用分 55，演示发布/下单阈值 |
| 管理员 | `ADM-001` | `Admin@12345` | 审核、处置、看板 |

> **演示买卖**：首页 5 件在售商品来自 **3 位不同卖家**（林同学、赵同学、低信用同学）。
> 用 `zhao` 登录可以买林同学或低信用同学的；想看「不能买自己的」，就用 zhao 买那辆山地车。

---

## 二、目录结构

```
campus-trade/
├─ backend/                          # 后端（Spring Boot）
│  ├─ pom.xml
│  └─ src/main/
│     ├─ java/com/campus/trade/
│     │  ├─ common/       统一响应、错误码、业务异常、全局异常处理
│     │  ├─ config/       业务参数、安全、跨域、MyBatis-Plus、OpenAPI
│     │  ├─ security/     令牌过滤器、会话服务、@CurrentUser
│     │  ├─ controller/   接口层（只做参数接收与响应包装）
│     │  ├─ service/      业务规则层（用例与规则的唯一落点）
│     │  ├─ mapper/       数据访问层（MyBatis-Plus）
│     │  ├─ entity/       实体（17 张表）
│     │  ├─ constant/     取值闭集（状态、原因、事件类型）
│     │  ├─ dto/ vo/      请求体与对外视图（白名单，防隐私泄露）
│     │  ├─ audit/        审计日志
│     │  └─ seed/         演示数据
│     └─ resources/
│        ├─ application.yml            全部业务参数集中配置
│        └─ db/schema.sql              建表 DDL + CHECK 约束 + 生成列唯一索引
├─ frontend/                         # 前端（Vue 3）
│  ├─ vite.config.js
│  └─ src/
│     ├─ api/             axios 封装与接口定义
│     ├─ router/          路由与守卫
│     ├─ stores/          Pinia 状态（登录态、红点）
│     ├─ layouts/         学生端 / 管理端布局
│     ├─ components/      通用组件（商品卡、状态标签）
│     ├─ views/student/   学生端页面
│     └─ views/admin/     管理端页面
├─ tools/smoke.mjs         后端冒烟测试（72 项）
└─ docs/                   需求覆盖矩阵、数据库设计说明
```

**分层约定**：`controller → service → mapper`，实体不直接暴露给前端（统一经 `vo` 整形）；
鉴权只有一个入口（`PermissionService`），所有业务规则集中在 service 层。

---

## 三、技术选型

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

## 四、功能范围（对齐 SRS V2.1）

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

完整的「用例 / 规则 / 状态转换 / 非功能需求 → 代码」映射见 `docs/需求覆盖矩阵.md`。

---

## 五、测试

| 套件 | 命令 | 覆盖 | 结果 |
|---|---|---|---|
| 后端冒烟 | `node tools/smoke.mjs` | 认证、商品全生命周期、交易、私信、通知、主页、举报处置、定时任务、封禁联动、权限面 | 72 项通过 |
| 浏览器冒烟 | `node tools/e2e.mjs` | 首页/搜索/详情/登录/收藏/订单/信用分/通知 + 管理端 7 页 + 控制台零报错 | 20 项通过 |
| 性能抽样 | `node tools/bench.mjs` | NFR-01 列表 50 并发、NFR-02 下单时延 | 最大 385ms / 37ms |

> 两个冒烟套件都会先调 `/api/dev/reset` 重置数据，可重复执行。
> 详细记录见 `docs/验收与测试记录.md`。

**前置条件**：后端已启动；浏览器冒烟需要本机安装 Edge 或 Chrome（脚本用 `EDGE_PATH` 可指定路径）。

### 接口调试

启动后端后打开 <http://127.0.0.1:8080/swagger-ui.html>，
先调 `/api/auth/login` 拿 `token`，点右上角 **Authorize** 填入即可调试其他接口。

---

## 六、演示工具（答辩用）

管理端「看板」页底部提供演示按钮，也可直接调接口：

| 接口 | 作用 |
|---|---|
| `POST /api/dev/reset` | 重置演示数据（回到种子状态） |
| `POST /api/dev/time-shift {hours}` | 服务端时间偏移，验证「7 天 / 24 小时」判定 |
| `POST /api/dev/time-reset` | 时间归零 |
| `POST /api/dev/scheduler/run` | 立即执行一轮定时判定 |
| `GET /api/dev/mailbox` | 开发邮箱（查看验证码） |

> 生产部署把 `application.yml` 的 `app.features.enable-dev-tools` 置为 `false` 即可整体关闭。
> 注意：业务会话有效期使用**真实时钟**，时间偏移不会把用户踢下线。

---

## 七、已知取舍

1. **订单没有状态机**：平台不涉及资金与交付，只保留「成交状态」与「撤销免责判定」两个标记（SRS §7.1）。
2. **「卖家主动下架」不可直接重新上架**：按 ST-08 的封闭集实现（仅 `审核不通过` / `卖家撤回` 可重提），
   与 UC-17 的笼统表述存在需求内部矛盾，已在 `docs/需求覆盖矩阵.md` 记录。
3. **举报成立即扣 −10**：按 BR-14 ② 的字面口径实现（不依赖管理员是否勾选「扣信用分」）。
4. **管理员初始密码不强制修改**：为演示便利，`DataSeeder` 中 `must_change_password=0`；正式部署应置 1。
