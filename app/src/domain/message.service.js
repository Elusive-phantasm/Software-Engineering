/**
 * 站内私信：UC-29 联系卖家与沟通、UC-30 查看我的私信。
 * 业务规则：BR-20（必须绑定商品、仅已认证学生可发起、同一(商品,双方)只一条会话、
 *          管理员仅可回复违规下架异议、纯文本无附件无撤回）。
 * 非功能：NFR-09（会话未读数与通知红点独立；消息不落库则不得显示已发送）。
 *
 * 「会话」不是实体（§6.2.1 / §7.1）：由同一（商品, 双方有序对）的私信行聚合，
 * 不单独建表、无状态、不可关闭。
 */
import { all, count, get, run, tx } from '../core/db.js';
import { bizId } from '../core/crypto.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify } from '../core/notifier.js';
import { OFF_REASON, ORDER, P, validateMessageContent } from '../core/rules.js';
import { nowIso } from '../core/time.js';
import { requireAdmin, requireCertifiedStudent, requireLogin, roleOf } from './guards.js';
import { messageView } from './view.js';

const convKey = (productId, peerType, peerId) => `${productId}|${peerType}|${peerId}`;

function productOrThrow(productId) {
  const product = get('SELECT * FROM products WHERE id=?', productId);
  if (!product || product.deleted_at) throw E.notFound(M.PRODUCT_GONE);
  return product;
}

function hasConversation(productId, aId, bId) {
  return get(
    `SELECT id FROM messages
      WHERE product_id=?
        AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))
      LIMIT 1`,
    productId, aId, bId, bId, aId
  );
}

/* ------------------------------------------------- UC-29 发送消息（学生发起） */
export function sendMessage(actor, { productId, content, toId = null }) {
  const student = requireCertifiedStudent(actor, M.ADMIN_CANNOT_CONTACT); // BR-20：仅已认证学生可发起
  const text = validateMessageContent(content);

  return tx(() => {
    const product = productOrThrow(productId);
    let receiverId = toId ? String(toId) : null;
    let receiverType = 'student';

    if (product.seller_id === student.id) {
      /* -------- 卖家一侧：只能回复既有会话，或就违规下架向管理员提异议 -------- */
      // 未指定对方即等于「自己跟自己说话」，按 UC-29 辅事件流 B 处理
      if (!receiverId || receiverId === student.id) throw E.state(M.MSG_SELF);
      const isAdmin = !!get('SELECT id FROM admins WHERE id=?', receiverId);
      if (isAdmin) {
        // BR-20：接收人为管理员时，商品下架原因必须为「管理员违规下架」
        if (product.off_shelf_reason !== OFF_REASON.ADMIN_OFF) throw E.state(M.MSG_ADMIN_TARGET_FORBIDDEN);
        receiverType = 'admin';
      } else if (!hasConversation(productId, student.id, receiverId)) {
        throw E.permission(M.MSG_PARTICIPANT_ONLY);
      }
    } else {
      /* ------------------------- 买家/咨询方一侧：发起新会话 ------------------------- */
      if (receiverId && receiverId !== product.seller_id) throw E.permission(M.MSG_PARTICIPANT_ONLY);
      receiverId = product.seller_id;
      if (product.status === P.SOLD) {
        const validOrder = get(
          'SELECT id FROM orders WHERE product_id=? AND status=? AND buyer_id=?',
          productId, ORDER.VALID, student.id
        );
        if (!validOrder) throw E.state(M.MSG_PRODUCT_SOLD);                  // 辅事件流 C
      } else if (product.status !== P.ON_SALE) {
        throw E.state(M.MSG_PRODUCT_UNAVAILABLE);                            // 辅事件流 D
      }
    }

    if (receiverType === 'student') {
      const peer = get('SELECT * FROM students WHERE id=?', receiverId);
      if (!peer) throw E.notFound('对方账号不存在');
      // 辅事件流 G：接收方已封禁 → 消息不落库、不产生通知，且不得显示「已发送」
      if (peer.account_status === '封禁') throw E.state(M.MSG_PEER_BANNED);
    } else {
      const peer = get('SELECT * FROM admins WHERE id=?', receiverId);
      if (!peer) throw E.notFound('对方账号不存在');
    }

    const id = bizId('PM');
    run(
      `INSERT INTO messages (id, product_id, sender_id, sender_type, receiver_id, receiver_type, content, created_at, read_status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id, productId, student.id, 'student', receiverId, receiverType, text, nowIso(), '未读'
    );

    // BR-15：收到新私信（消息类型＝私信，附会话入口）
    notify({
      recipientType: receiverType,
      recipientId: receiverId,
      msgType: '私信',
      title: '收到一条新私信',
      content: `${student.nickname} 就商品《${product.title}》给你发来消息：${text.slice(0, 60)}`
        .slice(0, 500),
      relatedKind: 'conversation',
      relatedId: `${productId}:${student.id}`,
      productId,
      peerId: student.id
    });

    audit({
      actorType: 'student', actorId: student.id, role: roleOf(actor),
      action: 'message.send', targetType: 'product', targetId: productId, result: 'allowed',
      detail: { receiverId, receiverType }
    });

    return messageView(get('SELECT * FROM messages WHERE id=?', id), { productTitle: product.title });
  });
}

/* ---------------------------------------- 管理员回复处置异议会话（BR-20 仅可回复） */
export function adminReply(actor, { productId, toId, content }) {
  const admin = requireAdmin(actor);
  const text = validateMessageContent(content);

  return tx(() => {
    const product = productOrThrow(productId);
    if (product.off_shelf_reason !== OFF_REASON.ADMIN_OFF) {
      throw E.permission(M.ADMIN_CONVERSATION_FORBIDDEN);
    }
    const sellerId = product.seller_id;
    if (String(toId) !== String(sellerId)) throw E.permission(M.ADMIN_CONVERSATION_FORBIDDEN);
    if (!hasConversation(productId, admin.id, sellerId)) {
      // 管理员仅可回复，不得主动发起（BR-20）
      throw E.permission(M.MSG_ADMIN_REPLY_ONLY);
    }
    const id = bizId('PM');
    run(
      `INSERT INTO messages (id, product_id, sender_id, sender_type, receiver_id, receiver_type, content, created_at, read_status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id, productId, admin.id, 'admin', sellerId, 'student', text, nowIso(), '未读'
    );
    notify({
      recipientId: sellerId,
      msgType: '私信',
      title: '管理员回复了你的处置异议',
      content: `就商品《${product.title}》的处置异议，管理员回复：${text.slice(0, 60)}`.slice(0, 500),
      relatedKind: 'conversation',
      relatedId: `${productId}:${admin.id}`,
      productId,
      peerId: admin.id
    });
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'message.adminReply', targetType: 'product', targetId: productId, result: 'allowed', detail: { toId: sellerId } });
    return messageView(get('SELECT * FROM messages WHERE id=?', id));
  });
}

/* ------------------------------------------------------- UC-30 会话列表聚合 */
export function listConversations(actor) {
  requireLogin(actor);
  const me = actor.id;
  const kind = actor.kind; // 'student' | 'admin'
  const rows = all(
    `SELECT m.* FROM messages m
      WHERE (m.sender_type=? AND m.sender_id=?) OR (m.receiver_type=? AND m.receiver_id=?)
      ORDER BY m.created_at ASC`,
    kind, me, kind, me
  );

  const groups = new Map();
  for (const m of rows) {
    const iAmSender = m.sender_type === kind && m.sender_id === me;
    const peerId = iAmSender ? m.receiver_id : m.sender_id;
    const peerType = iAmSender ? m.receiver_type : m.sender_type;
    const key = convKey(m.product_id, peerType, peerId);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        productId: m.product_id,
        peerId,
        peerType,
        unread: 0,
        messageCount: 0,
        lastAt: null,
        lastContent: null,
        lastFromMe: false
      };
      groups.set(key, g);
    }
    g.messageCount++;
    if (!iAmSender && m.read_status === '未读') g.unread++;
    if (!g.lastAt || m.created_at >= g.lastAt) {
      g.lastAt = m.created_at;
      g.lastContent = m.content;
      g.lastFromMe = iAmSender;
    }
  }

  const list = [...groups.values()].map((g) => {
    const product = get('SELECT id, title, status, off_shelf_reason FROM products WHERE id=?', g.productId);
    const peer =
      g.peerType === 'admin'
        ? get('SELECT id, display_name AS nickname FROM admins WHERE id=?', g.peerId)
        : get('SELECT id, nickname, account_status FROM students WHERE id=?', g.peerId);
    return {
      ...g,
      productTitle: product?.title ?? '（商品已删除）',
      productStatus: product?.status ?? null,
      offShelfReason: product?.off_shelf_reason ?? null,
      peerNickname: peer?.nickname ?? '未知用户',
      peerBanned: g.peerType === 'student' ? peer?.account_status === '封禁' : false,
      canSend: g.peerType === 'student' ? true : true
    };
  });

  list.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return {
    total: list.length,
    unreadTotal: list.reduce((s, c) => s + c.unread, 0),
    items: list
  };
}

/* -------------------------------------------- UC-30 会话详情（置本人未读为已读） */
export function getConversation(actor, productId, peerId) {
  requireLogin(actor);
  const me = actor.id;
  const kind = actor.kind;
  const peer = String(peerId);

  const rows = all(
    `SELECT * FROM messages
      WHERE product_id=?
        AND ((sender_type=? AND sender_id=? AND receiver_id=?)
          OR (receiver_type=? AND receiver_id=? AND sender_id=?))
      ORDER BY created_at ASC, id ASC`,
    productId, kind, me, peer, kind, me, peer
  );

  if (!rows.length) {
    // §5.6：非本人参与的会话 —— 不返回任何消息正文
    throw E.permission(
      kind === 'admin' ? M.ADMIN_CONVERSATION_FORBIDDEN : M.CONVERSATION_FORBIDDEN
    );
  }

  const product = get('SELECT id, title, status, off_shelf_reason, seller_id, price_cents FROM products WHERE id=?', productId);
  if (kind === 'admin' && product?.off_shelf_reason !== OFF_REASON.ADMIN_OFF) {
    throw E.permission(M.ADMIN_CONVERSATION_FORBIDDEN);
  }

  // UC-30 第 3 步：把该会话内属于本人的未读消息置为已读
  const unreadBefore = rows.filter(
    (m) => m.receiver_type === kind && m.receiver_id === me && m.read_status === '未读'
  ).length;
  if (unreadBefore > 0) {
    run(
      `UPDATE messages SET read_status='已读'
        WHERE product_id=? AND receiver_type=? AND receiver_id=? AND sender_id=? AND read_status='未读'`,
      productId, kind, me, peer
    );
    // 响应必须反映置读后的状态，否则会出现「刚打开却显示未读」的不一致
    for (const m of rows) {
      if (m.receiver_type === kind && m.receiver_id === me) m.read_status = '已读';
    }
  }

  const peerRow =
    rows[0].sender_id === peer && rows[0].sender_type !== kind
      ? rows[0].sender_type
      : kind === 'admin' ? 'student' : 'student';
  const peerInfo =
    peerRow === 'admin'
      ? get('SELECT id, display_name AS nickname FROM admins WHERE id=?', peer)
      : get('SELECT id, nickname, account_status, cert_status FROM students WHERE id=?', peer);

  return {
    productId,
    productTitle: product?.title ?? '（商品已删除）',
    productStatus: product?.status ?? null,
    offShelfReason: product?.off_shelf_reason ?? null,
    peerId: peer,
    peerNickname: peerInfo?.nickname ?? '未知用户',
    peerBanned: peerInfo?.account_status === '封禁',
    iAmSeller: kind === 'student' && product?.seller_id === me,
    messages: rows.map((m) => messageView(m, { mine: m.sender_type === kind && m.sender_id === me }))
  };
}

/** 私信未读总数（与通知红点相互独立，NFR-09） */
export function unreadMessageCount(actor) {
  if (!actor || actor.kind === 'guest') return 0;
  return count(
    `SELECT COUNT(*) FROM messages WHERE receiver_type=? AND receiver_id=? AND read_status='未读'`,
    actor.kind,
    actor.id
  );
}
