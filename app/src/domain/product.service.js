/**
 * 商品：UC-05 发布、UC-06 审核、UC-07 搜索、UC-08 分类浏览、UC-11 下架/删除、UC-17 我的商品、UC-32 编辑。
 * 状态机：ST-01～ST-04、ST-06～ST-09、ST-12、ST-13（§7.4.1）。
 * 业务规则：BR-01、BR-02、BR-03、BR-04、BR-05、BR-09、BR-11、BR-13、BR-14、BR-15、BR-22。
 */
import { L } from '../core/config.js';
import { bizId, likeEscape } from '../core/crypto.js';
import { all, count, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify } from '../core/notifier.js';
import * as R from '../core/rules.js';
import { OFF_REASON, P, RESUBMITTABLE_REASONS } from '../core/rules.js';
import { saveDataUrl } from '../core/storage.js';
import { nowIso } from '../core/time.js';
import {
  assertOnSaleQuota,
  assertOwner,
  requireAdmin,
  requireCertified,
  requireCertifiedStudent,
  requirePublishRights,
  requireStudent,
  roleOf
} from './guards.js';
import { applyCreditChange, EVENT } from './credit.service.js';
import { productView, publicStudent } from './view.js';

const IMG_PREFIX_PRODUCT = '/uploads/';

/* ---------------------------------------------------------------- 内部工具 */
function loadProduct(id) {
  const row = get('SELECT * FROM products WHERE id=?', id);
  if (!row || row.deleted_at) throw E.notFound(M.PRODUCT_GONE);
  return row;
}

function imagesOf(productId) {
  return all('SELECT path FROM product_images WHERE product_id=? ORDER BY seq', productId).map((r) => r.path);
}

function categoryName(id) {
  return get('SELECT name FROM categories WHERE id=?', id)?.name ?? null;
}

function sellerOf(row) {
  return publicStudent(get('SELECT * FROM students WHERE id=?', row.seller_id));
}

function shape(row, extra = {}) {
  return productView(row, imagesOf(row.id), {
    categoryName: categoryName(row.category_id),
    seller: sellerOf(row),
    ...extra
  });
}

function favoriterIds(productId) {
  return all('SELECT student_id FROM favorites WHERE product_id=?', productId).map((r) => r.student_id);
}

/** BR-15：通知收藏过该商品的买家 */
function notifyFavoriters(productId, title, content, kind = 'product') {
  for (const sid of favoriterIds(productId)) {
    notify({
      recipientId: sid,
      msgType: '商品审核',
      title,
      content,
      relatedKind: kind,
      relatedId: productId
    });
  }
}

function persistImages(productId, images) {
  let seq = 1;
  for (const img of images) {
    const path = String(img).startsWith('data:') ? saveDataUrl(img, 'product') : String(img);
    if (!String(path).startsWith(IMG_PREFIX_PRODUCT) && !String(img).startsWith('data:')) {
      throw E.validation('图片地址无效');
    }
    run('INSERT INTO product_images (product_id, seq, path) VALUES (?,?,?)', productId, seq++, path);
  }
}

function validateCommonFields(payload) {
  const title = R.validateTitle(payload.title);
  const description = R.validateDescription(payload.description);
  const priceCents = R.validatePrice(payload.price);
  const condition = R.validateCondition(payload.condition);
  const category = get('SELECT * FROM categories WHERE id=?', payload.categoryId);
  if (!category || Number(category.active) !== 1) throw E.validation(M.CATEGORY_INVALID);
  return { title, description, priceCents, condition, categoryId: category.id };
}

/* ------------------------------------------------------------- UC-05 发布商品 */
export function createProduct(actor, payload) {
  const student = requirePublishRights(actor);
  assertOnSaleQuota(student);
  const fields = validateCommonFields(payload);
  const images = R.validateImages(payload.images || []);
  const now = nowIso();
  const id = bizId('PRD');

  tx(() => {
    run(
      `INSERT INTO products
        (id, title, description, price_cents, condition, seller_id, category_id, status,
         off_shelf_reason, published_at, deleted_at, view_count, review_note, reviewed_by, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?,NULL,?,NULL,0,NULL,NULL,NULL)`,
      id,
      fields.title,
      fields.description,
      fields.priceCents,
      fields.condition,
      student.id,
      fields.categoryId,
      P.PENDING,
      now
    );
    persistImages(id, images);
    audit({
      actorType: 'student',
      actorId: student.id,
      role: roleOf(actor),
      action: 'product.publish',
      targetType: 'product',
      targetId: id,
      result: 'allowed'
    });
  });

  return shape(loadProduct(id));
}

/* ------------------------------------------------------------- 浏览 / 搜索 */
export function listProducts(actor, query = {}) {
  const conditions = [`p.status = ?`, `p.deleted_at IS NULL`];
  const args = [P.ON_SALE];

  const keyword = String(query.keyword || '').trim();
  if (keyword) {
    // UC-07 辅事件流 E：敏感词不发起检索
    if (R.isBlockedKeyword(keyword)) throw E.validation(M.KEYWORD_BLOCKED);
    conditions.push(`(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`);
    const like = `%${likeEscape(keyword)}%`;
    args.push(like, like);
  }
  if (query.categoryId) {
    conditions.push('p.category_id = ?');
    args.push(String(query.categoryId));
  }
  if (query.condition && R.CONDITIONS.includes(query.condition)) {
    conditions.push('p.condition = ?');
    args.push(query.condition);
  }
  if (query.minPrice) {
    conditions.push('p.price_cents >= ?');
    args.push(Math.max(0, Math.round(Number(query.minPrice) * 100)));
  }
  if (query.maxPrice) {
    conditions.push('p.price_cents <= ?');
    args.push(Math.round(Number(query.maxPrice) * 100));
  }

  const sortMap = {
    latest: 'p.published_at DESC',
    priceAsc: 'p.price_cents ASC',
    priceDesc: 'p.price_cents DESC',
    hot: 'p.view_count DESC'
  };
  const orderBy = sortMap[query.sort] || sortMap.latest;

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(query.pageSize) || 12));
  const where = conditions.join(' AND ');
  const total = count(`SELECT COUNT(*) FROM products p WHERE ${where}`, ...args);
  const rows = all(
    `SELECT p.* FROM products p WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...args,
    pageSize,
    (page - 1) * pageSize
  );
  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => shape(r))
  };
}

export function listCategories() {
  const cats = all('SELECT * FROM categories WHERE active=1 ORDER BY sort, id');
  const stats = all(
    `SELECT category_id, COUNT(*) AS n FROM products
      WHERE status=? AND deleted_at IS NULL GROUP BY category_id`,
    P.ON_SALE
  );
  const map = new Map(stats.map((s) => [s.category_id, Number(s.n)]));
  return cats.map((c) => ({ id: c.id, name: c.name, onSaleCount: map.get(c.id) || 0 }));
}

/**
 * UC-07 详情：在售/已售出对所有人可见；待审核与已下架仅发布人与管理员可见（§7.2）。
 */
export function getProductDetail(actor, id, { countView = true } = {}) {
  const row = get('SELECT * FROM products WHERE id=?', id);
  if (!row || row.deleted_at) throw E.notFound(M.PRODUCT_GONE);

  const isOwner = actor?.kind === 'student' && actor.id === row.seller_id;
  const isAdmin = actor?.kind === 'admin';
  const publicVisible = row.status === P.ON_SALE || row.status === P.SOLD;
  if (!publicVisible && !isOwner && !isAdmin) throw E.notFound(M.PRODUCT_GONE);

  if (countView && !isOwner) {
    run('UPDATE products SET view_count = view_count + 1 WHERE id=?', id);
    row.view_count = Number(row.view_count) + 1;
  }

  const favoriteCount = count('SELECT COUNT(*) FROM favorites WHERE product_id=?', id);
  const favorited = actor?.kind === 'student'
    ? !!get('SELECT id FROM favorites WHERE student_id=? AND product_id=?', actor.id, id)
    : false;

  return shape(row, { favoriteCount, favorited, owner: isOwner, adminView: isAdmin });
}

/* ------------------------------------------------------- UC-32 / ST-12 编辑 */
export function updateProduct(actor, id, payload) {
  const student = requireCertifiedStudent(actor, M.ADMIN_CANNOT_PUBLISH);
  if (student.account_status === '封禁') throw E.permission(M.ACCOUNT_BANNED);

  return tx(() => {
    const row = loadProduct(id);
    assertOwner(row.seller_id, student, '仅限本人发布的商品');

    if (row.status === P.SOLD) throw E.state(M.EDIT_SOLD_FORBIDDEN);           // 辅事件流 B
    if (row.status === P.OFF) {
      throw E.state('该商品已下架，请使用「修改后重新提交」走重新审核（ST-08）');
    }
    if (row.status !== P.PENDING && row.status !== P.ON_SALE) {
      throw E.state(M.STATE_UNSUPPORTED);
    }

    // 系统字段（发布人 / 状态 / 下架原因 / 发布时间）不可写，修改被丢弃（辅事件流 G）
    const fields = validateCommonFields(payload);
    const newImages = payload.images ? R.validateImages(payload.images) : null;
    const now = nowIso();

    run(
      `UPDATE products SET title=?, description=?, price_cents=?, condition=?, category_id=?,
              published_at=? WHERE id=?`,
      fields.title,
      fields.description,
      fields.priceCents,
      fields.condition,
      fields.categoryId,
      now,
      id
    );

    if (newImages) {
      run('DELETE FROM product_images WHERE product_id=?', id);
      persistImages(id, newImages);
    }

    let targetStatus = row.status;
    if (row.status === P.ON_SALE) {
      // ST-12：在售商品任何编辑都回到「待审核」重审，立即从搜索与分类列表移除
      run(
        'UPDATE products SET status=?, off_shelf_reason=NULL, review_note=NULL, reviewed_by=NULL, reviewed_at=NULL WHERE id=?',
        P.PENDING,
        id
      );
      targetStatus = P.PENDING;
      notifyFavoriters(
        id,
        '你收藏的商品已修改，等待重新审核',
        `商品《${fields.title}》的卖家修改了内容，需重新审核通过后才对外展示。`
      );
    } else {
      // BR-22 ②：待审核商品编辑后保持待审核并刷新排队时间（24 小时重新起算）
      targetStatus = P.PENDING;
    }

    notify({
      recipientId: student.id,
      msgType: '商品审核',
      title: '修改已提交，等待重新审核',
      content: `商品《${fields.title}》的修改已提交，需重新审核通过后才对外展示。`,
      relatedKind: 'product',
      relatedId: id
    });
    audit({
      actorType: 'student',
      actorId: student.id,
      role: roleOf(actor),
      action: 'product.edit',
      targetType: 'product',
      targetId: id,
      result: 'allowed',
      detail: { from: row.status, to: targetStatus }
    });

    return shape(loadProduct(id));
  });
}

/* ---------------------------------------------------- UC-11 / ST-04 卖家撤回 */
export function withdrawProduct(actor, id) {
  const student = requireCertified(requireStudent(actor));
  const row = loadProduct(id);
  assertOwner(row.seller_id, student, '仅限本人发布的商品');
  if (row.status !== P.PENDING) {
    if (row.status === P.SOLD) throw E.state(M.PRODUCT_SOLD_NO_OFF);
    throw E.state('仅「待审核」商品可撤回');
  }
  run('UPDATE products SET status=?, off_shelf_reason=? WHERE id=?', P.OFF, OFF_REASON.SELLER_WITHDRAW, id);
  audit({ actorType: 'student', actorId: student.id, role: roleOf(actor), action: 'product.withdraw', targetType: 'product', targetId: id, result: 'allowed' });
  return shape(loadProduct(id));
}

/* -------------------------------------------------- UC-11 / ST-06 卖家主动下架 */
export function takeDownProduct(actor, id) {
  const student = requireCertified(requireStudent(actor));
  return tx(() => {
    const row = loadProduct(id);
    assertOwner(row.seller_id, student, '仅限本人发布的商品');
    if (row.status === P.SOLD) throw E.state(M.PRODUCT_SOLD_NO_OFF);
    if (row.status === P.OFF) {
      if (row.off_shelf_reason === OFF_REASON.ADMIN_OFF) throw E.permission(M.PRODUCT_ADMIN_OFF);
      throw E.state('该商品已下架');
    }
    if (row.status === P.PENDING) throw E.state('「待审核」商品只能撤回，不能下架（UC-11 辅事件流 D）');
    run('UPDATE products SET status=?, off_shelf_reason=? WHERE id=?', P.OFF, OFF_REASON.SELLER_OFF, id);
    notifyFavoriters(id, '你收藏的商品已下架', `卖家下架了商品《${row.title}》，该收藏已标记为「已失效」。`);
    audit({ actorType: 'student', actorId: student.id, role: roleOf(actor), action: 'product.takeDown', targetType: 'product', targetId: id, result: 'allowed' });
    return shape(loadProduct(id));
  });
}

/* ------------------------------------------------- UC-11 / BR-09 永久删除 */
export function deleteProduct(actor, id) {
  const student = requireCertified(requireStudent(actor));
  return tx(() => {
    const row = get('SELECT * FROM products WHERE id=?', id);
    if (!row || row.deleted_at) throw E.notFound(M.PRODUCT_GONE);
    assertOwner(row.seller_id, student, '仅限本人发布的商品');
    if (row.status === P.SOLD) throw E.state(M.PRODUCT_SOLD_NO_OFF);
    if (row.status === P.ON_SALE) throw E.state(M.DELETE_NEEDS_OFFSHELF);
    if (row.status === P.PENDING) throw E.state('「待审核」商品只能撤回，不能删除');
    if (row.status !== P.OFF) throw E.state(M.STATE_UNSUPPORTED);
    if (row.off_shelf_reason === OFF_REASON.ADMIN_OFF) throw E.permission(M.PRODUCT_ADMIN_OFF);
    // 软删除：写入删除时间，从所有列表排除、不可恢复；历史成交与收藏记录保留（BR-09）
    run('UPDATE products SET deleted_at=? WHERE id=?', nowIso(), id);
    audit({ actorType: 'student', actorId: student.id, role: roleOf(actor), action: 'product.delete', targetType: 'product', targetId: id, result: 'allowed' });
    return { ok: true, deletedId: id };
  });
}

/* ------------------------------------------------ ST-08 已下架后重新提交 */
export function resubmitProduct(actor, id, payload = {}) {
  const student = requireCertifiedStudent(actor, M.ADMIN_CANNOT_PUBLISH);
  if (student.account_status === '封禁') throw E.permission(M.ACCOUNT_BANNED);
  return tx(() => {
    const row = loadProduct(id);
    assertOwner(row.seller_id, student, '仅限本人发布的商品');
    if (row.status !== P.OFF) throw E.state('仅「已下架」商品可重新提交');
    if (row.off_shelf_reason === OFF_REASON.ADMIN_OFF) {
      throw E.state('该商品因违规被管理员下架，请先在站内私信中联系管理员复核（UC-13 辅事件流 C）');
    }
    if (row.off_shelf_reason === OFF_REASON.CANCEL_NO_TRADE) {
      throw E.state('该商品因卖家账号封禁而不可交易，须先由管理员解除封禁');
    }
    if (!RESUBMITTABLE_REASONS.includes(row.off_shelf_reason)) throw E.state(M.STATE_UNSUPPORTED);
    assertOnSaleQuota(student);

    const fields = payload.title ? validateCommonFields({ ...payload }) : null;
    if (fields) {
      run(
        `UPDATE products SET title=?, description=?, price_cents=?, condition=?, category_id=? WHERE id=?`,
        fields.title, fields.description, fields.priceCents, fields.condition, fields.categoryId, id
      );
      if (payload.images) {
        run('DELETE FROM product_images WHERE product_id=?', id);
        persistImages(id, R.validateImages(payload.images));
      }
    }
    run(
      'UPDATE products SET status=?, off_shelf_reason=NULL, review_note=NULL, reviewed_by=NULL, reviewed_at=NULL, published_at=? WHERE id=?',
      P.PENDING,
      nowIso(),
      id
    );
    audit({ actorType: 'student', actorId: student.id, role: roleOf(actor), action: 'product.resubmit', targetType: 'product', targetId: id, result: 'allowed' });
    return shape(loadProduct(id));
  });
}

/* ------------------------------------------------------------- UC-17 我的商品 */
export function myProducts(actor) {
  const student = requireStudent(actor);
  if (actor.kind === 'admin') throw E.permission('管理员无「我的商品」视图（§5.2）');
  const rows = all(
    `SELECT * FROM products WHERE seller_id=? AND deleted_at IS NULL
      ORDER BY published_at DESC`,
    student.id
  );
  const groups = { 待审核: [], 在售: [], 已售出: [], 已下架: [] };
  for (const row of rows) {
    if (!groups[row.status]) continue;
    groups[row.status].push(
      shape(row, {
        favoriteCount: count('SELECT COUNT(*) FROM favorites WHERE product_id=?', row.id),
        canEdit: row.status === P.PENDING || row.status === P.ON_SALE,
        canWithdraw: row.status === P.PENDING,
        canTakeDown: row.status === P.ON_SALE,
        canDelete: row.status === P.OFF && row.off_shelf_reason !== OFF_REASON.ADMIN_OFF,
        canResubmit:
          row.status === P.OFF && RESUBMITTABLE_REASONS.includes(row.off_shelf_reason)
      })
    );
  }
  return { total: rows.length, groups };
}

/* ------------------------------------------------------------ UC-06 审核队列 */
export function adminPendingProducts() {
  const rows = all(
    `SELECT * FROM products WHERE status=? AND deleted_at IS NULL ORDER BY published_at ASC`,
    P.PENDING
  );
  return rows.map((r) => shape(r, { waitingHours: Math.floor((Date.now() - Date.parse(r.published_at)) / 3600000) }));
}

export function adminAllProducts({ status, keyword } = {}) {
  const conds = ['p.deleted_at IS NULL'];
  const args = [];
  if (status && R.PRODUCT_STATES.includes(status)) {
    conds.push('p.status=?');
    args.push(status);
  }
  if (keyword) {
    conds.push(`p.title LIKE ? ESCAPE '\\'`);
    args.push(`%${likeEscape(keyword)}%`);
  }
  const rows = all(`SELECT p.* FROM products p WHERE ${conds.join(' AND ')} ORDER BY p.published_at DESC LIMIT 300`, ...args);
  return rows.map((r) => shape(r));
}

/** ST-02 审核通过 */
export function approveProduct(actor, id) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const row = loadProduct(id);
    if (row.status !== P.PENDING) throw E.state(M.NOT_PENDING);
    run(
      'UPDATE products SET status=?, off_shelf_reason=NULL, reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?',
      P.ON_SALE, admin.id, nowIso(), '审核通过', id
    );
    notify({
      recipientId: row.seller_id,
      msgType: '商品审核',
      title: '商品审核通过',
      content: `商品《${row.title}》已审核通过并上架。`,
      relatedKind: 'product',
      relatedId: id
    });
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'product.approve', targetType: 'product', targetId: id, result: 'allowed' });
    return shape(loadProduct(id));
  });
}

/** ST-03 审核拒绝：原因必须引用 §4.3 类目编号 */
export function rejectProduct(actor, id, { reason, categoryCode }) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const row = loadProduct(id);
    if (row.status !== P.PENDING) throw E.state(M.NOT_PENDING);
    const note = R.validateRejectReason(reason, true, categoryCode);
    run(
      'UPDATE products SET status=?, off_shelf_reason=?, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?',
      P.OFF, OFF_REASON.REJECTED, note, admin.id, nowIso(), id
    );
    notify({
      recipientId: row.seller_id,
      msgType: '商品审核',
      title: '商品审核不通过',
      content: `商品《${row.title}》未通过审核。原因：${note}。可删除违规内容后重新提交（ST-08）。`,
      relatedKind: 'product',
      relatedId: id
    });
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'product.reject', targetType: 'product', targetId: id, result: 'allowed', detail: { note } });
    return shape(loadProduct(id));
  });
}

/** ST-07 管理员违规下架（同时按 BR-14 ② 扣 −10 并写信用记录） */
export function forceOffShelfProduct(actor, id, { reason, categoryCode, deduct = true, sourceKey = null }) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const row = loadProduct(id);
    if (row.status !== P.ON_SALE && row.status !== P.PENDING) {
      // 已售出商品不可下架（BR-09）；此处仅记录结论，商品状态不变
      throw E.state('仅「在售」或「待审核」商品可被强制下架（BR-09：已售出商品任何角色不可下架）');
    }
    const note = reason ? String(reason).slice(0, 200) : '违反 §4.3 禁售品类清单';
    run(
      'UPDATE products SET status=?, off_shelf_reason=?, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?',
      P.OFF, OFF_REASON.ADMIN_OFF, note, admin.id, nowIso(), id
    );
    if (deduct) {
      applyCreditChange({
        studentId: row.seller_id,
        delta: R.FORBIDDEN_CODES.includes(String(categoryCode || '').toUpperCase()) ? -10 : -10,
        eventType: EVENT.VIOLATION,
        reason: `商品《${row.title}》被管理员强制下架${categoryCode ? `（§4.3 ${categoryCode}）` : ''}：${note}`,
        sourceKey: sourceKey || `violation:product:${id}`
      });
    }
    notify({
      recipientId: row.seller_id,
      msgType: '处置',
      title: '商品被强制下架',
      content: `商品《${row.title}》因违规被管理员强制下架。原因：${note}。如认为处置有误，可在该商品的站内私信向管理员提出异议。`,
      relatedKind: 'product',
      relatedId: id
    });
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'product.forceOffShelf', targetType: 'product', targetId: id, result: 'allowed', detail: { note, categoryCode } });
    return shape(loadProduct(id));
  });
}

/** ST-09 管理员撤销违规处置：已下架(管理员违规下架) → 在售，扣分不回滚 */
export function restoreProduct(actor, id, { reason }) {
  const admin = requireAdmin(actor);
  return tx(() => {
    const row = loadProduct(id);
    if (row.status !== P.OFF || row.off_shelf_reason !== OFF_REASON.ADMIN_OFF) {
      throw E.state('仅「已下架（管理员违规下架）」的商品可撤销处置');
    }
    const note = String(reason || '').trim();
    if (!note) throw E.validation(M.ADMIN_REASON_REQUIRED);
    run(
      'UPDATE products SET status=?, off_shelf_reason=NULL, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?',
      P.ON_SALE, `撤销处置：${note}`, admin.id, nowIso(), id
    );
    notify({
      recipientId: row.seller_id,
      msgType: '商品审核',
      title: '商品已恢复在售',
      content: `经复核，商品《${row.title}》的违规处置已撤销，商品重新上架（信用分不因复核而回滚）。`,
      relatedKind: 'product',
      relatedId: id
    });
    notifyFavoriters(id, '你收藏的商品重新在售', `商品《${row.title}》已恢复在售，可以下单了。`);
    audit({ actorType: 'admin', actorId: admin.id, role: '管理员', action: 'product.restore', targetType: 'product', targetId: id, result: 'allowed', detail: { note } });
    return shape(loadProduct(id));
  });
}

/** ST-13 封禁联动下架（BR-10）：在售与待审核商品一并转「已下架（管理员违规下架）」 */
export function offShelfAllForBannedSeller(sellerId, adminId) {
  const rows = all(
    `SELECT * FROM products WHERE seller_id=? AND deleted_at IS NULL AND status IN (?,?)`,
    sellerId,
    P.ON_SALE,
    P.PENDING
  );
  for (const row of rows) {
    run(
      'UPDATE products SET status=?, off_shelf_reason=?, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?',
      P.OFF, OFF_REASON.ADMIN_OFF, '账号封禁联动下架（BR-10 / ST-13）', adminId, nowIso(), row.id
    );
    notify({
      recipientId: sellerId,
      msgType: '处置',
      title: '商品被联动下架',
      content: `因账号被封禁，商品《${row.title}》已联动下架（BR-10）。`,
      relatedKind: 'product',
      relatedId: row.id
    });
  }
  return rows.length;
}

/** ST-11 撤销后不可交易：卖家已封禁时，撤销成交不回到在售而转已下架 */export function offShelfAfterCancel(productId, adminId = null) {
  run(
    'UPDATE products SET status=?, off_shelf_reason=?, review_note=? WHERE id=?',
    P.OFF, OFF_REASON.CANCEL_NO_TRADE, '撤销成交时卖家账号已封禁（ST-11）', productId
  );
  return true;
}

/** BR-15：商品重新回到「在售」（撤销后重新可售、撤销违规处置后恢复），通知收藏过该商品的买家 */
export function notifyProductBackOnSale(productId, title) {
  notifyFavoriters(
    productId,
    '你收藏的商品重新在售',
    `商品《${title}》已重新回到「在售」，可以下单了。`
  );
}

export function assertProductCategory(id) {
  const c = get('SELECT * FROM categories WHERE id=?', id);
  if (!c) throw E.validation(M.CATEGORY_INVALID);
  return c;
}
