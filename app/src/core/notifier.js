/**
 * 站内通知（BR-15 系统主动通知规则）。
 * 通知由系统发起，不是用例；用户主动查看才是 UC-18。
 */
import { bizId } from './crypto.js';
import { all, get, run } from './db.js';
import { nowIso } from './time.js';
import { L } from './config.js';

const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

/**
 * @param {object} p
 * @param {'student'|'admin'} [p.recipientType]
 * @param {string} p.recipientId
 * @param {'核验'|'商品审核'|'成交'|'处置'|'信用'|'私信'} p.msgType
 * @param {string} p.title
 * @param {string} p.content
 * @param {string} [p.relatedKind] product | order | report | cert | conversation | credit
 * @param {string} [p.relatedId]
 * @param {string} [p.productId] 私信类通知的会话定位
 * @param {string} [p.peerId]
 */
export function notify({
  recipientType = 'student',
  recipientId,
  msgType,
  title,
  content,
  relatedKind = null,
  relatedId = null,
  productId = null,
  peerId = null
}) {
  if (!recipientId) return null;
  const id = bizId('MSG');
  run(
    `INSERT INTO notifications
      (id, recipient_id, recipient_type, msg_type, title, content, created_at, read_status,
       related_kind, related_id, product_id, peer_id)
     VALUES (?,?,?,?,?,?,?,'未读',?,?,?,?)`,
    id,
    recipientId,
    recipientType,
    msgType,
    clip(title, L.notificationTitleMaxLen),
    clip(content, L.notificationContentMaxLen),
    nowIso(),
    relatedKind,
    relatedId,
    productId,
    peerId
  );
  return id;
}

export function notifyAllAdmins({ msgType, title, content, relatedKind, relatedId }) {
  const admins = all('SELECT id FROM admins');
  for (const a of admins) {
    notify({ recipientType: 'admin', recipientId: a.id, msgType, title, content, relatedKind, relatedId });
  }
}

export function unreadCount(recipientType, recipientId) {
  const row = get(
    `SELECT COUNT(*) AS n FROM notifications
      WHERE recipient_type=? AND recipient_id=? AND read_status='未读'`,
    recipientType,
    recipientId
  );
  return Number(row?.n || 0);
}

/** 私有通知的接收人校验（§6.5：不得读取他人通知） */
export function findOwned(notificationId, recipientType, recipientId) {
  return get(
    `SELECT * FROM notifications WHERE id=? AND recipient_type=? AND recipient_id=?`,
    notificationId,
    recipientType,
    recipientId
  );
}
