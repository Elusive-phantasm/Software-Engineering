/**
 * 后端冒烟测试：认证 / 商品 / 交易 / 收藏 / 信用分。
 * 用法：node tools/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8080';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let pass = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name} ${detail}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: json };
}

const ok = async (method, path, body, token) => {
  const r = await req(method, path, body, token);
  if (r.body?.code !== 0) throw new Error(`${method} ${path} 期望成功，实际 ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
};

const fail = async (method, path, body, token) => {
  const r = await req(method, path, body, token);
  if (r.body?.code === 0) throw new Error(`${method} ${path} 期望被拒，实际成功`);
  return r.body;
};

const login = async (email) => (await ok('POST', '/api/auth/login', { email, password: 'Test@12345' })).token;

async function publishAndApprove(token, adminToken, title, price = '35.00', categoryId = 3) {
  const cats = await ok('GET', '/api/categories');
  const created = await ok('POST', '/api/products', {
    title, description: '冒烟测试用商品，描述完整。', price, condition: '九成新',
    categoryId: cats[categoryId - 1].id, images: [PNG]
  }, token);
  await ok('POST', `/api/admin/products/${created.id}/approve`, {}, adminToken);
  return created.id;
}

async function main() {
  console.log(`\n== 冒烟测试 ${BASE} ==`);
  await req('POST', '/api/dev/reset', {});
  console.log('  （已重置演示数据，保证测试可重复）');

  console.log('\n-- 认证 --');
  const token = await login('lin@campus.edu');
  check('学生登录拿到令牌', typeof token === 'string' && token.length === 64);
  const admin = await ok('POST', '/api/auth/admin/login', { adminNo: 'ADM-001', password: 'Admin@12345' });
  check('管理员登录成功', !!admin.token);
  const bad = await req('POST', '/api/auth/login', { email: 'lin@campus.edu', password: 'wrong' });
  check('错误密码被拒（401）', bad.status === 401 && bad.body.code === 1001);
  const me = await ok('GET', '/api/auth/me', undefined, token);
  check('当前用户是学生', me.kind === 'student' && me.profile.nickname === '林同学');
  const linId = me.profile.id;

  console.log('\n-- 分类与列表 --');
  const cats = await ok('GET', '/api/categories');
  check('8 个分类', cats.length === 8);
  const list0 = await ok('GET', '/api/products?pageSize=50');
  check('公开列表只含在售', list0.items.every((p) => p.status === '在售'));

  console.log('\n-- 发布与审核（ST-01/02/03/08）--');
  const created = await ok('POST', '/api/products', {
    title: '冒烟测试台灯', description: '宿舍用台灯，功能正常，无划痕。', price: '35.00',
    condition: '九成新', categoryId: cats[2].id, images: [PNG]
  }, token);
  check('发布后状态为待审核', created.status === '待审核');
  check('发布不对外展示', (await ok('GET', '/api/products?pageSize=50')).items.every((p) => p.id !== created.id));

  const queue = await ok('GET', '/api/admin/products?status=' + encodeURIComponent('待审核'), undefined, admin.token);
  check('审核队列含该商品', queue.some((p) => p.id === created.id));

  const noCode = await fail('POST', `/api/admin/products/${created.id}/reject`, { reason: '疑似违规', categoryCode: '' }, admin.token);
  check('驳回不填类目编号被拒', noCode.code === 2001, JSON.stringify(noCode));

  await ok('POST', `/api/admin/products/${created.id}/reject`, { reason: '疑似管制刀具', categoryCode: 'A1' }, admin.token);
  let detail = await ok('GET', `/api/products/${created.id}`, undefined, token);
  check('驳回后已下架（审核不通过）', detail.status === '已下架' && detail.offShelfReason === '审核不通过');
  check('驳回原因含类目编号', String(detail.reviewNote).includes('A1'));

  await ok('POST', `/api/products/${created.id}/resubmit`, {}, token);
  detail = await ok('GET', `/api/products/${created.id}`, undefined, token);
  check('重新提交回到待审核', detail.status === '待审核');
  check('重新提交保留商品编号', detail.id === created.id);

  await ok('POST', `/api/admin/products/${created.id}/approve`, {}, admin.token);
  check('审核通过后在售且可见', (await ok('GET', '/api/products?pageSize=50')).items.some((p) => p.id === created.id));

  console.log('\n-- 编辑重审（ST-12）--');
  const edited = await ok('PATCH', `/api/products/${created.id}`, {
    title: '冒烟测试台灯（改价）', description: '改过描述，价格下调。', price: '30.00',
    condition: '九成新', categoryId: cats[2].id
  }, token);
  check('在售编辑后回到待审核', edited.status === '待审核');
  check('编辑后编号不变', edited.id === created.id);
  check('编辑后从公开列表消失', !(await ok('GET', '/api/products?pageSize=50')).items.some((p) => p.id === created.id));
  await ok('POST', `/api/admin/products/${created.id}/approve`, {}, admin.token);

  console.log('\n-- 下架与重提（ST-06 / ST-08 口径）--');
  const off = await ok('POST', `/api/products/${created.id}/take-down`, {}, token);
  check('下架原因＝卖家主动下架', off.status === '已下架' && off.offShelfReason === '卖家主动下架');
  const resubmitAfterTakeDown = await req('POST', `/api/products/${created.id}/resubmit`, {}, token);
  check('「卖家主动下架」不可直接重提（与 ST-08 封闭集一致）', resubmitAfterTakeDown.body.code === 3001,
    JSON.stringify(resubmitAfterTakeDown.body));

  console.log('\n-- 收藏（UC-09 / BR-11）--');
  const zhao = await login('zhao@campus.edu');
  const zhaoMe = await ok('GET', '/api/auth/me', undefined, zhao);
  const zhaoId = zhaoMe.profile.id;
  const favTarget = await publishAndApprove(token, admin.token, '冒烟测试收藏商品', '12.00', 1);
  await ok('POST', '/api/favorites', { productId: favTarget }, zhao);
  const favs = await ok('GET', '/api/me/favorites', undefined, zhao);
  check('收藏成功并出现在我的收藏', favs.some((f) => f.productId === favTarget) && favs.every((f) => !f.invalid));
  const dupFav = await fail('POST', '/api/favorites', { productId: favTarget }, zhao);
  check('重复收藏被拒（组合唯一）', dupFav.code === 3001, JSON.stringify(dupFav));
  await ok('POST', `/api/products/${favTarget}/take-down`, {}, token);
  const favsAfter = await ok('GET', '/api/me/favorites', undefined, zhao);
  const invalidFav = favsAfter.find((f) => f.productId === favTarget);
  check('商品下架后收藏标记「已失效」且记录保留', !!invalidFav && invalidFav.invalid && invalidFav.invalidLabel === '已失效');

  console.log('\n-- 下单成交（UC-10 / BR-06 / ST-05）--');
  const target = await publishAndApprove(token, admin.token, '冒烟测试成交商品', '88.00', 2);
  const order = await ok('POST', '/api/orders', { productId: target }, zhao);
  check('下单后生成有效成交记录', order.status === '有效');
  check('成交金额＝标价', order.amount === '88.00');
  const soldDetail = await ok('GET', `/api/products/${target}`, undefined, token);
  check('商品在同一动作内转为已售出', soldDetail.status === '已售出');
  const repeatBuy = await ok('POST', '/api/orders', { productId: target }, zhao);
  check('重复提交返回同一订单，不重复成交', repeatBuy.id === order.id);
  const secondBuy = await fail('POST', '/api/orders', { productId: target }, token);
  check('他人对已售出商品下单被拒', secondBuy.code === 3001, JSON.stringify(secondBuy));

  const selfProduct = await publishAndApprove(token, admin.token, '冒烟测试自购商品', '5.00', 1);
  const selfBuy = await fail('POST', '/api/orders', { productId: selfProduct }, token);
  check('不能购买自己发布的商品', selfBuy.code === 3001);
  await ok('POST', `/api/products/${selfProduct}/take-down`, {}, token);

  const zhaoOrders = await ok('GET', '/api/me/orders?role=buyer', undefined, zhao);
  check('买到的订单出现在我的订单', zhaoOrders.some((o) => o.id === order.id));
  const linSellerOrders = await ok('GET', '/api/me/orders?role=seller', undefined, token);
  check('卖出的订单出现在我的订单', linSellerOrders.some((o) => o.id === order.id));

  console.log('\n-- 评价（UC-14 / BR-08 / BR-14 ①）--');
  const creditBefore = (await ok('GET', '/api/me/credit', undefined, zhao)).score;
  await ok('POST', `/api/orders/${order.id}/reviews`, { content: '东西不错，卖家很好沟通。' }, zhao);
  const creditAfter = (await ok('GET', '/api/me/credit', undefined, zhao)).score;
  check('评价人 +2 分', creditAfter === creditBefore + 2, `${creditBefore} -> ${creditAfter}`);
  const dupReview = await fail('POST', `/api/orders/${order.id}/reviews`, { content: '再评一次' }, zhao);
  check('同一订单不可重复评价', dupReview.code === 3001);

  console.log('\n-- 撤销与免责判定（UC-31 / BR-21 / ST-10）--');
  const cancelTarget = await publishAndApprove(zhao, admin.token, '冒烟测试撤销商品', '66.00', 2);
  const cancelOrder = await ok('POST', '/api/orders', { productId: cancelTarget }, token);
  check('买家下线成交（lin 买 zhao 的商品）', cancelOrder.status === '有效' && cancelOrder.myRole === 'buyer');
  const cancelled = await ok('POST', `/api/orders/${cancelOrder.id}/cancel`, { reason: '买家不想要了' }, token);
  check('撤销即时生效（不需对方同意）', cancelled.status === '已撤销');
  check('撤销后判定为待判定', cancelled.cancelJudgement === '待判定');
  const backOnSale = await ok('GET', `/api/products/${cancelTarget}`, undefined, token);
  check('商品回到在售（ST-10）', backOnSale.status === '在售');
  const dupCancel = await fail('POST', `/api/orders/${cancelOrder.id}/cancel`, { reason: '买家不想要了' }, token);
  check('不可重复撤销', dupCancel.code === 3001);

  const linCreditBefore = (await ok('GET', '/api/me/credit', undefined, token)).score;
  const judged = await ok('POST', `/api/orders/${cancelOrder.id}/cancel-judgement`, { judgement: '计违约' }, zhao);
  check('对方判定计违约', judged.cancelJudgement === '计违约');
  const linCreditAfter = (await ok('GET', '/api/me/credit', undefined, token)).score;
  check('计违约：撤销方 −2', linCreditAfter === linCreditBefore - 2, `${linCreditBefore} -> ${linCreditAfter}`);
  const dupJudge = await fail('POST', `/api/orders/${cancelOrder.id}/cancel-judgement`, { judgement: '已免责' }, zhao);
  check('不可重复判定（不重复扣分）', dupJudge.code === 3001);

  console.log('\n-- 已评价后不可撤销 --');
  const reviewTarget = await publishAndApprove(zhao, admin.token, '冒烟测试评价后撤销', '20.00', 4);
  const reviewOrder = await ok('POST', '/api/orders', { productId: reviewTarget }, token);
  await ok('POST', `/api/orders/${reviewOrder.id}/reviews`, { content: '好评。' }, token);
  const cancelAfterReview = await fail('POST', `/api/orders/${reviewOrder.id}/cancel`, { reason: '买家不想要了' }, token);
  check('已提交评价后撤销被拒', cancelAfterReview.code === 3001, JSON.stringify(cancelAfterReview));

  console.log('\n-- 私信（UC-29 / UC-30 / BR-20 / NFR-09）--');
  const lv = await login('lv@campus.edu');
  const msgProduct = await publishAndApprove(token, admin.token, '冒烟测试私信商品', '18.00', 5);
  const lvSend = await fail('POST', '/api/messages', { productId: msgProduct, content: '你好' }, lv);
  check('未认证学生不能发起私信', lvSend.code === 1003, JSON.stringify(lvSend));
  await ok('POST', '/api/messages', { productId: msgProduct, content: '同学你好，这个还在吗？' }, zhao);
  const convs = await ok('GET', '/api/messages/conversations', undefined, token);
  const conv = convs.find((c) => c.productId === msgProduct);
  check('卖家会话列表出现该会话', !!conv && conv.unread >= 1);
  check('会话未读数与实际未读一致', conv.unread === 1, String(conv && conv.unread));
  const convDetail = await ok('GET', `/api/messages/conversations/${msgProduct}/${zhaoId}`, undefined, token);
  check('打开会话后未读置为已读', convDetail.messages.every((m) => m.read === true));
  const low = await login('low@campus.edu');
  const peek = await fail('GET', `/api/messages/conversations/${msgProduct}/${zhaoId}`, undefined, low);
  check('第三方读取他人会话被拒（0 条正文）', peek.code === 1003 || peek.code === 3001, JSON.stringify(peek));
  // 释放该商品的在售名额，避免后续发布触发 BR-02 上限
  await ok('POST', `/api/products/${msgProduct}/take-down`, {}, token);

  console.log('\n-- 通知（UC-18 / BR-15）--');
  const notes = await ok('GET', '/api/notifications', undefined, token);
  check('通知列表可按人返回', notes.total >= 1);
  const badge = await ok('GET', '/api/badge', undefined, token);
  check('红点分别统计通知与私信', typeof badge.notificationUnread === 'number' && typeof badge.messageUnread === 'number');
  await ok('POST', '/api/notifications/read-all', {}, token);
  const badge2 = await ok('GET', '/api/badge', undefined, token);
  check('全部已读后通知红点清零', badge2.notificationUnread === 0);

  console.log('\n-- 个人主页（UC-33 / §6.5）--');
  const guestProfile = await req('GET', `/api/students/${zhaoId}/profile`);
  check('游客不可查看他人主页', guestProfile.status === 401);
  const otherProfile = await ok('GET', `/api/students/${zhaoId}/profile`, undefined, token);
  check('他人主页不含手机号/宿舍', otherProfile.student.phone === undefined && otherProfile.student.dorm === undefined);
  check('他人主页展示在售商品与评价区', Array.isArray(otherProfile.inSaleProducts) && Array.isArray(otherProfile.reviews));
  const selfProfile = await ok('GET', `/api/students/${linId}/profile`, undefined, token);
  check('本人主页可见自己的联系方式', selfProfile.self === true && !!selfProfile.selfExtra);

  console.log('\n-- 举报与处置（UC-12 / UC-13 / BR-14 ② / ST-07）--');
  const reportTarget = await publishAndApprove(token, admin.token, '冒烟测试被举报商品', '42.00', 6);
  const report = await ok('POST', '/api/reports', {
    targetType: '商品', targetId: reportTarget, type: '虚假描述', reason: '描述与实物不符，实际尺寸小很多。'
  }, zhao);
  check('举报后为待处理', report.handleStatus === '待处理');
  const dupReport = await fail('POST', '/api/reports', {
    targetType: '商品', targetId: reportTarget, type: '虚假描述', reason: '再举报一次'
  }, zhao);
  check('同一对象重复举报被拒', dupReport.code === 3001);
  const typeMismatch = await fail('POST', '/api/reports', {
    targetType: '商品', targetId: reportTarget, type: '收款不履约', reason: '类型不对'
  }, zhao);
  check('类型与对象不匹配被拒', typeMismatch.code === 2001);

  const creditBeforeReport = (await ok('GET', '/api/me/credit', undefined, token)).score;
  const handled = await ok('POST', `/api/admin/reports/${report.id}/handle`, {
    upheld: true, actions: ['强制下架商品', '扣信用分'], result: '核实与描述不符，强制下架。', categoryCode: 'C3'
  }, admin.token);
  check('举报成立后为已处理', handled.handleStatus === '已处理');
  const offedProduct = await ok('GET', `/api/products/${reportTarget}`, undefined, token);
  check('被处置商品转为已下架（管理员违规下架）',
    offedProduct.status === '已下架' && offedProduct.offShelfReason === '管理员违规下架');
  const creditAfterReport = (await ok('GET', '/api/me/credit', undefined, token)).score;
  check('举报成立：被举报方 −10（BR-14 ②）', creditAfterReport === creditBeforeReport - 10,
    `${creditBeforeReport} -> ${creditAfterReport}`);

  const secondTarget = await publishAndApprove(token, admin.token, '冒烟测试不成立举报', '9.00', 7);
  const report2 = await ok('POST', '/api/reports', {
    targetType: '商品', targetId: secondTarget, type: '价格欺诈', reason: '感觉价格偏高。'
  }, zhao);
  const rejected = await ok('POST', `/api/admin/reports/${report2.id}/handle`, {
    upheld: false, actions: [], result: '经核实价格属正常区间。'
  }, admin.token);
  check('举报不成立时状态为已驳回', rejected.handleStatus === '已驳回');
  const unchanged = await ok('GET', '/api/products/' + secondTarget, undefined, token);
  check('举报不成立时商品状态不变', unchanged.status === '在售');

  console.log('\n-- 定时任务（AT-06/07、BR-14 ③、UC-31 C）--');
  const pendingProduct = await publishAndApprove(zhao, admin.token, '冒烟测试待评价订单', '31.00', 8);
  await ok('POST', '/api/orders', { productId: pendingProduct }, token);
  const cancelLater = await publishAndApprove(zhao, admin.token, '冒烟测试超时判定', '23.00', 1);
  const cancelOrder2 = await ok('POST', '/api/orders', { productId: cancelLater }, token);
  await ok('POST', `/api/orders/${cancelOrder2.id}/cancel`, { reason: '约不上时间' }, token);
  await ok('POST', '/api/dev/time-shift', { hours: 192 }, admin.token);
  const sched = await ok('POST', '/api/dev/scheduler/run', {}, admin.token);
  check('7 天后未评价方被扣分（BR-14 ③）', sched.counts.noReviewPenalties >= 1, JSON.stringify(sched.counts));
  check('7 天后未判定自动计违约（UC-31 C）', sched.counts.cancelAutoJudgements >= 1, JSON.stringify(sched.counts));
  const autoJudged = await ok('GET', `/api/orders/${cancelOrder2.id}`, undefined, token);
  check('超时订单判定为计违约', autoJudged.cancelJudgement === '计违约');
  const sched2 = await ok('POST', '/api/dev/scheduler/run', {}, admin.token);
  check('重复执行不重复扣分', !sched2.counts.noReviewPenalties && !sched2.counts.cancelAutoJudgements,
    JSON.stringify(sched2.counts));
  await ok('POST', '/api/dev/time-reset', {}, admin.token);

  console.log('\n-- 封禁联动（ST-13 / BR-10 / BR-19）--');
  const banTarget = await publishAndApprove(zhao, admin.token, '冒烟测试封禁商品', '15.00', 2);
  const banRes = await ok('POST', `/api/admin/students/${zhaoId}/account-status`,
    { status: '封禁', reason: '冒烟测试封禁' }, admin.token);
  check('封禁时联动下架其在售商品', banRes.offShelf >= 1, JSON.stringify(banRes));
  const bannedProduct = await ok('GET', `/api/products/${banTarget}`, undefined, admin.token);
  check('商品转为已下架（管理员违规下架）',
    bannedProduct.status === '已下架' && bannedProduct.offShelfReason === '管理员违规下架');
  const bannedProfile = await ok('GET', `/api/admin/students/${zhaoId}`, undefined, admin.token);
  check('封禁不改变认证状态（BR-19）', bannedProfile.certStatus === '已认证');

  console.log('\n-- 权限面 --');
  const noAuth = await req('GET', '/api/me/products');
  check('未登录访问受保护接口返回 401', noAuth.status === 401);
  const adminCreate = await fail('POST', '/api/products', {
    title: '管理员发布', description: 'x', price: '1.00', condition: '全新', categoryId: cats[0].id, images: [PNG]
  }, admin.token);
  check('管理员不能发布商品', adminCreate.code === 1003, JSON.stringify(adminCreate));
  const adminOrders = await fail('GET', '/api/me/orders', undefined, admin.token);
  check('管理员无「我的订单」视图', adminOrders.code === 1003);

  console.log(`\n结果：通过 ${pass} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    failures.forEach((f) => console.log('  ✗ ' + f));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\n执行失败：', e.message);
  process.exitCode = 1;
});
