/**
 * 权限与资格守卫（§5.1 角色口径 / §5.2 基础权限矩阵 / §5.3 业务条件）。
 *
 * 说明：隐藏按钮只能辅助交互；这里在服务端逐个校验「有效身份、角色、
 * 对象归属与字段可见范围」，直接构造请求也无法绕过（§5.5 第 1 条）。
 * 权限拒绝一律不改变任何业务数据，也不扣信用分（§5.5 第 2 条）。
 */
import { CREDIT, L } from '../core/config.js';
import { count, get } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { P, CERT, ACCOUNT } from '../core/rules.js';

export function roleOf(actor) {
  if (!actor || actor.kind === 'guest') return '游客';
  if (actor.kind === 'admin') return '管理员';
  return actor.student?.cert_status === CERT.CERTIFIED ? '已认证学生' : '未认证学生';
}

export function requireLogin(actor) {
  if (!actor || actor.kind === 'guest') throw E.auth(M.LOGIN_REQUIRED);
  return actor;
}

/** 取学生行；管理员或游客调用学生接口一律拒绝 */
export function requireStudent(actor, adminMessage = M.ADMIN_CANNOT_PUBLISH) {
  if (!actor || actor.kind === 'guest') throw E.auth(M.LOGIN_REQUIRED);
  if (actor.kind === 'admin') throw E.permission(adminMessage);
  const student = get('SELECT * FROM students WHERE id=?', actor.id);
  if (!student) throw E.auth('账号不存在');
  return student;
}

export function requireAdmin(actor) {
  if (!actor || actor.kind === 'guest') throw E.auth(M.LOGIN_REQUIRED);
  if (actor.kind !== 'admin') throw E.permission(M.ADMIN_ONLY);
  return get('SELECT * FROM admins WHERE id=?', actor.id);
}

/** 认证状态三态给出各自提示语（§5.2 拒绝提示语表） */
export function requireCertified(student) {
  if (student.cert_status === CERT.CERTIFIED) return student;
  if (student.cert_status === CERT.NONE) throw E.permission(M.NEED_UPLOAD_CARD);
  if (student.cert_status === CERT.PENDING) throw E.permission(M.CERT_PENDING);
  throw E.permission(M.CERT_REJECTED);
}

export function assertNotBanned(student) {
  if (student.account_status === ACCOUNT.BANNED) throw E.permission(M.ACCOUNT_BANNED);
  return student;
}

/** 发布资格：已认证 + 未封禁 + 信用分 ≥ 60 + 在售未达 5 件（BR-01、BR-02、BR-13） */
export function requirePublishRights(actor) {
  const student = requireStudent(actor, M.ADMIN_CANNOT_PUBLISH);
  requireCertified(student);
  assertNotBanned(student);
  if (Number(student.credit_score) < CREDIT.publishThreshold) throw E.permission(M.CREDIT_LOW_PUBLISH);
  return student;
}

/** 下单资格：已认证 + 未封禁 + 信用分 ≥ 40（BR-01、BR-13） */
export function requireOrderRights(actor) {
  const student = requireStudent(actor, M.ADMIN_CANNOT_ORDER);
  requireCertified(student);
  assertNotBanned(student);
  if (Number(student.credit_score) < CREDIT.orderThreshold) throw E.permission(M.CREDIT_LOW_ORDER);
  return student;
}

/** 评价 / 举报 / 私信资格：已认证 + 未封禁 */
export function requireCertifiedStudent(actor, adminMessage) {
  const student = requireStudent(actor, adminMessage);
  requireCertified(student);
  assertNotBanned(student);
  return student;
}

export function onSaleCount(studentId) {
  return count(
    `SELECT COUNT(*) FROM products WHERE seller_id=? AND status=? AND deleted_at IS NULL`,
    studentId,
    P.ON_SALE
  );
}

export function assertOnSaleQuota(student) {
  if (onSaleCount(student.id) >= L.maxOnSalePerStudent) throw E.state(M.ONSALE_LIMIT);
  return true;
}

/** 对象归属校验：非本人一律「仅限本人操作」 */
export function assertOwner(ownerId, student, message = '仅限本人操作') {
  if (String(ownerId) !== String(student.id)) throw E.permission(message);
  return true;
}
