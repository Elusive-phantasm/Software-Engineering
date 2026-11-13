/**
 * 测试夹具：重置数据、构造已认证学生、读取开发邮箱验证码。
 * 全部通过公开接口完成，不直接读数据库，确保走查的是真实 HTTP 行为。
 */
import { Client, latestCode } from './harness.js';

/** 1×1 PNG，用作学生证 / 商品图占位 */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

export const PASSWORD = 'Test@12345';

/** 清库重灌演示数据（同时清空开发发件箱，便于定位最新验证码） */
export async function resetAll(client) {
  await client.request('DELETE', '/api/dev/mailbox');
  return client.postOk('/api/dev/reset');
}

export async function adminClient() {
  const c = new Client();
  await c.loginAdmin();
  return c;
}

/**
 * 通过真实注册 → 提交核验 → 管理员通过，得到一个已认证学生客户端。
 * @returns {Promise<{client: Client, studentId: string, studentNo: string, email: string}>}
 */
export async function makeCertifiedStudent(admin, { slug = 'new', studentNo, nickname } = {}) {
  const email = `${slug}${Date.now().toString(36)}@campus.edu`;
  const no = studentNo || String(20240000 + Math.floor(Math.random() * 90000));
  const client = new Client();
  client.label = email;

  await client.postOk('/api/auth/send-code', { email });
  const code = await latestCode(admin, email);
  await client.postOk('/api/auth/register', {
    email,
    code,
    nickname: nickname || `测试${slug}`,
    realName: `真实${slug}`,
    password: PASSWORD,
    agree: true
  });
  const { student } = await client.postOk('/api/auth/login', { email, password: PASSWORD });
  await client.postOk('/api/verifications', { studentNo: no, image: TINY_PNG });

  const pending = await admin.getOk('/api/admin/verifications?status=待审核');
  const app = pending.find((a) => a.studentId === student.id);
  if (!app) throw new Error('未找到待审核认证申请');
  await admin.postOk(`/api/admin/verifications/${app.id}/approve`);

  const me = await client.getOk('/api/auth/me');
  if (me.student.certStatus !== '已认证') throw new Error('认证未生效');

  return { client, studentId: student.id, studentNo: no, email };
}

/** 发布一件商品并让管理员审核通过，返回商品对象 */
export async function publishProduct(seller, admin, overrides = {}) {
  const payload = {
    title: overrides.title || `测试商品${Date.now().toString(36).slice(-4)}`,
    description: overrides.description || '测试用商品描述，九成新，无瑕疵，来源本人自购。',
    price: overrides.price || '25.50',
    condition: overrides.condition || '九成新',
    categoryId: overrides.categoryId || 'CAT-01',
    images: overrides.images || [TINY_PNG]
  };
  const created = await seller.postOk('/api/products', payload);
  if (overrides.skipApprove) return created;
  const approved = await admin.postOk(`/api/admin/products/${created.id}/approve`);
  return approved;
}

/** 学生客户端登录种子账号 */
export async function loginAs(email) {
  const c = new Client();
  await c.loginStudent(email);
  return c;
}

export const SEED = {
  lin: 'lin@campus.edu',
  zhao: 'zhao@campus.edu',
  lv: 'lv@campus.edu', // 未提交核验
  ma: 'ma@campus.edu', // 待审核
  guo: 'guo@campus.edu', // 已驳回
  ban: 'ban@campus.edu', // 封禁
  low: 'low@campus.edu', // 信用 55
  linId: 'STU-LIN',
  zhaoId: 'STU-ZHAO',
  lvId: 'STU-LV',
  maId: 'STU-MA',
  guoId: 'STU-GUO',
  banId: 'STU-BAN',
  lowId: 'STU-LOW'
};
