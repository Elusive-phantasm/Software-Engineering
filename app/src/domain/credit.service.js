/**
 * 信用分（BR-13 定义与阈值 / BR-14 变动事件）。
 *
 * BR-14 的四个事件：
 *   ① 评价加分       评价人 +2（每订单每人一次，不要求对方也评价）
 *   ② 违规处置       举报成立或商品被管理员强制下架，被处置方 −10
 *   ③ 未评价扣分     成交后 7 天内未评价，未评价方 −1（已撤销记录不适用）
 *   ④ 撤销违约       单方撤销成交且被判「计违约」，撤销方 −2（每笔成交最多一次）
 *
 * 两条硬约束：
 *   - 「每次变动必须生成一条信用记录」，且分数新值与流水在同一事务内落库（§6.4.1）；
 *   - 更新一律「原子增减 + 单条流水」，禁止「读当前值→计算→写回」的丢失更新
 *     （§5.5 第 7 条）。因此 credit_score 的更新用 SQL 表达式在库内完成，
 *     并在同一事务内回读结果用于截断判定，全程不跨请求。
 */
import { CREDIT } from '../core/config.js';
import { bizId } from '../core/crypto.js';
import { all, get, run } from '../core/db.js';
import { notify } from '../core/notifier.js';
import { nowIso } from '../core/time.js';
import { creditRecordView } from './view.js';

export const EVENT = {
  REVIEW: '评价加分',
  VIOLATION: '违规处置',
  NO_REVIEW: '未评价扣分',
  CANCEL_BREACH: '撤销违约'
};

/**
 * 应用一次信用变动。调用方必须已处于事务内。
 * @param {object} p
 * @param {string} p.studentId
 * @param {number} p.delta 期望变动值（+2 / -1 / -2 / -10）
 * @param {string} p.eventType EVENT 之一
 * @param {string} p.reason 变动原因说明
 * @param {string} [p.orderId] 关联订单
 * @param {string} [p.sourceKey] 幂等键，同一事件只记一次
 * @returns {{applied:number, score:number, recordId:string|null}|null}
 */
export function applyCreditChange({ studentId, delta, eventType, reason, orderId = null, sourceKey = null }) {
  const student = get('SELECT id, credit_score FROM students WHERE id=?', studentId);
  if (!student) return null;

  if (sourceKey) {
    const dup = get(
      'SELECT id FROM credit_records WHERE event_type=? AND source_key=?',
      eventType,
      sourceKey
    );
    if (dup) return { applied: 0, score: Number(student.credit_score), recordId: null, duplicate: true };
  }

  // 库内原子增减 + 越界截断（BR-13：0～150，边界值截断）
  run(
    `UPDATE students
        SET credit_score = MAX(?, MIN(?, credit_score + ?))
      WHERE id = ?`,
    CREDIT.min,
    CREDIT.max,
    Number(delta),
    studentId
  );
  const after = Number(get('SELECT credit_score FROM students WHERE id=?', studentId).credit_score);
  const applied = after - Number(student.credit_score);

  // 变动量为 0（已在上/下边界被截断）时不写流水：BR-14 规定变动值不允许 0
  if (applied === 0) {
    return { applied: 0, score: after, recordId: null };
  }

  const recordId = bizId('CR');
  run(
    `INSERT INTO credit_records (id, student_id, delta, event_type, reason, created_at, order_id, source_key)
     VALUES (?,?,?,?,?,?,?,?)`,
    recordId,
    studentId,
    applied,
    eventType,
    String(reason).slice(0, 200),
    nowIso(),
    orderId,
    sourceKey
  );

  notify({
    recipientId: studentId,
    msgType: '信用',
    title: '信用分变动',
    content: `你的信用分${applied > 0 ? '+' : ''}${applied}，当前 ${after} 分。原因：${reason}`,
    relatedKind: orderId ? 'order' : 'credit',
    relatedId: orderId || recordId
  });

  return { applied, score: after, recordId };
}

/** 当前分数与阈值提示（UC-15 辅事件流 D） */
export function creditSummary(studentId) {
  const s = get('SELECT credit_score FROM students WHERE id=?', studentId);
  if (!s) return null;
  const score = Number(s.credit_score);
  return {
    score,
    canPublish: score >= CREDIT.publishThreshold,
    canOrder: score >= CREDIT.orderThreshold,
    publishThreshold: CREDIT.publishThreshold,
    orderThreshold: CREDIT.orderThreshold,
    min: CREDIT.min,
    max: CREDIT.max,
    initial: CREDIT.initial
  };
}

/** 信用变动明细（仅本人与管理员可见，BR-13）。统一经 view 整形，避免把库字段名泄露到接口 */
export function creditRecords(studentId, limit = 100) {
  return all(
    `SELECT id, student_id, delta, event_type, reason, created_at, order_id
       FROM credit_records WHERE student_id=? ORDER BY created_at DESC, id DESC LIMIT ?`,
    studentId,
    limit
  ).map(creditRecordView);
}
