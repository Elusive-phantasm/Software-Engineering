/**
 * 管理端：学生管理、账号状态处置（BR-10 / BR-18 / ST-13）、信用分人工调整、看板统计、审计查询。
 * 处置手段固定五项：警告、强制下架、限制发布、封禁账号、扣信用分（附录 B「处置」）。
 */
import { CREDIT } from '../core/config.js';
import { all, count, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify } from '../core/notifier.js';
import { ACCOUNT, CERT, OFF_REASON, ORDER, P, forbiddenCategory } from '../core/rules.js';
import { nowIso } from '../core/time.js';
import { requireAdmin } from './guards.js';
import { applyCreditChange, creditRecords, EVENT } from './credit.service.js';
import { offShelfAllForBannedSeller } from './product.service.js';
import { publicStudent } from './view.js';

/* ------------------------------------------------------------------ 看板统计 */
export function dashboard() {
  const ordersValid = count('SELECT COUNT(*) FROM orders WHERE status=?', ORDER.VALID);
  const amountValid = Number(
    get('SELECT COALESCE(SUM(amount_cents),0) AS s FROM orders WHERE status=?', ORDER.VALID).s || 0
  );
  return {
    students: {
      total: count('SELECT COUNT(*) FROM students'),
      certified: count('SELECT COUNT(*) FROM students WHERE cert_status=?', CERT.CERTIFIED),
      pendingCert: count('SELECT COUNT(*) FROM students WHERE cert_status=?', CERT.PENDING),
      banned: count('SELECT COUNT(*) FROM students WHERE account_status=?', ACCOUNT.BANNED),
      restricted: count('SELECT COUNT(*) FROM students WHERE account_status=?', ACCOUNT.RESTRICTED)
    },
    products: {
      pending: count(`SELECT COUNT(*) FROM products WHERE status=? AND deleted_at IS NULL`, P.PENDING),
      onSale: count(`SELECT COUNT(*) FROM products WHERE status=? AND deleted_at IS NULL`, P.ON_SALE),
      sold: count(`SELECT COUNT(*) FROM products WHERE status=? AND deleted_at IS NULL`, P.SOLD),
      off: count(`SELECT COUNT(*) FROM products WHERE status=? AND deleted_at IS NULL`, P.OFF)
    },
    reports: {
      pending: count(`SELECT COUNT(*) FROM reports WHERE handle_status='待处理'`),
      handled: count(`SELECT COUNT(*) FROM reports WHERE handle_status='已处理'`),
      rejected: count(`SELECT COUNT(*) FROM reports WHERE handle_status='已驳回'`)
    },
    orders: {
      valid: ordersValid,
      cancelled: count('SELECT COUNT(*) FROM orders WHERE status=?', ORDER.CANCELLED),
      amountValidYuan: (amountValid / 100).toFixed(2)   // BR-12：以成交记录去重统计
    },
    messages: {
      total: count('SELECT COUNT(*) FROM messages'),
      pendingAdmin: count(
        `SELECT COUNT(*) FROM messages WHERE receiver_type='admin' AND read_status='未读'`
      )
    }
  };
}

/* ------------------------------------------------------------ 学生列表与详情 */
export function studentList({ keyword, certStatus, accountStatus } = {}) {
  const conds = [];
  const args = [];
  if (keyword) {
    conds.push('(nickname LIKE ? OR email LIKE ? OR IFNULL(student_no,\'\') LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like, like);
  }
  if (certStatus && Object.values(CERT).includes(certStatus)) {
    conds.push('cert_status=?');
    args.push(certStatus);
  }
  if (accountStatus && Object.values(ACCOUNT).includes(accountStatus)) {
    conds.push('account_status=?');
    args.push(accountStatus);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = all(`SELECT * FROM students ${where} ORDER BY registered_at DESC LIMIT 300`, ...args);
  return rows.map((r) => ({
    ...publicStudent(r),
    email: r.email,
    studentNo: r.student_no,
    realName: r.real_name,
    resubmitCount: Number(r.resubmit_count)
  }));
}

export function studentDetail(studentId) {
  const row = get('SELECT * FROM students WHERE id=?', studentId);
  if (!row) throw E.notFound('学生不存在');
  return {
    ...publicStudent(row),
    email: row.email,
    studentNo: row.student_no,
    realName: row.real_name,
    phone: row.phone,
    dorm: row.dorm,
    resubmitCount: Number(row.resubmit_count),
    failedLoginCount: Number(row.failed_login_count),
    lockedUntil: row.locked_until,
    registeredAt: row.registered_at,
    creditRecords: creditRecords(studentId, 50),
    products: all(
      `SELECT id, title, status, off_shelf_reason, price_cents, published_at
         FROM products WHERE seller_id=? AND deleted_at IS NULL ORDER BY published_at DESC`,
      studentId
    ).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      offShelfReason: p.off_shelf_reason,
      price: (Number(p.price_cents) / 100).toFixed(2),
      publishedAt: p.published_at
    })),
    orders: all(
      `SELECT id, product_id, buyer_id, seller_id, amount_cents, created_at, status
         FROM orders WHERE buyer_id=? OR seller_id=? ORDER BY created_at DESC LIMIT 50`,
      studentId, studentId
    ).map((o) => ({
      id: o.id,
      productId: o.product_id,
      amount: (Number(o.amount_cents) / 100).toFixed(2),
      createdAt: o.created_at,
      status: o.status,
      role: o.buyer_id === studentId ? 'buyer' : 'seller'
    })),
    applications: all(
      `SELECT id, declared_no, submitted_at, review_status, reject_reason
         FROM certification_applications WHERE student_id=? ORDER BY submitted_at DESC`,
      studentId
    )
  };
}

/* ------------------------------------------- 账号状态处置：封禁 / 解封 / 受限 */
export function setAccountStatus(actor, studentId, { status, reason, deductCredit = false }) {
  const admin = requireAdmin(actor);
  if (!Object.values(ACCOUNT).includes(status)) throw E.validation('账号状态取值非法');
  const note = String(reason || '').trim();
  if (!note) throw E.validation(M.ADMIN_REASON_REQUIRED);

  return tx(() => {
    const student = get('SELECT * FROM students WHERE id=?', studentId);
    if (!student) throw E.notFound('学生不存在');

    // 认证状态与账号状态分开记录（BR-19）：这里只改账号状态
    run('UPDATE students SET account_status=? WHERE id=?', status, studentId);

    let offShelf = 0;
    if (status === ACCOUNT.BANNED) {
      // BR-10 / ST-13：封禁须在同一处置动作中连带下架其在售与待审核商品
      offShelf = offShelfAllForBannedSeller(studentId, admin.id);
    }
    if (deductCredit && status === ACCOUNT.BANNED) {
      applyCreditChange({
        studentId,
        delta: CREDIT.violationPenalty,
        eventType: EVENT.VIOLATION,
        reason: `账号被处置（${status}）：${note}`.slice(0, 200),
        sourceKey: `violation:ban:${studentId}:${nowIso()}`
      });
    }

    notify({
      recipientId: studentId,
      msgType: '处置',
      title: `账号状态变更为「${status}」`,
      content:
        status === ACCOUNT.BANNED
          ? `你的账号已被封禁，名下 ${offShelf} 件在售与待审核商品已联动下架。封禁不改变认证状态（BR-19）。理由：${note}`
          : `你的账号状态已变更为「${status}」。理由：${note}`,
      relatedKind: 'student',
      relatedId: studentId
    });
    audit({
      actorType: 'admin', actorId: admin.id, role: '管理员', action: 'student.setAccountStatus',
      targetType: 'student', targetId: studentId, result: 'allowed',
      detail: { status, note, offShelf, deductCredit }
    });
    return { ok: true, offShelf };
  });
}

/* ---------------------------------------------------------- 信用分人工调整 */
export function adjustCredit(actor, studentId, { delta, reason }) {
  const admin = requireAdmin(actor);
  const d = Number(delta);
  if (![CREDIT.reviewBonus, CREDIT.noReviewPenalty, CREDIT.cancelPenalty, CREDIT.violationPenalty].includes(d)) {
    throw E.validation('信用分调整幅度须为 BR-14 规定的事件幅度之一（+2 / −1 / −2 / −10）');
  }
  const note = String(reason || '').trim();
  if (!note) throw E.validation(M.ADMIN_REASON_REQUIRED);
  const student = get('SELECT * FROM students WHERE id=?', studentId);
  if (!student) throw E.notFound('学生不存在');

  return tx(() => {
    const res = applyCreditChange({
      studentId,
      delta: d,
      eventType: d > 0 ? EVENT.REVIEW : EVENT.VIOLATION,
      reason: `管理员人工调整：${note}`.slice(0, 200),
      sourceKey: `manual:${studentId}:${nowIso()}`
    });
    audit({
      actorType: 'admin', actorId: admin.id, role: '管理员', action: 'student.adjustCredit',
      targetType: 'student', targetId: studentId, result: 'allowed',
      detail: { delta: d, applied: res?.applied ?? 0, note }
    });
    return { ok: true, ...res };
  });
}

/* ---------------------------------------------------------------- 违规下架清单 */
export function forcedOffShelfList() {
  return all(
    `SELECT p.id, p.title, p.status, p.off_shelf_reason, p.review_note, p.reviewed_at,
            s.id AS seller_id, s.nickname
       FROM products p JOIN students s ON s.id=p.seller_id
      WHERE p.status=? AND p.off_shelf_reason=? AND p.deleted_at IS NULL
      ORDER BY p.reviewed_at DESC LIMIT 200`,
    P.OFF, OFF_REASON.ADMIN_OFF
  ).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    offShelfReason: r.off_shelf_reason,
    note: r.review_note,
    reviewedAt: r.reviewed_at,
    sellerId: r.seller_id,
    sellerNickname: r.nickname
  }));
}

/* ---------------------------------------------------------------- 审计检索 */
export function auditList({ limit = 100, action } = {}) {
  const rows = action
    ? all('SELECT * FROM audit_logs WHERE action=? ORDER BY at DESC LIMIT ?', action, limit)
    : all('SELECT * FROM audit_logs ORDER BY at DESC LIMIT ?', limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actorType: r.actor_type,
    actorId: r.actor_id,
    role: r.role,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    result: r.result,
    reasonCode: r.reason_code,
    detail: r.detail ? JSON.parse(r.detail) : null
  }));
}

/** 禁售清单（供后台审核下拉与前端展示） */
export function forbiddenList() {
  return { codes: forbiddenCategory };
}
