/**
 * 对外视图整形（§6.5 数据可见性与最小必要原则）。
 * 一切响应都必须经此处整形，禁止把数据库行直接返回：
 *   - 手机号、宿舍地址、真实姓名、学号、密码哈希、内部计数一律不出现在他人可见的数据里；
 *   - 他人只可看信用分，不可看明细（UC-15 辅事件流 C）；
 *   - 学生证图片只在审核管理员调用专用接口时下发（NFR-08）。
 */
import { toYuan } from '../core/config.js';

export function publicStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    certified: row.cert_status === '已认证',
    certStatus: row.cert_status,
    accountStatus: row.account_status,
    banned: row.account_status === '封禁',
    creditScore: Number(row.credit_score),
    reviewCount: Number(row.review_count),
    verifiedDisputeCount: Number(row.verified_dispute_count),
    registeredAt: row.registered_at
  };
}

export function selfStudent(row) {
  if (!row) return null;
  return {
    ...publicStudent(row),
    email: row.email,
    studentNo: row.student_no,
    realName: row.real_name,
    phone: row.phone,
    dorm: row.dorm,
    resubmitCount: Number(row.resubmit_count),
    canPublish: row.cert_status === '已认证',
    registeredAt: row.registered_at
  };
}

export function adminProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    mustChangePassword: Number(row.must_change_password) === 1,
    createdAt: row.created_at
  };
}

/** 商品对外视图。actor 用于决定是否附「我的操作」提示 */
export function productView(row, images = [], extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: toYuan(row.price_cents),
    priceCents: Number(row.price_cents),
    condition: row.condition,
    status: row.status,
    offShelfReason: row.off_shelf_reason,
    reviewNote: row.review_note,
    categoryId: row.category_id,
    categoryName: extra.categoryName ?? row.category_name ?? null,
    sellerId: row.seller_id,
    seller: extra.seller ?? null,
    images: images.length ? images : undefined,
    publishedAt: row.published_at,
    reviewedAt: row.reviewed_at,
    deletedAt: row.deleted_at,
    viewCount: Number(row.view_count || 0),
    favoriteCount: extra.favoriteCount ?? undefined,
    ...extra
  };
}

export function orderView(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: extra.productTitle ?? row.product_title ?? null,
    amount: toYuan(row.amount_cents),
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    buyer: extra.buyer ?? null,
    seller: extra.seller ?? null,
    createdAt: row.created_at,
    status: row.status,
    cancelInitiatorId: row.cancel_initiator_id,
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at,
    cancelJudgement: row.cancel_judgement,
    judgementAt: row.judgement_at,
    ...extra
  };
}

export function reviewView(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    reviewerId: row.reviewer_id,
    reviewerNickname: extra.reviewerNickname ?? null,
    targetId: row.target_id,
    targetNickname: extra.targetNickname ?? null,
    content: row.content,
    createdAt: row.created_at,
    deleted: !!row.deleted_at
  };
}

export function notificationView(row) {
  if (!row) return null;
  return {
    id: row.id,
    msgType: row.msg_type,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    read: row.read_status === '已读',
    relatedKind: row.related_kind,
    relatedId: row.related_id,
    productId: row.product_id,
    peerId: row.peer_id
  };
}

export function creditRecordView(row) {
  return {
    id: row.id,
    delta: Number(row.delta),
    eventType: row.event_type,
    reason: row.reason,
    createdAt: row.created_at,
    orderId: row.order_id
  };
}

export function reportView(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetProductId: row.target_product_id,
    targetStudentId: row.target_student_id,
    type: row.type,
    reason: row.reason,
    createdAt: row.created_at,
    handleStatus: row.handle_status,
    actions: row.actions ? JSON.parse(row.actions) : [],
    violationCodes: row.violation_codes,
    result: row.result,
    handlerAdminId: row.handler_admin_id,
    handledAt: row.handled_at,
    ...extra
  };
}

export function certApplicationView(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    declaredNo: row.declared_no,
    submittedAt: row.submitted_at,
    reviewStatus: row.review_status,
    reviewerId: row.reviewer_id,
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    forgeryFlag: Number(row.forgery_flag) === 1,
    ...extra
  };
}

export function messageView(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    receiverType: row.receiver_type,
    receiverId: row.receiver_id,
    content: row.content,
    createdAt: row.created_at,
    read: row.read_status === '已读',
    ...extra
  };
}
