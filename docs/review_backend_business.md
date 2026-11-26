# 后端 Controller 与 Service 逐文件质量复核

复核范围：`backend/src/main/java/com/campus/trade/controller` 和 `backend/src/main/java/com/campus/trade/service`，共 31 个 Java 文件。复核方式：逐文件阅读结构、方法、输入校验、权限调用、事务边界、异常处理、数据库访问和输出封装；行号以 2026-11-25 工作区为准。

等级含义：A=质量良好；B=基本良好但有改进项；C=存在应整改问题；D=高风险或无法接受。

## 一、Controller 文件

| 文件 | 职责与优点 | 逐文件问题（行号） | 等级 | 建议 |
|---|---|---|---|---|
| `AdminController.java` | 管理员看板、学生、举报、评价、消息、审计和元数据入口；统一 `ApiResponse`，使用 `@Valid` 和 `@CurrentUser`。 | 管理端职责较多；`audit` 的 `limit` 未在控制器层限制；`meta` 含多处字符串常量。 | B | 将管理端资源拆分；限制 limit 范围；元数据统一使用枚举/常量。 |
| `AdminProductController.java` | 商品审核、驳回、强制下架、恢复接口；接口短小，权限交给 Service。 | 驳回和强制下架的错误信息依赖业务层，控制器缺少接口参数说明。 | A- | 补齐 OpenAPI 参数说明和错误响应文档。 |
| `AdminVerificationController.java` | 学生证审核和图片读取入口；使用 `ResponseEntity<byte[]>` 返回文件。 | `image` 是敏感认证材料读取接口，应明确缓存策略和内容类型白名单。 | B | 禁止缓存认证图片，校验路径/资源归属并记录访问审计。 |
| `AuthController.java` | 注册、登录、退出、找回密码、当前用户和改密接口；令牌提取集中处理。 | `clientIp`/Cookie 处理需防代理伪造；Cookie 安全属性应由配置控制；登录接口需限流。 | B | 增加 SameSite、Secure、HttpOnly 配置和登录/验证码限流。 |
| `CreditController.java` | 当前用户、指定学生和管理员信用查询；接口层很薄。 | `ofStudent` 的可见范围完全依赖 Service，需确保普通用户不能越权查看敏感记录。 | B | 增加权限测试并在接口文档声明可见字段。 |
| `DevController.java` | 开发重置、时间偏移、邮箱、调度入口；统一 `assertEnabled`。 | `shift` 使用 `Map<String,Object>`，输入弱类型；`mailbox` 的 limit 需上下界；开发端点误开会产生破坏性操作。 | C | 使用 DTO；所有端点统一校验开关、管理员权限和审计；生产默认关闭。 |
| `FavoriteController.java` | 收藏增删查接口，代码短小。 | `add` 使用 `Map<String,Long>`，缺少 `@Valid` 和空值/类型语义；错误输入依赖运行时转换。 | B | 定义 `FavoriteRequest` DTO，加入 Bean Validation。 |
| `OrderController.java` | 订单详情、我的订单、评价相关入口；职责清晰。 | `myOrders` 的 role 参数若来自查询参数，需要限制枚举值；订单状态操作的权限需由 Service 保证。 | B | 使用 `OrderRole` 枚举或 DTO，并增加非法 role 测试。 |
| `ProductController.java` | 商品列表、详情、发布、撤回、下架、删除、我的商品；统一调用 ProductService。 | `list` 使用 `Map<String,String>` 接收查询条件，容易接受未声明参数；缺少分页上限约束。 | B- | 使用查询 DTO；对 page/pageSize、排序和筛选值做白名单校验。 |
| `ReportController.java` | 用户举报入口，代码短小。 | 仅有我的举报接口，提交入口位于 SocialController，接口职责分散。 | B | 将举报资源集中到本 Controller，统一文档和权限说明。 |
| `SocialController.java` | 私信、通知红点、个人主页入口；统一当前用户参数。 | `conversations` 等列表接口分页边界需要校验；消息内容约束在 Service，接口层缺少长度说明。 | B | 引入分页 DTO，限制 page/size，补充消息长度和频率限制。 |
| `VerificationController.java` | 当前学生认证状态入口，简单清晰。 | 功能单一但与 AdminVerificationController 的资源命名需要统一说明。 | A- | 保持现状，补充认证状态枚举的 OpenAPI 文档。 |

## 二、Service 文件

| 文件 | 职责与优点 | 逐文件问题（行号/范围） | 等级 | 建议 |
|---|---|---|---|---|
| `AdminService.java` | 管理看板、学生查询、学生详情、信用调整、审计和强制下架列表；业务集中。 | `students`/`studentDetail` 等组装过程中存在多次关联查询，可能形成 N+1；类承担多个管理领域。 | B- | 批量查询关联数据；按 Dashboard、StudentAdmin、AuditQuery 拆分。 |
| `AuthService.java` | 注册、登录、会话、找回密码、改密、登录失败计数和角色计算；事务边界较完整。 | 文件约 364 行、职责多；登录失败/验证码/密码修改规则集中在一个类，后续修改风险较高。 | B | 拆出 LoginPolicy、PasswordResetService；增加锁定、并发登录和令牌失效测试。 |
| `BanService.java` | 封禁学生及关联商品的联动操作；事务标注。 | 封禁操作涉及多表更新，需确认所有更新均检查影响行数并写审计。 | B | 补充失败回滚和重复封禁测试。 |
| `CreditService.java` | 信用分变更、幂等 sourceKey 和汇总查询；有重复扣分保护。 | 信用分边界、负数和并发更新需依赖数据库/事务验证。 | B | 使用原子更新或乐观锁；增加边界与并发测试。 |
| `DevService.java` | 演示数据重置、时间偏移、状态和邮箱查询；开发功能集中。 | 破坏性重置/时间修改功能必须严格隔离生产；`setting` 暴露配置读取。 | C | profile 隔离、管理员权限、审计和默认关闭。 |
| `EmailCodeService.java` | 验证码签名、频率控制、验证和消费；有摘要存储思路。 | `catch (Exception e)`（约 113 行）过宽；验证码发送、重试和消费并发需进一步保护。 | C | 捕获明确异常、记录上下文；使用唯一约束/原子消费并补充限流测试。 |
| `FavoriteService.java` | 收藏新增、删除、列表；事务边界明确。 | 新增时重复收藏和并发竞争需依赖唯一约束；列表关联商品可能产生多次查询。 | B | 增加数据库唯一索引和幂等测试，批量加载商品。 |
| `MailService.java` | 开发邮箱写入和最近记录读取，便于测试。 | `catch (Exception e)`；文件写入路径和 limit 输入需约束；不应作为生产邮件实现。 | C | 限制路径、大小和记录数；开发 profile 隔离；生产使用正式邮件适配器。 |
| `MessageService.java` | 私信、管理员回复、申诉、会话、未读数和内容校验；业务规则较完整。 | 约 396 行，职责和视图组装较多；会话列表/详情中存在关联查询循环风险。 | B- | 拆 ConversationQuery、MessageCommand；批量查询参与者和未读数据。 |
| `NotificationService.java` | 通知写入、列表、已读、全部已读和未读数；接口集中。 | 列表分页参数需上限；通知关联数据和用户查询可能重复。 | B | 引入统一分页参数校验，批量加载关联对象。 |
| `OrderService.java` | 下单、订单列表、详情、取消、撤销判定；关键写操作使用 `@Transactional`。 | 约 385 行；下单涉及商品和订单双写，虽检查更新行数但仍需数据库并发验证；视图组装有多次查询。 | B | 增加条件更新/唯一约束和并发测试；拆 OrderCommand/OrderQuery。 |
| `PermissionService.java` | 当前用户、认证、封禁、发布/下单权限集中处理。 | 权限方法依赖调用方正确使用，缺少统一注解式保护；规则变化可能扩散到 Service。 | B | 增加权限矩阵测试，考虑统一授权策略。 |
| `ProductService.java` | 商品发布、编辑、撤回、审核、下架、恢复、分页和图片处理；事务覆盖较多。 | 约 669 行、30 个方法；`parsePrice` 等输入解析、图片保存、通知和状态变更混在一起；约 656 行存在 `catch (Exception e)`；列表和 VO 组装有查询循环风险。 | C | 拆 ProductCommand、ProductQuery、ProductImageService、ProductAuditService；缩小异常范围；补并发和图片安全测试。 |
| `ProfileService.java` | 个人主页查询，职责单一。 | 查询结果可见字段完全依赖 VO 组装，需防止隐私字段泄露。 | A- | 保留白名单 VO，并增加未登录/他人主页字段测试。 |
| `ReportService.java` | 举报提交、我的举报、管理员列表和处置；处置流程有事务。 | 约 294 行，举报、信用扣分、通知和审计耦合；状态转换需防重复处置。 | B- | 使用状态条件更新保证幂等；拆 ReportCommand/ReportQuery。 |
| `ReviewService.java` | 评价提交、公开评价、我的评价、管理员删除和统计；有内容校验。 | 评价提交需保证订单归属、完成状态和一单一评的并发一致性；统计查询可能重复访问。 | B | 增加唯一约束和并发测试，明确删除后统计规则。 |
| `SchedulerService.java` | 认证、商品、举报、评价、取消判定和提醒等定时任务集中。 | 约 273 行；`catch (Exception e)` 可能导致单个任务失败被吞；任务重复执行和多实例并发需防护；循环内查询风险。 | C | 每个任务独立错误边界与结构化日志；增加分布式锁/幂等键；拆分任务类。 |
| `StorageService.java` | Data URL/字节保存、认证文件读取和内容类型判断。 | 文件输入是安全边界；扩展名、大小、MIME 和路径穿越必须严格限制。 | B- | 使用白名单扩展名和真实文件头检测；限制大小；禁止路径穿越并隔离上传目录。 |
| `VerificationService.java` | 学生认证提交、查询、图片读取、审核、驳回和撤销；写操作有事务。 | 图片读取涉及敏感数据；审核状态转换和重复审核需条件更新；文件路径处理需与 StorageService 统一。 | B- | 增加访问审计、缓存禁止、状态幂等和文件安全测试。 |

## 三、总体结论

1. 31 个文件均完成逐文件结构复核；Controller 整体较薄，主要问题是弱类型请求体、分页边界和接口职责分散。
2. Service 层主要风险集中在 `ProductService`、`MessageService`、`OrderService`、`AuthService` 和 `SchedulerService` 的职责过多与查询复杂度。
3. 明确的高优先级问题是：生产配置隔离、开发接口关闭、宽泛异常捕获、文件上传安全、并发幂等和分页输入边界。
4. 本复核没有修改源代码；结论是静态代码审查结果，未把未执行的并发、渗透和生产部署测试写成已通过。
