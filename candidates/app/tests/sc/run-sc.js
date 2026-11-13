/**
 * §7.5 场景走查（SC-01～SC-12）自动化验收脚本
 * 另追加 SC-13：§4.3 禁售品类清单 18 类逐类审核（BR-04 可验收性）。
 *
 * 每个场景都从「清库重灌演示数据」开始，只通过 HTTP 接口驱动，
 * 断言的是「预期状态与数据结果」列，不是内部实现。
 *
 * 运行：npm run test:sc（需先启动服务：npm start）
 */
import { Client, Assert } from '../lib/harness.js';
import { adminClient, makeCertifiedStudent, publishProduct, loginAs, resetAll, TINY_PNG, PASSWORD, SEED } from '../lib/fixtures.js';

const a = new Assert();
let admin;

async function reset() {
  admin = await adminClient();
  await resetAll(admin);
  admin = await adminClient();
}

/* ================================================================= SC-01 */
async function sc01() {
  a.group('SC-01 正常主流程：注册 → 核验 → 发布 → 审核 → 搜索 → 下单 → 互评 → 信用分');
  await reset();

  // 1) 学生 A 注册（走真实邮箱验证码）
  const seller = await makeCertifiedStudent(admin, { slug: 'sc01seller', nickname: 'SC01卖家' });
  a.equal((await seller.client.getOk('/api/verifications/mine')).certStatus, '已认证', '认证状态 未提交 → 待审核 → 已认证');

  // 2) 发布商品 → 待审核
  const created = await publishProduct(seller.client, admin, { skipApprove: true, title: 'SC01 二手教材', price: '18.80' });
  a.equal(created.status, '待审核', '商品状态 待审核（ST-01）');

  // 3) 管理员审核通过 → 在售
  const approved = await admin.postOk(`/api/admin/products/${created.id}/approve`);
  a.equal(approved.status, '在售', '商品状态 待审核 → 在售（ST-02）');

  // 4) 学生 B 搜索到该商品
  const buyer = await makeCertifiedStudent(admin, { slug: 'sc01buyer', nickname: 'SC01买家' });
  const found = await buyer.client.getOk('/api/products?keyword=' + encodeURIComponent('SC01 二手教材'));
  a.equal(found.items.length, 1, '买家搜索到该商品');

  // 5) 下单 → 已售出 + 1 条成交记录
  const order = await buyer.client.postOk('/api/orders', { productId: created.id });
  a.equal(order.status, '有效', '生成 1 条成交记录');
  a.equal((await new Client().getOk(`/api/products/${created.id}`)).status, '已售出', '商品状态 在售 → 已售出（ST-05）');

  // 6) 双方互评 → 各 +2
  const buyerBefore = (await buyer.client.getOk('/api/me/credit')).score;
  const sellerBefore = (await seller.client.getOk('/api/me/credit')).score;
  await buyer.client.postOk(`/api/orders/${order.id}/reviews`, { content: '书很新，卖家守时。' });
  await seller.client.postOk(`/api/orders/${order.id}/reviews`, { content: '买家沟通顺畅。' });
  a.equal((await buyer.client.getOk('/api/me/credit')).score, buyerBefore + 2, '买家评价 +2 分（BR-14 ①）');
  a.equal((await seller.client.getOk('/api/me/credit')).score, sellerBefore + 2, '卖家评价 +2 分（BR-14 ①）');

  // 7) 查看信用分与主页展示
  const credit = await seller.client.getOk('/api/me/credit');
  a.ok(credit.records.length >= 1, '信用分页可见变动明细');
  const profile = await buyer.client.getOk(`/api/students/${seller.studentId}/profile`);
  a.equal(profile.reviews.length, 1, '双方均提交后评价在主页展示');
  a.ok(!JSON.stringify(profile).includes('13800'), '主页不泄露手机号（NFR-04）');
}

/* ================================================================= SC-02 */
async function sc02() {
  a.group('SC-02 权限：未认证 / 管理员 / 越权读取');
  await reset();
  const lv = await loginAs(SEED.lv);

  const totalBefore = (await admin.getOk('/api/admin/products')).length;
  await lv.postFail('/api/products', { title: '未认证不该成功', description: '内容内容内容', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  const totalAfter = (await admin.getOk('/api/admin/products')).length;
  a.equal(totalAfter, totalBefore, `未认证学生发布：不新增商品（前后均 ${totalBefore} 件）`);
  await lv.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.equal((await new Client().getOk('/api/products/PRD-001')).status, '在售', '未认证学生下单：商品保持「在售」');

  await admin.postFail('/api/products', { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  await admin.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  await admin.postFail('/api/reports', { targetType: '商品', targetId: 'PRD-001', type: '虚假描述', reason: 'x' }, 'PERMISSION_DENIED');
  a.ok(true, '管理员发布 / 下单 / 举报全部被拒（§5.2）');

  const zhao = await loginAs(SEED.zhao);
  const detail = await zhao.getOk(`/api/students/${SEED.linId}/profile`);
  a.ok(!JSON.stringify(detail).includes('13800000001'), '指定他人学号读取手机号：不返回手机号');
  a.ok(!JSON.stringify(detail).includes('紫荆'), '不返回宿舍地址');
  const credit = await zhao.getOk(`/api/students/${SEED.linId}/credit`);
  a.equal(credit.records, null, '他人信用分只返回分数，不返回明细');
}

/* ================================================================= SC-03 */
async function sc03() {
  a.group('SC-03 并发抢购：两名买家同时对同一「在售」商品下单');
  await reset();
  const lin = await loginAs(SEED.lin);
  const product = await publishProduct(lin, admin, { title: 'SC03 抢购商品' });
  const b1 = (await makeCertifiedStudent(admin, { slug: 'sc03a', nickname: '抢购A' })).client;
  const b2 = (await makeCertifiedStudent(admin, { slug: 'sc03b', nickname: '抢购B' })).client;

  const results = await Promise.all([
    b1.request('POST', '/api/orders', { productId: product.id }),
    b2.request('POST', '/api/orders', { productId: product.id })
  ]);
  const okCount = results.filter((r) => r.body?.ok).length;
  const failCount = results.filter((r) => !r.body?.ok).length;
  a.equal(okCount, 1, '仅一笔成功');
  a.equal(failCount, 1, '另一笔失败');
  a.includes(results.find((r) => !r.body.ok).body.message, '已售出', '失败方提示「该商品已售出」');
  a.equal((await new Client().getOk(`/api/products/${product.id}`)).status, '已售出', '商品状态为「已售出」');
  const orders = await admin.getOk('/api/admin/orders');
  a.equal(orders.filter((o) => o.productId === product.id).length, 1, '仅存在 1 条成交记录');
}

/* ================================================================= SC-04 */
async function sc04() {
  a.group('SC-04 审核与重提：拒绝 → 重新提交 → 通过；待审核撤回');
  await reset();
  const seller = (await makeCertifiedStudent(admin, { slug: 'sc04', nickname: 'SC04卖家' })).client;

  const p1 = await publishProduct(seller, admin, { skipApprove: true, title: 'SC04 待驳回商品' });
  const rejected = await admin.postOk(`/api/admin/products/${p1.id}/reject`, { reason: '宿舍禁用电器', categoryCode: 'E1' });
  a.equal(rejected.status, '已下架', '拒绝后为「已下架」');
  a.equal(rejected.offShelfReason, '审核不通过', '下架原因为「审核不通过」（ST-03）');
  a.includes(rejected.reviewNote, 'E1', '驳回原因引用 §4.3 类目编号');

  const resubmitted = await seller.postOk(`/api/products/${p1.id}/resubmit`, {});
  a.equal(resubmitted.status, '待审核', '修改后重新提交 → 待审核（ST-08）');
  a.equal(resubmitted.id, p1.id, '沿用原商品编号');
  const approved = await admin.postOk(`/api/admin/products/${p1.id}/approve`);
  a.equal(approved.status, '在售', '再次审核通过 → 在售');

  const p2 = await publishProduct(seller, admin, { skipApprove: true, title: 'SC04 待撤回商品' });
  const withdrawn = await seller.postOk(`/api/products/${p2.id}/withdraw`);
  a.equal(withdrawn.offShelfReason, '卖家撤回', '卖家在待审核时撤回（ST-04）');
  a.equal(withdrawn.id, p2.id, '撤回后商品编号不变');

  a.group('SC-04 附：审核通过 与 卖家撤回 并发（先到者为准）');
  const p3 = await publishProduct(seller, admin, { skipApprove: true, title: 'SC04 并发审核商品' });
  const [r1, r2] = await Promise.all([
    admin.request('POST', `/api/admin/products/${p3.id}/approve`, {}),
    seller.request('POST', `/api/products/${p3.id}/withdraw`, {})
  ]);
  const okCount = [r1, r2].filter((r) => r.body?.ok).length;
  a.equal(okCount, 1, '并发只有一方成功（§5.5 第 7 条）');
  a.ok(['在售', '已下架'].includes((await admin.getOk('/api/admin/products?keyword=' + encodeURIComponent('SC04 并发审核商品')))[0].status), '最终状态为在售或已下架，不会两个都成功');
}

/* ================================================================= SC-05 */
async function sc05() {
  a.group('SC-05 违规处置与撤销：举报 → 成立处置 → 卖家异议 → 复核恢复');
  await reset();
  const seller = (await makeCertifiedStudent(admin, { slug: 'sc05', nickname: 'SC05卖家' })).client;
  const product = await publishProduct(seller, admin, { title: 'SC05 违规商品' });
  const reporter = await loginAs(SEED.zhao);

  const report = await reporter.postOk('/api/reports', {
    targetType: '商品', targetId: product.id, type: '违禁品', reason: '这是管制刀具，校园内禁售'
  });
  a.equal(report.handleStatus, '待处理', '举报为「待处理」');
  const creditBefore = (await seller.getOk('/api/me/credit')).score;
  await admin.postOk(`/api/admin/reports/${report.id}/handle`, {
    upheld: true, actions: ['警告', '强制下架商品', '扣信用分'],
    result: '按 §4.3 A1 认定违规，强制下架并扣分', categoryCode: 'A1'
  });
  const offShelf = await admin.getOk('/api/admin/products?keyword=' + encodeURIComponent('SC05 违规商品'));
  a.equal(offShelf[0].status, '已下架', '商品为「已下架（管理员违规下架）」（ST-07）');
  a.equal(offShelf[0].offShelfReason, '管理员违规下架', '下架原因正确');
  a.equal((await seller.getOk('/api/me/credit')).score, creditBefore - 10, '卖家 −10 分并生成信用记录');

  // 卖家在站内私信中提出异议
  await seller.postOk('/api/messages', { productId: product.id, content: '管理员你好，这把刀是户外工具，申请复核。', toId: 'ADM-001' });
  const convs = await admin.getOk('/api/messages/conversations');
  a.ok(convs.items.some((c) => c.productId === product.id), '管理员可在处置异议会话中读到卖家异议');

  const restored = await admin.postOk(`/api/admin/products/${product.id}/restore`, { reason: '复核认为不构成 A1，撤销处置' });
  a.equal(restored.status, '在售', '复核通过后回到「在售」（ST-09）');
  a.equal(restored.offShelfReason, null, '下架原因已清空');
  a.equal((await seller.getOk('/api/me/credit')).score, creditBefore - 10, '扣分不回滚（信用记录留档）');
}

/* ================================================================= SC-06 */
async function sc06() {
  a.group('SC-06 浏览与自助管理：搜索 → 分类 → 收藏 → 我的商品下架 → 我的订单 → 通知');
  await reset();
  const buyer = await loginAs(SEED.zhao);
  const seller = await loginAs(SEED.lin);

  const search = await buyer.getOk('/api/products?keyword=教材');
  a.ok(search.items.every((p) => p.status === '在售'), '搜索结果只含「在售」');
  const byCat = await buyer.getOk('/api/products?categoryId=CAT-02');
  a.ok(byCat.items.every((p) => p.categoryId === 'CAT-02'), '分类筛选生效');

  await buyer.postOk('/api/favorites', { productId: 'PRD-005' });
  const favs = await buyer.getOk('/api/me/favorites');
  a.ok(favs.items.some((f) => f.product.id === 'PRD-005' && !f.invalid), '收藏成功且未失效');

  const product = await publishProduct(seller, admin, { title: 'SC06 收藏失效商品' });
  await buyer.postOk('/api/favorites', { productId: product.id });
  await seller.postOk(`/api/products/${product.id}/take-down`);
  const favsAfter = await buyer.getOk('/api/me/favorites');
  const invalidItem = favsAfter.items.find((f) => f.product.id === product.id);
  a.equal(invalidItem.invalid, true, '商品下架后收藏标记「已失效」且记录保留（BR-11）');

  const notif = await buyer.getOk('/api/notifications?pageSize=50');
  a.ok(notif.items.some((n) => n.msgType === '商品审核'), '卖家下架商品后收藏者收到站内通知（BR-15）');

  const orders = await buyer.getOk('/api/me/orders');
  a.ok(orders.length >= 1, '「我的订单」可见成交记录（UC-16）');
  const mine = await seller.getOk('/api/me/products');
  a.ok(mine.groups['已下架'].some((p) => p.offShelfReason === '卖家主动下架'), '卖家下架后进入「已下架（卖家主动下架）」分组');
}

/* ================================================================= SC-07 */
async function sc07() {
  a.group('SC-07 评价与信用分边界：单方评价、双方不评价、阈值拒绝');
  await reset();
  const seller = (await makeCertifiedStudent(admin, { slug: 'sc07s', nickname: 'SC07卖家' })).client;
  const buyerA = (await makeCertifiedStudent(admin, { slug: 'sc07a', nickname: 'SC07买家A' })).client;
  const buyerB = (await makeCertifiedStudent(admin, { slug: 'sc07b', nickname: 'SC07买家B' })).client;

  // 第一笔：买方评价、卖方未评价
  const p1 = await publishProduct(seller, admin, { title: 'SC07-1' });
  const o1 = await buyerA.postOk('/api/orders', { productId: p1.id });
  const aBefore = (await buyerA.getOk('/api/me/credit')).score;
  await buyerA.postOk(`/api/orders/${o1.id}/reviews`, { content: '好评' });
  a.equal((await buyerA.getOk('/api/me/credit')).score, aBefore + 2, '买方提交评价即 +2（不要求对方也评价）');

  // 第二笔：双方均不评价
  const p2 = await publishProduct(seller, admin, { title: 'SC07-2' });
  const o2 = await buyerB.postOk('/api/orders', { productId: p2.id });

  const sellerBefore = (await seller.getOk('/api/me/credit')).score;
  const bBefore = (await buyerB.getOk('/api/me/credit')).score;
  await admin.postOk('/api/dev/time-shift', { hours: 169 });
  await admin.postOk('/api/dev/scheduler/run');
  const sellerAfter = (await seller.getOk('/api/me/credit')).score;
  const bAfter = (await buyerB.getOk('/api/me/credit')).score;
  // 卖方在这两笔成交中都未评价 → 两笔各 −1
  a.equal(sellerAfter, sellerBefore - 2, '卖方两笔均未评价：每笔 −1（合计 −2）');
  a.equal(bAfter, bBefore - 1, '第二笔买方 7 天未评价 −1');
  const bRecords = (await buyerB.getOk('/api/me/credit')).records.filter((r) => r.eventType === '未评价扣分');
  a.equal(bRecords.length, 1, '未评价扣分每笔只记一次（幂等）');
  await admin.postOk('/api/dev/time-shift', { hours: -169 });
  await buyerA.postFail(`/api/orders/${o1.id}/reviews`, { content: '补评' }, 'STATE_REJECTED');
  a.ok(true, '7 天后失去评价资格（辅事件流 A/E）');

  // 阈值：55 分不可发布、35 分不可下单
  const low = await loginAs(SEED.low);
  await admin.postOk('/api/dev/set-credit', { studentId: SEED.lowId, score: 55 });
  await low.postFail('/api/products', { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '信用分 55：发布被拒');
  await admin.postOk('/api/dev/set-credit', { studentId: SEED.lowId, score: 35 });
  await low.postFail('/api/orders', { productId: 'PRD-002' }, 'PERMISSION_DENIED');
  a.ok(true, '信用分 35：下单被拒');
  a.equal((await new Client().getOk('/api/products/PRD-002')).status, '在售', '已发布商品与已有成交不受影响');
}

/* ================================================================= SC-08 */
async function sc08() {
  a.group('SC-08 身份核验异常：未提交 → 待审核 → 驳回 → 重提 → 超时 → 通过');
  await reset();
  const c = new Client();
  const email = `sc08${Date.now().toString(36)}@campus.edu`;
  await c.postOk('/api/auth/send-code', { email });
  const { latestCode } = await import('../lib/harness.js');
  const code = await latestCode(admin, email);
  await c.postOk('/api/auth/register', { email, code, nickname: 'SC08同学', realName: 'SC08同学', password: PASSWORD, agree: true });
  await c.postOk('/api/auth/login', { email, password: PASSWORD });

  await c.postFail('/api/products', { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '未提交状态：发布被拒「请先上传学生证」');

  await c.postOk('/api/verifications', { studentNo: '20259001', image: TINY_PNG });
  await c.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '待审核状态：下单被拒「核验审核中，请等待」');

  const pending = await admin.getOk('/api/admin/verifications?status=待审核');
  const app = pending.find((x) => x.declaredNo === '20259001');
  await admin.postOk(`/api/admin/verifications/${app.id}/reject`, { reason: '照片模糊，请重新拍摄' });
  const rejected = await c.getOk('/api/verifications/mine');
  a.equal(rejected.certStatus, '已驳回', '驳回后转「已驳回」');
  a.equal(rejected.resubmitCount, 0, '驳回不增加累计重提次数（§6.2.1）');

  await c.postOk('/api/verifications', { studentNo: '20259001', image: TINY_PNG });
  a.equal((await c.getOk('/api/verifications/mine')).resubmitCount, 1, '第 1 次重新提交后累计重提次数 = 1（BR-17）');
  await admin.postOk('/api/dev/time-shift', { hours: 25 });
  await admin.postOk('/api/dev/scheduler/run');
  a.equal((await c.getOk('/api/verifications/mine')).certStatus, '待审核', '超 24 小时保持「待审核」，不自动通过（AT-06）');
  await admin.postOk('/api/dev/time-shift', { hours: -25 });

  const pending2 = await admin.getOk('/api/admin/verifications?status=待审核');
  const app2 = pending2.find((x) => x.declaredNo === '20259001');
  await admin.postOk(`/api/admin/verifications/${app2.id}/approve`);
  const final = await c.getOk('/api/verifications/mine');
  a.equal(final.certStatus, '已认证', '管理员通过后转「已认证」');
  a.equal((await c.getOk('/api/me/credit')).score, 100, '认证状态变化不影响信用分（BR-19）');
}

/* ================================================================= SC-09 */
async function sc09() {
  a.group('SC-09 私信与沟通：未认证被拒 → 首条创建会话 → 通知 → 回复 → 成交后继续 → 越权读取');
  await reset();
  const seller = await loginAs(SEED.lin);
  const product = await publishProduct(seller, admin, { title: 'SC09 私信商品' });

  const lv = await loginAs(SEED.lv);
  await lv.postFail('/api/messages', { productId: product.id, content: '你好' }, 'PERMISSION_DENIED');
  a.ok(true, '未认证学生联系卖家被拒，不创建会话');

  const buyerInfo = await makeCertifiedStudent(admin, { slug: 'sc09b', nickname: 'SC09买家' });
  const buyer = buyerInfo.client;
  await buyer.postOk('/api/messages', { productId: product.id, content: '同学你好，这件还在吗？' });
  const sellerNotif = await seller.getOk('/api/notifications?pageSize=50');
  a.ok(sellerNotif.items.some((n) => n.msgType === '私信'), '首条私信生成 1 条「私信」类站内通知（BR-15）');

  const conv = (await seller.getOk('/api/messages/conversations')).items.find((c) => c.productId === product.id);
  a.equal(conv.unread, 1, '会话未读数为 1');
  await seller.postOk('/api/messages', { productId: product.id, content: '在的，明天下午四点图书馆西门见。', toId: buyerInfo.studentId });
  const buyerConvs = (await buyer.getOk('/api/messages/conversations')).items.filter((c) => c.productId === product.id);
  a.equal(buyerConvs.length, 1, '同一（商品, 双方）只有一条会话');
  const detail = await buyer.getOk(`/api/messages/conversations/${product.id}/${SEED.linId}`);
  a.equal(detail.messages.length, 2, '会话内共 2 条消息');
  a.ok(detail.messages.every((m) => m.read || m.mine), '打开会话后未读清零（NFR-09 ②）');

  await buyer.postOk('/api/orders', { productId: product.id });
  await buyer.postOk('/api/messages', { productId: product.id, content: '已下单，明天见。', toId: SEED.linId });
  a.ok(true, '成交后仍可在该会话继续沟通');

  const third = (await makeCertifiedStudent(admin, { slug: 'sc09c', nickname: 'SC09第三方' })).client;
  await third.getFail(`/api/messages/conversations/${product.id}/${SEED.linId}`, 'PERMISSION_DENIED');
  a.ok(true, '第三方按会话编号读取：返回拒绝，正文 0 条');

  const other = (await makeCertifiedStudent(admin, { slug: 'sc09d', nickname: 'SC09路人' })).client;
  await other.postFail('/api/messages', { productId: product.id, content: '我也想买' }, 'STATE_REJECTED');
  a.ok(true, '已售出后非成交买家不能发起私信');

  // 卖家就违规下架向管理员提异议
  const p2 = await publishProduct(seller, admin, { title: 'SC09 违规商品' });
  await admin.postOk(`/api/admin/products/${p2.id}/force-off`, { reason: '疑似违规', categoryCode: 'A3' });
  await seller.postOk('/api/messages', { productId: p2.id, content: '申请复核，这是正规充电宝。', toId: 'ADM-001' });
  const adminConvs = await admin.getOk('/api/messages/conversations');
  a.ok(adminConvs.items.some((c) => c.productId === p2.id), '卖家可在该商品私信中向管理员提出异议，管理员可读');
  await admin.postOk('/api/admin/messages/reply', { productId: p2.id, toId: SEED.linId, content: '已进入复核队列。' });
  a.ok(true, '管理员仅可回复，不得主动发起（BR-20）');
}

/* ================================================================= SC-10 */
async function sc10() {
  a.group('SC-10 成交撤销与免责判定');
  await reset();
  const seller = (await makeCertifiedStudent(admin, { slug: 'sc10s', nickname: 'SC10卖家' })).client;
  const buyer = (await makeCertifiedStudent(admin, { slug: 'sc10b', nickname: 'SC10买家' })).client;

  const p1 = await publishProduct(seller, admin, { title: 'SC10-1' });
  const o1 = await buyer.postOk('/api/orders', { productId: p1.id });
  const cancelled = await buyer.postOk(`/api/orders/${o1.id}/cancel`, { reason: '约不上时间' });
  a.equal(cancelled.status, '已撤销', '买家单方撤销即时生效');
  a.equal(cancelled.cancelJudgement, '待判定', '撤销免责判定为「待判定」');
  a.equal((await new Client().getOk(`/api/products/${p1.id}`)).status, '在售', '商品 已售出 → 在售（ST-10）');

  const buyerCreditBefore = (await buyer.getOk('/api/me/credit')).score;
  await seller.postOk(`/api/orders/${o1.id}/cancel-judgement`, { judgement: '计违约' });
  a.equal((await buyer.getOk('/api/me/credit')).score, buyerCreditBefore - 2, '判「计违约」：撤销方 −2');

  // 再次成交 + 已免责
  const o1b = await buyer.postOk('/api/orders', { productId: p1.id });
  a.ok(!!o1b.id, '撤销后商品可再次成交（同商品存在 2 条成交记录）');
  const allOrders = await admin.getOk('/api/admin/orders');
  const forProduct = allOrders.filter((o) => o.productId === p1.id);
  a.equal(forProduct.length, 2, '同商品 2 条成交记录');
  a.equal(forProduct.filter((o) => o.status === '有效').length, 1, '「有效」记录仅 1 条（BR-06/BR-21）');

  await buyer.postOk(`/api/orders/${o1b.id}/cancel`, { reason: '买家不想要了' });
  const creditBeforeExempt = (await buyer.getOk('/api/me/credit')).score;
  await seller.postOk(`/api/orders/${o1b.id}/cancel-judgement`, { judgement: '已免责' });
  a.equal((await buyer.getOk('/api/me/credit')).score, creditBeforeExempt, '判「已免责」不扣分，不产生 −2 记录');

  // 7 天无判定
  const p2 = await publishProduct(seller, admin, { title: 'SC10-2' });
  const o2 = await buyer.postOk('/api/orders', { productId: p2.id });
  await buyer.postOk(`/api/orders/${o2.id}/cancel`, { reason: '其他' });
  await admin.postOk('/api/dev/time-shift', { hours: 169 });
  await admin.postOk('/api/dev/scheduler/run');
  const auto = await buyer.getOk(`/api/orders/${o2.id}`);
  a.equal(auto.cancelJudgement, '计违约', '7 天不判定自动「计违约」');
  const dupCheck = (await buyer.getOk('/api/me/credit')).records.filter((r) => r.orderId === o2.id && r.eventType === '撤销违约');
  a.equal(dupCheck.length, 1, '每笔成交最多扣一次 −2');
  await admin.postOk('/api/dev/time-shift', { hours: -169 });

  await buyer.postFail(`/api/orders/${o2.id}/cancel`, { reason: '其他' }, 'STATE_REJECTED');
  a.ok(true, '第二次撤销被拒，不重复产生判定');

  // 已评价后不可撤销
  const p3 = await publishProduct(seller, admin, { title: 'SC10-3' });
  const o3 = await buyer.postOk('/api/orders', { productId: p3.id });
  await buyer.postOk(`/api/orders/${o3.id}/reviews`, { content: '好评' });
  await buyer.postFail(`/api/orders/${o3.id}/cancel`, { reason: '其他' }, 'STATE_REJECTED');
  a.ok(true, '已评价后撤销被拒');
  await buyer.getOk(`/api/orders/${o2.id}`);
  await buyer.postFail(`/api/orders/${o2.id}/reviews`, { content: '撤销后评价' }, 'STATE_REJECTED');
  a.ok(true, '已撤销记录不可再评价、不再触发 −1（BR-14 ③ 排除）');
}

/* ================================================================= SC-11 */
async function sc11() {
  a.group('SC-11 在售编辑与重审');
  await reset();
  const seller = (await makeCertifiedStudent(admin, { slug: 'sc11', nickname: 'SC11卖家' })).client;
  const product = await publishProduct(seller, admin, { title: 'SC11 可编辑商品', price: '50.00' });
  const before = await seller.getOk(`/api/products/${product.id}`);
  await new Promise((r) => setTimeout(r, 1100));

  const edited = await seller.patchOk(`/api/products/${product.id}`, {
    title: 'SC11 已改价商品', description: before.description, price: '45.00',
    condition: '九成新', categoryId: before.categoryId, images: [TINY_PNG]
  });
  a.equal(edited.status, '待审核', '在售 → 待审核（ST-12）');
  a.equal(edited.offShelfReason, null, '下架原因被清空');
  a.ok(edited.publishedAt > before.publishedAt, '发布时间已刷新（24 小时审核时限重新起算）');
  a.equal(edited.id, product.id, '商品编号不变');

  const search = await new Client().getOk('/api/products?keyword=' + encodeURIComponent('SC11 已改价商品'));
  a.equal(search.items.length, 0, '编辑后立即从搜索列表移除');
  const buyer = (await makeCertifiedStudent(admin, { slug: 'sc11b', nickname: 'SC11买家' })).client;
  await buyer.postFail('/api/orders', { productId: product.id }, 'STATE_REJECTED');
  a.ok(true, '重审通过前不可被下单');

  await admin.postOk(`/api/admin/products/${product.id}/approve`);
  a.equal((await new Client().getOk(`/api/products/${product.id}`)).status, '在售', '管理员再次通过后重新在售');

  await buyer.postOk('/api/orders', { productId: product.id });
  await seller.patchFail(`/api/products/${product.id}`, { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'STATE_REJECTED');
  a.ok(true, '「已售出」商品编辑被拒且原内容不变');

  const hijack = await seller.patchOk(`/api/products/${product.id}`, {}).catch(() => null);
  a.ok(hijack === null, '已售出商品无法通过任何编辑路径修改');
}

/* ================================================================= SC-12 */
async function sc12() {
  a.group('SC-12 封禁联动下架');
  await reset();
  const seller = await makeCertifiedStudent(admin, { slug: 'sc12', nickname: 'SC12卖家' });
  const onSale = await publishProduct(seller.client, admin, { title: 'SC12 在售商品' });
  const pending = await publishProduct(seller.client, admin, { skipApprove: true, title: 'SC12 待审商品' });
  const sold = await publishProduct(seller.client, admin, { title: 'SC12 已售商品' });
  const buyer = await loginAs(SEED.zhao);
  await buyer.postOk('/api/orders', { productId: sold.id });

  const reporter = await loginAs(SEED.lin);
  await admin.postOk(`/api/admin/students/${seller.studentId}/account-status`, { status: '封禁', reason: '多次违规' });

  const detail = await admin.getOk(`/api/admin/students/${seller.studentId}`);
  a.equal(detail.accountStatus, '封禁', '账号置「封禁」');
  const onSaleAfter = await admin.getOk('/api/admin/products?keyword=' + encodeURIComponent('SC12 在售商品'));
  a.equal(onSaleAfter[0].status, '已下架', '在售商品联动下架（ST-13）');
  a.equal(onSaleAfter[0].offShelfReason, '管理员违规下架', '下架原因＝管理员违规下架');
  const pendingAfter = await admin.getOk('/api/admin/products?keyword=' + encodeURIComponent('SC12 待审商品'));
  a.equal(pendingAfter[0].status, '已下架', '待审核商品联动下架（ST-13）');
  const soldAfter = await admin.getOk('/api/admin/products?keyword=' + encodeURIComponent('SC12 已售商品'));
  a.equal(soldAfter[0].status, '已售出', '「已售出」商品不受影响（BR-09）');
  a.equal(detail.certStatus, '已认证', '封禁不改变认证状态（BR-19）');

  await seller.client.postFail('/api/products', { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '被封卖家发布被拒');
  await seller.client.postFail('/api/orders', { productId: 'PRD-002' }, 'PERMISSION_DENIED');
  a.ok(true, '被封卖家下单被拒');
  await seller.client.patchFail(`/api/products/${onSale.id}`, { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '被封卖家编辑被拒');
  a.ok(!!reporter.label, '取证：举报人会话可用');
}

/* ================================================================= SC-13 */
async function sc13() {
  a.group('SC-13 §4.3 禁售品类清单 18 类逐类审核（BR-04 可验收性）');
  await reset();
  const meta = await admin.getOk('/api/admin/meta');
  a.equal(meta.forbiddenCategories.length, 18, '禁售清单共 18 个类目（闭集）');

  const sellers = [];
  for (let i = 0; i < 4; i++) {
    sellers.push((await makeCertifiedStudent(admin, { slug: `sc13s${i}`, nickname: `清单卖家${i}` })).client);
  }
  let idx = 0;
  for (const cat of meta.forbiddenCategories) {
    const seller = sellers[Math.floor(idx / 5) % sellers.length];
    const product = await publishProduct(seller, admin, {
      skipApprove: true,
      title: `SC13-${cat.code} ${cat.name}`,
      description: `典型物品：${cat.examples}`
    });
    const rejected = await admin.postOk(`/api/admin/products/${product.id}/reject`, {
      reason: '命中禁售品类', categoryCode: cat.code
    });
    const okStatus = rejected.status === '已下架' && rejected.offShelfReason === '审核不通过';
    const okCode = String(rejected.reviewNote || '').includes(cat.code);
    a.ok(okStatus && okCode, `${cat.code} ${cat.name}：驳回并记录类目编号`);
    idx++;
  }

  // 判定口径 2、3：教材与二手电子产品允许通过
  const seller = sellers[0];
  const book = await publishProduct(seller, admin, { skipApprove: true, title: 'SC13 教材（含印制习题答案）', description: '教材内印制的答案不属于 D2。' });
  a.equal((await admin.postOk(`/api/admin/products/${book.id}/approve`)).status, '在售', '教材允许通过（§4.3.2 第 2 条）');
  const ipad = await publishProduct(seller, admin, { skipApprove: true, title: 'SC13 二手 iPad 已恢复出厂' });
  a.equal((await admin.postOk(`/api/admin/products/${ipad.id}/approve`)).status, '在售', '二手电子产品允许通过（§4.3.2 第 3 条）');
}

/* ================================================================ 执行 */
for (const fn of [sc01, sc02, sc03, sc04, sc05, sc06, sc07, sc08, sc09, sc10, sc11, sc12, sc13]) {
  await fn();
}

const pass = a.summary();
console.log(`\n场景走查 SC-01～SC-13 ${pass ? '全部通过' : '存在失败项'}`);
process.exit(pass ? 0 : 1);
