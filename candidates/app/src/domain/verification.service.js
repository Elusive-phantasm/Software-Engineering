/**
 * 学生证核验：UC-02 提交核验申请、UC-03 审核学生证。
 * 状态机：AT-01～AT-08（§7.4.2）。
 * 业务规则：BR-16（7 天提交 / 24 小时审核，均不自动通过）、BR-17（重提上限 3 次）、
 *          BR-18（伪造必须封禁）、BR-19（认证状态与账号状态分离）。
 * 非功能：NFR-08（学生证图片仅审核职责内管理员可读）。
 */
import { config } from '../core/config.js';
import { bizId } from '../core/crypto.js';
import { all, count, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify, notifyAllAdmins } from '../core/notifier.js';
import { CERT, validateRejectReason, validateStudentNo } from '../core/rules.js';
import { saveDataUrl } from '../core/storage.js';
import { nowIso } from '../core/time.js';
import { requireAdmin, requireCertified, requireStudent, roleOf } from './guards.js';
import { applyCreditChange, EVENT } from './credit.service.js';
import { offShelfAllForBannedSeller } from './product.service.js';
import { certApplicationView, selfStudent } from './view.js';

const RESUBMIT_LIMIT = config.certification.resubmitLimit;

/* ------------------------------------------------- UC-02 提交 / 重新提交核验 */
export function submitVerification(actor, { studentNo, image }) {
  const student = requireStudent(actor);
  if (actor.kind === 'admin') throw E.permission('管理员不经过学生证核验');

  if (student.cert_status === CERT.CERTIFIED) throw E.state(M.CERT_ALREADY);
  if (student.cert_status === CERT.PENDING) throw E.state(M.CERT_PENDING);
  // 未提交 或 已驳回 可提交。
  // BR-17：驳回后「最多重新提交 3 次」；§6.2.1 把该计数定义为「累计重新提交核验的次数」，
  // 因此计数在**重提成功时** +1（见下方 tx），此处允许 count < 3 的重提，第 4 次才拒绝。
  const isResubmit = student.cert_status === CERT.REJECTED;
  if (isResubmit && Number(student.resubmit_count) >= RESUBMIT_LIMIT) {
    throw E.state(M.CERT_NO_REUPLOAD);
  }
  const declaredNo = validateStudentNo(studentNo);
  if (!image) throw E.validation(M.CARD_IMAGE_INVALID);
  if (!String(image).startsWith('data:image/')) throw E.validation(M.CARD_IMAGE_INVALID);

  // 一学号一账号：申报学号不得已被其他「已认证」账号占用（UC-02 辅事件流 C）
  const occupied = get(
    `SELECT id FROM students WHERE student_no=? AND cert_status=? AND id<>?`,
    declaredNo,
    CERT.CERTIFIED,
    student.id
  );
  if (occupied) throw E.conflict(M.STUDENT_NO_TAKEN);

  const path = saveDataUrl(image, 'cert');
  const now = nowIso();

  return tx(() => {
    const appId = bizId('CERT');
    run(
      `INSERT INTO certification_applications
        (id, student_id, declared_no, card_image, submitted_at, review_status, reviewer_id, reviewed_at, reject_reason, forgery_flag)
       VALUES (?,?,?,?,?,?,NULL,NULL,NULL,0)`,
      appId, student.id, declaredNo, path, now, '待审核'
    );
    run('UPDATE students SET cert_status=? WHERE id=?', CERT.PENDING, student.id);
    if (isResubmit) {
      // 重新提交成功 → 累计重提次数 +1（上限 3，BR-17 / §6.2.1）
      run(
        'UPDATE students SET resubmit_count=? WHERE id=?',
        Math.min(RESUBMIT_LIMIT, Number(student.resubmit_count) + 1),
        student.id
      );
    }

    notify({
      recipientId: student.id,
      msgType: '核验',
      title: '核验申请已提交',
      content: '你的学生证核验申请已提交，管理员将在 24 小时内作出结论（BR-16）。审核期间可浏览与收藏，暂不可发布与交易。',
      relatedKind: 'cert',
      relatedId: appId
    });
    notifyAllAdmins({
      msgType: '核验',
      title: '新的学生证核验申请',
      content: `学生「${student.nickname}」提交了核验申请（申报学号 ${declaredNo}），请在 24 小时内审核。`,
      relatedKind: 'cert',
      relatedId: appId
    });
    audit({
      actorType: 'student', actorId: student.id, role: roleOf(actor),
      action: 'cert.submit', targetType: 'cert', targetId: appId, result: 'allowed'
    });
    return { application: certApplicationView(get('SELECT * FROM certification_applications WHERE id=?', appId)), student: selfStudent(get('SELECT * FROM students WHERE id=?', student.id)) };
  });
}

export function myApplications(actor) {
  const student = requireStudent(actor);
  const rows = all(
    'SELECT * FROM certification_applications WHERE student_id=? ORDER BY submitted_at DESC',
    student.id
  );
  return rows.map((r) => certApplicationView(r));
}

/* ------------------------------------------------------ UC-03 管理员审核队列 */
export function pendingApplications() {
  const rows = all(
    `SELECT a.*, s.nickname, s.real_name, s.resubmit_count, s.email
       FROM certification_applications a JOIN students s ON s.id = a.student_id
      WHERE a.review_status='待审核' ORDER BY a.submitted_at ASC`
  );
  return rows.map((r) =>
    certApplicationView(r, {
      nickname: r.nickname,
      realName: r.real_name,
      resubmitCount: Number(r.resubmit_count),
      email: r.email
    })
  );
}

export function applicationList({ status } = {}) {
  const conds = [];
  const args = [];
  if (status) {
    conds.push('a.review_status=?');
    args.push(status);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = all(
    `SELECT a.*, s.nickname, s.real_name, s.resubmit_count
       FROM certification_applications a JOIN students s ON s.id=a.student_id
       ${where} ORDER BY a.submitted_at DESC LIMIT 200`,
    ...args
  );
  return rows.map((r) =>
    certApplicationView(r, { nickname: r.nickname, realName: r.real_name, resubmitCount: Number(r.resubmit_count) })
  );
}

/** NFR-08：只有审核职责内的管理员可通过本接口读取学生证图片 */
export function applicationImage(actor, id) {
  requireAdmin(actor);
  const app = get('SELECT * FROM certification_applications WHERE id=?', id);
  if (!app) throw E.notFound('认证申请不存在');
  return app.card_image;
}

/* ------------------------------------------------------------ AT-03 核验通过 */
export function approveApplication(actor, id) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const app = get('SELECT * FROM certification_applications WHERE id=?', id);
    if (!app) throw E.notFound('认证申请不存在');
    if (app.review_status !== '待审核') throw E.state(M.NOT_PENDING);
    const student = get('SELECT * FROM students WHERE id=?', app.student_id);

    // 一学号一账号（并发下仍可能被抢占）
    const occupied = get(
      `SELECT id FROM students WHERE student_no=? AND cert_status=? AND id<>?`,
      app.declared_no, CERT.CERTIFIED, student.id
    );
    if (occupied) {
      // UC-02 辅事件流 C 的兜底：审核时发现学号已被占用，不得通过
      throw E.conflict(M.STUDENT_NO_TAKEN);
    }

    const now = nowIso();
    run(
      'UPDATE certification_applications SET review_status=?, reviewer_id=?, reviewed_at=? WHERE id=?',
      '已通过', admin.id, now, id
    );
    // 认证状态与账号状态分开记录（BR-19）：核验通过不解封
    run('UPDATE students SET cert_status=?, student_no=? WHERE id=?', CERT.CERTIFIED, app.declared_no, student.id);

    notify({
      recipientId: student.id,
      msgType: '核验',
      title: '学生证核验已通过',
      content: '你的学生证核验已通过，现在可以发布商品、下单、评价与举报。封禁状态不会因核验通过而解除（BR-19）。',
      relatedKind: 'cert',
      relatedId: id
    });
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'cert.approve', targetType: 'cert', targetId: id, result: 'allowed', detail: { studentId: student.id } });
    return { ok: true };
  });
}

/* ------------------------------------------------------------ AT-04 核验驳回 */
export function rejectApplication(actor, id, { reason, forgery = false }) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const app = get('SELECT * FROM certification_applications WHERE id=?', id);
    if (!app) throw E.notFound('认证申请不存在');
    if (app.review_status !== '待审核') throw E.state(M.NOT_PENDING);
    const note = validateRejectReason(reason);
    const student = get('SELECT * FROM students WHERE id=?', app.student_id);
    const now = nowIso();

    run(
      'UPDATE certification_applications SET review_status=?, reviewer_id=?, reviewed_at=?, reject_reason=?, forgery_flag=? WHERE id=?',
      '已驳回', admin.id, now, note, forgery ? 1 : 0, id
    );
    // 注意：计数口径为「累计重新提交次数」（§6.2.1），在重提成功时才 +1（AT-05）；
    // 驳回只改变认证状态，不再 +1——否则 BR-17「最多重提 3 次」实际只能重提 2 次。
    // 与 AT-04「驳回时重提次数 +1」的字面差异见 docs/06-实现与需求一致性说明.md §2.6。
    run('UPDATE students SET cert_status=? WHERE id=?', CERT.REJECTED, student.id);

    notify({
      recipientId: student.id,
      msgType: '核验',
      title: '学生证核验未通过',
      content: `核验未通过。原因：${note}。修改后可重新提交（剩余重提次数 ${RESUBMIT_LIMIT - Number(student.resubmit_count)} 次）。`,
      relatedKind: 'cert',
      relatedId: id
    });

    // BR-18：核实伪造的必须按违规处置 —— 应封禁账号并连带下架其全部在售与待审核商品
    if (forgery) {
      run('UPDATE students SET account_status=? WHERE id=?', '封禁', student.id);
      const offCount = offShelfAllForBannedSeller(student.id, admin.id);
      notify({
        recipientId: student.id,
        msgType: '处置',
        title: '账号已被封禁',
        content: `经核实，你提交的学生证存在伪造/冒用情形，账号已封禁，名下 ${offCount} 件在售与待审核商品已联动下架（BR-10、BR-18）。`,
        relatedKind: 'cert',
        relatedId: id
      });
      audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'cert.rejectForgery', targetType: 'cert', targetId: id, result: 'allowed', detail: { banned: true, offShelf: offCount } });
    } else {
      audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'cert.reject', targetType: 'cert', targetId: id, result: 'allowed', detail: { note } });
    }
    return { ok: true };
  });
}

/* ------------------------------------- AT-08 已认证后事后核实伪造（改回已驳回） */
export function revokeCertification(actor, studentId, { reason, deductCredit = true }) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const student = get('SELECT * FROM students WHERE id=?', studentId);
    if (!student) throw E.notFound('学生不存在');
    if (student.cert_status !== CERT.CERTIFIED) throw E.state('仅「已认证」账号可执行事后核实处置');
    const note = validateRejectReason(reason);

    run('UPDATE students SET cert_status=?, student_no=? WHERE id=?', CERT.REJECTED, student.student_no, studentId);
    // AT-08：同一处置动作中必须封禁账号（BR-18「应封禁」），并连带下架
    run('UPDATE students SET account_status=? WHERE id=?', '封禁', studentId);
    const offCount = offShelfAllForBannedSeller(studentId, admin.id);
    if (deductCredit) {
      applyCreditChange({
        studentId,
        delta: -10,
        eventType: EVENT.VIOLATION,
        reason: `经核实学生证伪造/冒用（AT-08）：${note}`,
        sourceKey: `violation:cert:${studentId}:${nowIso()}`
      });
    }
    notify({
      recipientId: studentId,
      msgType: '处置',
      title: '认证资格已撤销',
      content: `经事后核实，你的学生证存在伪造/冒用情形，认证状态已改回「已驳回」，账号已封禁，名下 ${offCount} 件商品已联动下架。`,
      relatedKind: 'cert'
    });
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'cert.revoke', targetType: 'student', targetId: studentId, result: 'allowed', detail: { note, offShelf: offCount } });
    return { ok: true };
  });
}

/** AT-06 / AT-07 超时统计（只读，供后台展示；判定与提醒在 scheduler 中） */
export function verificationStats() {
  const pending = count(`SELECT COUNT(*) FROM certification_applications WHERE review_status='待审核'`);
  const over24h = count(
    `SELECT COUNT(*) FROM certification_applications
      WHERE review_status='待审核' AND submitted_at <= ?`,
    nowIso()
  );
  const unsubmitted = count(`SELECT COUNT(*) FROM students WHERE cert_status='未提交'`);
  return { pending, unsubmitted };
}

/** 学生取本人认证状态摘要 */
export function myCertificationState(actor) {
  const student = requireStudent(actor);
  const latest = get(
    'SELECT * FROM certification_applications WHERE student_id=? ORDER BY submitted_at DESC LIMIT 1',
    student.id
  );
  return {
    certStatus: student.cert_status,
    resubmitCount: Number(student.resubmit_count),
    resubmitLimit: RESUBMIT_LIMIT,
    declaredNo: latest?.declared_no ?? null,
    latest: latest ? certApplicationView(latest) : null,
    verified: student.cert_status === CERT.CERTIFIED,
    canSubmit: [CERT.NONE, CERT.REJECTED].includes(student.cert_status) && Number(student.resubmit_count) < RESUBMIT_LIMIT
  };
}

export function requireCertifiedForTrade(actor) {
  return requireCertified(requireStudent(actor));
}
