/**
 * 账号与登录：UC-01 注册与登录、UC-04 管理员登录、UC-34 找回密码。
 * 相关非功能：NFR-05（连续失败 5 次锁定 15 分钟）、NFR-10（邮箱验证码安全）。
 */
import { config, CREDIT, L } from '../core/config.js';
import { bizId, codeDigest, hashPassword, numericCode, safeEqual, verifyPassword } from '../core/crypto.js';
import { addHours, isOverdue, iso, nowIso, nowMs } from '../core/time.js';
import { get, all, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { sendMail } from '../core/mailer.js';
import { notify } from '../core/notifier.js';
import { createSession, revokeAllSessions, revokeSessionById } from '../core/session.js';
import {
  validateEmail,
  validateNickname,
  validatePassword,
  validatePhone,
  validateRealName
} from '../core/rules.js';
import { selfStudent } from './view.js';

const SEC = config.security;

/* ------------------------------------------------------------------ 验证码 */
function assertCodeRate(email) {
  const list = all(
    `SELECT created_at FROM email_codes WHERE email=? ORDER BY created_at DESC`,
    email
  );
  const now = nowMs();
  if (list.length) {
    const last = Date.parse(list[0].created_at);
    if (now - last < SEC.codeResendSeconds * 1000) throw E.rateLimit(M.CODE_TOO_FREQUENT);
  }
  const dayAgo = iso(now - 24 * 3600 * 1000);
  const dayCount = list.filter((r) => Date.parse(r.created_at) >= Date.parse(dayAgo)).length;
  if (dayCount >= SEC.codeDailyLimit) throw E.rateLimit(M.CODE_DAILY_LIMIT);
}

function issueCode(email, purpose) {
  // 清理过期记录（保留期建议 7 天，§6.2.1 邮箱验证码）
  run(
    `DELETE FROM email_codes WHERE created_at < ?`,
    iso(nowMs() - config.security.codeRetentionDays * 24 * 3600 * 1000)
  );
  const code = numericCode(SEC.codeLength);
  const id = bizId('EC');
  run(
    `INSERT INTO email_codes (id, email, purpose, code_hash, created_at, expires_at, used, fail_count)
     VALUES (?,?,?,?,?,?,0,0)`,
    id,
    email,
    purpose,
    codeDigest(email, purpose, code),
    nowIso(),
    iso(nowMs() + SEC.codeTtlMinutes * 60 * 1000)
  );
  return { id, code };
}

/**
 * 校验验证码。成功返回记录（由调用方在同一事务内置 used=1）；
 * 失败按 NFR-10 ④ 累计错误次数，满 5 次作废。
 */
function verifyCode(email, purpose, code) {
  const rec = get(
    `SELECT * FROM email_codes WHERE email=? AND purpose=? AND used=0
      ORDER BY created_at DESC LIMIT 1`,
    email,
    purpose
  );
  if (!rec) throw E.validation(M.CODE_INVALID);
  if (Number(rec.fail_count) >= SEC.codeMaxFails) throw E.validation(M.CODE_INVALID);
  if (isOverdue(rec.expires_at)) throw E.validation(M.CODE_INVALID);

  const ok = safeEqual(rec.code_hash, codeDigest(email, purpose, String(code ?? '').trim()));
  if (!ok) {
    const fails = Number(rec.fail_count) + 1;
    run(
      'UPDATE email_codes SET fail_count=?, used=? WHERE id=?',
      fails,
      fails >= SEC.codeMaxFails ? 1 : 0,
      rec.id
    );
    throw E.validation(M.CODE_INVALID);
  }
  return rec;
}

function consumeCode(rec) {
  run('UPDATE email_codes SET used=1 WHERE id=?', rec.id);
}

function mailBody({ code, purpose }) {
  return [
    '同学你好：',
    '',
    `你正在拾光二手（校园二手交易平台）进行${purpose}操作，验证码为：`,
    '',
    `    ${code}`,
    '',
    `验证码 ${SEC.codeTtlMinutes} 分钟内有效，且只能使用一次；连续输错 ${SEC.codeMaxFails} 次即作废。`,
    '如非本人操作，请忽略本邮件。',
    '',
    '—— 拾光二手（本邮件由系统自动发送）'
  ].join('\r\n');
}

/* ------------------------------------------------------ UC-01 发送注册验证码 */
export async function sendRegisterCode(rawEmail, meta = {}) {
  const email = validateEmail(rawEmail);
  const exists = get('SELECT id FROM students WHERE email=?', email);
  if (exists) {
    audit({ actorType: 'guest', role: '游客', action: 'auth.register.sendCode', targetType: 'email', targetId: email, result: 'denied', reasonCode: 'EMAIL_TAKEN' });
    throw E.conflict(M.EMAIL_TAKEN);
  }
  assertCodeRate(email);
  const { code } = issueCode(email, '注册');
  const res = await sendMail({ to: email, subject: '【拾光二手】注册验证码', text: mailBody({ code, purpose: '注册' }) });
  if (!res.ok) throw E.internal(M.MAIL_FAILED);
  audit({ actorType: 'guest', role: '游客', action: 'auth.register.sendCode', targetType: 'email', targetId: email, result: 'allowed', detail: { transport: res.transport } });
  return { ok: true, message: '验证码已发送，请查收邮箱', transport: res.transport };
}

/* ---------------------------------------------------------------- UC-01 注册 */
export function register({ email: rawEmail, code, nickname, realName, password, phone, agree }) {
  const email = validateEmail(rawEmail);
  const nick = validateNickname(nickname);
  const realNameV = validateRealName(realName);
  const pwd = validatePassword(password);
  const phoneV = validatePhone(phone);
  if (!agree) throw E.validation(M.AGREEMENT_REQUIRED);

  return tx(() => {
    if (get('SELECT id FROM students WHERE email=?', email)) throw E.conflict(M.EMAIL_TAKEN);
    const rec = verifyCode(email, '注册', code);
    consumeCode(rec);

    const now = nowIso();
    const id = bizId('STU');
    run(
      `INSERT INTO students
        (id, email, student_no, nickname, real_name, password_hash, registered_at,
         cert_status, account_status, phone, dorm, credit_score, review_count,
         verified_dispute_count, resubmit_count, failed_login_count, created_at)
       VALUES (?,?,NULL,?,?,?,?,?,?,?,NULL,?,0,0,0,0,?)`,
      id,
      email,
      nick,
      realNameV,
      hashPassword(pwd),
      now,
      '未提交',
      '正常',
      phoneV,
      CREDIT.initial,
      now
    );
    notify({
      recipientId: id,
      msgType: '核验',
      title: '注册成功，请提交学生证核验',
      content: '账号已创建。请上传学生证并申报学号；核验通过后才能发布商品与下单（BR-01）。',
      relatedKind: 'cert'
    });
    audit({ actorType: 'student', actorId: id, role: '未认证学生', action: 'auth.register', targetType: 'student', targetId: id, result: 'allowed' });
    return selfStudent(get('SELECT * FROM students WHERE id=?', id));
  });
}

/* ------------------------------------------------- 登录失败计数与锁定（NFR-05） */
/** 学生实体字段名是 failed_login_count，管理员实体是 failed_count（见 §6.2.1） */
const FAIL_COLUMN = { students: 'failed_login_count', admins: 'failed_count' };

function checkLock(row) {
  if (row.locked_until && !isOverdue(row.locked_until)) throw E.rateLimit(M.ACCOUNT_LOCKED);
}

function countFailure(table, id) {
  const col = FAIL_COLUMN[table];
  const row = get(`SELECT * FROM ${table} WHERE id=?`, id);
  // 锁定期间再次尝试不延长既有锁定截止时间（NFR-05 验收口径）
  if (row.locked_until && !isOverdue(row.locked_until)) return;
  const next = Number(row[col]) + 1;
  if (next >= SEC.loginFailLimit) {
    run(
      `UPDATE ${table} SET ${col}=?, locked_until=? WHERE id=?`,
      next,
      iso(nowMs() + SEC.lockMinutes * 60 * 1000),
      id
    );
  } else {
    run(`UPDATE ${table} SET ${col}=? WHERE id=?`, next, id);
  }
}

function clearFailure(table, id) {
  run(`UPDATE ${table} SET ${FAIL_COLUMN[table]}=0, locked_until=NULL WHERE id=?`, id);
}

/* ---------------------------------------------------------------- UC-01 登录 */
export function loginStudent({ email: rawEmail, password }, meta = {}) {
  const email = validateEmail(rawEmail);
  const row = get('SELECT * FROM students WHERE email=?', email);
  if (!row) {
    audit({ actorType: 'guest', role: '游客', action: 'auth.login', targetType: 'email', targetId: email, result: 'failed', reasonCode: 'BAD_CREDENTIAL' });
    throw E.auth(M.LOGIN_FAILED);
  }
  checkLock(row);
  if (!verifyPassword(password, row.password_hash)) {
    countFailure('students', row.id);
    audit({ actorType: 'student', actorId: row.id, role: '游客', action: 'auth.login', targetType: 'student', targetId: row.id, result: 'failed', reasonCode: 'BAD_CREDENTIAL' });
    throw E.auth(M.LOGIN_FAILED);
  }
  if (row.account_status === '封禁') {
    // 封禁账号拒绝登录（UC-01 辅事件流 E）
    audit({ actorType: 'student', actorId: row.id, role: '未认证学生', action: 'auth.login', targetType: 'student', targetId: row.id, result: 'denied', reasonCode: 'ACCOUNT_BANNED' });
    throw E.permission(M.ACCOUNT_BANNED_LOGIN);
  }

  clearFailure('students', row.id);
  const { token, expiresAt } = createSession('student', row.id, meta);
  if (config.features.loginSuccessNotification !== false) {
    notify({
      recipientId: row.id,
      msgType: '账号',
      title: '登录成功',
      content: `你的账号于 ${nowIso()} 登录。若非本人操作，请立即通过邮箱验证码重置密码。`,
      relatedKind: 'account'
    });
  }
  audit({ actorType: 'student', actorId: row.id, role: row.cert_status === '已认证' ? '已认证学生' : '未认证学生', action: 'auth.login', targetType: 'student', targetId: row.id, result: 'allowed' });
  return {
    token,
    expiresAt,
    student: selfStudent(get('SELECT * FROM students WHERE id=?', row.id)),
    restrictedNotice: row.account_status === '受限' ? '账号当前为受限状态：部分操作会被限制（BR-13）' : null
  };
}

export function logout(session) {
  if (session?.id) revokeSessionById(session.id);
  return { ok: true };
}

/* ---------------------------------------------------------- UC-34 找回密码 */
export async function forgotSendCode(rawEmail) {
  const email = validateEmail(rawEmail);
  const student = get('SELECT id FROM students WHERE email=?', email);
  // 防账号枚举：无论邮箱是否存在，都返回同一提示（NFR-10 ⑤）
  if (!student) {
    audit({ actorType: 'guest', role: '游客', action: 'auth.forgot.sendCode', targetType: 'email', targetId: email, result: 'denied', reasonCode: 'EMAIL_NOT_FOUND_SILENT' });
    return { ok: true, message: M.FORGOT_SENT };
  }
  try {
    assertCodeRate(email);
  } catch (err) {
    throw err; // 频控对存在的账号给出明确失败（NFR-10 ③）
  }
  const { code } = issueCode(email, '找回密码');
  const res = await sendMail({ to: email, subject: '【拾光二手】找回密码验证码', text: mailBody({ code, purpose: '找回密码' }) });
  if (!res.ok) throw E.internal(M.MAIL_FAILED);
  audit({ actorType: 'guest', role: '游客', action: 'auth.forgot.sendCode', targetType: 'student', targetId: student.id, result: 'allowed' });
  return { ok: true, message: M.FORGOT_SENT };
}

export function resetPassword({ email: rawEmail, code, newPassword }) {
  const email = validateEmail(rawEmail);
  const pwd = validatePassword(newPassword);
  const student = get('SELECT * FROM students WHERE email=?', email);
  // 邮箱不存在时同样返回「验证码错误或已失效」，与其他失败路径无差异
  if (!student) throw E.validation(M.CODE_INVALID);

  return tx(() => {
    const rec = verifyCode(email, '找回密码', code);
    if (verifyPassword(pwd, student.password_hash)) throw E.validation(M.PASSWORD_SAME);
    consumeCode(rec);
    run('UPDATE students SET password_hash=? WHERE id=?', hashPassword(pwd), student.id);
    // 重置成功后该账号所有既有会话立即失效（NFR-10 ⑥）
    revokeAllSessions('student', student.id);
    notify({
      recipientId: student.id,
      msgType: '核验',
      title: '密码已重置',
      content: '你的登录密码已通过邮箱验证码重置，原登录会话已全部失效。如非本人操作，请立即联系管理员。',
      relatedKind: 'account'
    });
    audit({ actorType: 'student', actorId: student.id, role: '未认证学生', action: 'auth.resetPassword', targetType: 'student', targetId: student.id, result: 'allowed' });
    return { ok: true, message: '密码已重置，请用新密码登录' };
  });
}

/* ------------------------------------------------------------- 个人资料维护 */
export function updateProfile(student, { nickname, phone, dorm, realName }) {
  const patch = {};
  if (nickname !== undefined) patch.nickname = validateNickname(nickname);
  if (phone !== undefined) patch.phone = validatePhone(phone);
  if (dorm !== undefined) patch.dorm = dorm == null || String(dorm).trim() === '' ? null : String(dorm).trim().slice(0, L.dormMaxLen);
  if (realName !== undefined) patch.realName = validateRealName(realName);
  const sets = [];
  const args = [];
  if (patch.nickname) {
    sets.push('nickname=?');
    args.push(patch.nickname);
  }
  if (patch.phone !== undefined) {
    sets.push('phone=?');
    args.push(patch.phone);
  }
  if (patch.dorm !== undefined) {
    sets.push('dorm=?');
    args.push(patch.dorm);
  }
  if (patch.realName) {
    sets.push('real_name=?');
    args.push(patch.realName);
  }
  if (!sets.length) return selfStudent(get('SELECT * FROM students WHERE id=?', student.id));
  args.push(student.id);
  run(`UPDATE students SET ${sets.join(', ')} WHERE id=?`, ...args);
  audit({ actorType: 'student', actorId: student.id, role: '已认证学生', action: 'student.updateProfile', targetType: 'student', targetId: student.id, result: 'allowed', detail: Object.keys(patch) });
  return selfStudent(get('SELECT * FROM students WHERE id=?', student.id));
}

/* ------------------------------------------------------------ UC-04 管理员登录 */
export function loginAdmin({ adminId, password }, meta = {}) {
  const id = String(adminId ?? '').trim();
  const row = get('SELECT * FROM admins WHERE id=?', id);
  if (!row) {
    audit({ actorType: 'guest', role: '游客', action: 'admin.login', targetType: 'admin', targetId: id, result: 'failed', reasonCode: 'BAD_CREDENTIAL' });
    throw E.auth(M.ADMIN_LOGIN_FAILED);
  }
  checkLock(row);
  if (!verifyPassword(password, row.password_hash)) {
    countFailure('admins', id);
    audit({ actorType: 'guest', role: '游客', action: 'admin.login', targetType: 'admin', targetId: id, result: 'failed', reasonCode: 'BAD_CREDENTIAL' });
    throw E.auth(M.ADMIN_LOGIN_FAILED);
  }
  clearFailure('admins', id);
  const { token, expiresAt } = createSession('admin', id, meta);
  audit({ actorType: 'admin', actorId: id, role: '管理员', action: 'admin.login', targetType: 'admin', targetId: id, result: 'allowed' });
  return { token, expiresAt, mustChangePassword: Number(row.must_change_password) === 1 };
}

export function changeAdminPassword(admin, { oldPassword, newPassword }) {
  const row = get('SELECT * FROM admins WHERE id=?', admin.id);
  if (!verifyPassword(oldPassword, row.password_hash)) throw E.validation(M.ADMIN_LOGIN_FAILED);
  const pwd = validatePassword(newPassword);
  if (verifyPassword(pwd, row.password_hash)) throw E.validation(M.PASSWORD_SAME);
  run('UPDATE admins SET password_hash=?, must_change_password=0 WHERE id=?', hashPassword(pwd), admin.id);
  audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'admin.changePassword', targetType: 'admin', targetId: admin.id, result: 'allowed' });
  return { ok: true };
}
