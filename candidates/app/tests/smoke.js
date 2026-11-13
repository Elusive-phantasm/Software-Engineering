/** 冒烟测试：确认服务与主要接口可用 */
import { Client, Assert, BASE } from './lib/harness.js';

const a = new Assert();
const guest = new Client();
const lin = new Client();
const admin = new Client();

a.group('基础可用性');
const cats = await guest.getOk('/api/categories');
a.ok(Array.isArray(cats) && cats.length >= 6, `分类接口返回 ${cats.length} 个分类`);
const list = await guest.getOk('/api/products?pageSize=5');
a.ok(list.items.length > 0, `商品列表返回 ${list.items.length} 条在售商品`);
a.ok(list.items.every((p) => p.status === '在售'), '列表只含「在售」商品（BR-11）');

a.group('学生登录与我的视图');
const me = await lin.loginStudent('lin@campus.edu');
a.equal(me.certStatus, '已认证', '林同学已认证');
const mine = await lin.getOk('/api/me/products');
a.ok(mine.total > 0, `我的商品共 ${mine.total} 件，分组：${Object.entries(mine.groups).map(([k, v]) => `${k}=${v.length}`).join(' ')}`);
const badge = await lin.getOk('/api/badge');
a.ok(badge.notificationUnread >= 0, `红点：通知 ${badge.notificationUnread} 条、私信 ${badge.messageUnread} 条`);

a.group('管理员登录与看板');
await admin.loginAdmin();
const dash = await admin.getOk('/api/admin/dashboard');
a.ok(dash.students.total >= 7, `学生总数 ${dash.students.total}，待审核核验 ${dash.students.pendingCert}`);
a.ok(dash.products.pending >= 2, `待审核商品 ${dash.products.pending}`);
a.ok(dash.reports.pending >= 1, `待处理举报 ${dash.reports.pending}`);

a.group('权限拒绝');
const anon = new Client();
await anon.postFail('/api/products', { title: 'x' }, 'AUTH_REQUIRED');
const lv = new Client();
await lv.loginStudent('lv@campus.edu');
await lv.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');

const pass = a.summary();
console.log(`\n服务地址：${BASE}`);
process.exit(pass ? 0 : 1);
