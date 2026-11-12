/**
 * 收藏：UC-09 收藏商品。
 * 业务规则：BR-11（默认只展示在售；收藏不锁定商品；(学生, 商品) 唯一；上限 100 件；
 *          商品状态变化不级联删除收藏记录，列表显示「已失效」）。
 */
import { L } from '../core/config.js';
import { bizId } from '../core/crypto.js';
import { all, count, get, run, tx } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { P } from '../core/rules.js';
import { nowIso } from '../core/time.js';
import { requireStudent, roleOf } from './guards.js';

export function addFavorite(actor, productId) {
  if (!actor || actor.kind === 'guest') throw E.auth(M.NOT_LOGGED_IN_FAVORITE);   // 辅事件流 C
  if (actor.kind === 'admin') throw E.permission(M.ADMIN_CANNOT_FAVORITE);
  const student = requireStudent(actor, M.ADMIN_CANNOT_FAVORITE);

  return tx(() => {
    const product = get('SELECT * FROM products WHERE id=?', productId);
    if (!product || product.deleted_at) throw E.notFound(M.PRODUCT_GONE);
    if (product.status !== P.ON_SALE) throw E.state('只能收藏「在售」商品');

    const exists = get('SELECT id FROM favorites WHERE student_id=? AND product_id=?', student.id, productId);
    if (exists) throw E.state(M.ALREADY_FAVORITE);                                 // 辅事件流 A

    if (count('SELECT COUNT(*) FROM favorites WHERE student_id=?', student.id) >= L.favoriteLimit) {
      throw E.state(M.FAVORITE_LIMIT);                                             // 辅事件流 D
    }
    run(
      'INSERT INTO favorites (id, student_id, product_id, created_at) VALUES (?,?,?,?)',
      bizId('FAV'), student.id, productId, nowIso()
    );
    audit({ actorType: 'student', actorId: student.id, role: roleOf(actor), action: 'favorite.add', targetType: 'product', targetId: productId, result: 'allowed' });
    return { ok: true, favorited: true };
  });
}

export function removeFavorite(actor, productId) {
  const student = requireStudent(actor, M.ADMIN_CANNOT_FAVORITE);
  if (actor.kind === 'admin') throw E.permission(M.ADMIN_CANNOT_FAVORITE);
  run('DELETE FROM favorites WHERE student_id=? AND product_id=?', student.id, productId);
  audit({ actorType: 'student', actorId: student.id, role: roleOf(actor), action: 'favorite.remove', targetType: 'product', targetId: productId, result: 'allowed' });
  return { ok: true, favorited: false };
}

/** 我的收藏：展示商品实际状态，已售出/已下架/已删除标记「已失效」 */
export function myFavorites(actor) {
  const student = requireStudent(actor, M.ADMIN_CANNOT_FAVORITE);
  if (actor.kind === 'admin') throw E.permission(M.ADMIN_CANNOT_FAVORITE);
  const rows = all(
    `SELECT f.created_at AS fav_at, p.* FROM favorites f JOIN products p ON p.id=f.product_id
      WHERE f.student_id=? ORDER BY f.created_at DESC`,
    student.id
  );
  return {
    total: rows.length,
    limit: L.favoriteLimit,
    items: rows.map((r) => {
      const invalid = !!r.deleted_at || r.status !== P.ON_SALE;
      return {
        favoriteAt: r.fav_at,
        invalid,
        invalidLabel: invalid ? '已失效' : null,
        product: {
          id: r.id,
          title: r.title,
          price: (Number(r.price_cents) / 100).toFixed(2),
          condition: r.condition,
          status: r.status,
          deleted: !!r.deleted_at,
          publishedAt: r.published_at
        }
      };
    })
  };
}
