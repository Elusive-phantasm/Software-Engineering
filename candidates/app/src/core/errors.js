/**
 * 业务错误与统一拒绝提示语。
 * 文案严格取自需求文档 §5.2「拒绝提示语」与 §5.5「权限控制业务规则」，
 * 走查时可直接对照，不做自由发挥。
 */

export const M = {
  // 登录与账号
  LOGIN_REQUIRED: '请先登录',
  LOGIN_FAILED: '邮箱或密码不正确',
  ADMIN_LOGIN_FAILED: '账号或密码不正确',
  ACCOUNT_LOCKED: '账号已暂时锁定，请稍后重试',
  ACCOUNT_BANNED: '账号已封禁，不可发布与下单',
  ACCOUNT_BANNED_LOGIN: '账号不可用',
  ADMIN_ONLY: '仅管理员可登录后台',
  EMAIL_TAKEN: '该邮箱已注册',
  EMAIL_INVALID: '邮箱格式不正确',
  REAL_NAME_REQUIRED: '请填写真实姓名',
  PASSWORD_WEAK: '密码强度不足：至少 8 位，且须同时包含字母与数字',
  CODE_INVALID: '验证码错误或已失效，请重新获取',
  CODE_TOO_FREQUENT: '验证码请求过于频繁，请 60 秒后再试',
  CODE_DAILY_LIMIT: '该邮箱 24 小时内获取验证码次数已达上限',
  MAIL_FAILED: '验证码发送失败，请稍后重试或更换邮箱',
  FORGOT_SENT: '若该邮箱已注册，验证码已发送，请查收',
  PASSWORD_SAME: '新密码不能与当前密码相同',
  AGREEMENT_REQUIRED: '请先勾选《用户协议》与《隐私政策》',
  ADMIN_PASSWORD_RESET: '管理员账号密码重置须由系统维护方执行',

  // 认证
  NEED_UPLOAD_CARD: '请先上传学生证',
  CERT_PENDING: '核验审核中，请等待',
  CERT_REJECTED: '核验未通过，请按原因修改后重新提交',
  CERT_ALREADY: '已完成学生证核验，无需重复提交',
  CERT_NO_REUPLOAD: '核验重提次数已达上限 3 次，请联系管理员',
  STUDENT_NO_TAKEN: '该学号已被其他账号认证占用，如属冒用请举报',
  STUDENT_NO_INVALID: '学号格式不正确',
  CARD_IMAGE_INVALID: '学生证图片格式不支持或超过大小上限',
  NOT_CERTIFIED: '请先完成学生证核验',

  // 权限（§5.2）
  GUEST_TRADE: '请先登录并完成学生证核验',
  ADMIN_CANNOT_PUBLISH: '管理员无发布商品权限',
  ADMIN_CANNOT_ORDER: '管理员无下单权限',
  ADMIN_CANNOT_REVIEW: '管理员无评价权限',
  ADMIN_CANNOT_REPORT: '管理员不能以举报人身份提交举报',
  ADMIN_CANNOT_CONTACT: '管理员不能主动发起私信',
  ADMIN_CANNOT_FAVORITE: '管理员无收藏权限',
  ONLY_OWNER: '仅限本人操作',
  ONLY_ADMIN_DELETE_REVIEW: '仅管理员可删除他人评价',
  ONLY_ADMIN_CREDIT_VIEW: '仅管理员可查看他人信用变动明细',
  CONVERSATION_FORBIDDEN: '非本人参与的会话，无权查看',
  ADMIN_CONVERSATION_FORBIDDEN: '管理员仅可查看处置异议会话',

  // 业务状态拒绝（§5.5 第 3 条）
  STATE_UNSUPPORTED: '当前业务状态不支持该操作',
  PRODUCT_NOT_BUYABLE: '该商品不可购买',
  PRODUCT_SOLD: '该商品已售出',
  PRODUCT_SOLD_NO_OFF: '该商品已售出，不可下架或删除',
  PRODUCT_ADMIN_OFF: '该商品已被管理员下架',
  PRODUCT_GONE: '该商品已不存在',
  PRODUCT_NOT_ONSALE: '该商品当前不在售',
  PRODUCT_NOT_PENDING: '该商品不在待审核状态',
  DELETE_NEEDS_OFFSHELF: '请先下架再删除',
  EDIT_SOLD_FORBIDDEN: '已售出商品不可修改',
  PRODUCT_SYSTEM_FIELD: '发布人、商品状态、下架原因、发布时间为系统字段，不可修改',

  // 商品字段（BR-05 等）
  PRICE_INVALID: '价格须为大于 0 且不超过 50000 元的数值，最多 2 位小数',
  TITLE_REQUIRED: '请填写商品标题',
  DESC_REQUIRED: '请填写商品描述',
  IMAGES_REQUIRED: '请至少上传 1 张商品图片（最多 9 张）',
  IMAGES_TOO_MANY: '商品图片最多 9 张',
  CONDITION_INVALID: '请选择成色（全新 / 九成新 / 七成新 / 其他）',
  CATEGORY_INVALID: '请选择有效分类',
  ONSALE_LIMIT: '在售商品已达 5 件，请先售出或下架',
  CREDIT_LOW_PUBLISH: '信用分不足，暂不可发布新商品',
  CREDIT_LOW_ORDER: '信用分不足，暂不可下单',
  SELF_PURCHASE: '不能购买自己发布的商品',
  KEYWORD_REQUIRED: '请先输入关键词',
  KEYWORD_BLOCKED: '关键词包含违规内容，已拒绝检索',
  NO_RESULT: '没有找到相关商品',

  // 收藏
  FAVORITE_LIMIT: '收藏已达上限 100 件，请先清理',
  ALREADY_FAVORITE: '已收藏',
  NOT_LOGGED_IN_FAVORITE: '请先登录后再收藏',

  // 订单 / 撤销
  ORDER_NOT_FOUND: '成交记录不存在',
  CANCEL_ALREADY: '该成交已撤销',
  CANCEL_AFTER_REVIEW: '评价已提交，成交不可撤销',
  CANCEL_NOT_PARTICIPANT: '仅限本人参与的成交',
  CANCEL_JUDGE_NOT_PARTICIPANT: '免责判定只能由该成交的对方作出',
  CANCEL_JUDGE_DONE: '该撤销已完成判定',
  CANCEL_REASON_REQUIRED: '请选择撤销原因',

  // 评价
  REVIEW_ALREADY: '该订单已评价',
  REVIEW_WINDOW_CLOSED: '评价期限已过',
  REVIEW_SELF: '不能评价自己',
  REVIEW_NOT_PARTICIPANT: '仅成交双方可评价',
  REVIEW_ORDER_REVOKED: '该成交已撤销，不可评价',
  REVIEW_CONTENT_REQUIRED: '请填写评价内容',
  REVIEW_CONTENT_BLOCKED: '评价内容含违规信息（联系方式 / 广告 / 辱骂），请修改',

  // 举报
  REPORT_DUPLICATE: '你已举报过该对象',
  REPORT_SELF_PRODUCT: '不能举报自己的商品',
  REPORT_SELF: '不能举报自己',
  REPORT_NO_RELATION: '只能举报与你发生过交易或沟通的用户',
  REPORT_TYPE_MISMATCH: '举报类型与举报对象不匹配，请改选',
  REPORT_REASON_REQUIRED: '请填写举报说明',
  REPORT_ALREADY_HANDLED: '该举报已被处理',

  // 私信（BR-20）
  MSG_NEED_CERT: '请先完成学生证核验，再联系卖家',
  MSG_SELF: '不能与自己对话',
  MSG_PRODUCT_SOLD: '该商品已售出',
  MSG_PRODUCT_UNAVAILABLE: '该商品暂不可沟通',
  MSG_EMPTY: '消息内容不能为空',
  MSG_TOO_LONG: '消息长度不得超过 500 字',
  MSG_PEER_BANNED: '对方账号当前不可用',
  MSG_SEND_FAILED: '发送失败，请重试',
  MSG_ADMIN_TARGET_FORBIDDEN: '仅「管理员违规下架」的商品可向管理员发送异议私信',
  MSG_ADMIN_REPLY_ONLY: '管理员仅可回复处置异议会话，不得主动发起私信',
  MSG_PARTICIPANT_ONLY: '仅该商品的发布人、沟通过的买家与（违规下架时）管理员可参与',

  // 管理员侧
  NOT_PENDING: '当前业务状态不支持该操作',
  ADMIN_REASON_REQUIRED: '请填写处理理由',
  REPORT_ACTIONS_REQUIRED: '请至少选择一项处置手段',
  REPORT_ACTION_MISMATCH: '对象为学生的举报不得包含「强制下架商品」',
  CATEGORY_CODE_REQUIRED: '驳回原因须引用 §4.3 禁售类目编号（如 A1）',
  NOTHING_TO_DO: '未提供任何有效处置动作'
};

export class BizError extends Error {
  /**
   * @param {string} code 机器可读错误码
   * @param {string} message 面向用户的提示语
   * @param {object} [extra] 附加信息（如当前状态）
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'BizError';
    this.code = code;
    this.extra = extra;
  }
}

export const E = {
  auth: (msg = M.LOGIN_REQUIRED) => new BizError('AUTH_REQUIRED', msg),
  permission: (msg) => new BizError('PERMISSION_DENIED', msg),
  state: (msg, extra) => new BizError('STATE_REJECTED', msg, extra),
  validation: (msg, extra) => new BizError('VALIDATION_FAILED', msg, extra),
  notFound: (msg = '对象不存在') => new BizError('NOT_FOUND', msg),
  conflict: (msg) => new BizError('CONFLICT', msg),
  rateLimit: (msg) => new BizError('RATE_LIMITED', msg),
  internal: (msg = '系统繁忙，请稍后重试') => new BizError('INTERNAL', msg)
};
