/**
 * 定时任务（需求文档中没有「定时任务」这个用例，但以下判定必须由系统完成）：
 *   AT-06  学生证审核超 24 小时 → 提醒管理员、计入超时统计，**不得自动通过**
 *   AT-07  注册满 7 天未提交核验 → 每日提醒一次，**不得自动驳回或封禁**
 *   商品审核队列超 24 小时、举报超 24 小时未处理 → 提醒管理员（只提醒，不自动处置）
 *   BR-14 ③ 成交满 7 天未评价 → 未评价方 −1
 *   UC-31 辅事件流 C 撤销满 7 天对方未判定 → 系统自动置「计违约」，撤销方 −2
 *
 * 时间一律以服务端 nowMs() 为准（§4.1.1 第 4 条），左闭右开判定。
 * 所有扣分都走带幂等键的 applyCreditChange，重复执行不会重复扣分。
 */
import { CREDIT, DL } from '../core/config.js';
import { get, all, run, tx } from '../core/db.js';
import { notify, notifyAllAdmins } from '../core/notifier.js';
import { addHours, isOverdue, iso, nowIso, nowMs, sameLocalDay } from '../core/time.js';
import { applyCreditChange, EVENT } from './credit.service.js';

const DEDUPE_HOURS = 6;

function recentlyNotified(msgType, relatedId) {
  const since = iso(nowMs() - DEDUPE_HOURS * 3600 * 1000);
  return !!get(
    `SELECT id FROM notifications
      WHERE msg_type=? AND related_id=? AND created_at>=? LIMIT 1`,
    msgType,
    relatedId,
    since
  );
}

/* ------------------------------------------------- AT-07 核验提交期限提醒 */
function taskCertSubmitReminder(result) {
  const students = all(
    `SELECT id, registered_at, last_cert_reminder_at FROM students WHERE cert_status='未提交'`
  );
  for (const s of students) {
    const deadline = addHours(s.registered_at, DL.certSubmitWindowHours);
    if (!isOverdue(deadline)) continue;
    if (sameLocalDay(s.last_cert_reminder_at, nowIso())) continue; // 每日一次
    notify({
      recipientId: s.id,
      msgType: '核验',
      title: '请尽快提交学生证核验',
      content:
        '你已注册满 7 天但尚未提交学生证核验。未通过核验前可以浏览与收藏，但无法发布商品、下单、评价与举报。',
      relatedKind: 'cert'
    });
    run('UPDATE students SET last_cert_reminder_at=? WHERE id=?', nowIso(), s.id);
    result.certReminders++;
  }
}

/* ------------------------------- BR-14 ③ 成交满 7 天未评价 → 未评价方 −1 */
function taskNoReviewPenalty(result) {
  const orders = all(`SELECT * FROM orders WHERE status='有效'`);
  for (const o of orders) {
    const deadline = addHours(o.created_at, DL.noReviewPenaltyAfterHours);
    if (!isOverdue(deadline)) continue;
    for (const [role, studentId] of [
      ['buyer', o.buyer_id],
      ['seller', o.seller_id]
    ]) {
      const reviewed = get('SELECT id FROM reviews WHERE order_id=? AND reviewer_id=?', o.id, studentId);
      if (reviewed) continue;
      const res = tx(() =>
        applyCreditChange({
          studentId,
          delta: CREDIT.noReviewPenalty,
          eventType: EVENT.NO_REVIEW,
          reason: '成交后 7 天内未提交评价',
          orderId: o.id,
          sourceKey: `noreview:${o.id}:${studentId}`
        })
      );
      if (res && res.applied !== 0) result.noReviewPenalties++;
    }
  }
}

/* --------------------------- UC-31 C 撤销满 7 天未判定 → 自动「计违约」 */
function taskCancelJudgementTimeout(result) {
  const orders = all(
    `SELECT * FROM orders WHERE status='已撤销' AND cancel_judgement='待判定'`
  );
  for (const o of orders) {
    const deadline = addHours(o.cancelled_at, DL.cancelJudgementWindowHours);
    if (!isOverdue(deadline)) continue;
    const done = tx(() => {
      // 与「对方人工判定」竞态：先落库者为准（§5.5 第 7 条）
      const upd = run(
        `UPDATE orders SET cancel_judgement='计违约', judgement_at=?
          WHERE id=? AND cancel_judgement='待判定'`,
        nowIso(),
        o.id
      );
      if (!upd.changes) return false;
      applyCreditChange({
        studentId: o.cancel_initiator_id,
        delta: CREDIT.cancelPenalty,
        eventType: EVENT.CANCEL_BREACH,
        reason: '撤销成交后 7 天内对方未作判定，系统自动计违约',
        orderId: o.id,
        sourceKey: `cancel:${o.id}`
      });
      const peer = get(
        'SELECT id FROM students WHERE id=?',
        o.cancel_initiator_id === o.buyer_id ? o.seller_id : o.buyer_id
      );
      notify({
        recipientId: peer?.id || '',
        msgType: '成交',
        title: '撤销免责判定已超时',
        content: '你在 7 天内未对这笔撤销作出判定，系统已自动计对方违约（对方信用分 −2）。',
        relatedKind: 'order',
        relatedId: o.id
      });
      notify({
        recipientId: o.cancel_initiator_id,
        msgType: '成交',
        title: '撤销被判计违约',
        content: '你发起的撤销在 7 天内未获对方免责判定，系统已自动计违约，信用分 −2。',
        relatedKind: 'order',
        relatedId: o.id
      });
      return true;
    });
    if (done) result.cancelAutoJudgements++;
  }
}

/* --------------------- AT-06 / 商品审核 / 举报处理 24 小时超时提醒 */
function taskTimeoutReminders(result) {
  // 学生证审核
  const certs = all(
    `SELECT id, submitted_at FROM certification_applications WHERE review_status='待审核'`
  );
  for (const c of certs) {
    if (!isOverdue(addHours(c.submitted_at, DL.certReviewTimeoutHours))) continue;
    if (recentlyNotified('核验', c.id)) continue;
    notifyAllAdmins({
      msgType: '核验',
      title: '学生证核验已超时',
      content: `认证申请 ${c.id} 已超过 24 小时未出结论，请尽快审核（系统不会自动通过）。`,
      relatedKind: 'cert',
      relatedId: c.id
    });
    result.certTimeouts++;
  }

  // 商品审核
  const products = all(`SELECT id, title, published_at FROM products WHERE status='待审核'`);
  for (const p of products) {
    if (!isOverdue(addHours(p.published_at, DL.productReviewTimeoutHours))) continue;
    if (recentlyNotified('商品审核', p.id)) continue;
    notifyAllAdmins({
      msgType: '商品审核',
      title: '商品审核已超时',
      content: `商品《${p.title}》已超过 24 小时未审核，请尽快处理。`,
      relatedKind: 'product',
      relatedId: p.id
    });
    result.productTimeouts++;
  }

  // 举报处理
  const reports = all(`SELECT id FROM reports WHERE handle_status='待处理'`);
  for (const r of reports) {
    const row = get('SELECT created_at FROM reports WHERE id=?', r.id);
    if (!isOverdue(addHours(row.created_at, DL.reportHandleTimeoutHours))) continue;
    if (recentlyNotified('处置', r.id)) continue;
    notifyAllAdmins({
      msgType: '处置',
      title: '举报处理已超时',
      content: `举报 ${r.id} 已超过 24 小时未处理，请尽快判定。`,
      relatedKind: 'report',
      relatedId: r.id
    });
    result.reportTimeouts++;
  }
}

/**
 * 执行一轮全部时间判定任务。
 * 导出供验收测试直接调用（配合 /api/dev/time-shift 时间偏移，可验证 7 天/24 小时边界）。
 */
export function runScheduler() {
  const result = {
    at: nowIso(),
    certReminders: 0,
    noReviewPenalties: 0,
    cancelAutoJudgements: 0,
    certTimeouts: 0,
    productTimeouts: 0,
    reportTimeouts: 0
  };
  taskCertSubmitReminder(result);
  taskNoReviewPenalty(result);
  taskCancelJudgementTimeout(result);
  taskTimeoutReminders(result);
  return result;
}

let timer = null;
export function startScheduler(intervalMs = 30000) {
  if (timer) return timer;
  timer = setInterval(() => {
    try {
      runScheduler();
    } catch (err) {
      console.warn('[scheduler] 执行失败：', err.message);
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}
export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
