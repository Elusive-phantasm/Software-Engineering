/**
 * 消息通知：UC-18 查看消息通知（只读 + 置已读）。
 * 通知本身由 BR-15 的系统事件产生，不是用例。
 */
import { config } from '../core/config.js';
import { all, count, get, run } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { requireLogin } from './guards.js';
import { notificationView } from './view.js';
import { unreadMessageCount } from './message.service.js';
import { iso, nowMs } from '../core/time.js';

/** 保留期建议 90 天（§6.2.1 保留期），超期记录不再出现在默认列表 */
function retentionCutoff() {
  return iso(nowMs() - config.retention.notificationDays * 24 * 3600 * 1000);
}

export function listNotifications(actor, { page = 1, pageSize = 30 } = {}) {
  requireLogin(actor);
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 30));
  const cutoff = retentionCutoff();
  const total = count(
    `SELECT COUNT(*) FROM notifications WHERE recipient_type=? AND recipient_id=? AND created_at>=?`,
    actor.kind, actor.id, cutoff
  );
  const rows = all(
    `SELECT * FROM notifications
      WHERE recipient_type=? AND recipient_id=? AND created_at>=?
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    actor.kind, actor.id, cutoff, size, (p - 1) * size
  );
  return {
    total,
    page: p,
    pageSize: size,
    retentionDays: config.retention.notificationDays,
    unread: count(
      `SELECT COUNT(*) FROM notifications WHERE recipient_type=? AND recipient_id=? AND read_status='未读'`,
      actor.kind, actor.id
    ),
    items: rows.map(notificationView)
  };
}

export function markRead(actor, id) {
  requireLogin(actor);
  const row = get(
    'SELECT * FROM notifications WHERE id=? AND recipient_type=? AND recipient_id=?',
    id, actor.kind, actor.id
  );
  if (!row) throw E.permission('仅可操作本人通知');           // §6.5：不得读取他人通知
  run(`UPDATE notifications SET read_status='已读' WHERE id=?`, id);
  return { ok: true };
}

export function markAllRead(actor) {
  requireLogin(actor);
  run(
    `UPDATE notifications SET read_status='已读' WHERE recipient_type=? AND recipient_id=? AND read_status='未读'`,
    actor.kind, actor.id
  );
  audit({ actorType: actor.kind, actorId: actor.id, role: actor.kind === 'admin' ? '管理员' : '学生', action: 'notification.readAll', result: 'allowed' });
  return { ok: true };
}

/** 导航栏红点：通知红点与私信未读相互独立（附录 B·七） */
export function badge(actor) {
  if (!actor || actor.kind === 'guest') return { notificationUnread: 0, messageUnread: 0 };
  return {
    notificationUnread: count(
      `SELECT COUNT(*) FROM notifications WHERE recipient_type=? AND recipient_id=? AND read_status='未读'`,
      actor.kind, actor.id
    ),
    messageUnread: unreadMessageCount(actor)
  };
}
