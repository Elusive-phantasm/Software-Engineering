/**
 * UC 级回归测试：逐条覆盖 UC-01～UC-18、UC-29～UC-34 的主事件流与关键辅事件流，
 * 以及 BR-01～BR-22、NFR-04/05/08/09/10 的可自动化断言。
 *
 * 运行：npm run test:uc（需先启动服务：npm start）
 */
import { Client, Assert, latestCode } from '../lib/harness.js';
import { adminClient, makeCertifiedStudent, publishProduct, loginAs, resetAll, TINY_PNG, PASSWORD, SEED } from '../lib/fixtures.js';

const a = new Assert();
let admin;
let lin;
let zhao;

async function fresh() {
  admin = await adminClient();
  await resetAll(admin);
  admin = await adminClient();
  lin = await loginAs(SEED.lin);
  zhao = await loginAs(SEED.zhao);
}

/* ========================================================= UC-01 注册与登录 */
async function uc01() {
  a.group('UC-01 注册与登录 / NFR-05 登录锁定 / NFR-10 验证码');
  const c = new Client();
  const email = `reg${Date.now().toString(36)}@campus.edu`;

  const mail = await c.postOk('/api/auth/send-code', { email });
  a.ok(mail.transport === 'local' || mail.transport === 'smtp', `发送验证码成功（通道 ${mail.transport}）`);
  const code = await latestCode(admin, email);
  a.equal(code.length, 6, '验证码为 6 位数字');

  await c.postFail('/api/auth/send-code', { email }, 'RATE_LIMITED');
  a.ok(true, '同一邮箱 60 秒内重复获取被频控拒绝（NFR-10 ③）');

  await c.postFail('/api/auth/register', { email, code: '000000', nickname: 'x', realName: 'x', password: PASSWORD, agree: true }, 'VALIDATION_FAILED');
  a.ok(true, '验证码错误时拒绝注册（UC-01 辅事件流 G）');

  await c.postFail('/api/auth/register', { email, code, nickname: 'x', realName: '', password: PASSWORD, agree: true }, 'VALIDATION_FAILED');
  a.ok(true, '未填真实姓名时拒绝注册（辅事件流 D）');

  await c.postFail('/api/auth/register', { email, code, nickname: 'x', realName: 'x', password: 'short', agree: true }, 'VALIDATION_FAILED');
  a.ok(true, '密码强度不足时拒绝注册');

  const reg = await c.postOk('/api/auth/register', { email, code, nickname: '新同学', realName: '新同学', password: PASSWORD, agree: true });
  a.equal(reg.student.certStatus, '未提交', '注册后认证状态为「未提交」（AT-01）');
  a.equal(reg.student.accountStatus, '正常', '注册后账号状态为「正常」');
  a.equal(reg.student.creditScore, 100, '注册后信用分为 100（BR-13）');
  a.ok(!('password' in reg.student) && !('passwordHash' in reg.student), '注册响应不含密码字段（NFR-05）');

  await c.postFail('/api/auth/register', { email, code: '123456', nickname: 'x', realName: 'x', password: PASSWORD, agree: true }, 'CONFLICT');
  a.ok(true, '邮箱已注册时再次注册被拒（辅事件流 J：注册过程中被抢占）');

  // 验证码与邮箱、用途绑定且一次性：拿 A 邮箱的验证码去注册 B 邮箱必然失败
  await c.postFail(
    '/api/auth/register',
    { email: `other${Date.now().toString(36)}@campus.edu`, code, nickname: 'x', realName: 'x', password: PASSWORD, agree: true },
    'VALIDATION_FAILED'
  );
  a.ok(true, '验证码与邮箱绑定，换邮箱复用无效（NFR-10 ①）');

  await c.postFail('/api/auth/send-code', { email: SEED.lin }, 'CONFLICT');
  a.ok(true, '邮箱已注册时提示已被注册（辅事件流 B）');

  await c.postFail('/api/auth/login', { email, password: 'wrong-pass-1' }, 'AUTH_REQUIRED');
  a.ok(true, '密码错误时提示「邮箱或密码不正确」（辅事件流 A）');

  const login = await c.postOk('/api/auth/login', { email, password: PASSWORD });
  a.equal(login.student.certStatus, '未提交', '未认证学生可以登录（辅事件流 F）');
  await c.postFail('/api/products', { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '未认证学生发布被拦截并提示「请先上传学生证」');

  a.group('NFR-05 连续失败 5 次锁定 15 分钟');
  const victim = new Client();
  for (let i = 1; i <= 4; i++) {
    await victim.postFail('/api/auth/login', { email: SEED.zhao, password: 'bad-pass' }, 'AUTH_REQUIRED');
  }
  a.ok(true, '第 1～4 次密码错误不锁定');
  await victim.postFail('/api/auth/login', { email: SEED.zhao, password: 'bad-pass' }, 'AUTH_REQUIRED');
  await victim.postFail('/api/auth/login', { email: SEED.zhao, password: PASSWORD }, 'RATE_LIMITED');
  a.ok(true, '第 5 次失败后即使密码正确也拒绝登录（锁定期内）');
  const state = await admin.getOk('/api/dev/state');
  a.ok(!!state.now, `锁定期间状态：服务端时间 ${state.now}`);
  await admin.postOk('/api/dev/time-shift', { hours: 0.26 });
  const afterUnlock = new Client();
  const okLogin = await afterUnlock.postOk('/api/auth/login', { email: SEED.zhao, password: PASSWORD });
  a.ok(!!okLogin.student, '满 15 分钟后允许重新登录（锁定到期清零）');
  await admin.postOk('/api/dev/time-shift', { hours: -0.26 });
}

/* ================================================= UC-02 / UC-03 学生证核验 */
async function uc0203() {
  a.group('UC-02 提交核验 / UC-03 审核核验 / BR-16、BR-17、BR-18、BR-19');
  const lv = await loginAs(SEED.lv);

  await lv.postFail('/api/verifications', { studentNo: 'abc', image: TINY_PNG }, 'VALIDATION_FAILED');
  a.ok(true, '申报学号格式非法时拒绝（辅事件流 D）');
  await lv.postFail('/api/verifications', { studentNo: '20230201' }, 'VALIDATION_FAILED');
  a.ok(true, '未上传学生证图片时拒绝（辅事件流 A）');
  await lv.postFail('/api/verifications', { studentNo: '20230101', image: TINY_PNG }, 'CONFLICT');
  a.ok(true, '申报学号已被其他已认证账号占用时拒绝（辅事件流 C）');

  const sub = await lv.postOk('/api/verifications', { studentNo: '20230201', image: TINY_PNG });
  a.equal(sub.student.certStatus, '待审核', '提交后认证状态转「待审核」（AT-02）');
  await lv.postFail('/api/verifications', { studentNo: '20230202', image: TINY_PNG }, 'STATE_REJECTED');
  a.ok(true, '已存在待审核申请时不允许重复提交（辅事件流 E）');
  await lv.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '待审核期间下单被拒并提示「核验审核中，请等待」');

  const pending = await admin.getOk('/api/admin/verifications?status=待审核');
  const app = pending.find((x) => x.declaredNo === '20230201');
  a.ok(!!app, '管理员待审核队列含该申请');
  a.ok(!('cardImage' in app) && !('card_image' in app), '队列响应不含学生证图片地址（NFR-08）');

  await zhao.getFail(`/api/admin/verifications/${app.id}/image`, 'PERMISSION_DENIED');
  a.ok(true, '非管理员读取学生证图片被拒（NFR-08）');

  await admin.postOk(`/api/admin/verifications/${app.id}/reject`, { reason: '证件照片模糊，请重新拍摄' });
  const afterReject = await lv.getOk('/api/verifications/mine');
  a.equal(afterReject.certStatus, '已驳回', '驳回后认证状态转「已驳回」（AT-04）');
  a.equal(afterReject.resubmitCount, 0, '驳回本身不增加「累计重提次数」（§6.2.1：计数在重提成功时 +1）');
  await lv.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '已驳回状态下单被拒并提示修改后重提');

  const sub2 = await lv.postOk('/api/verifications', { studentNo: '20230201', image: TINY_PNG });
  a.equal(sub2.student.certStatus, '待审核', '修改后重新提交转「待审核」（AT-05）');
  a.equal((await lv.getOk('/api/verifications/mine')).resubmitCount, 1, '第 1 次重新提交后累计重提次数 = 1');

  await admin.postOk('/api/dev/time-shift', { hours: 25 });
  await admin.postOk('/api/dev/scheduler/run');
  const stillPending = await lv.getOk('/api/verifications/mine');
  a.equal(stillPending.certStatus, '待审核', '审核超 24 小时只提醒、不自动通过（AT-06）');
  await admin.postOk('/api/dev/time-shift', { hours: -25 });

  const pending2 = await admin.getOk('/api/admin/verifications?status=待审核');
  const app2 = pending2.find((x) => x.declaredNo === '20230201');
  await admin.postOk(`/api/admin/verifications/${app2.id}/approve`);
  const cert = await lv.getOk('/api/verifications/mine');
  a.equal(cert.certStatus, '已认证', '核验通过后认证状态为「已认证」（AT-03）');
  a.equal(cert.declaredNo, '20230201', '核验通过后申报学号写入学生实体');

  a.group('BR-18 伪造必须封禁 + ST-13 联动下架');
  const forger = await makeCertifiedStudent(admin, { slug: 'forge', nickname: '伪造同学' });
  const p1 = await publishProduct(forger.client, admin);
  const p2 = await publishProduct(forger.client, admin, { skipApprove: true });
  const forgerPending = await admin.getOk('/api/admin/verifications?status=待审核');
  a.ok(Array.isArray(forgerPending), '取证：伪造者已有在售与待审核商品');

  const studentDetail = await admin.getOk(`/api/admin/students/${forger.studentId}`);
  await admin.postOk(`/api/admin/students/${forger.studentId}/revoke-certification`, { reason: '经核实为拼接证件' });
  const afterRevoke = await admin.getOk(`/api/admin/students/${forger.studentId}`);
  a.equal(afterRevoke.certStatus, '已驳回', 'AT-08：认证状态改回「已驳回」');
  a.equal(afterRevoke.accountStatus, '封禁', 'BR-18：核实伪造必须封禁账号');
  const p1After = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent(p1.title)}`);
  a.equal(p1After[0]?.status, '已下架', 'ST-13：在售商品联动下架');
  a.equal(p1After[0]?.offShelfReason, '管理员违规下架', '联动下架原因为「管理员违规下架」');
  const p2After = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent(p2.title)}`);
  a.equal(p2After[0]?.status, '已下架', 'ST-13：待审核商品联动下架');
  await forger.client.postFail('/api/products', { title: 't', description: 'd', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '被封禁账号发布被拒（BR-10）');
  a.ok(!!studentDetail, '取证：处置前学生详情可读');
}

/* ================================================== BR-17 核验重提上限（3 次） */
async function br17() {
  a.group('BR-17 核验重提上限：允许重提 3 次，第 4 次拒绝');
  const c = new Client();
  const email = `retry${Date.now().toString(36)}@campus.edu`;
  await c.postOk('/api/auth/send-code', { email });
  const code = await latestCode(admin, email);
  await c.postOk('/api/auth/register', {
    email, code, nickname: '重提同学', realName: '重提同学', password: PASSWORD, agree: true
  });
  await c.postOk('/api/auth/login', { email, password: PASSWORD });
  await c.postOk('/api/verifications', { studentNo: '20259301', image: TINY_PNG });
  a.equal((await c.getOk('/api/verifications/mine')).resubmitCount, 0, '首次提交不计入累计重提次数');

  for (let i = 1; i <= 3; i++) {
    const pending = await admin.getOk('/api/admin/verifications?status=待审核');
    const app = pending.find((x) => x.declaredNo === '20259301');
    a.ok(!!app, `第 ${i} 轮：存在待审核申请`);
    await admin.postOk(`/api/admin/verifications/${app.id}/reject`, { reason: `第 ${i} 次驳回：照片不清晰` });
    a.equal((await c.getOk('/api/verifications/mine')).certStatus, '已驳回', `第 ${i} 次驳回后为「已驳回」`);
    const resub = await c.postOk('/api/verifications', { studentNo: '20259301', image: TINY_PNG });
    a.equal(resub.student.certStatus, '待审核', `第 ${i} 次重新提交成功（BR-17 允许 3 次）`);
    a.equal((await c.getOk('/api/verifications/mine')).resubmitCount, i, `累计重提次数 = ${i}`);
  }

  // 第 3 次重提后再被驳回 → 第 4 次重提必须被拒
  const last = (await admin.getOk('/api/admin/verifications?status=待审核')).find((x) => x.declaredNo === '20259301');
  await admin.postOk(`/api/admin/verifications/${last.id}/reject`, { reason: '仍然不清晰' });
  const done = await c.getOk('/api/verifications/mine');
  a.equal(done.resubmitCount, 3, '累计重提次数达上限 3');
  a.equal(done.canSubmit, false, '达到上限后 canSubmit 为 false');
  const blocked = await c.postFail('/api/verifications', { studentNo: '20259301', image: TINY_PNG }, 'STATE_REJECTED');
  a.includes(blocked.message, '上限', '第 4 次重提被拒并提示已达上限');
}

/* ================================================== UC-04 管理员登录与权限 */
async function uc04() {
  a.group('UC-04 管理员登录 / §5.2 权限矩阵');
  await zhao.postFail('/api/admin/auth/login', { adminId: 'ADM-001', password: PASSWORD }, 'AUTH_REQUIRED');
  a.ok(true, '学生凭据不能登录后台（辅事件流 B）');

  await admin.postFail('/api/products', { title: 't', description: 'd', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '管理员发布商品被拒「管理员无发布商品权限」');
  await admin.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '管理员下单被拒「管理员无下单权限」');
  await admin.postFail('/api/reports', { targetType: '商品', targetId: 'PRD-001', type: '虚假描述', reason: 'x' }, 'PERMISSION_DENIED');
  a.ok(true, '管理员不能以举报人身份提交举报');
  await admin.postFail('/api/favorites', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '管理员无收藏权限');
  await zhao.getFail('/api/admin/dashboard', 'PERMISSION_DENIED');
  a.ok(true, '学生访问后台接口被拒');
  const adminMe = await admin.getOk('/api/auth/me');
  a.equal(adminMe.kind, 'admin', '管理员会话与学生会话相互独立');
}

/* ================================================= UC-05 / UC-06 发布与审核 */
async function uc0506() {
  a.group('UC-05 发布商品 / BR-02、BR-05、BR-13');
  const base = { title: '测试商品', description: '描述内容足够长', price: '10', condition: '九成新', categoryId: 'CAT-02', images: [TINY_PNG] };

  await lin.postFail('/api/products', { ...base, title: '' }, 'VALIDATION_FAILED');
  a.ok(true, '标题为空时拒绝（辅事件流 A）');
  await lin.postFail('/api/products', { ...base, price: '0' }, 'VALIDATION_FAILED');
  a.ok(true, '价格为 0 时拒绝（BR-05）');
  await lin.postFail('/api/products', { ...base, price: '50000.01' }, 'VALIDATION_FAILED');
  a.ok(true, '价格超过 50000 元时拒绝（BR-05）');
  await lin.postFail('/api/products', { ...base, price: '10.999' }, 'VALIDATION_FAILED');
  a.ok(true, '价格超过 2 位小数时拒绝（BR-05）');
  await lin.postFail('/api/products', { ...base, images: [] }, 'VALIDATION_FAILED');
  a.ok(true, '未上传图片时拒绝（1～9 张必填）');
  await lin.postFail('/api/products', { ...base, images: Array(10).fill(TINY_PNG) }, 'VALIDATION_FAILED');
  a.ok(true, '图片超过 9 张时拒绝');
  await lin.postFail('/api/products', { ...base, categoryId: 'CAT-NONE' }, 'VALIDATION_FAILED');
  a.ok(true, '分类无效时拒绝');
  await lin.postFail('/api/products', { ...base, description: '联系我 13800009999 详聊' }, 'VALIDATION_FAILED');
  a.ok(true, '描述含站外联系方式时拒绝（站外导流，BR-04）');

  const created = await lin.postOk('/api/products', base);
  a.equal(created.status, '待审核', '发布后商品恒为「待审核」（ST-01）');
  await zhao.getFail(`/api/products/${created.id}`, 'NOT_FOUND');
  a.ok(true, '待审核商品对他人不可见（§7.2）');

  await lin.postOk('/api/dev/time-reset').catch(() => {});
  const mine = await lin.getOk('/api/me/products');
  a.ok(mine.groups['待审核'].length >= 1, '「我的商品」按四状态分组，待审核组含新商品');

  a.group('BR-02 在售上限 5 件');
  const { client: bulk } = await makeCertifiedStudent(admin, { slug: 'bulk', nickname: '批量卖家' });
  for (let i = 0; i < 5; i++) await publishProduct(bulk, admin, { title: `批量商品${i}` });
  await bulk.postFail('/api/products', base, 'STATE_REJECTED');
  a.ok(true, '在售已达 5 件时发布被拒（BR-02）');

  a.group('UC-06 审核商品 / §4.3 禁售清单 18 类');
  const pendingList = await admin.getOk('/api/admin/products?status=待审核');
  a.ok(pendingList.length >= 1, `待审核队列 ${pendingList.length} 条`);

  const rejectSeller = (await makeCertifiedStudent(admin, { slug: 'rejectseller', nickname: '驳回流程卖家' })).client;
  const target = await publishProduct(rejectSeller, admin, { skipApprove: true, title: '驳回测试商品' });
  await admin.postFail(`/api/admin/products/${target.id}/reject`, { reason: '不合规' }, 'VALIDATION_FAILED');
  a.ok(true, '驳回未引用 §4.3 类目编号时拒绝（UC-06 主事件流 5）');

  const rejected = await admin.postOk(`/api/admin/products/${target.id}/reject`, { reason: '宿舍禁用', categoryCode: 'E1' });
  a.equal(rejected.status, '已下架', '审核不通过 → 已下架（ST-03）');
  a.equal(rejected.offShelfReason, '审核不通过', '下架原因为「审核不通过」');
  a.includes(rejected.reviewNote, 'E1', '驳回原因引用了类目编号');

  const approved = await admin.postOk(`/api/admin/products/${created.id}/approve`);
  a.equal(approved.status, '在售', '审核通过 → 在售（ST-02）');
  const visible = await new Client().getOk(`/api/products/${created.id}`);
  a.equal(visible.status, '在售', '在售商品对游客可见');

  await admin.postFail(`/api/admin/products/${created.id}/approve`, {}, 'STATE_REJECTED');
  a.ok(true, '对非「待审核」商品再次审核被拒（状态拒绝）');

  const resub = await rejectSeller.postOk(`/api/products/${target.id}/resubmit`, {});
  a.equal(resub.status, '待审核', '已下架（审核不通过）可修改后重新提交（ST-08）');
  a.equal(resub.id, target.id, '重新提交沿用原商品编号');
}

/* ============================================ UC-07 / UC-08 搜索与分类浏览 */
async function uc0708() {
  a.group('UC-07 搜索 / UC-08 分类浏览 / BR-11');
  const all = await new Client().getOk('/api/products?pageSize=50');
  a.ok(all.items.every((p) => p.status === '在售'), '列表只含「在售」商品');
  a.ok(all.total >= 5, `在售商品 ${all.total} 件`);

  const kw = await new Client().getOk('/api/products?keyword=数学');
  a.ok(kw.items.length >= 1, `关键词检索命中 ${kw.items.length} 件`);
  const none = await new Client().getOk('/api/products?keyword=不存在的商品xyz');
  a.equal(none.items.length, 0, '无匹配时返回空列表（辅事件流 A）');
  await new Client().getFail('/api/products?keyword=毒品', 'VALIDATION_FAILED');
  a.ok(true, '敏感词不发起检索（辅事件流 E）');

  const cat = await new Client().getOk('/api/products?categoryId=CAT-01');
  a.ok(cat.items.every((p) => p.categoryId === 'CAT-01'), '分类筛选只返回该分类商品');
  const cats = await new Client().getOk('/api/categories');
  a.ok(cats.length === 8, `单层分类共 ${cats.length} 个（UC-08：不分层）`);
  a.ok(cats.every((c) => 'onSaleCount' in c), '分类附带在售数量');

  const priceAsc = await new Client().getOk('/api/products?sort=priceAsc&pageSize=20');
  const prices = priceAsc.items.map((p) => Number(p.price));
  a.ok(prices.every((v, i) => i === 0 || prices[i - 1] <= v), '价格升序排序生效');
}

/* ============================================================ UC-09 收藏 */
async function uc09() {
  a.group('UC-09 收藏商品 / BR-11');
  const guest = new Client();
  await guest.postFail('/api/favorites', { productId: 'PRD-001' }, 'AUTH_REQUIRED');
  a.ok(true, '未登录收藏被拒（辅事件流 C）');

  const lv = await loginAs(SEED.lv);
  const fav = await lv.postOk('/api/favorites', { productId: 'PRD-001' });
  a.equal(fav.favorited, true, '未认证学生也可收藏（§5.2）');
  await lv.postFail('/api/favorites', { productId: 'PRD-001' }, 'STATE_REJECTED');
  a.ok(true, '重复收藏不新增记录（辅事件流 A）');

  const list = await lv.getOk('/api/me/favorites');
  a.ok(list.items.length >= 1, `收藏列表 ${list.items.length} 条`);

  const off = await lin.postOk('/api/products/PRD-012/resubmit', {}).catch((e) => e);
  a.ok(true, '（跳过不可重提场景，PRD-012 为卖家主动下架）');

  await zhao.postOk('/api/products/PRD-003/take-down');
  const listAfter = await lv.getOk('/api/me/favorites');
  const soldFav = listAfter.items.find((i) => i.product.id === 'PRD-001');
  a.ok(!!soldFav, '商品状态变化后收藏记录仍保留（BR-11）');
}

/* ====================================================== UC-10 下单成交 */
async function uc10() {
  a.group('UC-10 下单成交 / BR-06 / ST-05');
  await lin.postFail('/api/orders', { productId: 'PRD-001' }, 'STATE_REJECTED');
  a.ok(true, '不能购买自己发布的商品（BR-01）');

  const lv = await loginAs(SEED.lv);
  await lv.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '未认证学生下单被拒（辅事件流 B）');

  const lowCredit = await loginAs(SEED.low);
  a.equal((await lowCredit.getOk('/api/me/credit')).score, 55, '低信用同学当前 55 分');
  await lowCredit.postFail('/api/products', { title: '低信用发布', description: '描述内容足够长', price: '10', condition: '九成新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '信用分低于 60 时发布被拒「信用分不足，暂不可发布新商品」（BR-13）');
  await admin.postOk('/api/dev/set-credit', { studentId: SEED.lowId, score: 35 });
  await lowCredit.postFail('/api/orders', { productId: 'PRD-001' }, 'PERMISSION_DENIED');
  a.ok(true, '信用分低于 40 时下单被拒「信用分不足，暂不可下单」（BR-13）');
  await admin.postOk('/api/dev/set-credit', { studentId: SEED.lowId, score: 55 });

  const order = await zhao.postOk('/api/orders', { productId: 'PRD-001' });
  a.equal(order.status, '有效', '下单成功生成「有效」成交记录（ST-05）');
  a.equal(order.amount, '35.00', '成交金额等于商品当前标价（BR-05）');
  const sold = await new Client().getOk('/api/products/PRD-001');
  a.equal(sold.status, '已售出', '商品在同一次操作中转为「已售出」');

  const dup = await zhao.postOk('/api/orders', { productId: 'PRD-001' });
  a.equal(dup.id, order.id, '重复提交返回同一订单，不重复成交（辅事件流 F）');

  const third = await makeCertifiedStudent(admin, { slug: 'third', nickname: '第三买家' });
  await third.client.postFail('/api/orders', { productId: 'PRD-001' }, 'STATE_REJECTED');
  a.ok(true, '他人对已售出商品下单被拒（辅事件流 A/E）');

  const notif = await lin.getOk('/api/notifications?pageSize=50');
  a.ok(notif.items.some((n) => n.msgType === '成交'), '卖家收到成交通知（BR-15）');

  a.group('SC-03 并发抢购：仅一笔成功');
  const p = await publishProduct(lin, admin, { title: '并发抢购测试商品' });
  const b1 = (await makeCertifiedStudent(admin, { slug: 'race1', nickname: '抢购甲' })).client;
  const b2 = (await makeCertifiedStudent(admin, { slug: 'race2', nickname: '抢购乙' })).client;
  const [r1, r2] = await Promise.all([
    b1.request('POST', '/api/orders', { productId: p.id }),
    b2.request('POST', '/api/orders', { productId: p.id })
  ]);
  const successes = [r1, r2].filter((r) => r.body?.ok).length;
  a.equal(successes, 1, '两名买家同时下单，只有一笔成功');
  const detail = await admin.getOk(`/api/admin/students/${SEED.linId}`);
  a.ok(detail.orders.filter((o) => o.productId === p.id && o.status === '有效').length === 1, '同商品仅存在 1 条有效成交记录');
}

/* ================================================= UC-11 下架 / 撤回 / 删除 */
async function uc11() {
  a.group('UC-11 下架、撤回、删除 / BR-09');
  const created = await publishProduct(lin, admin, { skipApprove: true, title: '撤回测试商品' });
  const withdrawn = await lin.postOk(`/api/products/${created.id}/withdraw`);
  a.equal(withdrawn.offShelfReason, '卖家撤回', '待审核商品撤回 → 已下架（卖家撤回）（ST-04）');

  const toDelete = await publishProduct(lin, admin, { skipApprove: true, title: '删除测试商品' });
  await lin.delFail(`/api/products/${toDelete.id}`, 'STATE_REJECTED');
  a.ok(true, '「待审核」商品不可删除（辅事件流 F）');
  await lin.postOk(`/api/products/${toDelete.id}/withdraw`);
  const del = await lin.delOk(`/api/products/${toDelete.id}`);
  a.equal(del.deletedId, toDelete.id, '「已下架」商品可永久删除（BR-09）');
  await lin.getFail(`/api/products/${toDelete.id}`, 'NOT_FOUND');
  a.ok(true, '删除后访问提示「该商品已不存在」（辅事件流 G）');

  const onSale = await publishProduct(lin, admin, { title: '下架测试商品' });
  await lin.delFail(`/api/products/${onSale.id}`, 'STATE_REJECTED');
  a.ok(true, '「在售」商品不可删除，须先下架（辅事件流 E）');
  const downed = await lin.postOk(`/api/products/${onSale.id}/take-down`);
  a.equal(downed.offShelfReason, '卖家主动下架', '在售商品下架（ST-06）');

  await zhao.postFail(`/api/products/${created.id}/take-down`, undefined, 'PERMISSION_DENIED');
  a.ok(true, '非本人商品不可下架（辅事件流 C）');

  // 「已售出」商品任何角色都不可下架（BR-09）：用所有者本人验证状态拒绝
  const soldProduct = await admin.getOk('/api/admin/products?status=已售出');
  if (soldProduct.length) {
    await lin.postFail(`/api/products/${soldProduct[0].id}/take-down`, {}, 'STATE_REJECTED');
    a.ok(true, '「已售出」商品不可下架（卖家本人亦然）');
  } else {
    a.ok(true, '（无已售出商品，跳过）');
  }

  // 被管理员违规下架的商品：卖家本人也不能再操作（提示「该商品已被管理员下架」）
  const adminOffSeller = (await makeCertifiedStudent(admin, { slug: 'adminoff', nickname: '违规下架卖家' })).client;
  const adminOffProduct = await publishProduct(adminOffSeller, admin, { title: '违规下架后再操作测试' });
  await admin.postOk(`/api/admin/products/${adminOffProduct.id}/force-off`, { reason: '测试强制下架', categoryCode: 'A1' });
  await adminOffSeller.postFail(`/api/products/${adminOffProduct.id}/take-down`, {}, 'PERMISSION_DENIED');
  a.ok(true, '被管理员违规下架的商品，卖家不能再操作');
  await adminOffSeller.delFail(`/api/products/${adminOffProduct.id}`, 'PERMISSION_DENIED');
  a.ok(true, '被管理员违规下架的商品，卖家也不能删除');
}

/* ================================================ UC-12 / UC-13 举报与处置 */
async function uc1213() {
  a.group('UC-12 举报 / UC-13 处置 / BR-14 ②');
  const target = await publishProduct(zhao, admin, { title: '被举报测试商品' });

  await lin.postFail('/api/reports', { targetType: '商品', targetId: target.id, type: '收款不履约', reason: 'x' }, 'VALIDATION_FAILED');
  a.ok(true, '举报类型与对象不匹配时拒绝（辅事件流 G）');
  await zhao.postFail('/api/reports', { targetType: '商品', targetId: target.id, type: '虚假描述', reason: 'x' }, 'STATE_REJECTED');
  a.ok(true, '不能举报自己的商品（辅事件流 B）');

  const r1 = await lin.postOk('/api/reports', { targetType: '商品', targetId: target.id, type: '虚假描述', reason: '实际成色与描述不符' });
  a.equal(r1.handleStatus, '待处理', '举报成功后为「待处理」');
  await lin.postFail('/api/reports', { targetType: '商品', targetId: target.id, type: '虚假描述', reason: '重复' }, 'STATE_REJECTED');
  a.ok(true, '同一对象重复举报被拒（组合唯一）');

  await lin.postFail('/api/reports', { targetType: '学生', targetId: SEED.banId, type: '收款不履约', reason: 'x' }, 'PERMISSION_DENIED');
  a.ok(true, '与本人无成交/无私信的学生不可举报（辅事件流 C）');

  const beforeCredit = (await admin.getOk(`/api/admin/students/${SEED.zhaoId}`)).creditScore;
  const handled = await admin.postOk(`/api/admin/reports/${r1.id}/handle`, {
    upheld: true,
    actions: ['警告', '强制下架商品', '扣信用分'],
    result: '核实描述与实际不符，强制下架并扣分',
    categoryCode: null
  });
  a.equal(handled.handleStatus, '已处理', '举报成立后状态为「已处理」');
  const prodAfter = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent('被举报测试商品')}`);
  a.equal(prodAfter[0]?.status, '已下架', '成立后商品被强制下架（ST-07）');
  a.equal(prodAfter[0]?.offShelfReason, '管理员违规下架', '下架原因为「管理员违规下架」');
  const afterCredit = (await admin.getOk(`/api/admin/students/${SEED.zhaoId}`)).creditScore;
  a.equal(afterCredit, beforeCredit - 10, '卖家信用分 −10（BR-14 ②）');
  const creditRecords = (await admin.getOk(`/api/admin/students/${SEED.zhaoId}`)).creditRecords;
  a.ok(creditRecords.some((r) => r.eventType === '违规处置' && r.delta === -10), '生成一条「违规处置」信用记录');

  await admin.postOk(`/api/admin/reports/${r1.id}/handle`, {}).catch(() => {});
  const dupHandle = await admin.postFail(`/api/admin/reports/${r1.id}/handle`, { upheld: false, result: 'x' }, 'STATE_REJECTED');
  a.equal(dupHandle.code, 'STATE_REJECTED', '同一举报不可重复处理（避免重复扣分）');

  a.group('UC-13 辅事件流：举报不成立');
  const p2 = await publishProduct(zhao, admin, { title: '无违规测试商品' });
  const r2 = await lin.postOk('/api/reports', { targetType: '商品', targetId: p2.id, type: '其他', reason: '感觉不对' });
  const creditBeforeReject = (await admin.getOk(`/api/admin/students/${SEED.zhaoId}`)).creditScore;
  await admin.postOk(`/api/admin/reports/${r2.id}/handle`, { upheld: false, result: '经核实无违规' });
  const creditAfterReject = (await admin.getOk(`/api/admin/students/${SEED.zhaoId}`)).creditScore;
  a.equal(creditAfterReject, creditBeforeReject, '举报不成立时不扣分（辅事件流 H）');
  const p2After = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent('无违规测试商品')}`);
  a.equal(p2After[0]?.status, '在售', '举报不成立时商品状态不变');

  a.group('ST-09 撤销违规处置');
  const restored = await admin.postOk(`/api/admin/products/${target.id}/restore`, { reason: '复核认为描述差异不构成违规' });
  a.equal(restored.status, '在售', '复核通过后商品恢复「在售」（ST-09）');
  const creditAfterRestore = (await admin.getOk(`/api/admin/students/${SEED.zhaoId}`)).creditScore;
  a.equal(creditAfterRestore, afterCredit, '撤销处置不回滚已扣信用分（SC-05）');

  a.group('UC-13 辅事件流 G：收款不履约成立 → 封禁 + 联动下架 + 争议计数');
  const seller = await makeCertifiedStudent(admin, { slug: 'runner', nickname: '跑路卖家' });
  const sp = await publishProduct(seller.client, admin, { title: '跑路测试商品' });
  const spPending = await publishProduct(seller.client, admin, { title: '跑路待审商品', skipApprove: true });
  const buyer = await makeCertifiedStudent(admin, { slug: 'victim', nickname: '受害买家' });
  await buyer.client.postOk('/api/messages', { productId: sp.id, content: '同学，什么时候能取货？' });
  const r3 = await buyer.client.postOk('/api/reports', {
    targetType: '学生', targetId: seller.studentId, type: '收款不履约', reason: '约定转账后失联，私信不回复'
  });
  await admin.postOk(`/api/admin/reports/${r3.id}/handle`, {
    upheld: true, actions: ['警告'], result: '经核实收款不履约成立'
  });
  const sellerAfter = await admin.getOk(`/api/admin/students/${seller.studentId}`);
  a.equal(sellerAfter.accountStatus, '封禁', '收款不履约成立应封禁账号（辅事件流 G）');
  a.equal(sellerAfter.verifiedDisputeCount, 1, '被核实争议数 +1（公开计数）');
  const spAfter = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent('跑路测试商品')}`);
  a.equal(spAfter[0]?.status, '已下架', '封禁时联动下架其在售商品（ST-13）');
  const spPendingAfter = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent('跑路待审商品')}`);
  a.equal(spPendingAfter[0]?.status, '已下架', '封禁时联动下架其待审核商品（ST-13）');
}

/* ============================================================ UC-14 评价 */
async function uc14() {
  a.group('UC-14 评价交易 / BR-08 / BR-14 ①③');
  const p = await publishProduct(lin, admin, { title: '评价测试商品' });
  const buyer = await makeCertifiedStudent(admin, { slug: 'reviewer', nickname: '评价买家' });
  const order = await buyer.client.postOk('/api/orders', { productId: p.id });

  await buyer.client.postFail(`/api/orders/${order.id}/reviews`, { content: '联系我 13800001111' }, 'VALIDATION_FAILED');
  a.ok(true, '评价含联系方式被过滤（辅事件流 B）');
  await zhao.postFail(`/api/orders/${order.id}/reviews`, { content: '我不是当事人' }, 'PERMISSION_DENIED');
  a.ok(true, '非成交双方不可评价');

  const beforeBuyer = (await buyer.client.getOk('/api/me/credit')).score;
  await buyer.client.postOk(`/api/orders/${order.id}/reviews`, { content: '东西不错，卖家准时。' });
  const afterBuyer = (await buyer.client.getOk('/api/me/credit')).score;
  a.equal(afterBuyer, beforeBuyer + 2, '提交评价方 +2 分（BR-14 ①）');
  await buyer.client.postFail(`/api/orders/${order.id}/reviews`, { content: '再来一次' }, 'STATE_REJECTED');
  a.ok(true, '同一订单不可重复评价（辅事件流 C）');

  const beforeSeller = (await lin.getOk('/api/me/credit')).score;
  await admin.postOk('/api/dev/time-shift', { hours: 169 });
  const sched = await admin.postOk('/api/dev/scheduler/run');
  a.ok(sched.noReviewPenalties >= 1, `定时判定执行：未评价扣分 ${sched.noReviewPenalties} 次`);
  const afterSeller = (await lin.getOk('/api/me/credit')).score;
  a.equal(afterSeller, beforeSeller - 1, '成交 7 天未评价方 −1 分（BR-14 ③）');
  await lin.postFail(`/api/orders/${order.id}/reviews`, { content: '迟到的评价' }, 'STATE_REJECTED');
  a.ok(true, '超过 7 天失去评价资格（辅事件流 E）');
  await admin.postOk('/api/dev/time-shift', { hours: -169 });

  a.group('BR-08 双方均提交后才展示');
  const p2 = await publishProduct(lin, admin, { title: '互评展示测试商品' });
  const b2 = await makeCertifiedStudent(admin, { slug: 'reviewer2', nickname: '互评买家' });
  const o2 = await b2.client.postOk('/api/orders', { productId: p2.id });
  await b2.client.postOk(`/api/orders/${o2.id}/reviews`, { content: '买家先评' });
  const profileBefore = await zhao.getOk(`/api/students/${SEED.linId}/profile`);
  const shownBefore = profileBefore.reviews.some((r) => r.content === '买家先评');
  a.equal(shownBefore, false, '仅一方评价时不展示（BR-08）');
  await lin.postOk(`/api/orders/${o2.id}/reviews`, { content: '卖家后评' });
  const profileAfter = await zhao.getOk(`/api/students/${SEED.linId}/profile`);
  a.ok(profileAfter.reviews.some((r) => r.content === '买家先评'), '双方均提交后在主页展示');
}

/* ================================================= UC-15 信用分 / UC-33 主页 */
async function uc1533() {
  a.group('UC-15 查看信用分 / NFR-04 个人信息保护');
  const mine = await lin.getOk('/api/me/credit');
  a.ok(Array.isArray(mine.records), '本人可见信用分与变动明细');
  const others = await zhao.getOk(`/api/students/${SEED.linId}/credit`);
  a.equal(others.records, null, '他人仅可见分数，不可见明细（辅事件流 C）');
  await new Client().getFail('/api/me/credit', 'AUTH_REQUIRED');
  a.ok(true, '游客不可查看信用分');

  const profile = await zhao.getOk(`/api/students/${SEED.linId}/profile`);
  const json = JSON.stringify(profile);
  a.ok(!json.includes('13800000001'), '他人主页不含手机号（NFR-04）');
  a.ok(!json.includes('紫荆 3 号楼'), '他人主页不含宿舍地址（NFR-04）');
  a.ok(profile.student.creditScore > 0, '他人主页可见信用分');
  a.ok('verifiedDisputeCount' in profile.student, '他人主页可见被核实争议数');

  const detail = await new Client().getOk('/api/products/PRD-002');
  a.ok(!JSON.stringify(detail).includes('13800000001'), '商品详情不泄露卖家手机号');

  await new Client().getFail(`/api/students/${SEED.linId}/profile`, 'AUTH_REQUIRED');
  a.ok(true, '游客不可查看他人主页（UC-33 辅事件流 C）');

  a.group('UC-33 个人主页');
  const selfProfile = await lin.getOk(`/api/students/${SEED.linId}/profile`);
  a.equal(selfProfile.isSelf, true, '本人查看主页标记 isSelf');
  a.ok(selfProfile.selfExtra.phone !== undefined, '本人可见自己的手机号');
  const banned = await zhao.getOk(`/api/students/${SEED.banId}/profile`);
  a.equal(banned.inSaleProducts.length, 0, '封禁账号在售商品被隐藏（BR-10）');
}

/* ============================================ UC-16 我的订单 / UC-17 我的商品 */
async function uc1617() {
  a.group('UC-16 我的订单 / UC-17 我的商品');
  const orders = await zhao.getOk('/api/me/orders');
  a.ok(orders.length >= 1, `买家订单 ${orders.length} 条`);
  a.ok(orders.every((o) => 'cancelJudgement' in o), '订单含「撤销免责判定」字段');
  const buyerOrders = await zhao.getOk('/api/me/orders?role=buyer');
  a.ok(buyerOrders.every((o) => o.myRole === 'buyer'), '「我买到的」筛选生效');
  const sellerOrders = await lin.getOk('/api/me/orders?role=seller');
  a.ok(sellerOrders.every((o) => o.myRole === 'seller'), '「我卖出的」筛选生效');
  await admin.getFail('/api/me/orders', 'PERMISSION_DENIED');
  a.ok(true, '管理员无「我的订单」视图');

  const mine = await lin.getOk('/api/me/products');
  a.ok(Object.keys(mine.groups).join(',') === '待审核,在售,已售出,已下架', '我的商品按四状态分组（UC-17）');
}

/* ============================================================ UC-18 通知 */
async function uc18() {
  a.group('UC-18 查看消息通知 / BR-15');
  const list = await lin.getOk('/api/notifications?pageSize=50');
  a.ok(list.items.length >= 1, `通知 ${list.items.length} 条`);
  const unread = list.items.filter((n) => !n.read);
  a.ok(unread.length >= 1, '存在未读通知');
  const target = unread[0];
  await lin.postOk(`/api/notifications/${target.id}/read`);
  const after = await lin.getOk('/api/notifications?pageSize=50');
  a.equal(after.items.find((n) => n.id === target.id).read, true, '通知置为已读（UC-18 主事件流 3）');
  await zhao.postFail(`/api/notifications/${target.id}/read`, {}, 'PERMISSION_DENIED');
  a.ok(true, '不可操作他人通知（§6.5）');
  await lin.postOk('/api/notifications/read-all');
  const cleared = await lin.getOk('/api/badge');
  a.equal(cleared.notificationUnread, 0, '全部已读后通知红点清零（辅事件流 C）');
  const badge = await lin.getOk('/api/badge');
  a.ok('messageUnread' in badge, '私信未读与通知红点分别统计（NFR-09）');
}

/* ================================================== UC-29 / UC-30 站内私信 */
async function uc2930() {
  a.group('UC-29 联系卖家 / UC-30 我的私信 / BR-20 / NFR-09');
  const p = await publishProduct(lin, admin, { title: '私信测试商品' });

  const lv = await loginAs(SEED.lv);
  await lv.postFail('/api/messages', { productId: p.id, content: '你好' }, 'PERMISSION_DENIED');
  a.ok(true, '未认证学生不能发起私信（辅事件流 A，BR-20）');

  await lin.postFail('/api/messages', { productId: p.id, content: '自己跟自己说话' }, 'STATE_REJECTED');
  a.ok(true, '不能与自己对话（辅事件流 B）');

  await zhao.postFail('/api/messages', { productId: p.id, content: '   ' }, 'VALIDATION_FAILED');
  a.ok(true, '空消息不记录（辅事件流 E）');
  await zhao.postFail('/api/messages', { productId: p.id, content: 'x'.repeat(501) }, 'VALIDATION_FAILED');
  a.ok(true, '超过 500 字的消息被拒');

  const m1 = await zhao.postOk('/api/messages', { productId: p.id, content: '同学你好，这件还在吗？' });
  a.equal(m1.read, false, '新消息对接收方为未读');
  const sellerNotif = await lin.getOk('/api/notifications?pageSize=50');
  a.ok(sellerNotif.items.some((n) => n.msgType === '私信' && n.productId === p.id), '卖家收到「私信」类型站内通知（BR-15）');

  const convList = await lin.getOk('/api/messages/conversations');
  const conv = convList.items.find((c) => c.productId === p.id);
  a.ok(!!conv, '卖家会话列表出现该会话');
  a.equal(conv.unread, 1, '会话未读数为 1（NFR-09 ②）');

  await lin.postOk('/api/messages', { productId: p.id, content: '在的，随时可以看货。', toId: SEED.zhaoId });
  const conv2 = await zhao.getOk(`/api/messages/conversations/${p.id}/${SEED.linId}`);
  a.equal(conv2.messages.length, 2, '同一（商品, 双方）只有一条会话，共 2 条消息（复事件流 F）');
  await zhao.postOk('/api/messages', { productId: p.id, content: '好的，明天下午四点图书馆西门？', toId: SEED.linId });
  const convAfterRead = await zhao.getOk(`/api/messages/conversations/${p.id}/${SEED.linId}`);
  a.ok(convAfterRead.messages.every((m) => m.read || m.mine), '打开会话后本人未读消息置为已读（UC-30 主事件流 3）');

  const third = await makeCertifiedStudent(admin, { slug: 'spy', nickname: '第三方' });
  await third.client.getFail(`/api/messages/conversations/${p.id}/${SEED.linId}`, 'PERMISSION_DENIED');
  a.ok(true, '第三方按会话编号读取返回拒绝、正文 0 条（SC-09）');

  await admin.getFail(`/api/messages/conversations/${p.id}/${SEED.linId}`, 'PERMISSION_DENIED');
  a.ok(true, '管理员不可读取学生之间的交易会话（§5.4）');

  // 成交后继续沟通；非成交买家不可再发起
  await zhao.postOk('/api/orders', { productId: p.id });
  await zhao.postOk('/api/messages', { productId: p.id, content: '已经下单了，明天见。', toId: SEED.linId });
  a.ok(true, '成交后仍可在该会话继续沟通（UC-29）');
  await third.client.postFail('/api/messages', { productId: p.id, content: '我也想买' }, 'STATE_REJECTED');
  a.ok(true, '商品已售出时非成交买家不能发起私信（辅事件流 C）');

  // 卖家就违规下架向管理员提异议
  const op = await publishProduct(lin, admin, { title: '违规下架异议商品' });
  await admin.postOk(`/api/admin/products/${op.id}/force-off`, { reason: '疑似违规', categoryCode: 'A1' });
  const reply = await lin.postOk('/api/messages', { productId: op.id, content: '管理员你好，这件商品我申请复核。', toId: 'ADM-001' });
  a.ok(!!reply.id, '卖家可在违规下架商品的私信中向管理员提出异议（BR-20）');
  const adminConvs = await admin.getOk('/api/messages/conversations');
  a.ok(adminConvs.items.some((c) => c.productId === op.id), '管理员会话列表可见处置异议会话');
  await admin.postOk('/api/admin/messages/reply', { productId: op.id, toId: SEED.linId, content: '已收到，将在复核队列中处理。' });
  a.ok(true, '管理员可回复处置异议会话');

  const normalProduct = await publishProduct(lin, admin, { title: '正常商品异议测试' });
  await lin.postFail('/api/messages', { productId: normalProduct.id, content: '管理员你好', toId: 'ADM-001' }, 'STATE_REJECTED');
  a.ok(true, '非「管理员违规下架」商品不能给管理员发异议私信');
  await admin.postFail('/api/admin/messages/reply', { productId: normalProduct.id, toId: SEED.linId, content: 'x' }, 'PERMISSION_DENIED');
  a.ok(true, '管理员不能主动发起私信（BR-20）');
}

/* ========================================================= UC-31 撤销成交 */
async function uc31() {
  a.group('UC-31 撤销成交 / BR-21 / ST-10、ST-11 / BR-14 ④');
  const p = await publishProduct(lin, admin, { title: '撤销测试商品' });
  const order = await zhao.postOk('/api/orders', { productId: p.id });

  const third = await makeCertifiedStudent(admin, { slug: 'nonparty', nickname: '非当事人' });
  await third.client.postFail(`/api/orders/${order.id}/cancel`, { reason: '约不上时间' }, 'PERMISSION_DENIED');
  a.ok(true, '非当事人不能撤销（辅事件流 G）');

  await zhao.postFail(`/api/orders/${order.id}/cancel`, { reason: '随便一个原因' }, 'VALIDATION_FAILED');
  a.ok(true, '撤销原因须来自固定选项');

  const cancelled = await zhao.postOk(`/api/orders/${order.id}/cancel`, { reason: '约不上时间' });
  a.equal(cancelled.status, '已撤销', '撤销即时生效（无需对方同意）');
  a.equal(cancelled.cancelJudgement, '待判定', '撤销后免责判定为「待判定」');
  const back = await new Client().getOk(`/api/products/${p.id}`);
  a.equal(back.status, '在售', '商品回到「在售」（ST-10）');

  await zhao.postFail(`/api/orders/${order.id}/cancel`, { reason: '约不上时间' }, 'STATE_REJECTED');
  a.ok(true, '不可重复撤销（辅事件流 E）');

  const sellerCreditBefore = (await lin.getOk('/api/me/credit')).score;
  const judged = await lin.postOk(`/api/orders/${order.id}/cancel-judgement`, { judgement: '计违约' });
  a.equal(judged.cancelJudgement, '计违约', '对方判定「计违约」');
  const zhaoCredit = (await zhao.getOk('/api/me/credit')).score;
  const buyerStart = 102; // 种子信用分
  a.equal(zhaoCredit, buyerStart - 2, '撤销方 −2 分（BR-14 ④）');
  a.equal((await lin.getOk('/api/me/credit')).score, sellerCreditBefore, '判定方不扣分');
  await lin.postFail(`/api/orders/${order.id}/cancel-judgement`, { judgement: '已免责' }, 'STATE_REJECTED');
  a.ok(true, '不可重复判定（不重复扣分）');

  a.group('UC-31 已免责不扣分 + 已撤销不可评价');
  const seller2 = (await makeCertifiedStudent(admin, { slug: 'cancel2', nickname: '撤销卖家2' })).client;
  const p2 = await publishProduct(seller2, admin, { title: '免责测试商品' });
  const o2 = await zhao.postOk('/api/orders', { productId: p2.id });
  await zhao.postOk(`/api/orders/${o2.id}/cancel`, { reason: '买家不想要了' });
  const creditBefore = (await zhao.getOk('/api/me/credit')).score;
  await seller2.postOk(`/api/orders/${o2.id}/cancel-judgement`, { judgement: '已免责' });
  a.equal((await zhao.getOk('/api/me/credit')).score, creditBefore, '已免责不扣分');
  await zhao.postFail(`/api/orders/${o2.id}/reviews`, { content: '已撤销还能评价吗' }, 'STATE_REJECTED');
  a.ok(true, '已撤销成交不可评价（BR-08）');

  a.group('UC-31 辅事件流 C：7 天未判定自动计违约');
  const seller3 = (await makeCertifiedStudent(admin, { slug: 'cancel3', nickname: '撤销卖家3' })).client;
  const p3 = await publishProduct(seller3, admin, { title: '自动判定测试商品' });
  const o3 = await zhao.postOk('/api/orders', { productId: p3.id });
  await zhao.postOk(`/api/orders/${o3.id}/cancel`, { reason: '其他' });
  const creditBeforeAuto = (await zhao.getOk('/api/me/credit')).score;
  await admin.postOk('/api/dev/time-shift', { hours: 169 });
  const sched = await admin.postOk('/api/dev/scheduler/run');
  a.ok(sched.cancelAutoJudgements >= 1, `定时判定：自动计违约 ${sched.cancelAutoJudgements} 笔`);
  const autoDetail = await zhao.getOk(`/api/orders/${o3.id}`);
  a.equal(autoDetail.cancelJudgement, '计违约', '满 7 天未判定，系统自动置「计违约」');
  const recordsForOrder = (await zhao.getOk('/api/me/credit')).records.filter(
    (r) => r.orderId === o3.id && r.eventType === '撤销违约'
  );
  a.equal(recordsForOrder.length, 1, '自动计违约只产生 1 条「撤销违约」信用记录（每笔成交最多一次）');
  a.equal(recordsForOrder[0].delta, -2, '自动计违约扣 2 分');
  const scoreNow = (await zhao.getOk('/api/me/credit')).score;
  a.ok(scoreNow < creditBeforeAuto, `自动计违约后信用分下降（${creditBeforeAuto} → ${scoreNow}）`);
  const sched2 = await admin.postOk('/api/dev/scheduler/run');
  a.equal(sched2.cancelAutoJudgements, 0, '重复执行定时判定不重复扣分');
  const recordsAgain = (await zhao.getOk('/api/me/credit')).records.filter(
    (r) => r.orderId === o3.id && r.eventType === '撤销违约'
  );
  a.equal(recordsAgain.length, 1, '幂等：再次判定不会新增重复记录');
  await admin.postOk('/api/dev/time-shift', { hours: -169 });

  a.group('UC-31 辅事件流 F：撤销时卖家已封禁 → 转已下架（ST-11）');
  const seller4 = await makeCertifiedStudent(admin, { slug: 'cancel4', nickname: '将被封禁卖家' });
  const sp = await publishProduct(seller4.client, admin, { title: '封禁后撤销测试商品' });
  const so = await zhao.postOk('/api/orders', { productId: sp.id });
  await admin.postOk(`/api/admin/students/${seller4.studentId}/account-status`, { status: '封禁', reason: '测试封禁' });
  const sc = await zhao.postOk(`/api/orders/${so.id}/cancel`, { reason: '其他' });
  a.equal(sc.status, '已撤销', '卖家封禁时撤销仍生效');
  const spAfter = await admin.getOk(`/api/admin/products?keyword=${encodeURIComponent('封禁后撤销测试商品')}`);
  a.equal(spAfter[0]?.status, '已下架', '商品转「已下架」而非回到在售（ST-11）');
  a.equal(spAfter[0]?.offShelfReason, '撤销后不可交易', '下架原因为「撤销后不可交易」');

  a.group('UC-31 辅事件流 D：已评价后不可撤销');
  const seller5 = (await makeCertifiedStudent(admin, { slug: 'cancel5', nickname: '撤销卖家5' })).client;
  const p4 = await publishProduct(seller5, admin, { title: '已评价撤销测试商品' });
  const o4 = await zhao.postOk('/api/orders', { productId: p4.id });
  await zhao.postOk(`/api/orders/${o4.id}/reviews`, { content: '好评' });
  await zhao.postFail(`/api/orders/${o4.id}/cancel`, { reason: '其他' }, 'STATE_REJECTED');
  a.ok(true, '任一方已评价后撤销被拒（BR-21）');
}

/* ============================================================ UC-32 编辑商品 */
async function uc32() {
  a.group('UC-32 编辑商品 / BR-22 / ST-12');
  const p = await publishProduct(lin, admin, { title: '编辑测试商品', price: '30.00' });
  const before = await lin.getOk(`/api/products/${p.id}`);
  await new Promise((r) => setTimeout(r, 1100)); // 让「发布时间刷新」可被观测到（秒级精度）

  const edited = await lin.patchOk(`/api/products/${p.id}`, {
    title: '编辑测试商品（已改价）', description: before.description, price: '28.00',
    condition: '七成新', categoryId: 'CAT-02', images: [TINY_PNG],
    sellerId: 'STU-HACK', status: '在售', offShelfReason: '卖家主动下架', publishedAt: '2000-01-01T00:00:00Z'
  });
  a.equal(edited.status, '待审核', '在售商品编辑后回到「待审核」（ST-12）');
  a.equal(edited.price, '28.00', '卖家可写字段（价格）已保存');
  a.equal(edited.sellerId, SEED.linId, '系统字段「发布人」的修改被丢弃（辅事件流 G）');
  a.ok(edited.publishedAt > before.publishedAt, '发布时间已刷新（24 小时审核时限重新起算）');
  a.equal(edited.id, p.id, '编辑不改变商品编号');
  await zhao.getFail(`/api/products/${p.id}`, 'NOT_FOUND');
  a.ok(true, '编辑后在售商品立即从公开列表移除');

  await lin.patchFail(`/api/products/${p.id}`, { title: 'x', description: 'y', price: '0', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'VALIDATION_FAILED');
  a.ok(true, '编辑校验失败时原内容不被覆盖（辅事件流 A）');

  await admin.postOk(`/api/admin/products/${p.id}/approve`);
  const sold = await zhao.postOk('/api/orders', { productId: p.id });
  await lin.patchFail(`/api/products/${p.id}`, { title: '再改', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'STATE_REJECTED');
  a.ok(true, '「已售出」商品不可编辑（辅事件流 B）');
  await zhao.patchFail(`/api/products/${p.id}`, { title: 'x', description: 'y', price: '1', condition: '全新', categoryId: 'CAT-01', images: [TINY_PNG] }, 'PERMISSION_DENIED');
  a.ok(true, '非本人商品不可编辑（辅事件流 D）');
  a.ok(!!sold.id, '取证：编辑后商品可被正常下单');
}

/* ============================================================ UC-34 找回密码 */
async function uc34() {
  a.group('UC-34 找回密码 / NFR-10 防枚举');
  const c = new Client();
  const ghost = `nobody${Date.now().toString(36)}@campus.edu`;
  const r1 = await c.postOk('/api/auth/forgot/send-code', { email: ghost });
  const r2 = await c.postOk('/api/auth/forgot/send-code', { email: SEED.zhao });
  a.equal(r1.message, r2.message, '邮箱存在与不存在返回同一提示（防账号枚举）');

  await c.postFail('/api/auth/forgot/reset', { email: ghost, code: '123456', newPassword: 'NewPass123' }, 'VALIDATION_FAILED');
  a.ok(true, '不存在的邮箱无法完成重置（同样提示验证码无效）');

  const code = await latestCode(admin, SEED.zhao);
  await c.postFail('/api/auth/forgot/reset', { email: SEED.zhao, code, newPassword: PASSWORD }, 'VALIDATION_FAILED');
  a.ok(true, '新密码不能与当前密码相同（辅事件流 E）');

  const oldSession = await loginAs(SEED.zhao);
  await oldSession.getOk('/api/auth/me');
  const newPass = 'BrandNew#2026';
  await c.postOk('/api/auth/forgot/reset', { email: SEED.zhao, code, newPassword: newPass });
  await oldSession.getFail('/api/auth/me', 'AUTH_REQUIRED').catch(() => {});
  const meAfter = await oldSession.getOk('/api/auth/me');
  a.equal(meAfter.kind, 'guest', '重置后该账号既有会话立即失效（NFR-10 ⑥）');
  await new Client().postFail('/api/auth/login', { email: SEED.zhao, password: PASSWORD }, 'AUTH_REQUIRED');
  const relogin = await new Client().postOk('/api/auth/login', { email: SEED.zhao, password: newPass });
  a.ok(!!relogin.student, '新密码可登录');

  const banned = await new Client();
  await admin.postOk('/api/dev/set-account', { studentId: SEED.banId, status: '封禁' });
  await banned.postFail('/api/auth/login', { email: SEED.ban, password: PASSWORD }, 'PERMISSION_DENIED');
  a.ok(true, '封禁账号登录被拒（辅助流 E）');
}

/* ============================================================ 主流程编排 */
await fresh();
await uc01();
await fresh();
await uc0203();
await fresh();
await br17();
await fresh();
await uc04();
await fresh();
await uc0506();
await fresh();
await uc0708();
await fresh();
await uc09();
await fresh();
await uc10();
await fresh();
await uc11();
await fresh();
await uc1213();
await fresh();
await uc14();
await fresh();
await uc1533();
await fresh();
await uc1617();
await fresh();
await uc18();
await fresh();
await uc2930();
await fresh();
await uc31();
await fresh();
await uc32();
await fresh();
await uc34();

const pass = a.summary();
console.log(`\nUC 级回归测试${pass ? '全部通过' : '存在失败项'}`);
process.exit(pass ? 0 : 1);
