-- ============================================================================
-- 校园二手交易平台 · 数据库结构（MySQL 8.0）
-- 依据《需求规格说明书 V2.1》§6 数据需求（13 个实体）与 §6.4.1 一致性约束
-- 约定：
--   1) 金额一律以「分」存整数，避免浮点误差（BR-05）；
--   2) 时间使用 DATETIME（服务器时区 Asia/Shanghai），业务期限由服务端时间统一计算；
--   3) 状态、原因等枚举以中文闭集存储，用 CHECK 约束保证取值合法；
--   4) MySQL 无部分唯一索引，改用「生成列 + 唯一索引」实现条件唯一。
-- ============================================================================

CREATE TABLE IF NOT EXISTS admins (
  id                    BIGINT       NOT NULL AUTO_INCREMENT,
  admin_no              VARCHAR(20)  NOT NULL COMMENT '管理员编号，同时是登录账号',
  display_name          VARCHAR(50)  NOT NULL,
  password_hash         VARCHAR(100) NOT NULL,
  must_change_password  TINYINT      NOT NULL DEFAULT 1,
  failed_count          INT          NOT NULL DEFAULT 0,
  locked_until          DATETIME     NULL,
  created_at            DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_no (admin_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员';

CREATE TABLE IF NOT EXISTS students (
  id                     BIGINT       NOT NULL AUTO_INCREMENT,
  email                  VARCHAR(120) NOT NULL,
  student_no             VARCHAR(32)  NULL COMMENT '学号：核验通过后绑定，未认证时为空',
  nickname               VARCHAR(50)  NOT NULL,
  real_name              VARCHAR(50)  NOT NULL,
  password_hash          VARCHAR(100) NOT NULL,
  phone                  VARCHAR(20)  NULL,
  dorm                   VARCHAR(100) NULL,
  cert_status            VARCHAR(10)  NOT NULL DEFAULT '未提交',
  account_status         VARCHAR(10)  NOT NULL DEFAULT '正常',
  credit_score           INT          NOT NULL DEFAULT 100,
  review_count           INT          NOT NULL DEFAULT 0,
  verified_dispute_count INT          NOT NULL DEFAULT 0,
  resubmit_count         INT          NOT NULL DEFAULT 0,
  failed_login_count     INT          NOT NULL DEFAULT 0,
  locked_until           DATETIME     NULL,
  last_cert_reminder_at  DATETIME     NULL,
  registered_at          DATETIME     NOT NULL,
  created_at             DATETIME     NOT NULL,
  updated_at             DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_student_email (email),
  UNIQUE KEY uk_student_no (student_no),
  KEY ix_student_cert (cert_status),
  CONSTRAINT ck_student_cert CHECK (cert_status IN ('未提交','待审核','已认证','已驳回')),
  CONSTRAINT ck_student_account CHECK (account_status IN ('正常','受限','封禁')),
  CONSTRAINT ck_student_credit CHECK (credit_score BETWEEN 0 AND 150),
  CONSTRAINT ck_student_resubmit CHECK (resubmit_count BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生';

CREATE TABLE IF NOT EXISTS certification_applications (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  student_id     BIGINT       NOT NULL,
  declared_no    VARCHAR(32)  NOT NULL COMMENT '申报学号',
  card_image     VARCHAR(255) NOT NULL COMMENT '学生证图片（仅审核管理员可读）',
  review_status  VARCHAR(10)  NOT NULL DEFAULT '待审核',
  reviewer_id    BIGINT       NULL,
  reviewed_at    DATETIME     NULL,
  reject_reason  VARCHAR(200) NULL,
  forgery_flag   TINYINT      NOT NULL DEFAULT 0,
  submitted_at   DATETIME     NOT NULL,
  pending_sid    BIGINT GENERATED ALWAYS AS (CASE WHEN review_status = '待审核' THEN student_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cert_pending (pending_sid),
  KEY ix_cert_student (student_id),
  CONSTRAINT ck_cert_status CHECK (review_status IN ('待审核','已通过','已驳回')),
  CONSTRAINT ck_cert_reject CHECK ((review_status = '已驳回') = (reject_reason IS NOT NULL)),
  CONSTRAINT ck_cert_reviewed CHECK ((review_status = '待审核') = (reviewed_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='认证申请';

CREATE TABLE IF NOT EXISTS categories (
  id     BIGINT      NOT NULL AUTO_INCREMENT,
  name   VARCHAR(30) NOT NULL,
  sort   INT         NOT NULL DEFAULT 0,
  active TINYINT     NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分类（单层）';

CREATE TABLE IF NOT EXISTS products (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  title            VARCHAR(50)   NOT NULL,
  description      VARCHAR(1000) NOT NULL,
  price_cents      INT           NOT NULL,
  item_condition   VARCHAR(10)   NOT NULL,
  seller_id        BIGINT        NOT NULL,
  category_id      BIGINT        NOT NULL,
  status           VARCHAR(10)   NOT NULL,
  off_shelf_reason VARCHAR(20)   NULL,
  published_at     DATETIME      NOT NULL,
  deleted_at       DATETIME      NULL,
  view_count       INT           NOT NULL DEFAULT 0,
  review_note      VARCHAR(200)  NULL,
  reviewed_by      BIGINT        NULL,
  reviewed_at      DATETIME      NULL,
  created_at       DATETIME      NOT NULL,
  updated_at       DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY ix_product_status (status, published_at),
  KEY ix_product_seller (seller_id),
  KEY ix_product_category (category_id),
  CONSTRAINT ck_product_price CHECK (price_cents > 0 AND price_cents <= 5000000),
  CONSTRAINT ck_product_condition CHECK (item_condition IN ('全新','九成新','七成新','其他')),
  CONSTRAINT ck_product_status CHECK (status IN ('待审核','在售','已售出','已下架')),
  CONSTRAINT ck_product_reason CHECK ((status = '已下架') = (off_shelf_reason IS NOT NULL)),
  CONSTRAINT ck_product_reason_value CHECK (off_shelf_reason IS NULL OR off_shelf_reason IN
    ('审核不通过','卖家撤回','卖家主动下架','管理员违规下架','撤销后不可交易'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品';

CREATE TABLE IF NOT EXISTS product_images (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  product_id BIGINT       NOT NULL,
  seq        INT          NOT NULL,
  path       VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_seq (product_id, seq),
  CONSTRAINT ck_image_seq CHECK (seq BETWEEN 1 AND 9)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品图片（1～9 张）';

CREATE TABLE IF NOT EXISTS favorites (
  id         BIGINT   NOT NULL AUTO_INCREMENT,
  student_id BIGINT   NOT NULL,
  product_id BIGINT   NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_favorite (student_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收藏';

CREATE TABLE IF NOT EXISTS orders (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  product_id          BIGINT       NOT NULL,
  buyer_id            BIGINT       NOT NULL,
  seller_id           BIGINT       NOT NULL,
  amount_cents        INT          NOT NULL,
  status              VARCHAR(10)  NOT NULL DEFAULT '有效',
  cancel_initiator_id BIGINT       NULL,
  cancel_reason       VARCHAR(200) NULL,
  cancelled_at        DATETIME     NULL,
  cancel_judgement    VARCHAR(10)  NULL,
  judgement_at        DATETIME     NULL,
  created_at          DATETIME     NOT NULL,
  delivery_deadline   DATETIME     NULL,
  updated_at          DATETIME     NOT NULL,
  valid_product_id    BIGINT GENERATED ALWAYS AS (CASE WHEN status = '有效' THEN product_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_one_valid (valid_product_id),
  KEY ix_order_buyer (buyer_id, created_at),
  KEY ix_order_seller (seller_id, created_at),
  CONSTRAINT ck_order_amount CHECK (amount_cents > 0),
  CONSTRAINT ck_order_self CHECK (buyer_id <> seller_id),
  CONSTRAINT ck_order_status CHECK (status IN ('有效','已撤销')),
  CONSTRAINT ck_order_judge CHECK (cancel_judgement IS NULL OR cancel_judgement IN ('待判定','已免责','计违约')),
  CONSTRAINT ck_order_cancel CHECK (
    (status = '有效' AND cancel_initiator_id IS NULL AND cancel_reason IS NULL AND cancelled_at IS NULL
      AND cancel_judgement IS NULL AND judgement_at IS NULL)
    OR
    (status = '已撤销' AND cancel_initiator_id IS NOT NULL AND cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL
      AND cancel_judgement IS NOT NULL
      AND ((cancel_judgement = '待判定' AND judgement_at IS NULL)
        OR (cancel_judgement IN ('已免责','计违约') AND judgement_at IS NOT NULL)))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单（成交记录）';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_deadline DATETIME NULL AFTER created_at;

CREATE TABLE IF NOT EXISTS reviews (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  order_id    BIGINT       NOT NULL,
  reviewer_id BIGINT       NOT NULL,
  target_id   BIGINT       NOT NULL,
  content     VARCHAR(500) NOT NULL,
  created_at  DATETIME     NOT NULL,
  deleted_by  BIGINT       NULL,
  deleted_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_review_order_reviewer (order_id, reviewer_id),
  KEY ix_review_target (target_id),
  CONSTRAINT ck_review_self CHECK (reviewer_id <> target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评价（仅文字）';

CREATE TABLE IF NOT EXISTS reports (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  reporter_id       BIGINT       NOT NULL,
  target_type       VARCHAR(10)  NOT NULL,
  target_product_id BIGINT       NULL,
  target_student_id BIGINT       NULL,
  target_key        VARCHAR(40)  NOT NULL,
  type              VARCHAR(20)  NOT NULL,
  reason            VARCHAR(500) NOT NULL,
  handle_status     VARCHAR(10)  NOT NULL DEFAULT '待处理',
  actions           VARCHAR(200) NULL,
  violation_codes   VARCHAR(50)  NULL,
  result            VARCHAR(500) NULL,
  handler_admin_id  BIGINT       NULL,
  handled_at        DATETIME     NULL,
  created_at        DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_report_reporter (reporter_id, target_type, target_key),
  KEY ix_report_status (handle_status, created_at),
  CONSTRAINT ck_report_target CHECK (target_type IN ('商品','学生')),
  CONSTRAINT ck_report_type CHECK (type IN ('违禁品','虚假描述','价格欺诈','站外导流','收款不履约','其他')),
  CONSTRAINT ck_report_status CHECK (handle_status IN ('待处理','已处理','已驳回')),
  CONSTRAINT ck_report_one_target CHECK (
    (target_type = '商品' AND target_product_id IS NOT NULL AND target_student_id IS NULL)
    OR (target_type = '学生' AND target_student_id IS NOT NULL AND target_product_id IS NULL)),
  CONSTRAINT ck_report_type_match CHECK (
    NOT (type = '收款不履约' AND target_type = '商品')
    AND NOT (type IN ('违禁品','虚假描述','价格欺诈','站外导流') AND target_type = '学生')),
  CONSTRAINT ck_report_handle CHECK (
    (handle_status = '待处理' AND result IS NULL AND handler_admin_id IS NULL AND handled_at IS NULL)
    OR (handle_status <> '待处理' AND result IS NOT NULL AND handler_admin_id IS NOT NULL AND handled_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='举报记录';

CREATE TABLE IF NOT EXISTS credit_records (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  student_id  BIGINT       NOT NULL,
  delta       INT          NOT NULL,
  event_type  VARCHAR(20)  NOT NULL,
  reason      VARCHAR(200) NOT NULL,
  source_key  VARCHAR(100) NULL COMMENT '幂等键',
  order_id    BIGINT       NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_credit_source (source_key),
  KEY ix_credit_student (student_id, created_at),
  CONSTRAINT ck_credit_delta CHECK (delta <> 0),
  CONSTRAINT ck_credit_event CHECK (event_type IN ('评价加分','违规处置','未评价扣分','撤销违约')),
  CONSTRAINT ck_credit_sign CHECK ((event_type = '评价加分' AND delta > 0) OR (event_type <> '评价加分' AND delta < 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='信用记录';

CREATE TABLE IF NOT EXISTS notifications (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  recipient_type VARCHAR(10)  NOT NULL,
  recipient_id   BIGINT       NOT NULL,
  msg_type       VARCHAR(20)  NOT NULL,
  title          VARCHAR(100) NOT NULL,
  content        VARCHAR(500) NOT NULL,
  related_kind   VARCHAR(20)  NULL,
  related_id     BIGINT       NULL,
  product_id     BIGINT       NULL,
  peer_id        BIGINT       NULL,
  read_status    VARCHAR(10)  NOT NULL DEFAULT '未读',
  created_at     DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notify_recipient (recipient_type, recipient_id, created_at),
  CONSTRAINT ck_notify_type CHECK (msg_type IN ('核验','商品审核','成交','处置','信用','私信','账号')),
  CONSTRAINT ck_notify_read CHECK (read_status IN ('未读','已读'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息通知';

CREATE TABLE IF NOT EXISTS messages (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  product_id    BIGINT       NOT NULL COMMENT 'BR-20：私信必须绑定商品',
  sender_type   VARCHAR(10)  NOT NULL,
  sender_id     BIGINT       NOT NULL,
  receiver_type VARCHAR(10)  NOT NULL,
  receiver_id   BIGINT       NOT NULL,
  content       VARCHAR(500) NOT NULL,
  read_status   VARCHAR(10)  NOT NULL DEFAULT '未读',
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_msg_conv (product_id, created_at),
  KEY ix_msg_receiver (receiver_type, receiver_id, read_status),
  CONSTRAINT ck_msg_type CHECK (sender_type IN ('student','admin') AND receiver_type IN ('student','admin')),
  CONSTRAINT ck_msg_self CHECK (sender_id <> receiver_id OR sender_type <> receiver_type),
  CONSTRAINT ck_msg_read CHECK (read_status IN ('未读','已读'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='私信（会话不建表）';

CREATE TABLE IF NOT EXISTS email_codes (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  email      VARCHAR(120) NOT NULL,
  purpose    VARCHAR(10) NOT NULL,
  code_hash  VARCHAR(100) NOT NULL COMMENT '只存哈希（NFR-10）',
  expires_at DATETIME    NOT NULL,
  used       TINYINT     NOT NULL DEFAULT 0,
  fail_count INT         NOT NULL DEFAULT 0,
  created_at DATETIME    NOT NULL,
  PRIMARY KEY (id),
  KEY ix_code_lookup (email, purpose, created_at),
  CONSTRAINT ck_code_purpose CHECK (purpose IN ('注册','找回密码'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮箱验证码';

CREATE TABLE IF NOT EXISTS sessions (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  subject_type VARCHAR(10)  NOT NULL,
  subject_id   BIGINT       NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  revoked      TINYINT      NOT NULL DEFAULT 0,
  ip           VARCHAR(45)  NULL,
  user_agent   VARCHAR(200) NULL,
  created_at   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_token (token_hash),
  KEY ix_session_subject (subject_type, subject_id),
  CONSTRAINT ck_session_subject CHECK (subject_type IN ('student','admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录会话';

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  actor_type  VARCHAR(10)   NOT NULL,
  actor_id    BIGINT        NULL,
  role        VARCHAR(20)   NOT NULL,
  action      VARCHAR(60)   NOT NULL,
  target_type VARCHAR(20)   NULL,
  target_id   BIGINT        NULL,
  result      VARCHAR(10)   NOT NULL,
  reason_code VARCHAR(40)   NULL,
  detail      VARCHAR(1000) NULL,
  created_at  DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY ix_audit_action (action, created_at),
  KEY ix_audit_actor (actor_type, actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志';

CREATE TABLE IF NOT EXISTS settings (
  k          VARCHAR(50)  NOT NULL,
  v          VARCHAR(200) NOT NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统设置';
