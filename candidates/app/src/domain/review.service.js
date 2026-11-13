/**
 * 评价：UC-14 评价交易。
 * 业务规则：BR-08（仅有效成交的双方可各评一次、不可改、只有文字、7 天内、双方均提交后展示、
 * 已撤销成交不可评价）、BR-14 ①（评价人 +2）。
 */
import { CREDIT, DL } from '../core/config.js';
import { bizId } from '../core/crypto.js';
import { all, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify } from '../core/notifier.js';
import { ORDER, validateReviewContent } from '../core/rules.js';
import { addHours, isOverdue, nowIso } from '../core/time.js';
import { requireAdmin, requireCertifiedStudent, requireStudent, roleOf } from './guards.js';
import { applyCreditChange, EVENT } from './credit.service.js';
import { orderDetail } from './order.service.js';
import { reviewView } from './view.js';

/* ---------------------------------------------------------------- UC-14 提交 */
export function submitReview(actor, orderId, { content } = {}) {
  const student = requireCertifiedStudent(actor, M.ADMIN_CANNOT_REVIEW);
  const text = validateReviewContent(content);

  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=?', orderId);
    if (!o) throw E.notFound(M.ORDER_NOT_FOUND);
    if (o.buyer_id !== student.id && o.seller_id !== student.id) {
      throw E.permission(M.REVIEW_NOT_PARTICIPANT);
    }
    if (o.status === ORDER.CANCELLED) throw E.state(M.REVIEW_ORDER_REVOKED);   // BR-08 / BR-21
    if (get('SELECT id FROM reviews WHERE order_id=? AND reviewer_id=?', orderId, student.id)) {
      throw E.state(M.REVIEW_ALREADY);                                        // 辅事件流 C
    }
    const deadline = addHours(o.created_at, DL.reviewWindowHours);
    if (isOverdue(deadline)) throw E.state(M.REVIEW_WINDOW_CLOSED);            // 辅事件流 E

    const targetId = o.buyer_id === student.id ? o.seller_id : o.buyer_id;
    if (targetId === student.id) throw E.state(M.REVIEW_SELF);                 // 辅事件流 D

    const id = bizId('REV');
    run(
      `INSERT INTO reviews (id, order_id, reviewer_id, target_id, content, created_at)
       VALUES (?,?,?,?,?,?)`,
      id, orderId, student.id, targetId, text, nowIso()
    );
    run('UPDATE students SET review_count = review_count + 1 WHERE id=?', targetId);

    // BR-14 ①：提交评价方 +2（每订单每人一次，不要求对方也评价）
    applyCreditChange({
      studentId: student.id,
      delta: CREDIT.reviewBonus,
      eventType: EVENT.REVIEW,
      reason: '提交交易评价',
      orderId,
      sourceKey: `review:${orderId}:${student.id}`
    });

    notify({
      recipientId: targetId,
      msgType: '成交',
      title: '你收到一条交易评价',
      content: '对方已对这笔成交提交评价。双方均已提交后，评价将在你的个人主页展示（BR-08）。',
      relatedKind: 'order',
      relatedId: orderId
    });
    audit({
      actorType: 'student', actorId: student.id, role: roleOf(actor),
      action: 'review.submit', targetType: 'review', targetId: id, result: 'allowed',
      detail: { orderId, targetId }
    });

    return {
      review: reviewView(get('SELECT * FROM reviews WHERE id=?', id), {}),
      order: orderDetail(actor, orderId)
    };
  });
}

/* ------------------------------------------------- 公开评价（BR-08 双方均提交） */
export function publicReviewsOf(studentId) {
  const rows = all(
    `SELECT r.*, s.nickname AS reviewer_nickname
       FROM reviews r JOIN students s ON s.id = r.reviewer_id
      WHERE r.target_id=? AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC LIMIT 100`,
    studentId
  );
  // 只在「双方均已提交」后展示
  return rows
    .filter((r) => {
      const both = all(
        'SELECT reviewer_id FROM reviews WHERE order_id=? AND deleted_at IS NULL',
        r.order_id
      );
      return both.length >= 2;
    })
    .map((r) => reviewView(r, { reviewerNickname: r.reviewer_nickname }));
}

export function reviewsWrittenBy(actor) {
  const student = requireStudent(actor);
  const rows = all(
    `SELECT r.*, s.nickname AS target_nickname FROM reviews r
       JOIN students s ON s.id = r.target_id
      WHERE r.reviewer_id=? AND r.deleted_at IS NULL ORDER BY r.created_at DESC`,
    student.id
  );
  return rows.map((r) => reviewView(r, { targetNickname: r.target_nickname }));
}

export function reviewsReceivedBy(actor) {
  const student = requireStudent(actor);
  const rows = all(
    `SELECT r.*, s.nickname AS reviewer_nickname FROM reviews r
       JOIN students s ON s.id = r.reviewer_id
      WHERE r.target_id=? AND r.deleted_at IS NULL ORDER BY r.created_at DESC`,
    student.id
  );
  return rows.map((r) => reviewView(r, { reviewerNickname: r.reviewer_nickname }));
}

/* -------------------------------------------------------- 管理员删除他人评价 */
export function deleteReview(actor, reviewId, { reason } = {}) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const r = get('SELECT * FROM reviews WHERE id=?', reviewId);
    if (!r) throw E.notFound('评价不存在');
    if (r.deleted_at) throw E.state('该评价已删除');
    run('UPDATE reviews SET deleted_by=?, deleted_at=? WHERE id=?', admin.id, nowIso(), reviewId);
    run('UPDATE students SET review_count = MAX(0, review_count - 1) WHERE id=?', r.target_id);
    notify({
      recipientId: r.target_id,
      msgType: '处置',
      title: '一条评价已被管理员删除',
      content: `依据《§4.3 / BR-04 处置范围》，你收到的一条评价已被管理员删除。${reason ? `理由：${reason}` : ''}`,
      relatedKind: 'review',
      relatedId: reviewId
    });
    audit({
      actorType: 'admin', actorId: admin.id, role: '管理员',
      action: 'review.delete', targetType: 'review', targetId: reviewId, result: 'allowed',
      detail: { reason: reason || null }
    });
    return { ok: true };
  });
}
