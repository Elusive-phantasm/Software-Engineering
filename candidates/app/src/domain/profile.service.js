/**
 * 个人主页与信用分：UC-33 查看个人主页、UC-15 查看信用分。
 * 公开字段以 §6.5 为准：昵称、认证标识、信用分、评价数、被核实争议数、在售商品、已公开评价 → 公开；
 * 真实姓名、手机号、宿舍地址、成交记录、举报明细、信用变动明细 → 不公开。
 */
import { all, get } from '../core/db.js';
import { M, E } from '../core/errors.js';
import { CREDIT } from '../core/config.js';
import { CERT, P } from '../core/rules.js';
import { requireLogin } from './guards.js';
import { creditRecords, creditSummary } from './credit.service.js';
import { publicReviewsOf } from './review.service.js';
import { publicStudent, selfStudent } from './view.js';

/** UC-33：游客不可查看（辅事件流 C），且不展示任何隐私字段 */
export function viewProfile(actor, studentId) {
  if (!actor || actor.kind === 'guest') throw E.auth('请先登录后查看用户主页');
  const row = get('SELECT * FROM students WHERE id=?', studentId);
  if (!row) throw E.notFound('该用户不存在');                                  // 辅事件流 A

  const isSelf = actor.kind === 'student' && actor.id === studentId;
  const isAdmin = actor.kind === 'admin';
  const banned = row.account_status === '封禁';

  // 封禁账号：主页仍可访问，但隐藏在售商品（BR-10 已连带下架）
  const products = banned
    ? []
    : all(
        `SELECT id, title, price_cents, condition, category_id, published_at, view_count
           FROM products WHERE seller_id=? AND status=? AND deleted_at IS NULL
          ORDER BY published_at DESC`,
        studentId,
        P.ON_SALE
      ).map((p) => ({
        id: p.id,
        title: p.title,
        price: (Number(p.price_cents) / 100).toFixed(2),
        condition: p.condition,
        publishedAt: p.published_at,
        viewCount: Number(p.view_count)
      }));

  const reviews = publicReviewsOf(studentId);                                  // 双方均提交后展示

  return {
    student: {
      ...publicStudent(row),
      certLabel: row.cert_status === CERT.CERTIFIED ? '已认证' : '未认证',
      banned,
      inSaleCount: products.length
    },
    isSelf,
    reviews,
    inSaleProducts: products,
    selfExtra: isSelf
      ? {
          ...selfStudent(row),
          entries: ['我的商品', '我的订单', '我的收藏', '我的私信', '我的举报', '信用分']
        }
      : isAdmin
        ? {
            realName: row.real_name,
            email: row.email,
            studentNo: row.student_no,
            phone: row.phone ? '已填写（管理员按最小必要原则查看）' : null,
            dorm: row.dorm ? '已填写（管理员按最小必要原则查看）' : null,
            resubmitCount: Number(row.resubmit_count)
          }
        : null
  };
}

/** UC-15：本人/管理员可见分数与明细；他人仅可见分数（辅事件流 C） */
export function creditInfo(actor, studentId) {
  requireLogin(actor);
  const target = studentId || (actor.kind === 'student' ? actor.id : null);
  if (!target) throw E.validation('请指定学生');
  const row = get('SELECT * FROM students WHERE id=?', target);
  if (!row) throw E.notFound('该用户不存在');

  const isSelf = actor.kind === 'student' && actor.id === target;
  const isAdmin = actor.kind === 'admin';
  const summary = creditSummary(target);

  if (!isSelf && !isAdmin) {
    return { ...summary, records: null, restricted: true, hint: '他人信用分仅展示分数，不展示变动明细与具体交易记录（NFR-04）' };
  }
  return {
    ...summary,
    records: creditRecords(target, 100),
    rules: {
      initial: CREDIT.initial,
      range: [CREDIT.min, CREDIT.max],
      publishThreshold: CREDIT.publishThreshold,
      orderThreshold: CREDIT.orderThreshold,
      events: [
        { name: '评价加分', delta: `+${CREDIT.reviewBonus}`, desc: '成交后提交评价，评价人加分（对方未评价也加分）' },
        { name: '违规处置', delta: `${CREDIT.violationPenalty}`, desc: '举报成立或商品被管理员强制下架' },
        { name: '未评价扣分', delta: `${CREDIT.noReviewPenalty}`, desc: '成交后 7 天内未评价（已撤销记录不适用）' },
        { name: '撤销违约', delta: `${CREDIT.cancelPenalty}`, desc: '单方撤销成交被判「计违约」（每笔成交最多一次）' }
      ]
    }
  };
}
