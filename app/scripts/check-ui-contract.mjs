/** 界面数据契约自检：确认各页面拿到的是期望形状的数据 */
import { Client } from '../tests/lib/harness.js';

const out = (label, value) => console.log(`\n[${label}]\n` + JSON.stringify(value, null, 1).slice(0, 900));

const guest = new Client();
const list = await guest.getOk('/api/products?pageSize=3');
out('首页商品卡片所需字段', list.items.map((p) => ({
  id: p.id, title: p.title, price: p.price, condition: p.condition,
  status: p.status, viewCount: p.viewCount, images: p.images?.length, seller: p.seller?.nickname, categoryName: p.categoryName
})));

const lin = new Client();
await lin.loginStudent('lin@campus.edu');
const mine = await lin.getOk('/api/me/products');
out('我的商品（分组）', Object.fromEntries(Object.entries(mine.groups).map(([k, v]) => [k, v.length])));
const badge = await lin.getOk('/api/badge');
out('红点', badge);
const convs = await lin.getOk('/api/messages/conversations');
out('私信会话（lin）', convs.items.map((c) => ({ peer: c.peerNickname, product: c.productTitle, unread: c.unread, last: c.lastContent?.slice(0, 20) })));
const notif = await lin.getOk('/api/notifications?pageSize=3');
out('通知', notif.items.map((n) => ({ type: n.msgType, title: n.title, read: n.read })));
const credit = await lin.getOk('/api/me/credit');
out('信用分', { score: credit.score, canPublish: credit.canPublish, canOrder: credit.canOrder, records: credit.records.length });
const profile = await lin.getOk(`/api/students/STU-LIN/profile`);
out('个人主页', { isSelf: profile.isSelf, inSale: profile.inSaleProducts.length, reviews: profile.reviews.length, dispute: profile.student.verifiedDisputeCount });

const admin = new Client();
await admin.loginAdmin();
const dash = await admin.getOk('/api/admin/dashboard');
out('管理端看板', dash);
const meta = await admin.getOk('/api/admin/meta');
out('后台元数据', { forbidden: meta.forbiddenCategories.length, actions: meta.actions, reportTypesByTarget: meta.reportTypesByTarget });
const certPending = await admin.getOk('/api/admin/verifications?status=待审核');
out('待审核验队列', certPending.map((c) => ({ nickname: c.nickname, declaredNo: c.declaredNo, hasImageField: 'cardImage' in c })));
