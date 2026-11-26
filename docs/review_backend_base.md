# 后端基础代码逐文件质量审查

审查范围：`backend/src/main/java` 下 common、config、constant、entity、mapper、security、audit、util、seed，以及 `backend/src/main/resources`。每个文件均按职责、可读性、可靠性、安全性、维护性和明显缺陷进行检查。结论分为：A（质量良好）、B（基本良好，建议改进）、C（存在交付前问题）。

## 一、common

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `common/ApiResponse.java` | A | 统一响应结构，字段不可变，泛型设计清晰；成功/失败工厂方法完整。建议为错误响应补充traceId以支持线上排障。 |
| `common/BizException.java` | A | 业务异常携带ErrorCode，并提供语义化工厂方法；职责单一。建议避免继续增加过多静态快捷方法。 |
| `common/ErrorCode.java` | A | 错误码、HTTP状态和用户提示集中管理，避免魔法数字。需确认错误码与前端文案的版本同步。 |
| `common/GlobalExceptionHandler.java` | B | 覆盖业务异常、参数错误、唯一约束和未知异常，日志处理较完整。第78行的`Exception.class`兜底是必要防线，但应避免把底层异常细节写入响应；第35行审计写入失败时需保证不能反向阻断错误响应。 |
| `common/PageResult.java` | A | 分页结果封装和映射函数清晰；使用不可变结果字段。建议对page/pageSize做非负校验。 |

## 二、config

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `config/AppProperties.java` | B | 业务参数集中、分组清晰，便于调整。第114行`enableDevTools=true`不应作为生产默认值；字段缺少`@Validated`及范围校验，负数或极大值可能被配置注入。 |
| `config/MybatisPlusConfig.java` | A | 分页插件和最大分页限制明确，防止无限制查询。建议增加配置层测试，确认分页上限在所有接口生效。 |
| `config/OpenApiConfig.java` | B | OpenAPI标题、版本、Bearer认证说明完整。第25行全局添加安全要求可能让公开接口文档显示为需认证，建议对公开接口显式标注。 |
| `config/SecurityConfig.java` | C | 无状态会话、BCrypt、CORS和统一错误响应设计正确；第42行把`/api/dev/**`整体permitAll，开发接口安全依赖业务开关，生产必须关闭；第42行Swagger和上传目录公开，需确认上传文件类型、路径穿越和敏感文件暴露；CSRF关闭适用于Bearer方案，但若改Cookie认证必须重新开启或使用CSRF令牌。 |
| `config/WebConfig.java` | B | 静态上传映射和当前用户参数解析职责明确。需要限制上传目录、响应头和缓存策略，避免把任意本地文件作为资源暴露。 |

## 三、constant

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `constant/AccountStatus.java` | A | 账号状态闭集，命名明确。 |
| `constant/CancelJudgement.java` | A | 撤销判定闭集，避免字符串散落。 |
| `constant/CertStatus.java` | A | 认证状态闭集，和数据库CHECK约束配合良好。 |
| `constant/CodePurpose.java` | A | 验证码用途闭集，职责单一。 |
| `constant/CreditEvent.java` | A | 信用事件类型集中定义。 |
| `constant/ForbiddenCategories.java` | B | 禁止分类常量集中，但集合若可变会有误修改风险；建议暴露不可变集合并增加测试。 |
| `constant/ItemCondition.java` | A | 商品成色闭集，和数据库约束一致。 |
| `constant/NotifyType.java` | A | 通知类型集中定义。 |
| `constant/OffShelfReason.java` | A | 下架原因闭集，状态语义清楚。 |
| `constant/OrderStatus.java` | A | 订单状态闭集，当前设计简单明确。 |
| `constant/ProductStatus.java` | A | 商品状态闭集，和schema约束一致。 |
| `constant/ReportStatus.java` | A | 举报处理状态集中。 |
| `constant/ReportTarget.java` | A | 举报对象类型集中。 |
| `constant/ReportType.java` | A | 举报类型闭集；需持续同步schema中的取值约束。 |
| `constant/SubjectType.java` | A | 主体类型集中，安全边界更易复用。 |

## 四、entity

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `entity/Admin.java` | A | 管理员持久化字段与schema对应，密码字段命名为hash。建议禁止实体直接序列化到前端。 |
| `entity/AuditLog.java` | A | 审计字段完整，支持主体、动作、结果和目标追踪。 |
| `entity/Category.java` | A | 分类实体简单清晰。 |
| `entity/CertificationApplication.java` | A | 认证申请状态和审核字段齐全。 |
| `entity/ChatMessage.java` | A | 消息双方、商品绑定、阅读状态字段明确。 |
| `entity/CreditRecord.java` | A | 信用变更和幂等源键字段清楚。 |
| `entity/EmailCode.java` | A | 只保存验证码hash的模型设计合理。 |
| `entity/Favorite.java` | A | 收藏关系实体简单，唯一约束由schema保证。 |
| `entity/LoginSession.java` | A | tokenHash、过期和撤销字段完整，符合不透明令牌方案。 |
| `entity/Notification.java` | A | 通知关联字段可支持多种业务来源。 |
| `entity/Product.java` | A | 商品状态、审核、删除和时间字段完整。 |
| `entity/ProductImage.java` | A | 图片序号和路径字段明确。 |
| `entity/Report.java` | A | 举报对象、处理结果和管理员字段齐全。 |
| `entity/Review.java` | A | 评价对象和删除审计字段清晰。 |
| `entity/Setting.java` | A | 键值设置实体简单。 |
| `entity/Student.java` | A | 学生、认证、信用和锁定字段覆盖业务需求。建议敏感字段只在服务层使用。 |
| `entity/TradeOrder.java` | B | 订单字段较多但与撤销判定对应；实体本身没有状态机行为，状态约束依赖service/schema，需测试覆盖。 |

## 五、mapper

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `mapper/AdminMapper.java` | A | MyBatis-Plus基础Mapper，职责单一。 |
| `mapper/AuditLogMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/CategoryMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/CertificationApplicationMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/ChatMessageMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/CreditRecordMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/EmailCodeMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/FavoriteMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/LoginSessionMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/NotificationMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/ProductImageMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/ProductMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/ReportMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/ReviewMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/SettingMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/StudentMapper.java` | A | 基础Mapper，职责单一。 |
| `mapper/TradeOrderMapper.java` | A | 基础Mapper，职责单一。 |

## 六、security、audit、util、seed

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `security/AuthUser.java` | A | 认证主体字段少而明确，避免把实体直接放进SecurityContext。 |
| `security/CurrentUser.java` | A | 参数注解简单清晰。 |
| `security/CurrentUserArgumentResolver.java` | A | 将SecurityContext主体转换为业务参数，职责明确；匿名访问行为需接口测试覆盖。 |
| `security/TokenAuthenticationFilter.java` | B | 从Bearer头解析令牌并放入SecurityContext，职责正确。需确认非法token、过期token和日志中不会输出原token。 |
| `security/TokenService.java` | A | 令牌只保存SHA-256摘要，并支持创建、解析、撤销和过期；第98行将算法缺失转为IllegalStateException是合理的启动失败策略。建议补充令牌重放和并发撤销测试。 |
| `audit/AuditService.java` | B | 统一记录允许/拒绝操作，便于追责；第42行宽泛异常捕获可能掩盖审计写入失败，建议记录完整上下文并增加告警指标。 |
| `util/ContentFilter.java` | B | 手机号、微信、QQ、URL和广告关键词规则清晰；正则属于启发式过滤，可能误报/漏报，建议维护测试样例并限制文本长度。 |
| `util/TimeProvider.java` | B | 统一业务时间源和持久化偏移，便于演示时间规则；第36行宽泛捕获，第19行直接依赖SettingMapper使工具层耦合数据库，建议抽象Clock/TimeOffsetStore。 |
| `seed/DataSeeder.java` | C | 演示数据初始化完整且事务化；第62行和第80行固定演示密码，第231行宽泛捕获，第32行使用`@Component`使种子逻辑默认加载。必须通过profile或显式开关隔离生产，并强制管理员改密。文件274行且同时负责大量实体装配，建议拆分fixture构造器。 |

## 七、resources

| 文件 | 结论 | 逐文件意见 |
|---|---|---|
| `backend/src/main/resources/application.yml` | C | 参数集中、注释完整；数据库密码明文（第17行）、开发工具默认开启（第114行）、本地上传目录和演示邮箱均为开发配置，生产必须外置并分环境管理。 |
| `backend/src/main/resources/db/schema.sql` | B | 表、索引、CHECK约束、生成列唯一索引设计较完整，金额使用分避免浮点误差。需补充外键或在服务层明确引用完整性；schema中固定长度和状态字符串必须与Java常量、DTO校验保持自动化一致。 |

## 八、总体结论

- 基础层大部分文件职责单一、命名规范、可读性良好；constant/entity/mapper基本达到A级。
- 交付前重点整改：`SecurityConfig.java`、`AppProperties.java`、`DataSeeder.java`、`TimeProvider.java`、`AuditService.java`、`application.yml`。
- 本批共检查 5 个 common、5 个 config、15 个 constant、17 个 entity、17 个 mapper、5 个 security、1 个 audit、2 个 util、1 个 seed 和 2 个 resources 文件，共 **70 个文件**。
