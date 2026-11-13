/**
 * 会话（登录态）。
 * 令牌为随机 48 字节，数据库只存其 SHA-256；重置密码会吊销该账号全部会话（NFR-10 ⑥）。
 *
 * 注意：会话有效期用**真实时钟**计算，不使用 nowMs()（含演示偏移）。
 * 理由：§4.1.1 的时间口径针对业务期限（评价 7 天、审核 24 小时等），
 * 而会话 TTL 属基础设施设置；若用演示偏移，一次「+7 天」的演示操作会把所有人踢下线。
 */
import { bizId, randomToken, sha256 } from './crypto.js';
import { config } from './config.js';
import { get, run } from './db.js';

export const COOKIE_NAME = 'sgsid';

const isoReal = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';

export function createSession(subjectType, subjectId, meta = {}) {
  const token = randomToken();
  const now = Date.now();
  const expiresAt = isoReal(now + config.server.sessionTtlHours * 3600 * 1000);
  run(
    `INSERT INTO sessions (id, subject_type, subject_id, token_hash, created_at, expires_at, revoked, ip, user_agent)
     VALUES (?,?,?,?,?,?,0,?,?)`,
    bizId('SES'),
    subjectType,
    subjectId,
    sha256(token),
    isoReal(now),
    expiresAt,
    meta.ip || null,
    (meta.ua || '').slice(0, 200)
  );
  return { token, expiresAt };
}

export function resolveSession(token) {
  if (!token) return null;
  const s = get('SELECT * FROM sessions WHERE token_hash=?', sha256(token));
  if (!s || Number(s.revoked) === 1) return null;
  if (Date.parse(s.expires_at) <= Date.now()) return null;
  return s;
}

export function revokeSessionById(sessionId) {
  run('UPDATE sessions SET revoked=1 WHERE id=?', sessionId);
}

export function revokeAllSessions(subjectType, subjectId) {
  run('UPDATE sessions SET revoked=1 WHERE subject_type=? AND subject_id=? AND revoked=0', subjectType, subjectId);
}
