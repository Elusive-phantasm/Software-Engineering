/**
 * 举报与处置：UC-12 举报违规商品或学生、UC-13 处理举报与违规处置。
 * 业务规则：BR-04（禁售清单闭集与举报受理范围）、BR-09、BR-10（封禁连带下架）、
 *          BR-14 ②（成立 −10）、BR-18。
 * 状态：ST-07（管理员违规下架）、ST-09（撤销处置）、ST-13（封禁联动下架）。
 */
import { CREDIT } from '../core/config.js';
import { bizId } from '../core/crypto.js';
import { all, count, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify, notifyAllAdmins } from '../core/notifier.js';
import {
  ACTIONS,
  ACTIONS_BY_TARGET,
  OFF_REASON,
  P,
  REPORT_STATUS,
  REPORT_TARGET,
  REPORT_TYPES,
  REPORT_TYPES_BY_TARGET,
  forbiddenCategory,
  validateReportReason
} from '../core/rules.js';
import { nowIso } from '../core/time.js';
import { requireAdmin, requireCertifiedStudent, requireStudent, roleOf } from './guards.js';
import { applyCreditChange, EVENT } from './credit.service.js';
import { offShelfAllForBannedSeller } from './product.service.js';
import { reportView } from './view.js';

function reportFull(row) {
  if (!row) return null;
  const reporter = get('SELECT nickname FROM students WHERE id=?', row.reporter_id);
  const product = row.target_product_id
    ? get('SELECT id, title, status FROM products WHERE id=?', row.target_product_id)
    : null;
  const target = row.target_student_id
    ? get('SELECT id, nickname, credit_score FROM students WHERE id=?', row.target_student_id)
    : null;
  return reportView(row, {
    reporterNickname: reporter?.nickname ?? null,
    targetProductTitle: product?.title ?? null,
    targetProductStatus: product?.status ?? null,
    targetStudentNickname: target?.nickname ?? null,
    allowedActions: ACTIONS_BY_TARGET[row.target_type] || ACTIONS
  });
}

/* ---------------------------------------------------------------- UC-12 举报 */
export function submitReport(actor, { targetType, targetId, type, reason }) {
  const student = requireCertifiedStudent(actor, M.ADMIN_CANNOT_REPORT);
  const kind = String(targetType || '').trim();
  if (![REPORT_TARGET.PRODUCT, REPORT_TARGET.STUDENT].includes(kind)) {
    throw E.validation('举报对象类型只能是「商品」或「学生」');
  }
  const typeV = String(type || '').trim();
  if (!REPORT_TYPES.includes(typeV)) throw E.validation('请选择有效的举报类型');
  // §6.2.1 一致性约束 2：类型与对象必须匹配
  if (!REPORT_TYPES_BY_TARGET[kind].includes(typeV)) throw E.validation(M.REPORT_TYPE_MISMATCH);
  const reasonV = validateReportReason(reason);
  const id = String(targetId || '').trim();
  if (!id) throw E.validation('请选择举报对象');

  return tx(() => {
    let productId = null;
    let studentId = null;

    if (kind === REPORT_TARGET.PRODUCT) {
      const product = get('SELECT * FROM products WHERE id=?', id);
      if (!product || product.deleted_at) throw E.notFound(M.PRODUCT_GONE);
      if (product.seller_id === student.id) throw E.state(M.REPORT_SELF_PRODUCT);   // 辅事件流 B
      productId = product.id;
    } else {
      if (id === student.id) throw E.state(M.REPORT_SELF);                          // 辅事件流 F
      const target = get('SELECT * FROM students WHERE id=?', id);
      if (!target) throw E.notFound('被举报用户不存在');
      // 辅事件流 C：只能举报与之发生过交易或沟通的用户
      const deal = get(
        `SELECT id FROM orders
          WHERE (buyer_id=? AND seller_id=?) OR (buyer_id=? AND seller_id=?) LIMIT 1`,
        student.id, id, id, student.id
      );
      const chat = get(
        `SELECT id FROM messages
          WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) LIMIT 1`,
        student.id, id, id, student.id
      );
      if (!deal && !chat) throw E.permission(M.REPORT_NO_RELATION);
      studentId = id;
    }

    const dup = get(
      'SELECT id FROM reports WHERE reporter_id=? AND target_type=? AND target_key=?',
      student.id, kind, id
    );
    if (dup) throw E.state(M.REPORT_DUPLICATE);                                     // 辅事件流 A

    const reportId = bizId('RPT');
    run(
      `INSERT INTO reports
        (id, reporter_id, target_type, target_product_id, target_student_id, target_key, type, reason, created_at, handle_status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      reportId, student.id, kind, productId, studentId, id, typeV, reasonV, nowIso(), REPORT_STATUS.PENDING
    );

    notifyAllAdmins({
      msgType: '处置',
      title: '收到新的举报',
      content: `学生「${student.nickname}」提交了一条${kind}举报（类型：${typeV}），请在 24 小时内处理。`,
      relatedKind: 'report',
      relatedId: reportId
    });
    notify({
      recipientId: student.id,
      msgType: '处置',
      title: '举报已受理',
      content: `你的举报已受理（编号 ${reportId}），管理员核实后会在「我的举报」中更新进度。`,
      relatedKind: 'report',
      relatedId: reportId
    });
    audit({
      actorType: 'student', actorId: student.id, role: roleOf(actor),
      action: 'report.submit', targetType: 'report', targetId: reportId, result: 'allowed',
      detail: { targetType: kind, targetKey: id, type: typeV }
    });

    return reportFull(get('SELECT * FROM reports WHERE id=?', reportId));
  });
}

export function myReports(actor) {
  const student = requireStudent(actor, M.ADMIN_CANNOT_REPORT);
  const rows = all('SELECT * FROM reports WHERE reporter_id=? ORDER BY created_at DESC', student.id);
  return rows.map(reportFull);
}

/* ------------------------------------------------------------ UC-13 处理举报 */
export function pendingReports() {
  const rows = all(`SELECT * FROM reports WHERE handle_status=? ORDER BY created_at ASC`, REPORT_STATUS.PENDING);
  return rows.map(reportFull);
}

export function allReports({ status } = {}) {
  const rows = status
    ? all('SELECT * FROM reports WHERE handle_status=? ORDER BY created_at DESC LIMIT 300', status)
    : all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 300');
  return rows.map(reportFull);
}

/**
 * 处理举报。
 * @param {object} actor 管理员
 * @param {string} reportId
 * @param {object} p
 * @param {boolean} p.upheld 是否成立
 * @param {string[]} [p.actions] 处置手段（五项清单中的子集）
 * @param {string} p.result 处理结果说明
 * @param {string} [p.categoryCode] 命中 §4.3 类目编号（违禁品类举报必填）
 */
export function handleReport(actor, reportId, { upheld, actions = [], result, categoryCode = null }) {
  const admin = requireAdmin(actor);

  return tx(() => {
    const report = get('SELECT * FROM reports WHERE id=?', reportId);
    if (!report) throw E.notFound('举报不存在');
    if (report.handle_status !== REPORT_STATUS.PENDING) throw E.state(M.REPORT_ALREADY_HANDLED);

    const resultText = String(result || '').trim();
    if (!resultText) throw E.validation(M.ADMIN_REASON_REQUIRED);
    const now = nowIso();

    /* ------------------------------ 不成立：标记已驳回，不产生任何处置 ------------------------------ */
    if (!upheld) {
      run(
        `UPDATE reports SET handle_status=?, result=?, handler_admin_id=?, handled_at=?, actions=NULL
          WHERE id=?`,
        REPORT_STATUS.REJECTED, resultText, admin.id, now, reportId
      );
      notify({
        recipientId: report.reporter_id,
        msgType: '处置',
        title: '举报处理结果：不成立',
        content: `你提交的举报经核实不成立，已驳回。恶意举报可能被反向处置。`,
        relatedKind: 'report',
        relatedId: reportId
      });
      audit({
        actorType: 'admin', actorId: admin.id, role: '管理员', action: 'report.reject',
        targetType: 'report', targetId: reportId, result: 'allowed', detail: { result: resultText }
      });
      return reportFull(get('SELECT * FROM reports WHERE id=?', reportId));
    }

    /* ------------------------------------------ 成立：按对象类型执行处置手段 ------------------------------------------ */
    const picked = (Array.isArray(actions) ? actions : []).filter((a) => ACTIONS.includes(a));
    if (!picked.length) throw E.validation(M.REPORT_ACTIONS_REQUIRED);
    if (report.target_type === REPORT_TARGET.STUDENT && picked.includes('强制下架商品')) {
      throw E.validation(M.REPORT_ACTION_MISMATCH);
    }
    // 「收款不履约」核实成立 → 应同时封禁（UC-13 辅事件流 G）
    if (report.type === '收款不履约' && !picked.includes('封禁账号')) picked.push('封禁账号');

    const product = report.target_product_id
      ? get('SELECT * FROM products WHERE id=?', report.target_product_id)
      : null;
    const targetStudentId = report.target_type === REPORT_TARGET.STUDENT
      ? report.target_student_id
      : product?.seller_id ?? null;
    if (!targetStudentId) throw E.internal('举报对象已不可用，无法处置');

    let offShelfDone = false;

    // ① 强制下架商品（ST-07）。已售出商品不可下架 → 仅记录结论（辅事件流 F）
    if (report.target_type === REPORT_TARGET.PRODUCT && picked.includes('强制下架商品')) {
      if (product && !product.deleted_at && (product.status === P.ON_SALE || product.status === P.PENDING)) {
        const code = categoryCode && forbiddenCategory(categoryCode) ? String(categoryCode).toUpperCase() : null;
        const note = `举报 ${reportId} 核实成立${code ? `（§4.3 ${code} ${forbiddenCategory(code).name}）` : ''}：${resultText}`.slice(0, 200);
        run(
          'UPDATE products SET status=?, off_shelf_reason=?, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?',
          P.OFF, OFF_REASON.ADMIN_OFF, note, admin.id, now, product.id
        );
        offShelfDone = true;
        notify({
          recipientId: targetStudentId,
          msgType: '处置',
          title: '商品因违规被强制下架',
          content: `商品《${product.title}》经核实违规，已被强制下架。原因：${note}。如认为处置有误，可在该商品的站内私信向管理员提出异议。`,
          relatedKind: 'product',
          relatedId: product.id
        });
      }
    }

    // ② 扣信用分（BR-14 ②）：−10，每份举报只扣一次
    if (picked.includes('扣信用分') || picked.includes('强制下架商品')) {
      applyCreditChange({
        studentId: targetStudentId,
        delta: CREDIT.violationPenalty,
        eventType: EVENT.VIOLATION,
        reason: `举报 ${reportId} 核实成立：${resultText}`.slice(0, 200),
        sourceKey: `violation:report:${reportId}`
      });
    }

    // ③ 封禁账号 → 同一动作内连带下架其在售与待审核商品（BR-10 / ST-13）
    let bannedCount = 0;
    if (picked.includes('封禁账号')) {
      run('UPDATE students SET account_status=? WHERE id=?', '封禁', targetStudentId);
      bannedCount = offShelfAllForBannedSeller(targetStudentId, admin.id);
      notify({
        recipientId: targetStudentId,
        msgType: '处置',
        title: '账号已被封禁',
        content: `经核实违规成立，你的账号已被封禁，名下 ${bannedCount} 件在售与待审核商品已联动下架（BR-10）。封禁不改变你的认证状态（BR-19）。`,
        relatedKind: 'report',
        relatedId: reportId
      });
    } else if (picked.includes('限制发布')) {
      run('UPDATE students SET account_status=? WHERE id=?', '受限', targetStudentId);
    }

    // ④ 对象为学生的举报成立 → 被核实争议数 +1（公开计数）
    if (report.target_type === REPORT_TARGET.STUDENT) {
      run(
        'UPDATE students SET verified_dispute_count = verified_dispute_count + 1 WHERE id=?',
        targetStudentId
      );
    }

    const code = categoryCode && forbiddenCategory(categoryCode) ? String(categoryCode).toUpperCase() : null;
    run(
      `UPDATE reports SET handle_status=?, actions=?, violation_codes=?, result=?, handler_admin_id=?, handled_at=?
        WHERE id=?`,
      REPORT_STATUS.HANDLED, JSON.stringify(picked), code, resultText, admin.id, now, reportId
    );

    notify({
      recipientId: report.reporter_id,
      msgType: '处置',
      title: '举报处理结果：成立',
      content: `你提交的举报经核实成立，已执行处置：${picked.join('、')}。处理结果：${resultText}`,
      relatedKind: 'report',
      relatedId: reportId
    });
    if (!picked.includes('封禁账号')) {
      notify({
        recipientId: targetStudentId,
        msgType: '处置',
        title: '你被举报的事项已核实成立',
        content: `处理结果：${resultText}。已执行处置：${picked.join('、')}。`,
        relatedKind: 'report',
        relatedId: reportId
      });
    }

    audit({
      actorType: 'admin', actorId: admin.id, role: '管理员', action: 'report.handle',
      targetType: 'report', targetId: reportId, result: 'allowed',
      detail: { upheld: true, actions: picked, offShelfDone, bannedCount, code }
    });

    return reportFull(get('SELECT * FROM reports WHERE id=?', reportId));
  });
}

/** 举报统计（后台看板） */
export function reportStats() {
  return {
    pending: count(`SELECT COUNT(*) FROM reports WHERE handle_status='待处理'`),
    handled: count(`SELECT COUNT(*) FROM reports WHERE handle_status='已处理'`),
    rejected: count(`SELECT COUNT(*) FROM reports WHERE handle_status='已驳回'`)
  };
}
