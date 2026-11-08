/**
 * 演示/自检：不用浏览器、直接构造 HTTP 请求，验证"规则由后端执行"。
 * 运行：node --no-warnings scripts/check-server-authority.mjs
 */
import { Client } from '../tests/lib/harness.js';

const show = (label, r) =>
  console.log(
    `${label.padEnd(38)} → HTTP ${String(r.status).padEnd(3)} ${r.body?.ok ? 'OK' : r.body?.code} ${r.body?.message || ''}`
  );

console.log('== 后端是规则的唯一执行者（全部绕过前端界面，直接构造请求）==\n');

// 1) 未登录直接下单
const guest = new Client();
show('未登录 POST /api/orders', await guest.request('POST', '/api/orders', { productId: 'PRD-002' }));

// 2) 未认证学生直接下单
const lv = new Client();
await lv.postOk('/api/auth/login', { email: 'lv@campus.edu', password: 'Test@12345' });
show('未认证学生 POST /api/orders', await lv.request('POST', '/api/orders', { productId: 'PRD-002' }));

// 3) 学生伪造字段发布商品（伪造价格 1e9、伪造发布人）
const lin = new Client();
await lin.postOk('/api/auth/login', { email: 'lin@campus.edu', password: 'Test@12345' });
show(
  '已认证学生发布「价格 999999999」',
  await lin.request('POST', '/api/products', {
    title: '越权测试', description: '内容内容内容', price: '999999999', condition: '全新',
    categoryId: 'CAT-01', images: ['data:image/png;base64,iVBORw0KGgo='], sellerId: 'STU-HACK'
  })
);

// 4) 登录用户直接访问后台接口
show('学生 GET /api/admin/dashboard', await lin.request('GET', '/api/admin/dashboard'));

// 5) 直接改他人商品（不经界面）
show('学生 PATCH 他人商品', await lin.request('PATCH', '/api/products/PRD-003', { title: 'hack' }));

// 6) 第三方读取他人私信会话
const zhao = new Client();
await zhao.postOk('/api/auth/login', { email: 'zhao@campus.edu', password: 'Test@12345' });
show(
  '第三方读他人会话正文',
  await zhao.request('GET', '/api/messages/conversations/PRD-002/STU-GUO')
);

// 7) 后端返回的是数据，不是渲染好的 HTML
const list = await guest.request('GET', '/api/products?pageSize=2');
console.log('\n== /api/products 返回的是 JSON 数据（前端负责渲染）==');
console.log(
  JSON.stringify(
    { ok: list.body.ok, total: list.body.data.total, firstItemKeys: Object.keys(list.body.data.items[0]) },
    null,
    1
  )
);
console.log('\n结论：隐藏按钮只是交互辅助；直接构造请求同样被鉴权与校验拦住（§5.5 第 1 条）。');
