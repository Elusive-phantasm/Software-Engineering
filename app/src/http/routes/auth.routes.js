/**
 * 账号与个人资料路由：UC-01 / UC-04 / UC-34、个人资料维护。
 */
import express from 'express';
import { config } from '../../core/config.js';
import { COOKIE_NAME } from '../../core/session.js';
import { selfStudent } from '../../domain/view.js';
import * as auth from '../../domain/auth.service.js';
import { ok } from '../middleware.js';
import { get } from '../../core/db.js';

const router = express.Router();

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  maxAge: config.server.sessionTtlHours * 3600 * 1000,
  path: '/'
});

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

/* ------------------------------------------------------------- 学生登录态 */
router.get('/auth/me', (req, res) => {
  if (req.actor.kind === 'student') {
    const row = get('SELECT * FROM students WHERE id=?', req.actor.id);
    return ok(res, { kind: 'student', student: selfStudent(row) });
  }
  if (req.actor.kind === 'admin') {
    const row = get('SELECT * FROM admins WHERE id=?', req.actor.id);
    return ok(res, {
      kind: 'admin',
      admin: { id: row.id, displayName: row.display_name, mustChangePassword: Number(row.must_change_password) === 1 }
    });
  }
  return ok(res, { kind: 'guest' });
});

router.post('/auth/send-code', async (req, res, next) => {
  try {
    const data = await auth.sendRegisterCode(req.body?.email, { ip: req.ip, ua: req.headers['user-agent'] });
    ok(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/auth/register', (req, res, next) => {
  try {
    const student = auth.register(req.body || {});
    ok(res, { student }, '注册成功，请提交学生证核验');
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', (req, res, next) => {
  try {
    const result = auth.loginStudent(req.body || {}, { ip: req.ip, ua: req.headers['user-agent'] });
    setSessionCookie(res, result.token);
    ok(res, { student: result.student, restrictedNotice: result.restrictedNotice }, '登录成功');
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (req, res) => {
  auth.logout(req.actor?.session);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  ok(res, { ok: true }, '已退出登录');
});

/* ----------------------------------------------------------------- UC-34 */
router.post('/auth/forgot/send-code', async (req, res, next) => {
  try {
    const data = await auth.forgotSendCode(req.body?.email);
    ok(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/auth/forgot/reset', (req, res, next) => {
  try {
    const data = auth.resetPassword(req.body || {});
    ok(res, data);
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- 个人资料 */
router.patch('/me/profile', (req, res, next) => {
  try {
    if (req.actor.kind !== 'student') {
      return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED', message: '请先登录学生账号' });
    }
    const student = auth.updateProfile(req.actor.student, req.body || {});
    ok(res, { student }, '资料已更新');
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------- 管理员登录态 */
router.post('/admin/auth/login', (req, res, next) => {
  try {
    const result = auth.loginAdmin(req.body || {}, { ip: req.ip, ua: req.headers['user-agent'] });
    setSessionCookie(res, result.token);
    ok(res, result, '登录成功');
  } catch (err) {
    next(err);
  }
});

router.post('/admin/auth/change-password', (req, res, next) => {
  try {
    if (req.actor.kind !== 'admin') {
      return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED', message: '仅管理员可登录后台' });
    }
    ok(res, auth.changeAdminPassword(req.actor.admin, req.body || {}), '密码已修改');
  } catch (err) {
    next(err);
  }
});

export default router;
