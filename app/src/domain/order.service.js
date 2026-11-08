/**
 * 订单（成交记录）：UC-10 下单成交、UC-16 查看我的订单、UC-31 撤销成交。
 * 状态：ST-05（在售→已售出 + 创建订单原子完成）、ST-10（撤销回在售）、ST-11（卖家已封禁则转已下架）。
 * 业务规则：BR-01、BR-05、BR-06、BR-07、BR-08、BR-14（③④）、BR-21。
 *
 * 注意：本版订单**没有状态机**。只有 `成交状态`（有效／已撤销）与
 * `撤销免责判定`（待判定／已免责／计违约）两个标记，见 §7.1。
 */
import { CREDIT, DL } from '../core/config.js';
import { bizId } from '../core/crypto.js';
import { all, count, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify } from '../core/notifier.js';
import { CANCEL_REASONS, JUDGE, ORDER, P, OFF_REASON } from '../core/rules.js';
import { addHours, humanRemaining, isOverdue, nowIso } from '../core/time.js';
import { requireCertifiedStudent, requireOrderRights, requireStudent, roleOf } from './guards.js';
import { applyCreditChange, EVENT } from './credit.service.js';
import { notifyProductBackOnSale, offShelfAfterCancel } from './product.service.js';
import { orderView, publicStudent } from './view.js';

function reviewsOf(orderId) {
  return all(
    `SELECT r.*, s.nickname FROM reviews r JOIN students s ON s.id=r.reviewer_id
      WHERE r.order_id=? AND r.deleted_at IS NULL`,
    orderId
  );
}

function productOf(orderId) {
  return get(
    `SELECT p.* FROM products p JOIN orders o ON o.product_id=p.id WHERE o.id=?`,
    orderId
  );
}

/** 订单详情（含评价/撤销/判定入口可用性与剩余时长，供 UC-16 各辅助流使用） */
export function orderDetail(actor, orderId) {
  const o = get('SELECT * FROM orders WHERE id=?', orderId);
  if (!o) throw E.notFound(M.ORDER_NOT_FOUND);

  const isBuyer = actor?.kind === 'student' && actor.id === o.buyer_id;
  const isSeller = actor?.kind === 'student' && actor.id === o.seller_id;
  const isAdmin = actor?.kind === 'admin';
  if (!isBuyer && !isSeller && !isAdmin) throw E.permission('仅成交双方可查看该成交记录');

  const product = productOf(orderId);
  const reviews = reviewsOf(orderId);
  const myReview = isBuyer || isSeller ? reviews.find((r) => r.reviewer_id === actor.id) : null;
  const peerId = isBuyer ? o.seller_id : isSeller ? o.buyer_id : null;
  const peerReview = peerId ? reviews.find((r) => r.reviewer_id === peerId) : null;

  const reviewDeadline = addHours(o.created_at, DL.reviewWindowHours);
  const canReview =
    (isBuyer || isSeller) &&
    o.status === ORDER.VALID &&
    !myReview &&
    !isOverdue(reviewDeadline);

  const canCancel =
    (isBuyer || isSeller) &&
    o.status === ORDER.VALID &&
    reviews.length === 0 &&
    product?.status === P.SOLD;

  const judgeDeadline = o.cancelled_at ? addHours(o.cancelled_at, DL.cancelJudgementWindowHours) : null;
  const isInitiator = o.cancel_initiator_id === (actor?.id ?? null);
  const canJudge =
    (isBuyer || isSeller) &&
    !isInitiator &&
    o.status === ORDER.CANCELLED &&
    o.cancel_judgement === JUDGE.PENDING &&
    judgeDeadline &&
    !isOverdue(judgeDeadline);

  return orderView(o, {
    productTitle: product?.title ?? null,
    productStatus: product?.status ?? null,
    productId: o.product_id,
    buyer: publicStudent(get('SELECT * FROM students WHERE id=?', o.buyer_id)),
    seller: publicStudent(get('SELECT * FROM students WHERE id=?', o.seller_id)),
    myRole: isBuyer ? 'buyer' : isSeller ? 'seller' : 'admin',
    peerId,
    peerNickname: peerId ? get('SELECT nickname FROM students WHERE id=?', peerId)?.nickname ?? null : null,
    myReview: myReview ? { id: myReview.id, content: myReview.content, createdAt: myReview.created_at } : null,
    peerReviewed: !!peerReview,
    reviews: reviews.map((r) => ({
      id: r.id,
      reviewerId: r.reviewer_id,
      reviewerNickname: r.nickname,
      content: r.content,
      createdAt: r.created_at
    })),
    canReview,
    reviewDeadline,
    canCancel,
    canJudge,
    judgeDeadline,
    judgeRemaining: judgeDeadline ? humanRemaining(judgeDeadline) : null,
    reviewRemaining: humanRemaining(reviewDeadline),
    isCancelInitiator: o.status === ORDER.CANCELLED ? isInitiator : null
  });
}

/* ------------------------------------------------------ UC-10 / ST-05 下单成交 */
export function createOrder(actor, { productId }) {
  const student = requireOrderRights(actor);

  return tx(() => {
    const product = get('SELECT * FROM products WHERE id=?', productId);
    if (!product || product.deleted_at) throw E.notFound(M.PRODUCT_GONE);
    if (product.seller_id === student.id) throw E.state(M.SELF_PURCHASE);   // BR-01：禁止自购

    if (product.status !== P.ON_SALE) {
      if (product.status === P.SOLD) {
        // 重复提交同一购买请求 → 返回同一订单结果，不重复成交（UC-10 辅事件流 F）
        const mine = get(
          `SELECT id FROM orders WHERE product_id=? AND buyer_id=? AND status='有效'`,
          productId,
          student.id
        );
        if (mine) return orderDetail(actor, mine.id);
        throw E.state(M.PRODUCT_SOLD);
      }
      throw E.state(M.PRODUCT_NOT_BUYABLE);
    }

    // 原子切换：`WHERE status='在售'` 保证并发抢购只有一条成功（BR-06、SC-03）
    const switched = run(
      `UPDATE products SET status=? WHERE id=? AND status=? AND deleted_at IS NULL`,
      P.SOLD,
      productId,
      P.ON_SALE
    );
    if (!switched.changes) throw E.state(M.PRODUCT_SOLD);

    const now = nowIso();
    const orderId = bizId('ORD');
    run(
      `INSERT INTO orders (id, product_id, buyer_id, seller_id, amount_cents, created_at, status)
       VALUES (?,?,?,?,?,?,?)`,
      orderId,
      productId,
      student.id,
      product.seller_id,
      product.price_cents, // BR-05：成交金额＝下单时标价
      now,
      ORDER.VALID
    );

    // BR-15：下单成交通知双方；UC-10 第 6 步：引导进入该商品的站内私信会话
    notify({
      recipientId: student.id,
      msgType: '成交',
      title: '下单成功，交易已成交',
      content: `你已买下《${product.title}》，成交金额 ${(product.price_cents / 100).toFixed(2)} 元。平台不展示对方手机号，请在站内私信中与卖家约定取货时间与地点。`,
      relatedKind: 'order',
      relatedId: orderId,
      productId,
      peerId: product.seller_id
    });
    notify({
      recipientId: product.seller_id,
      msgType: '成交',
      title: '你的商品已成交',
      content: `《${product.title}》已被买家下单成交，成交金额 ${(product.price_cents / 100).toFixed(2)} 元。请在站内私信中与买家约定取货时间与地点。`,
      relatedKind: 'order',
      relatedId: orderId,
      productId,
      peerId: student.id
    });
    audit({
      actorType: 'student',
      actorId: student.id,
      role: roleOf(actor),
      action: 'order.create',
      targetType: 'order',
      targetId: orderId,
      result: 'allowed',
      detail: { productId, amountCents: product.price_cents }
    });

    return orderDetail(actor, orderId);
  });
}

/* ------------------------------------------------------- UC-16 查看我的订单 */
export function myOrders(actor, { role = 'all' } = {}) {
  const student = requireStudent(actor, '管理员无「我的订单」视图（§5.2）');
  if (actor.kind === 'admin') throw E.permission('管理员无「我的订单」视图（§5.2）');

  const conds = [];
  const args = [];
  if (role === 'buyer') {
    conds.push('o.buyer_id=?');
    args.push(student.id);
  } else if (role === 'seller') {
    conds.push('o.seller_id=?');
    args.push(student.id);
  } else {
    conds.push('(o.buyer_id=? OR o.seller_id=?)');
    args.push(student.id, student.id);
  }
  const rows = all(
    `SELECT o.*, p.title AS product_title, p.status AS product_status
       FROM orders o JOIN products p ON p.id = o.product_id
      WHERE ${conds.join(' AND ')}
      ORDER BY o.created_at DESC, o.id DESC`,
    ...args
  );
  return rows.map((r) => {
    const detail = orderDetail(actor, r.id);
    return { ...detail, productTitle: r.product_title, productStatus: r.product_status };
  });
}

/* ------------------------------------------------------ UC-31 / ST-10 撤销成交 */
export function cancelOrder(actor, orderId, { reason } = {}) {
  const student = requireCertifiedStudent(actor, '管理员无撤销成交权限（§5.2）');
  const reasonV = String(reason ?? '').trim();
  if (!reasonV) throw E.validation(M.CANCEL_REASON_REQUIRED);
  if (!CANCEL_REASONS.includes(reasonV)) throw E.validation(M.CANCEL_REASON_REQUIRED);

  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=?', orderId);
    if (!o) throw E.notFound(M.ORDER_NOT_FOUND);
    if (o.buyer_id !== student.id && o.seller_id !== student.id) {
      throw E.permission(M.CANCEL_NOT_PARTICIPANT);
    }
    if (o.status === ORDER.CANCELLED) throw E.state(M.CANCEL_ALREADY);        // 辅事件流 E

    const reviewCount = count(
      'SELECT COUNT(*) FROM reviews WHERE order_id=? AND deleted_at IS NULL',
      orderId
    );
    if (reviewCount > 0) throw E.state(M.CANCEL_AFTER_REVIEW);                // 辅事件流 D

    const product = get('SELECT * FROM products WHERE id=?', o.product_id);
    if (!product || product.status !== P.SOLD) {
      throw E.state('该成交对应商品当前不处于「已售出」，无法撤销');
    }

    const now = nowIso();
    // 单方即时生效，不可回滚；条件更新保证「第二次撤销」被拒（BR-21）
    const upd = run(
      `UPDATE orders SET status=?, cancel_initiator_id=?, cancel_reason=?, cancelled_at=?,
              cancel_judgement=?, judgement_at=NULL
        WHERE id=? AND status=?`,
      ORDER.CANCELLED,
      student.id,
      reasonV.slice(0, 200),
      now,
      JUDGE.PENDING,
      orderId,
      ORDER.VALID
    );
    if (!upd.changes) throw E.state(M.CANCEL_ALREADY);

    const seller = get('SELECT * FROM students WHERE id=?', o.seller_id);
    let productBack = false;
    if (seller.account_status === '封禁') {
      offShelfAfterCancel(o.product_id);                                     // ST-11
    } else {
      run('UPDATE products SET status=?, off_shelf_reason=NULL WHERE id=?', P.ON_SALE, o.product_id);
      productBack = true;
    }

    const peerId = o.buyer_id === student.id ? o.seller_id : o.buyer_id;
    notify({
      recipientId: peerId,
      msgType: '成交',
      title: '对方已撤销这笔成交',
      content: `对方撤销了《${product.title}》的这笔成交（原因：${reasonV}）。你可选择「同意免责」或「计其违约」；7 天内未处理默认计违约。`,
      relatedKind: 'order',
      relatedId: orderId,
      productId: o.product_id,
      peerId: student.id
    });
    notify({
      recipientId: student.id,
      msgType: '成交',
      title: '撤销已生效',
      content: productBack
        ? `《${product.title}》的成交已撤销，商品已回到「在售」。等待对方在 7 天内判定是否计你违约。`
        : `《${product.title}》的成交已撤销。因卖家账号已封禁，商品转为「已下架（撤销后不可交易）」（ST-11）。`,
      relatedKind: 'order',
      relatedId: orderId,
      productId: o.product_id,
      peerId
    });
    if (productBack) notifyProductBackOnSale(o.product_id, product.title);

    audit({
      actorType: 'student',
      actorId: student.id,
      role: roleOf(actor),
      action: 'order.cancel',
      targetType: 'order',
      targetId: orderId,
      result: 'allowed',
      detail: { reason: reasonV, productBack, sellerBanned: seller.account_status === '封禁' }
    });

    return orderDetail(actor, orderId);
  });
}

/* --------------------------------- UC-31 第 5 步 / BR-14 ④ 对方免责判定 */
export function judgeCancellation(actor, orderId, { judgement } = {}) {
  const student = requireCertifiedStudent(actor, '管理员无撤销免责判定权限（§5.2）');
  const value = String(judgement ?? '').trim();
  if (![JUDGE.EXEMPT, JUDGE.BREACH].includes(value)) {
    throw E.validation('判定结论只能是「已免责」或「计违约」');
  }

  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=?', orderId);
    if (!o) throw E.notFound(M.ORDER_NOT_FOUND);
    if (o.buyer_id !== student.id && o.seller_id !== student.id) {
      throw E.permission(M.CANCEL_JUDGE_NOT_PARTICIPANT);
    }
    if (o.status !== ORDER.CANCELLED) throw E.state('该成交未撤销，无需判定');
    if (o.cancel_initiator_id === student.id) throw E.permission(M.CANCEL_JUDGE_NOT_PARTICIPANT);
    if (o.cancel_judgement !== JUDGE.PENDING) throw E.state(M.CANCEL_JUDGE_DONE);

    const deadline = addHours(o.cancelled_at, DL.cancelJudgementWindowHours);
    if (isOverdue(deadline)) {
      // 判定窗口已过：按 §4.1.1 左闭右开视为超期，系统默认计违约
      run(
        `UPDATE orders SET cancel_judgement=?, judgement_at=? WHERE id=? AND cancel_judgement=?`,
        JUDGE.BREACH,
        nowIso(),
        orderId,
        JUDGE.PENDING
      );
      applyCreditChange({
        studentId: o.cancel_initiator_id,
        delta: CREDIT.cancelPenalty,
        eventType: EVENT.CANCEL_BREACH,
        reason: '撤销成交后 7 天内对方未作判定，系统自动计违约',
        orderId,
        sourceKey: `cancel:${orderId}`
      });
      throw E.state('免责判定窗口（7 天）已过，系统已自动计违约');
    }

    // 与超时自动判定竞态：先落库者为准（§5.5 第 7 条）
    const upd = run(
      `UPDATE orders SET cancel_judgement=?, judgement_at=? WHERE id=? AND cancel_judgement=?`,
      value,
      nowIso(),
      orderId,
      JUDGE.PENDING
    );
    if (!upd.changes) throw E.state(M.CANCEL_JUDGE_DONE);

    if (value === JUDGE.BREACH) {
      applyCreditChange({
        studentId: o.cancel_initiator_id,
        delta: CREDIT.cancelPenalty,
        eventType: EVENT.CANCEL_BREACH,
        reason: '撤销成交被判「计违约」',
        orderId,
        sourceKey: `cancel:${orderId}`
      });
    }

    notify({
      recipientId: o.cancel_initiator_id,
      msgType: '成交',
      title: `撤销免责判定结果：${value}`,
      content:
        value === JUDGE.BREACH
          ? '对方判定本次撤销为违约，你的信用分 −2。'
          : '对方已同意免责，本次撤销不计违约，不扣分。',
      relatedKind: 'order',
      relatedId: orderId
    });
    notify({
      recipientId: student.id,
      msgType: '成交',
      title: '免责判定已提交',
      content: `你已对这笔撤销作出判定：${value}。判定结果不影响已完成撤销的商品状态。`,
      relatedKind: 'order',
      relatedId: orderId
    });
    audit({
      actorType: 'student',
      actorId: student.id,
      role: roleOf(actor),
      action: 'order.judgeCancel',
      targetType: 'order',
      targetId: orderId,
      result: 'allowed',
      detail: { judgement: value }
    });

    return orderDetail(actor, orderId);
  });
}

/* ------------------------------------------------------------ 管理员视角列表 */
export function adminOrders({ keyword } = {}) {
  const rows = all(
    `SELECT o.*, p.title AS product_title, p.status AS product_status
       FROM orders o JOIN products p ON p.id=o.product_id
      ORDER BY o.created_at DESC LIMIT 300`
  );
  return rows
    .filter((r) => !keyword || String(r.product_title).includes(String(keyword)))
    .map((r) =>
      orderView(r, {
        productTitle: r.product_title,
        productStatus: r.product_status,
        buyer: publicStudent(get('SELECT * FROM students WHERE id=?', r.buyer_id)),
        seller: publicStudent(get('SELECT * FROM students WHERE id=?', r.seller_id))
      })
    );
}
