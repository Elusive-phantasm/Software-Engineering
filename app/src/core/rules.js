/**
 * 枚举、闭集清单与字段校验（可直接对照需求文档正文）。
 */
import { L, CREDIT, toCents } from './config.js';
import { M, E } from './errors.js';

/* ---------------------------------------------------------------- 状态枚举 */
export const CERT = {
  NONE: '未提交',
  PENDING: '待审核',
  CERTIFIED: '已认证',
  REJECTED: '已驳回'
};
export const CERT_STATES = Object.values(CERT);

export const ACCOUNT = { NORMAL: '正常', RESTRICTED: '受限', BANNED: '封禁' };
export const ACCOUNT_STATES = Object.values(ACCOUNT);

export const P = { PENDING: '待审核', ON_SALE: '在售', SOLD: '已售出', OFF: '已下架' };
export const PRODUCT_STATES = Object.values(P);

export const OFF_REASON = {
  REJECTED: '审核不通过',
  SELLER_WITHDRAW: '卖家撤回',
  SELLER_OFF: '卖家主动下架',
  ADMIN_OFF: '管理员违规下架',
  CANCEL_NO_TRADE: '撤销后不可交易'
};
export const OFF_REASONS = Object.values(OFF_REASON);
/** ST-08 允许重提的下架原因（BR-03：管理员违规下架与撤销后不可交易不得直接重提） */
export const RESUBMITTABLE_REASONS = [OFF_REASON.REJECTED, OFF_REASON.SELLER_WITHDRAW];

export const ORDER = { VALID: '有效', CANCELLED: '已撤销' };
export const JUDGE = { PENDING: '待判定', EXEMPT: '已免责', BREACH: '计违约' };

export const CONDITIONS = ['全新', '九成新', '七成新', '其他'];

export const REPORT_TARGET = { PRODUCT: '商品', STUDENT: '学生' };
export const REPORT_TYPES = ['违禁品', '虚假描述', '价格欺诈', '站外导流', '收款不履约', '其他'];
/** §6.2.1 一致性约束 2：类型与对象必须匹配 */
export const REPORT_TYPES_BY_TARGET = {
  [REPORT_TARGET.PRODUCT]: ['违禁品', '虚假描述', '价格欺诈', '站外导流', '其他'],
  [REPORT_TARGET.STUDENT]: ['收款不履约', '其他']
};
export const REPORT_STATUS = { PENDING: '待处理', HANDLED: '已处理', REJECTED: '已驳回' };

/** 处置手段五项（UC-13 与附录 B「处置」为同一份清单） */
export const ACTIONS = ['警告', '强制下架商品', '限制发布', '封禁账号', '扣信用分'];
/** 对象为学生时的可用手段（不含强制下架商品，UC-13 主事件流 4b） */
export const ACTIONS_BY_TARGET = {
  [REPORT_TARGET.PRODUCT]: ACTIONS,
  [REPORT_TARGET.STUDENT]: ACTIONS.filter((a) => a !== '强制下架商品')
};

export const NOTIFY_TYPES = ['核验', '商品审核', '成交', '处置', '信用', '私信'];
export const CREDIT_EVENTS = ['评价加分', '违规处置', '未评价扣分', '撤销违约'];

export const CANCEL_REASONS = ['买家不想要了', '卖家不卖了', '货物与描述不符', '约不上时间', '其他'];

/* -------------------------------------------- §4.3 禁售品类清单（18 类，闭集） */
export const FORBIDDEN_GROUPS = {
  A: '法律法规禁止流通',
  B: '实名与资质管制',
  C: '侵权与隐私',
  D: '学术诚信',
  E: '校园安全'
};
export const FORBIDDEN_CATEGORIES = [
  { code: 'A1', name: '武器与管制器具', examples: '枪支、弹药、仿真枪、弩、管制刀具、甩棍、指虎、催泪喷雾', why: '违反枪支与管制刀具管理规定' },
  { code: 'A2', name: '毒品与管制药品', examples: '毒品、麻醉药品、精神药品、易制毒化学品', why: '违反禁毒与管制药品法规' },
  { code: 'A3', name: '危险品', examples: '烟花爆竹、易燃易爆品、剧毒化学品、放射性物品、废弃铅蓄电池', why: '违反危险化学品与危废管理规定' },
  { code: 'A4', name: '淫秽色情物品', examples: '色情书刊、影像、成人用品', why: '违反治安管理规定' },
  { code: 'A5', name: '赌博与作弊器材', examples: '赌具、筹码、考试作弊器材、窃听窃照器材', why: '违反治安管理规定' },
  { code: 'A6', name: '野生动物及其制品', examples: '象牙、龟甲、受保护动物制品', why: '违反野生动物保护规定' },
  { code: 'A7', name: '伪造与变造物品', examples: '假证件、假印章、假票据、假币', why: '属伪造类违法物品' },
  { code: 'B1', name: '实名制卡证', examples: '银行卡、电话卡、手机卡、SIM 卡、流量卡', why: '违反电话用户实名制' },
  { code: 'B2', name: '身份凭据与账号', examples: '身份证、学生证、一卡通、门禁卡；校园网与教务账号；各类互联网平台账号', why: '涉身份冒用与实名制' },
  { code: 'B3', name: '受管制消费品', examples: '处方药、医疗器械、烟草、电子烟及烟油、酒类', why: '需经营许可' },
  { code: 'B4', name: '未许可食品与活体', examples: '自制食品、无标签预包装食品、活体动物', why: '需食品经营许可' },
  { code: 'C1', name: '他人个人信息', examples: '他人个人信息、通讯录、客户名单、数据库', why: '违反个人信息保护要求' },
  { code: 'C2', name: '校园内部资料', examples: '未授权试卷、题库、教师课件、内部通讯录', why: '涉学校知识产权与保密要求' },
  { code: 'C3', name: '盗版与破解资源', examples: '盗版书籍、盗版软件、注册机、翻录课程视频', why: '侵犯著作权' },
  { code: 'D1', name: '学术不端服务', examples: '代写论文作业、代考、代做实验与课设的服务或中介信息', why: '违反学术诚信规范' },
  { code: 'D2', name: '代抄与答案', examples: '他人已填写的作业本、实验报告、考试答案', why: '为抄袭提供便利' },
  { code: 'E1', name: '违规大功率电器', examples: '热得快、电磁炉、电炉、电热毯、电饭锅', why: '违反宿舍安全管理规定' },
  { code: 'E2', name: '明火器具', examples: '酒精炉、卡式炉、燃气罐、蜡烛、酒精灯', why: '违反宿舍消防安全规定' }
];
export const FORBIDDEN_CODES = FORBIDDEN_CATEGORIES.map((c) => c.code);
export function forbiddenCategory(code) {
  return FORBIDDEN_CATEGORIES.find((c) => c.code === String(code || '').trim().toUpperCase()) || null;
}

/* ------------------------------------------------------------ 内容安全（BR-04） */
/** 站外导流特征：站外联系方式与广告（不含双方在私信内约定取货的联系方式） */
const CONTACT_PATTERNS = [
  /(?<!\d)1[3-9]\d{9}(?!\d)/,                 // 手机号
  /(?:微信|weixin|wechat|vx|v信)\s*[:：]?\s*[A-Za-z0-9_-]{4,}/i,
  /(?:QQ|扣扣|企鹅)\s*[:：]?\s*\d{5,}/i,
  /https?:\/\/|www\.[A-Za-z0-9-]+\.[A-Za-z]{2,}/i
];
const AD_KEYWORDS = ['加群', '扫码进群', '卖课', '代购', '代理加盟', '刷单', '兼职日结'];
/** 检索敏感词（UC-07 辅事件流 E） */
const SEARCH_BLOCKLIST = ['毒品', '枪支', '代考', '代写', '办证', '假证', '冰毒', '赌博'];

export function containsOffsiteContact(text) {
  const s = String(text || '');
  return CONTACT_PATTERNS.some((re) => re.test(s));
}
export function containsAd(text) {
  const s = String(text || '');
  return AD_KEYWORDS.some((k) => s.includes(k));
}
export function isBlockedKeyword(keyword) {
  const s = String(keyword || '');
  return SEARCH_BLOCKLIST.some((k) => s.includes(k));
}

/* ------------------------------------------------------------ 字段校验器 */
export function validateNickname(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation('请填写昵称');
  if (s.length > L.nicknameMaxLen) throw E.validation(`昵称不得超过 ${L.nicknameMaxLen} 个字符`);
  return s;
}
export function validateRealName(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.REAL_NAME_REQUIRED);
  if (s.length > L.realNameMaxLen) throw E.validation(`真实姓名不得超过 ${L.realNameMaxLen} 个字符`);
  return s;
}
export function validateEmail(v) {
  const s = String(v ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw E.validation(M.EMAIL_INVALID);
  return s.toLowerCase();
}
export function validatePassword(v) {
  const s = String(v ?? '');
  if (s.length < 8 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) throw E.validation(M.PASSWORD_WEAK);
  return s;
}
export function validatePhone(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!new RegExp(L.phonePattern).test(s)) throw E.validation('手机号格式不正确（须为 11 位中国大陆手机号）');
  return s;
}
export function validateDorm(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.length > L.dormMaxLen) throw E.validation(`宿舍地址不得超过 ${L.dormMaxLen} 个字符`);
  return s;
}
export function validateStudentNo(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{6,20}$/.test(s)) throw E.validation(M.STUDENT_NO_INVALID);
  return s;
}
export function validateTitle(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.TITLE_REQUIRED);
  if (s.length > L.titleMaxLen) throw E.validation(`标题不得超过 ${L.titleMaxLen} 个字符`);
  return s;
}
export function validateDescription(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.DESC_REQUIRED);
  if (s.length > L.descMaxLen) throw E.validation(`描述不得超过 ${L.descMaxLen} 个字符`);
  if (containsOffsiteContact(s) || containsAd(s)) {
    throw E.validation('描述中不得包含站外联系方式或广告（站外导流），请改为站内私信沟通');
  }
  return s;
}
/** BR-05：大于 0 且不超过 50000 元，最多 2 位小数。返回「分」 */
export function validatePrice(yuan) {
  const raw = String(yuan ?? '').trim();
  if (!raw) throw E.validation(M.PRICE_INVALID);
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw E.validation(M.PRICE_INVALID);
  const cents = toCents(raw);
  if (cents <= 0 || cents > toCents(L.priceMaxYuan)) throw E.validation(M.PRICE_INVALID);
  return cents;
}
export function validateCondition(v) {
  const s = String(v ?? '').trim();
  if (!CONDITIONS.includes(s)) throw E.validation(M.CONDITION_INVALID);
  return s;
}
export function validateImages(list) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  if (arr.length < L.imagesMin) throw E.validation(M.IMAGES_REQUIRED);
  if (arr.length > L.imagesMax) throw E.validation(M.IMAGES_TOO_MANY);
  return arr;
}
export function validateReviewContent(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.REVIEW_CONTENT_REQUIRED);
  if (s.length > L.reviewContentMaxLen) throw E.validation(`评价内容不得超过 ${L.reviewContentMaxLen} 个字符`);
  if (containsOffsiteContact(s) || containsAd(s) || containsAbuse(s)) throw E.validation(M.REVIEW_CONTENT_BLOCKED);
  return s;
}
const ABUSE_WORDS = ['傻逼', 'sb', '垃圾东西', '骗子死全家'];
export function containsAbuse(text) {
  const s = String(text || '').toLowerCase();
  return ABUSE_WORDS.some((w) => s.includes(w));
}
export function validateReportReason(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.REPORT_REASON_REQUIRED);
  if (s.length > L.reportReasonMaxLen) throw E.validation(`举报说明不得超过 ${L.reportReasonMaxLen} 个字符`);
  return s;
}
export function validateMessageContent(v) {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.MSG_EMPTY);
  if (s.length > L.messageMaxLen) throw E.validation(M.MSG_TOO_LONG);
  return s;
}
export function validateRejectReason(v, withCategory = false, categoryCode = '') {
  const s = String(v ?? '').trim();
  if (!s) throw E.validation(M.ADMIN_REASON_REQUIRED);
  if (s.length > L.certRejectReasonMaxLen) throw E.validation(`原因不得超过 ${L.certRejectReasonMaxLen} 个字符`);
  if (withCategory) {
    const code = String(categoryCode || '').trim().toUpperCase();
    if (!FORBIDDEN_CODES.includes(code)) throw E.validation(M.CATEGORY_CODE_REQUIRED);
    return `${code} ${forbiddenCategory(code).name}：${s}`;
  }
  return s;
}

/** 信用分阈值判断（BR-13） */
export const canPublishByCredit = (score) => Number(score) >= CREDIT.publishThreshold;
export const canOrderByCredit = (score) => Number(score) >= CREDIT.orderThreshold;
