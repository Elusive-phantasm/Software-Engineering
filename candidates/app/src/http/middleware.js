/**
 * HTTP 中间件：会话识别、统一错误处理、权限拒绝审计、请求日志。
 */
import { COOKIE_NAME, resolveSession } from '../core/session.js';
import { get } from '../core/db.js';
import { BizError } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { roleOf } from '../domain/guards.js';

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** 挂载 req.actor：guest / student / admin */
export function attachActor(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
    const session = resolveSession(token);
    if (!session) {
      req.actor = { kind: 'guest' };
      return next();
    }
    if (session.subject_type === 'student') {
      const student = get('SELECT * FROM students WHERE id=?', session.subject_id);
      req.actor = student
        ? { kind: 'student', id: student.id, student, session }
        : { kind: 'guest' };
    } else {
      const admin = get('SELECT * FROM admins WHERE id=?', session.subject_id);
      req.actor = admin ? { kind: 'admin', id: admin.id, admin, session } : { kind: 'guest' };
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

const STATUS_BY_CODE = {
  AUTH_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STATE_REJECTED: 409,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof BizError) {
    // §5.5 第 2、5 条：权限拒绝与状态拒绝一律记录审计，但不改业务数据、不扣分
    if (['PERMISSION_DENIED', 'AUTH_REQUIRED', 'STATE_REJECTED'].includes(err.code)) {
      audit({
        actorType: req.actor?.kind || 'guest',
        actorId: req.actor?.id || null,
        role: roleOf(req.actor),
        action: `${req.method} ${req.path}`,
        targetType: null,
        targetId: req.params?.id || null,
        result: err.code === 'STATE_REJECTED' ? 'failed' : 'denied',
        reasonCode: err.code,
        detail: { message: err.message }
      });
    }
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      ok: false,
      code: err.code,
      message: err.message,
      extra: err.extra || null
    });
  }
  // 数据库约束兜底：把约束冲突翻译为可读错误（例如重复收藏、并发成交）
  if (String(err?.message || '').includes('UNIQUE constraint failed')) {
    return res.status(409).json({
      ok: false,
      code: 'CONFLICT',
      message: '该操作已存在一条记录，请勿重复提交'
    });
  }
  console.error('[error]', req.method, req.path, err);
  return res.status(500).json({
    ok: false,
    code: 'INTERNAL',
    message: '系统繁忙，请稍后重试'
  });
}

export function ok(res, data = null, message) {
  return res.json({ ok: true, data, message: message ?? undefined });
}

/** 仅开发模式可用的守卫 */
export function devOnly(config) {
  return (req, res, next) => {
    if (!config.server.enableDevTools) {
      return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED', message: '开发工具已关闭' });
    }
    return next();
  };
}
