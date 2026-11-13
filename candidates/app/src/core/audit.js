/**
 * 审计日志（§5.5 第 5 条）。
 * 记录权限拒绝、敏感信息读取与管理员审核/下架/删除/扣分等操作。
 * 严禁写入：登录密码、完整手机号、完整宿舍地址、学生证图片内容、验证码明文。
 */
import { bizId } from './crypto.js';
import { run } from './db.js';
import { nowIso } from './time.js';

const SENSITIVE_KEYS = ['password', 'newPassword', 'oldPassword', 'code', 'token', 'cardImage', 'idCard', 'phone', 'dorm'];

function scrub(detail) {
  if (!detail || typeof detail !== 'object') return detail == null ? null : String(detail);
  const out = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
      out[k] = '[已隐去]';
    } else if (typeof v === 'string' && v.length > 300) {
      out[k] = v.slice(0, 300) + '…';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {object} entry
 * @param {'guest'|'student'|'admin'|'system'} entry.actorType
 * @param {string} [entry.actorId]
 * @param {string} entry.role 有效角色：游客 / 未认证学生 / 已认证学生 / 管理员
 * @param {string} entry.action 动作，如 'product.publish'
 * @param {string} [entry.targetType]
 * @param {string} [entry.targetId]
 * @param {'allowed'|'denied'|'failed'} entry.result
 * @param {string} [entry.reasonCode]
 * @param {object} [entry.detail]
 */
export function audit(entry) {
  try {
    run(
      `INSERT INTO audit_logs (id, at, actor_type, actor_id, role, action, target_type, target_id, result, reason_code, detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      bizId('AUD'),
      nowIso(),
      entry.actorType || 'guest',
      entry.actorId || null,
      entry.role || '游客',
      entry.action,
      entry.targetType || null,
      entry.targetId || null,
      entry.result || 'allowed',
      entry.reasonCode || null,
      entry.detail ? JSON.stringify(scrub(entry.detail)) : null
    );
  } catch (err) {
    console.warn('[audit] 写入失败：', err.message);
  }
}

export function listAudit({ limit = 200 } = {}) {
  return { limit };
}
