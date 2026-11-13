-- ============================================================================
-- 拾光二手 · 校园二手交易平台  数据库结构
-- 依据《需求规格说明书 V2.1》§6 数据需求（13 个实体）与 §6.4.1 一致性约束
-- 说明：
--   1) 时间戳统一存 ISO-8601 UTC 字符串（秒精度，§4.1.1 第 4 条），便于排序与比较；
--   2) 金额统一以「分」存储（整数），规避浮点误差；对外展示为元；
--   3) 学生以 email 为业务唯一键、学号在核验通过后绑定且全局唯一（§6.2.1 学生）；
--      student_no 允许为空（未认证学生无学号），因此以 id 作为代理主键；
--   4) 收藏、私信等实体按数据字典逐字段落库；「会话」不建表（§6.2.1 私信）。
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- 系统设置
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------- 管理员
CREATE TABLE IF NOT EXISTS admins (
  id                   TEXT PRIMARY KEY,                 -- 管理员编号（同时是后台登录账号）
  display_name         TEXT NOT NULL,                    -- 显示名称
  password_hash        TEXT NOT NULL,                    -- 仅存不可逆哈希
  must_change_password INTEGER NOT NULL DEFAULT 1,       -- 首登强制修改初始密码（UC-04 主事件流 4）
  failed_count         INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until         TEXT,
  created_at           TEXT NOT NULL
);

-- ---------------------------------------------------------------- 学生
CREATE TABLE IF NOT EXISTS students (
  id                      TEXT PRIMARY KEY,              -- 代理主键（未认证学生尚无学号）
  email                   TEXT NOT NULL UNIQUE,          -- 登录账号，唯一
  student_no              TEXT UNIQUE,                   -- 学号：核验通过后绑定，唯一
  nickname                TEXT NOT NULL,
  real_name               TEXT NOT NULL,                 -- 真实姓名（核验时与证件比对，非公开）
  password_hash           TEXT NOT NULL,
  registered_at           TEXT NOT NULL,
  cert_status             TEXT NOT NULL DEFAULT '未提交'
                          CHECK (cert_status IN ('未提交','待审核','已认证','已驳回')),
  account_status          TEXT NOT NULL DEFAULT '正常'
                          CHECK (account_status IN ('正常','受限','封禁')),
  phone                   TEXT,
  dorm                    TEXT,
  credit_score            INTEGER NOT NULL DEFAULT 100 CHECK (credit_score BETWEEN 0 AND 150),
  review_count            INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  verified_dispute_count  INTEGER NOT NULL DEFAULT 0 CHECK (verified_dispute_count >= 0),
  resubmit_count          INTEGER NOT NULL DEFAULT 0 CHECK (resubmit_count BETWEEN 0 AND 3),
  failed_login_count      INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until            TEXT,
  last_cert_reminder_at   TEXT,
  created_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_students_cert ON students(cert_status);

-- ---------------------------------------------------------------- 认证申请
CREATE TABLE IF NOT EXISTS certification_applications (
  id              TEXT PRIMARY KEY,                      -- 申请编号
  student_id      TEXT NOT NULL REFERENCES students(id),
  declared_no     TEXT NOT NULL,                         -- 申报学号
  card_image      TEXT NOT NULL,                         -- 学生证图片存储引用（仅审核管理员可读）
  submitted_at    TEXT NOT NULL,                         -- 提交时间
  review_status   TEXT NOT NULL DEFAULT '待审核'
                  CHECK (review_status IN ('待审核','已通过','已驳回')),
  reviewer_id     TEXT REFERENCES admins(id),
  reviewed_at     TEXT,
  reject_reason   TEXT,
  forgery_flag    INTEGER NOT NULL DEFAULT 0,            -- 疑似伪造标记（BR-18）
  CHECK ((review_status = '待审核') = (reviewed_at IS NULL)),
  CHECK (review_status <> '已驳回' OR reject_reason IS NOT NULL),
  CHECK (review_status = '已驳回' OR reject_reason IS NULL)
);
-- 同一学生同时最多一条「待审核」申请（UC-02 辅事件流 E）
CREATE UNIQUE INDEX IF NOT EXISTS ux_cert_pending
  ON certification_applications(student_id) WHERE review_status = '待审核';

-- ---------------------------------------------------------------- 分类（单层，不分层）
CREATE TABLE IF NOT EXISTS categories (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1,                    -- 0 表示入口停用（UC-08 辅事件流 B）
  sort    INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- 商品
CREATE TABLE IF NOT EXISTS products (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  price_cents      INTEGER NOT NULL
                   CHECK (price_cents > 0 AND price_cents <= 5000000),   -- BR-05：>0 且 ≤50000 元
  condition        TEXT NOT NULL CHECK (condition IN ('全新','九成新','七成新','其他')),
  seller_id        TEXT NOT NULL REFERENCES students(id),
  category_id      TEXT NOT NULL REFERENCES categories(id),
  status           TEXT NOT NULL CHECK (status IN ('待审核','在售','已售出','已下架')),
  off_shelf_reason TEXT CHECK (off_shelf_reason IN
                   ('审核不通过','卖家撤回','卖家主动下架','管理员违规下架','撤销后不可交易')),
  published_at     TEXT NOT NULL,                        -- 发布时间（编辑/重提刷新，BR-22）
  deleted_at       TEXT,                                 -- 删除时间（软删除，BR-09）
  view_count       INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  review_note      TEXT,                                 -- 审核结论说明（驳回须引用 §4.3 类目编号）
  reviewed_by      TEXT REFERENCES admins(id),
  reviewed_at      TEXT,
  -- §6.4.1：进入「已下架」必须写下架原因；其余状态不得有下架原因
  CHECK ((status = '已下架') = (off_shelf_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_products_status ON products(status, published_at);
CREATE INDEX IF NOT EXISTS ix_products_seller ON products(seller_id);

CREATE TABLE IF NOT EXISTS product_images (
  product_id  TEXT NOT NULL REFERENCES products(id),
  seq         INTEGER NOT NULL CHECK (seq >= 1 AND seq <= 9),   -- 1～9 张，至少 1 张
  path        TEXT NOT NULL,
  PRIMARY KEY (product_id, seq)
);

-- ---------------------------------------------------------------- 收藏
CREATE TABLE IF NOT EXISTS favorites (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  product_id  TEXT NOT NULL REFERENCES products(id),
  created_at  TEXT NOT NULL,
  UNIQUE (student_id, product_id)                        -- 组合唯一（UC-09 辅事件流 A）
);

-- ---------------------------------------------------------------- 订单（成交记录）
CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  product_id          TEXT NOT NULL REFERENCES products(id),
  buyer_id            TEXT NOT NULL REFERENCES students(id),
  seller_id           TEXT NOT NULL REFERENCES students(id),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at          TEXT NOT NULL,                     -- 成交时间
  status              TEXT NOT NULL DEFAULT '有效' CHECK (status IN ('有效','已撤销')),
  cancel_initiator_id TEXT REFERENCES students(id),
  cancel_reason       TEXT,
  cancelled_at        TEXT,
  cancel_judgement    TEXT CHECK (cancel_judgement IN ('待判定','已免责','计违约')),
  judgement_at        TEXT,
  CHECK (buyer_id <> seller_id),                         -- BR-01：禁止自购
  -- §6.4.1 撤销与免责判定的五条一致性约束（第 1、2 条）
  CHECK (
    (status = '有效'
      AND cancel_initiator_id IS NULL AND cancel_reason IS NULL AND cancelled_at IS NULL
      AND cancel_judgement IS NULL AND judgement_at IS NULL)
    OR
    (status = '已撤销'
      AND cancel_initiator_id IS NOT NULL AND cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL
      AND cancel_judgement IS NOT NULL
      AND ((cancel_judgement = '待判定' AND judgement_at IS NULL)
           OR (cancel_judgement IN ('已免责','计违约') AND judgement_at IS NOT NULL)))
  )
);
-- BR-06：同一商品同时最多 1 条「有效」成交记录（并发抢购的数据库级保证）
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_one_valid ON orders(product_id) WHERE status = '有效';
CREATE INDEX IF NOT EXISTS ix_orders_buyer ON orders(buyer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_orders_seller ON orders(seller_id, created_at);

-- ---------------------------------------------------------------- 评价（仅文字，无星级）
CREATE TABLE IF NOT EXISTS reviews (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id),
  reviewer_id  TEXT NOT NULL REFERENCES students(id),
  target_id    TEXT NOT NULL REFERENCES students(id),
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  deleted_by   TEXT REFERENCES admins(id),                -- 管理员可删除他人评价（§5.2 权限矩阵）
  deleted_at   TEXT,
  UNIQUE (order_id, reviewer_id),                         -- BR-08：每人每单一次
  CHECK (reviewer_id <> target_id)                        -- 不可自评
);

-- ---------------------------------------------------------------- 举报记录
CREATE TABLE IF NOT EXISTS reports (
  id                TEXT PRIMARY KEY,
  reporter_id       TEXT NOT NULL REFERENCES students(id),
  target_type       TEXT NOT NULL CHECK (target_type IN ('商品','学生')),
  target_product_id TEXT REFERENCES products(id),
  target_student_id TEXT REFERENCES students(id),
  target_key        TEXT NOT NULL,                        -- 对象编号（按类型取其一），用于组合唯一
  type              TEXT NOT NULL
                    CHECK (type IN ('违禁品','虚假描述','价格欺诈','站外导流','收款不履约','其他')),
  reason            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  handle_status     TEXT NOT NULL DEFAULT '待处理'
                    CHECK (handle_status IN ('待处理','已处理','已驳回')),
  actions           TEXT,                                 -- JSON 数组：五项处置手段
  violation_codes   TEXT,                                 -- 引用的 §4.3 类目编号（如 A1）
  result            TEXT,
  handler_admin_id  TEXT REFERENCES admins(id),
  handled_at        TEXT,
  UNIQUE (reporter_id, target_type, target_key),           -- 同一学生对同一对象仅一条（组合唯一）
  -- 被举报对象两字段恰好一个非空
  CHECK ((target_type = '商品' AND target_product_id IS NOT NULL AND target_student_id IS NULL)
      OR (target_type = '学生' AND target_student_id IS NOT NULL AND target_product_id IS NULL)),
  -- §6.2.1 一致性约束 2：举报类型与对象类型必须匹配
  CHECK (NOT (type = '收款不履约' AND target_type = '商品')),
  CHECK (NOT (type IN ('违禁品','虚假描述','价格欺诈','站外导流') AND target_type = '学生')),
  -- 处理状态与处理结果的相互一致
  CHECK ((handle_status = '待处理' AND result IS NULL AND handler_admin_id IS NULL AND handled_at IS NULL)
      OR (handle_status <> '待处理' AND result IS NOT NULL AND handler_admin_id IS NOT NULL AND handled_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_reports_status ON reports(handle_status, created_at);

-- ---------------------------------------------------------------- 信用记录
CREATE TABLE IF NOT EXISTS credit_records (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  delta       INTEGER NOT NULL CHECK (delta <> 0),
  event_type  TEXT NOT NULL
              CHECK (event_type IN ('评价加分','违规处置','未评价扣分','撤销违约')),
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  order_id    TEXT REFERENCES orders(id),
  source_key  TEXT,                                      -- 幂等键：同一事件最多记一次（BR-14）
  UNIQUE (event_type, source_key),
  CHECK ((event_type = '评价加分' AND delta > 0) OR (event_type <> '评价加分' AND delta < 0))
);
CREATE INDEX IF NOT EXISTS ix_credit_student ON credit_records(student_id, created_at);

-- ---------------------------------------------------------------- 消息通知（系统单向推送）
CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  recipient_id  TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('student','admin')),
  msg_type      TEXT NOT NULL
                -- 六值封闭集（§6.2.1）+ `账号`：
                -- BR-15 要求「登录成功」也发站内通知，但消息类型六值中无账号类，
                -- 属需求内部不一致；本项目按 BR-15 实现，并新增 `账号` 值，
                -- 可在 config/default.json 的 features.loginSuccessNotification 关闭。
                CHECK (msg_type IN ('核验','商品审核','成交','处置','信用','私信','账号')),
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  read_status   TEXT NOT NULL DEFAULT '未读' CHECK (read_status IN ('未读','已读')),
  related_kind  TEXT,                                    -- product / report / cert / order / conversation
  related_id    TEXT,
  product_id    TEXT,                                    -- 私信类通知的会话定位（商品编号＋对方学号）
  peer_id       TEXT
);
CREATE INDEX IF NOT EXISTS ix_notifications_recipient
  ON notifications(recipient_type, recipient_id, created_at);

-- ---------------------------------------------------------------- 私信（会话不建表，由行聚合）
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),   -- BR-20：必须绑定具体商品
  sender_id     TEXT NOT NULL,
  sender_type   TEXT NOT NULL CHECK (sender_type IN ('student','admin')),
  receiver_id   TEXT NOT NULL,
  receiver_type TEXT NOT NULL CHECK (receiver_type IN ('student','admin')),
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  read_status   TEXT NOT NULL DEFAULT '未读' CHECK (read_status IN ('未读','已读')),
  CHECK (sender_type <> receiver_type OR sender_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS ix_messages_conversation ON messages(product_id, created_at);
CREATE INDEX IF NOT EXISTS ix_messages_receiver ON messages(receiver_type, receiver_id, read_status);

-- ---------------------------------------------------------------- 邮箱验证码（临时安全记录）
CREATE TABLE IF NOT EXISTS email_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('注册','找回密码')),
  code_hash   TEXT NOT NULL,                             -- 只存哈希，不存明文（NFR-10）
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  fail_count  INTEGER NOT NULL DEFAULT 0 CHECK (fail_count >= 0)
);
CREATE INDEX IF NOT EXISTS ix_email_codes_lookup ON email_codes(email, purpose, created_at);

-- ---------------------------------------------------------------- 会话
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('student','admin')),
  subject_id    TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0,
  ip            TEXT,
  user_agent    TEXT
);

-- ---------------------------------------------------------------- 审计日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  role        TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  result      TEXT NOT NULL,
  reason_code TEXT,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_logs(at);
