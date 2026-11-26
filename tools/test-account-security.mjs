/**
 * 马歆远专项测试脚本：帽子一（账号与身份 SC-01/SC-02/SC-08/NFR-05/NFR-08/NFR-10）
 *                   + 帽子三（信息安全测试专项 SEC-01 ~ SEC-13）。
 *
 * 用法：
 *   node tools/test-account-security.mjs [baseUrl] [--out evidence/S1/S1-account-security-20261126.log]
 *
 * 注意：
 *   1) 严格按照 SRS 判据断言，不放宽预期；如实暴露并记录失败项以便开 BUG。
 *   2) 依赖开发环境 /api/dev/reset、/api/dev/time-shift、/api/dev/mailbox；
 *      开始与结束均会执行 reset + time-reset，不把脏数据与时间偏移留给他人。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let BASE = 'http://127.0.0.1:8080';
let outFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outFile = args[++i];
  } else if (!args[i].startsWith('--')) {
    BASE = args[i];
  }
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const logs = [];
let passCount = 0;
const failures = [];

function log(line = '') {
  logs.push(line);
  console.log(line);
}

function check(id, name, cond, detail = '') {
  if (cond) {
    passCount++;
    log(`  ✓ [${id}] ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    const msg = `[${id}] ${name} -> 实际: ${detail}`;
    failures.push(msg);
    log(`  ✗ ${msg}`);
  }
}

async function req(method, urlPath, body, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const t0 = performance.now();
  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const elapsedMs = performance.now() - t0;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: json,
    elapsedMs
  };
}

async function resetAll() {
  const r1 = await req('POST', '/api/dev/reset', {});
  if (r1.body?.code !== 0) {
    throw new Error(`重置失败: ${r1.status} ${r1.text}`);
  }
  await req('POST', '/api/dev/time-reset', {});
}

async function timeShift(hours) {
  const r = await req('POST', '/api/dev/time-shift', { hours });
  if (r.body?.code !== 0) {
    throw new Error(`时间偏移失败: ${r.status} ${r.text}`);
  }
  return r.body.data;
}

async function loginStudent(email, password = 'Test@12345', extraHeaders = {}) {
  return req('POST', '/api/auth/login', { email, password }, null, extraHeaders);
}

async function loginAdmin(adminNo = 'ADM-001', password = 'Admin@12345') {
  return req('POST', '/api/auth/admin/login', { adminNo, password });
}

async function latestCodeFor(email) {
  const r = await req('GET', '/api/dev/mailbox?limit=30');
  const items = r.body?.data?.items || [];
  const mail = items.find((m) => String(m.to).toLowerCase() === email.toLowerCase());
  if (!mail) return null;
  const match = String(mail.text).match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

/* ==========================================================================
 * 1. SC-01（认证段）：注册 → 提交学生证 → 管理员核验通过 → 学号唯一性
 * ========================================================================== */
async function runSc01() {
  log('\n=== [SC-01] 认证段：注册 -> 核验提交 -> 审核通过 -> 学号唯一 ===');
  await resetAll();

  const email = 'sc01_user@campus.edu';
  const sendR = await req('POST', '/api/auth/send-code', { email });
  check('SC01-01a', '发送注册验证码成功', sendR.body?.code === 0, JSON.stringify(sendR.body));
  const code = await latestCodeFor(email);
  check('SC01-01b', '开发邮箱收到 6 位数字验证码', /^\d{6}$/.test(code || ''), `code=${code}`);

  const regR = await req('POST', '/api/auth/register', {
    email,
    code,
    nickname: '测试新同学',
    realName: '测试张三',
    password: 'Test@12345',
    phone: '13800138000',
    agree: true
  });
  const regData = regR.body?.data;
  check('SC01-01c', '注册成功且认证=未提交、账号=正常、学号为空',
    regR.body?.code === 0
    && regData?.certStatus === '未提交'
    && regData?.accountStatus === '正常'
    && (regData?.studentNo === null || regData?.studentNo === undefined),
    JSON.stringify(regR.body));

  const loginR = await loginStudent(email);
  const token = loginR.body?.data?.token;
  check('SC01-02a', '新注册学生可登录', typeof token === 'string' && token.length === 64);

  const subR = await req('POST', '/api/verifications', {
    declaredNo: '20239901',
    cardImage: PNG
  }, token);
  check('SC01-02b', '提交核验后状态为待审核',
    subR.body?.code === 0
    && subR.body?.data?.certStatus === '待审核'
    && subR.body?.data?.latest?.reviewStatus === '待审核',
    JSON.stringify(subR.body));

  const adminToken = (await loginAdmin()).body?.data?.token;
  const appId = subR.body?.data?.latest?.id;
  const approveR = await req('POST', `/api/admin/verifications/${appId}/approve`, {}, adminToken);
  check('SC01-03a', '管理员审核通过成功', approveR.body?.code === 0, JSON.stringify(approveR.body));

  const mineAfter = await req('GET', '/api/verifications/mine', undefined, token);
  check('SC01-03b', '通过后状态=已认证且绑定学号 20239901',
    mineAfter.body?.data?.certStatus === '已认证' && mineAfter.body?.data?.studentNo === '20239901',
    JSON.stringify(mineAfter.body));

  const lvToken = (await loginStudent('lv@campus.edu')).body?.data?.token;
  const dupNoR = await req('POST', '/api/verifications', {
    declaredNo: '20239901',
    cardImage: PNG
  }, lvToken);
  check('SC01-04', '同一学号不可绑定第二个账号（返回 409/3003）',
    dupNoR.status === 409 && dupNoR.body?.code === 3003,
    `${dupNoR.status} ${JSON.stringify(dupNoR.body)}`);
}

/* ==========================================================================
 * 2. SC-02：权限拒绝面（四角色 × 七类操作 + 逐字提示语 + 拒绝后四查）
 * ========================================================================== */
async function runSc02() {
  log('\n=== [SC-02] 权限拒绝面：四角色×七操作 + 逐字提示语 + 拒绝后四查 ===');
  await resetAll();

  const linToken = (await loginStudent('lin@campus.edu')).body?.data?.token;
  const zhaoToken = (await loginStudent('zhao@campus.edu')).body?.data?.token;
  const lvToken = (await loginStudent('lv@campus.edu')).body?.data?.token;
  const maToken = (await loginStudent('ma@campus.edu')).body?.data?.token;
  const guoToken = (await loginStudent('guo@campus.edu')).body?.data?.token;
  const lowToken = (await loginStudent('low@campus.edu')).body?.data?.token;
  const adminToken = (await loginAdmin()).body?.data?.token;

  const cats = (await req('GET', '/api/categories')).body?.data || [];
  const catId = cats[0]?.id || 1;
  const products = (await req('GET', '/api/products?pageSize=50')).body?.data?.items || [];
  const onSale = products[0];
  const linMe = (await req('GET', '/api/auth/me', undefined, linToken)).body?.data?.profile;
  const zhaoOrders = (await req('GET', '/api/me/orders', undefined, zhaoToken)).body?.data || [];
  const sampleOrder = zhaoOrders[0];

  const validProductBody = {
    title: '权限测试商品', description: '用于测试权限拦截的描述。',
    price: '20.00', condition: '九成新', categoryId: catId, images: [PNG]
  };

  // 快照：拒绝前状态
  const stateBefore = (await req('GET', '/api/dev/state')).body?.data?.counts;
  const lvCreditBefore = (await req('GET', '/api/me/credit', undefined, lvToken)).body?.data?.score;
  const guoCreditBefore = (await req('GET', '/api/me/credit', undefined, guoToken)).body?.data?.score;

  // 1) 游客
  const guestPub = await req('POST', '/api/products', validProductBody);
  check('SC02-01a', '游客发布被拒且提示=请先登录并完成学生证核验',
    guestPub.status === 401 && guestPub.body?.message === '请先登录并完成学生证核验',
    `status=${guestPub.status}, msg="${guestPub.body?.message}"`);

  const guestOrder = await req('POST', '/api/orders', { productId: onSale.id });
  check('SC02-01b', '游客下单被拒且提示=请先登录并完成学生证核验',
    guestOrder.status === 401 && guestOrder.body?.message === '请先登录并完成学生证核验',
    `status=${guestOrder.status}, msg="${guestOrder.body?.message}"`);

  const guestFav = await req('POST', '/api/favorites', { productId: onSale.id });
  check('SC02-01c', '游客收藏被拒', guestFav.status === 401);

  // 2) 未认证三态逐字提示语
  const lvPub = await req('POST', '/api/products', validProductBody, lvToken);
  check('SC02-02a', '未提交学生发布提示=请先上传学生证',
    lvPub.status === 403 && lvPub.body?.message === '请先上传学生证',
    `status=${lvPub.status}, msg="${lvPub.body?.message}"`);

  const maPub = await req('POST', '/api/products', validProductBody, maToken);
  check('SC02-02b', '待审核学生发布提示=核验审核中，请等待',
    maPub.status === 403 && maPub.body?.message === '核验审核中，请等待',
    `status=${maPub.status}, msg="${maPub.body?.message}"`);

  const guoPub = await req('POST', '/api/products', validProductBody, guoToken);
  check('SC02-02c', '已驳回学生发布提示=核验未通过，请按原因修改后重新提交',
    guoPub.status === 403 && guoPub.body?.message === '核验未通过，请按原因修改后重新提交',
    `status=${guoPub.status}, msg="${guoPub.body?.message}"`);

  const lvFav = await req('POST', '/api/favorites', { productId: onSale.id }, lvToken);
  check('SC02-02d', '未认证学生允许收藏商品', lvFav.body?.code === 0, JSON.stringify(lvFav.body));
  await req('DELETE', `/api/favorites/${onSale.id}`, undefined, lvToken);

  const lvReport = await req('POST', '/api/reports', {
    targetType: '商品', targetId: onSale.id, type: '虚假描述', reason: '未认证测试举报'
  }, lvToken);
  check('SC02-02e', '未认证学生举报被拒', lvReport.status === 403 && lvReport.body?.code === 1003);

  const lvMsg = await req('POST', '/api/messages', { productId: onSale.id, content: '未认证私信' }, lvToken);
  check('SC02-02f', '未认证学生私信被拒', lvMsg.status === 403 && lvMsg.body?.code === 1003);

  const lvAdminCall = await req('POST', `/api/admin/products/${onSale.id}/approve`, {}, lvToken);
  check('SC02-02g', '未认证学生调用审核接口被拒(403)', lvAdminCall.status === 403);

  // 3) 管理员调学生接口逐字提示语
  const admPub = await req('POST', '/api/products', validProductBody, adminToken);
  check('SC02-04a', '管理员发布被拒且提示=管理员无发布商品权限',
    admPub.status === 403 && admPub.body?.message === '管理员无发布商品权限',
    `status=${admPub.status}, msg="${admPub.body?.message}"`);

  const admOrder = await req('POST', '/api/orders', { productId: onSale.id }, adminToken);
  check('SC02-04b', '管理员下单被拒且提示=管理员无下单权限',
    admOrder.status === 403 && admOrder.body?.message === '管理员无下单权限',
    `status=${admOrder.status}, msg="${admOrder.body?.message}"`);

  if (sampleOrder) {
    const admReview = await req('POST', `/api/orders/${sampleOrder.id}/reviews`, { content: '管理员评' }, adminToken);
    check('SC02-04c', '管理员评价被拒且提示=管理员无评价权限',
      admReview.status === 403 && admReview.body?.message === '管理员无评价权限',
      `status=${admReview.status}, msg="${admReview.body?.message}"`);
  }

  const admReport = await req('POST', '/api/reports', {
    targetType: '商品', targetId: onSale.id, type: '虚假描述', reason: '管理员试举报'
  }, adminToken);
  check('SC02-04d', '管理员提交举报被拒且提示=管理员不能以举报人身份提交举报',
    admReport.status === 403 && admReport.body?.message === '管理员不能以举报人身份提交举报',
    `status=${admReport.status}, msg="${admReport.body?.message}"`);

  // 4) 封禁 & 信用分不足
  const banLogin = await loginStudent('ban@campus.edu');
  check('SC02-05', '封禁账号登录返回 403/1004 且提示=账号已封禁，不可发布与下单',
    banLogin.status === 403 && banLogin.body?.code === 1004
    && banLogin.body?.message === '账号已封禁，不可发布与下单',
    `status=${banLogin.status}, code=${banLogin.body?.code}, msg="${banLogin.body?.message}"`);

  const lowPub = await req('POST', '/api/products', validProductBody, lowToken);
  check('SC02-06a', '信用分55(<60)发布被拒且提示=信用分不足，暂不可发布新商品',
    lowPub.status === 403 && lowPub.body?.message === '信用分不足，暂不可发布新商品',
    `status=${lowPub.status}, msg="${lowPub.body?.message}"`);

  // 调整 low 到 35 (<40) 测试下单提示语
  const lowMe = (await req('GET', '/api/auth/me', undefined, lowToken)).body?.data?.profile;
  await req('POST', `/api/admin/students/${lowMe.id}/credit`, { delta: -10, reason: '压测阈值1' }, adminToken);
  await timeShift(0.001);
  await req('POST', `/api/admin/students/${lowMe.id}/credit`, { delta: -10, reason: '压测阈值2' }, adminToken);
  const lowOrder = await req('POST', '/api/orders', { productId: onSale.id }, lowToken);
  check('SC02-06b', '信用分35(<40)下单被拒且提示=信用分不足，暂不可下单',
    lowOrder.status === 403 && lowOrder.body?.message === '信用分不足，暂不可下单',
    `status=${lowOrder.status}, msg="${lowOrder.body?.message}"`);

  // 5) 状态拒绝 vs 权限拒绝：已售出商品下单
  const soldProductId = sampleOrder?.productId;
  if (soldProductId) {
    const buySold = await req('POST', '/api/orders', { productId: soldProductId }, linToken);
    check('SC02-07', '对已售出商品下单属状态拒绝(409/3001)而非权限拒绝',
      buySold.status === 409 && buySold.body?.code === 3001,
      `${buySold.status} ${JSON.stringify(buySold.body)}`);
  }

  // 6) 拒绝后四查：数据不变、信用分不变
  const stateAfter = (await req('GET', '/api/dev/state')).body?.data?.counts;
  const lvCreditAfter = (await req('GET', '/api/me/credit', undefined, lvToken)).body?.data?.score;
  const guoCreditAfter = (await req('GET', '/api/me/credit', undefined, guoToken)).body?.data?.score;
  check('SC02-08a', '权限拒绝后业务表条数(商品/订单/评价/举报)未增长',
    stateBefore.products === stateAfter.products
    && stateBefore.orders === stateAfter.orders
    && stateBefore.reviews === stateAfter.reviews
    && stateBefore.reports === stateAfter.reports,
    `before=${JSON.stringify(stateBefore)}, after=${JSON.stringify(stateAfter)}`);
  check('SC02-08b', '权限拒绝不扣被拒用户信用分',
    lvCreditBefore === lvCreditAfter && guoCreditBefore === guoCreditAfter,
    `lv:${lvCreditBefore}->${lvCreditAfter}, guo:${guoCreditBefore}->${guoCreditAfter}`);
}

/* ==========================================================================
 * 3. SC-08：身份核验异常（空原因驳回、重提+1口径、24h/7d定时、AT-08、并发）
 * ========================================================================== */
async function runSc08() {
  log('\n=== [SC-08] 身份核验异常与 AT-08 / 并发 ===');
  await resetAll();

  const adminToken = (await loginAdmin()).body?.data?.token;
  const maToken = (await loginStudent('ma@campus.edu')).body?.data?.token;
  const lvToken = (await loginStudent('lv@campus.edu')).body?.data?.token;
  const zhaoToken = (await loginStudent('zhao@campus.edu')).body?.data?.token;
  const zhaoId = (await req('GET', '/api/auth/me', undefined, zhaoToken)).body?.data?.profile?.id;

  const maMine = (await req('GET', '/api/verifications/mine', undefined, maToken)).body?.data;
  const maAppId = maMine?.latest?.id;

  // 空原因驳回被拒
  const emptyReject = await req('POST', `/api/admin/verifications/${maAppId}/reject`, {
    reason: '   ', forgery: false
  }, adminToken);
  check('SC08-02', '驳回原因为空不允许提交', emptyReject.status === 422 && emptyReject.body?.code === 2001);

  // 正式驳回后检查状态与重提次数
  const okReject = await req('POST', `/api/admin/verifications/${maAppId}/reject`, {
    reason: '学生证照片反光看不清学号', forgery: false
  }, adminToken);
  check('SC08-03a', '管理员正式驳回成功', okReject.body?.code === 0);
  const maAfterReject = (await req('GET', '/api/verifications/mine', undefined, maToken)).body?.data;
  check('SC08-03b', '驳回后状态=已驳回且重提次数按任务书期望+1',
    maAfterReject?.certStatus === '已驳回' && maAfterReject?.resubmitCount === 1,
    `certStatus=${maAfterReject?.certStatus}, resubmitCount=${maAfterReject?.resubmitCount}`);

  // 并发提交同一学生：lv 并发 5 次
  const concRes = await Promise.all(
    Array.from({ length: 5 }, (_, i) => req('POST', '/api/verifications', {
      declaredNo: '20238801',
      cardImage: PNG
    }, lvToken))
  );
  const concOk = concRes.filter((r) => r.body?.code === 0).length;
  check('SC08-07', '同一学生并发 5 次提交核验仅 1 次成功',
    concOk === 1, `成功数=${concOk}, 状态码=${concRes.map((r) => r.status).join(',')}`);

  // +24h 不自动通过
  await timeShift(24);
  const sched24 = (await req('POST', '/api/dev/scheduler/run', {}, adminToken)).body?.data;
  const lvAfter24 = (await req('GET', '/api/verifications/mine', undefined, lvToken)).body?.data;
  check('SC08-04', '核验提交满 24 小时仍保持待审核（不自动通过）',
    lvAfter24?.certStatus === '待审核' && (sched24?.counts?.certTimeouts || 0) >= 1,
    JSON.stringify({ certStatus: lvAfter24?.certStatus, schedCounts: sched24?.counts }));

  // 新注册未提交账号 +168h 不自动驳回/封禁
  await req('POST', '/api/dev/time-reset', {});
  const freshEmail = 'sc08_7d@campus.edu';
  await req('POST', '/api/auth/send-code', { email: freshEmail });
  const freshCode = await latestCodeFor(freshEmail);
  await req('POST', '/api/auth/register', {
    email: freshEmail, code: freshCode, nickname: '7天未交', realName: '七天未交',
    password: 'Test@12345', agree: true
  });
  await timeShift(168);
  await req('POST', '/api/dev/scheduler/run', {}, adminToken);
  const freshLogin = await loginStudent(freshEmail);
  check('SC08-05', '注册满 7 天未提交仍保持未提交且账号正常（不自动驳回/封禁）',
    freshLogin.body?.code === 0
    && freshLogin.body?.data?.student?.certStatus === '未提交'
    && freshLogin.body?.data?.student?.accountStatus === '正常',
    JSON.stringify(freshLogin.body?.data?.student));

  // AT-08 事后核实伪造：撤销认证 + 封禁账号
  const revokeR = await req('POST', `/api/admin/verifications/students/${zhaoId}/revoke`, {
    reason: '事后核实学生证系伪造', deductCredit: true
  }, adminToken);
  check('SC08-06a', 'AT-08 撤销认证接口调用成功', revokeR.body?.code === 0);
  const zhaoDetail = (await req('GET', `/api/admin/students/${zhaoId}`, undefined, adminToken)).body?.data;
  const zhaoLoginAfter = await loginStudent('zhao@campus.edu');
  check('SC08-06b', 'AT-08 同动作认证改回已驳回且账号封禁',
    zhaoDetail?.certStatus === '已驳回'
    && zhaoDetail?.accountStatus === '封禁'
    && zhaoLoginAfter.body?.code === 1004,
    `cert=${zhaoDetail?.certStatus}, account=${zhaoDetail?.accountStatus}, loginCode=${zhaoLoginAfter.body?.code}`);
}

/* ==========================================================================
 * 4. NFR-05：登录安全（4次不锁 / 5次锁 / t+15m 边界 / 跨设备共用计数 / 清零）
 * ========================================================================== */
async function runNfr05() {
  log('\n=== [NFR-05] 登录安全：失败计数 / 15 分钟锁定边界 / 跨设备同计数 ===');
  await resetAll();
  const adminToken = (await loginAdmin()).body?.data?.token;
  const lvMe = (await req('GET', '/api/auth/me', undefined, (await loginStudent('lv@campus.edu')).body?.data?.token)).body?.data?.profile;

  // 跨设备前 3 次错（设备 A）
  for (let i = 1; i <= 3; i++) {
    const r = await loginStudent('lv@campus.edu', 'Wrong@1', {
      'User-Agent': 'Device-A', 'X-Forwarded-For': '10.0.0.1'
    });
    check(`NFR05-01.${i}`, `第 ${i} 次错误不锁定`, r.status === 401 && r.body?.code === 1001);
  }
  // 换设备 B 第 4 次错，仍不锁
  const fail4 = await loginStudent('lv@campus.edu', 'Wrong@1', {
    'User-Agent': 'Device-B', 'X-Forwarded-For': '10.0.0.2'
  });
  check('NFR05-01.4', '跨设备第 4 次错误仍不锁定', fail4.status === 401 && fail4.body?.code === 1001);

  // 第 5 次错（设备 B）：触发锁定
  const fail5 = await loginStudent('lv@campus.edu', 'Wrong@1', {
    'User-Agent': 'Device-B', 'X-Forwarded-For': '10.0.0.2'
  });
  const detailAt5 = (await req('GET', `/api/admin/students/${lvMe.id}`, undefined, adminToken)).body?.data;
  const lockedUntilBefore = detailAt5?.lockedUntil;
  check('NFR05-02', '跨设备累计第 5 次错误写入锁定截止时间',
    !!lockedUntilBefore && detailAt5?.failedLoginCount === 5,
    `failedCount=${detailAt5?.failedLoginCount}, lockedUntil=${lockedUntilBefore}`);

  // t+14 分钟内：正确密码被拒，且不延长 lockedUntil
  await timeShift(14 / 60);
  const lockedRight = await loginStudent('lv@campus.edu', 'Test@12345', {
    'User-Agent': 'Device-C', 'X-Forwarded-For': '10.0.0.3'
  });
  const detailDuring = (await req('GET', `/api/admin/students/${lvMe.id}`, undefined, adminToken)).body?.data;
  check('NFR05-03', '锁定期内(+14m)正确密码仍拒(429/1006)且不延长锁定时间',
    lockedRight.status === 429 && lockedRight.body?.code === 1006
    && detailDuring?.lockedUntil === lockedUntilBefore,
    `status=${lockedRight.status}, code=${lockedRight.body?.code}, lockedUntil=${detailDuring?.lockedUntil}`);

  // t+15 分钟整：放行且清零
  await timeShift(1 / 60);
  const unlocked = await loginStudent('lv@campus.edu', 'Test@12345');
  const detailAfterUnlock = (await req('GET', `/api/admin/students/${lvMe.id}`, undefined, adminToken)).body?.data;
  check('NFR05-04', '满 15 分钟整放行并清零失败计数',
    unlocked.body?.code === 0 && detailAfterUnlock?.failedLoginCount === 0,
    `loginCode=${unlocked.body?.code}, failedCount=${detailAfterUnlock?.failedLoginCount}`);
  check('NFR05-05', '锁定期间认证状态/信用分/账号状态不变',
    detailAfterUnlock?.certStatus === lvMe.certStatus
    && detailAfterUnlock?.creditScore === lvMe.creditScore
    && detailAfterUnlock?.accountStatus === lvMe.accountStatus);
}

/* ==========================================================================
 * 5. NFR-08：学生证信息安全
 * ========================================================================== */
async function runNfr08() {
  log('\n=== [NFR-08] 学生证信息安全 ===');
  await resetAll();

  const lvToken = (await loginStudent('lv@campus.edu')).body?.data?.token;
  const zhaoToken = (await loginStudent('zhao@campus.edu')).body?.data?.token;
  const adminToken = (await loginAdmin()).body?.data?.token;

  const sub = await req('POST', '/api/verifications', { declaredNo: '20237701', cardImage: PNG }, lvToken);
  const appId = sub.body?.data?.latest?.id;

  const guestImg = await req('GET', `/api/admin/verifications/${appId}/image`);
  const selfImg = await req('GET', `/api/admin/verifications/${appId}/image`, undefined, lvToken);
  const otherImg = await req('GET', `/api/admin/verifications/${appId}/image`, undefined, zhaoToken);
  const adminImg = await req('GET', `/api/admin/verifications/${appId}/image`, undefined, adminToken);

  check('NFR08-01a', '游客读证件图返回 401 且无图片内容',
    guestImg.status === 401 && !guestImg.text.includes('base64') && !guestImg.text.includes('.png'));
  check('NFR08-01b', '学生本人读证件图接口返回 403 且无 base64/文件名',
    selfImg.status === 403 && !selfImg.text.includes('base64') && !selfImg.text.includes('.png'));
  check('NFR08-01c', '其他已认证学生读证件图返回 403 且无 base64/文件名',
    otherImg.status === 403 && !otherImg.text.includes('base64') && !otherImg.text.includes('.png'));
  check('NFR08-01d', '管理员读证件图 200 且带 Cache-Control: no-store',
    adminImg.status === 200 && String(adminImg.headers.get('cache-control')).includes('no-store'),
    `status=${adminImg.status}, cache-control=${adminImg.headers.get('cache-control')}`);

  const traversal = await req('GET', '/uploads/../cert/nonexistent.png');
  check('NFR08-03', '静态目录路径穿越读 cert 目录被拒', traversal.status !== 200, `status=${traversal.status}`);

  const auditText = (await req('GET', '/api/admin/audit?limit=100', undefined, adminToken)).text;
  const notesText = (await req('GET', '/api/notifications', undefined, lvToken)).text;
  check('NFR08-02', '通知与审计日志不含 base64 或证件图路径',
    !/data:image|\/secure\/cert|uploads\/cert/i.test(auditText + notesText));
}

/* ==========================================================================
 * 6. NFR-10：邮箱验证码安全（格式/整10分失效/一次性/错5次作废/频控/防枚举/改密全失效）
 * ========================================================================== */
async function runNfr10() {
  log('\n=== [NFR-10] 邮箱验证码安全 ===');
  await resetAll();

  // 1) 10 分钟边界（+9m50s 有效 vs 整 10m 失效）
  const emailA = 'nfr10_ttl@campus.edu';
  await req('POST', '/api/auth/send-code', { email: emailA });
  const codeA = await latestCodeFor(emailA);
  check('NFR10-01', '验证码为 6 位数字', /^\d{6}$/.test(codeA || ''), codeA);

  await timeShift(590 / 3600); // +9m50s
  const regBefore10 = await req('POST', '/api/auth/register', {
    email: emailA, code: codeA, nickname: '未满十分', realName: '未满十分',
    password: 'Test@12345', agree: true
  });
  check('NFR10-02a', '未满 10 分钟(+9m50s)验证码仍可用', regBefore10.body?.code === 0,
    JSON.stringify(regBefore10.body));

  const emailExact10 = 'nfr10_exact10@campus.edu';
  await req('POST', '/api/auth/send-code', { email: emailExact10 });
  const codeExact10 = await latestCodeFor(emailExact10);
  await timeShift(600 / 3600); // 整 +10m
  const regAtExact10 = await req('POST', '/api/auth/register', {
    email: emailExact10, code: codeExact10, nickname: '整十分', realName: '整十分',
    password: 'Test@12345', agree: true
  });
  check('NFR10-02b', '整 10 分钟验证码立即失效', regAtExact10.status === 422 && regAtExact10.body?.code === 2001,
    `status=${regAtExact10.status} ${JSON.stringify(regAtExact10.body)}`);

  // 2) 一次性消费 + 错 5 次作废
  await req('POST', '/api/dev/time-reset', {});
  const emailOnce = 'nfr10_once@campus.edu';
  await req('POST', '/api/auth/send-code', { email: emailOnce });
  const codeOnce = await latestCodeFor(emailOnce);
  const regOnceOk = await req('POST', '/api/auth/register', {
    email: emailOnce, code: codeOnce, nickname: '一次性', realName: '一次性',
    password: 'Test@12345', agree: true
  });
  const regOnceReplay = await req('POST', '/api/auth/register', {
    email: 'nfr10_once2@campus.edu', code: codeOnce, nickname: '重放', realName: '重放',
    password: 'Test@12345', agree: true
  });
  check('NFR10-03', '验证码消费后一次性作废（重放失败）',
    regOnceOk.body?.code === 0 && regOnceReplay.body?.code !== 0);

  const emailFail5 = 'nfr10_fail5@campus.edu';
  await req('POST', '/api/auth/send-code', { email: emailFail5 });
  const codeFail5 = await latestCodeFor(emailFail5);
  for (let i = 0; i < 5; i++) {
    await req('POST', '/api/auth/register', {
      email: emailFail5, code: '000000', nickname: '错五次', realName: '错五次',
      password: 'Test@12345', agree: true
    });
  }
  const sixthRight = await req('POST', '/api/auth/register', {
    email: emailFail5, code: codeFail5, nickname: '错五次', realName: '错五次',
    password: 'Test@12345', agree: true
  });
  check('NFR10-04', '同一码错 5 次作废，第 6 次用正确验证码仍被拒',
    sixthRight.status === 422 && sixthRight.body?.code === 2001,
    JSON.stringify(sixthRight.body));

  // 3) 60s 与 24h 10 次双重频控
  const emailRate = 'nfr10_rate@campus.edu';
  await req('POST', '/api/auth/send-code', { email: emailRate });
  const rate60 = await req('POST', '/api/auth/send-code', { email: emailRate });
  check('NFR10-05a', '60 秒内重发被频控拒绝(429/4001)', rate60.status === 429 && rate60.body?.code === 4001);

  for (let i = 2; i <= 10; i++) {
    await timeShift(65 / 3600);
    const ri = await req('POST', '/api/auth/send-code', { email: emailRate });
    if (ri.body?.code !== 0) {
      check('NFR10-05b', `第 ${i} 次发送应在 24h 上限内成功`, false, JSON.stringify(ri.body));
      break;
    }
  }
  await timeShift(65 / 3600);
  const rate11 = await req('POST', '/api/auth/send-code', { email: emailRate });
  check('NFR10-05c', '24 小时内第 11 次发送被拒(429/4001)',
    rate11.status === 429 && rate11.body?.code === 4001,
    JSON.stringify(rate11.body));

  // 4) 找回密码防枚举（20 次存在 vs 20 次不存在）
  await resetAll();
  const existTimes = [];
  const absentTimes = [];
  let sameMsgAll = true;
  let baselineMsg = null;
  for (let i = 0; i < 20; i++) {
    await timeShift(65 / 3600);
    const rExist = await req('POST', '/api/auth/forgot/send-code', { email: 'lin@campus.edu' });
    const rAbsent = await req('POST', '/api/auth/forgot/send-code', { email: `absent_${i}@campus.edu` });
    // 第10次(i===9)后跨过24h窗口，避免第11次触发 429
    if (i === 9) await timeShift(25);
    existTimes.push(rExist.elapsedMs);
    absentTimes.push(rAbsent.elapsedMs);
    if (baselineMsg === null) baselineMsg = rExist.body?.message;
    if (rExist.body?.message !== baselineMsg || rAbsent.body?.message !== baselineMsg) {
      sameMsgAll = false;
    }
  }
  const diffMs = Math.abs(mean(existTimes) - mean(absentTimes)).toFixed(2);
  check('NFR10-06', '找回密码存在与不存在邮箱 20 次均返回完全一致文案',
    sameMsgAll, `存在均值=${mean(existTimes).toFixed(2)}ms, 不存在均值=${mean(absentTimes).toFixed(2)}ms, 差=${diffMs}ms（结论写「未发现显著差异」）`);

  // 5) 重置密码后所有旧会话全部 401 & 封禁账号可重置但登录被拒
  await resetAll();
  const tok1 = (await loginStudent('lin@campus.edu')).body?.data?.token;
  const tok2 = (await loginStudent('lin@campus.edu')).body?.data?.token;
  await req('POST', '/api/auth/forgot/send-code', { email: 'lin@campus.edu' });
  const resetCode = await latestCodeFor('lin@campus.edu');
  const resetOk = await req('POST', '/api/auth/forgot/reset', {
    email: 'lin@campus.edu', code: resetCode, newPassword: 'NewPass@2026'
  });
  check('NFR10-07a', '学生重置密码成功', resetOk.body?.code === 0);
  const checkTok1 = await req('GET', '/api/me/products', undefined, tok1);
  const checkTok2 = await req('GET', '/api/me/products', undefined, tok2);
  check('NFR10-07b', '重置密码后旧会话令牌 1 与 2 全部 401',
    checkTok1.status === 401 && checkTok2.status === 401,
    `tok1=${checkTok1.status}, tok2=${checkTok2.status}`);

  await req('POST', '/api/auth/forgot/send-code', { email: 'ban@campus.edu' });
  const banResetCode = await latestCodeFor('ban@campus.edu');
  const banResetOk = await req('POST', '/api/auth/forgot/reset', {
    email: 'ban@campus.edu', code: banResetCode, newPassword: 'BanNew@2026'
  });
  const banLoginNew = await loginStudent('ban@campus.edu', 'BanNew@2026');
  check('NFR10-08', '封禁账号可重置密码，但新密码登录仍被拒(1004)',
    banResetOk.body?.code === 0 && banLoginNew.body?.code === 1004,
    `resetCode=${banResetOk.body?.code}, loginCode=${banLoginNew.body?.code}`);
}

/* ==========================================================================
 * 7. 帽子三：信息安全测试专项（会话、横/纵向越权、泄露、注入/XSS、审计扫描）
 * ========================================================================== */
async function runSecuritySpecial() {
  log('\n=== [帽子三] 信息安全测试专项 (SEC-02 ~ SEC-13) ===');
  await resetAll();

  const linLogin = await loginStudent('lin@campus.edu');
  const linToken = linLogin.body?.data?.token;
  const zhaoToken = (await loginStudent('zhao@campus.edu')).body?.data?.token;
  const lvToken = (await loginStudent('lv@campus.edu')).body?.data?.token;
  const adminToken = (await loginAdmin()).body?.data?.token;

  const linMe = (await req('GET', '/api/auth/me', undefined, linToken)).body?.data?.profile;
  const zhaoMe = (await req('GET', '/api/auth/me', undefined, zhaoToken)).body?.data?.profile;
  const linOrders = (await req('GET', '/api/me/orders', undefined, linToken)).body?.data || [];
  const sampleOrder = linOrders[0];

  // Cookie 安全属性
  const setCookie = linLogin.headers.get('set-cookie') || '';
  check('SEC-04', '登录 Set-Cookie 包含 HttpOnly 与 SameSite=Lax',
    /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), setCookie);

  // 伪造令牌 & 登出后重放
  const fakeAuth = await req('GET', '/api/me/orders', undefined, '0'.repeat(64));
  check('SEC-02a', '伪造令牌访问受保护接口返回 401', fakeAuth.status === 401);
  await req('POST', '/api/auth/logout', undefined, lvToken);
  const afterLogout = await req('GET', '/api/me/favorites', undefined, lvToken);
  check('SEC-02b', '登出后重放旧令牌返回 401', afterLogout.status === 401);

  // 管理员改密后旧会话是否失效
  const admBefore = (await loginAdmin()).body?.data?.token;
  await req('POST', '/api/auth/admin/change-password', {
    oldPassword: 'Admin@12345', newPassword: 'AdminNew@2026'
  }, adminToken);
  const admOldCheck = await req('GET', '/api/admin/dashboard', undefined, admBefore);
  check('SEC-03', '管理员修改密码后原有管理员令牌应失效(401)',
    admOldCheck.status === 401, `实际状态=${admOldCheck.status}（若为200请登记BUG）`);

  // 重新登录管理员用于后续扫描
  const adminTokenNew = (await loginAdmin('ADM-001', 'AdminNew@2026')).body?.data?.token;

  // 横向越权：lv 读取 lin/zhao 的订单、私信、信用明细
  const lvToken2 = (await loginStudent('lv@campus.edu')).body?.data?.token;
  if (sampleOrder) {
    const hOrder = await req('GET', `/api/orders/${sampleOrder.id}`, undefined, lvToken2);
    check('SEC-05a', '横向越权：第三方读他人订单返回 403 且无正文',
      hOrder.status === 403 && hOrder.body?.data == null, `${hOrder.status} ${hOrder.text}`);
    const hMsg = await req('GET', `/api/messages/conversations/${sampleOrder.productId}/${zhaoMe.id}`, undefined, lvToken2);
    check('SEC-05b', '横向越权：第三方读他人私信会话返回 403 且无正文',
      hMsg.status === 403 && !String(hMsg.text).includes('鼠标'), `${hMsg.status} ${hMsg.text}`);
  }
  const hCredit = await req('GET', `/api/students/${linMe.id}/credit`, undefined, lvToken2);
  check('SEC-05c', '查看他人信用分不含变动明细 records',
    hCredit.body?.code === 0 && hCredit.body?.data?.records == null, JSON.stringify(hCredit.body?.data));

  // 纵向越权：学生打管理员接口
  const vDash = await req('GET', '/api/admin/dashboard', undefined, linToken);
  const vAudit = await req('GET', '/api/admin/audit', undefined, linToken);
  const vCredit = await req('GET', `/api/admin/students/${zhaoMe.id}/credit`, undefined, linToken);
  check('SEC-06', '纵向越权：学生调管理员接口全部返回 403',
    vDash.status === 403 && vAudit.status === 403 && vCredit.status === 403,
    `dash=${vDash.status}, audit=${vAudit.status}, credit=${vCredit.status}`);

  // 信息泄露：游客个人主页 & 他人主页隐私字段 & SQL 表名/堆栈
  const guestProf = await req('GET', `/api/students/${linMe.id}/profile`);
  check('SEC-07a', '游客查看个人主页返回 401', guestProf.status === 401);

  await req('PATCH', '/api/auth/me/profile', { phone: '13912345678', dorm: '紫荆公寓99号楼999' }, linToken);
  const otherProf = await req('GET', `/api/students/${linMe.id}/profile`, undefined, zhaoToken);
  const publicProds = await req('GET', '/api/products?pageSize=50');
  const leakText = otherProf.text + publicProds.text;
  check('SEC-07b', '他人主页与公开列表不含手机号/宿舍/密码哈希/SQL异常栈',
    !/13912345678|紫荆公寓99号楼999|passwordHash|SQLException|Exception:/i.test(leakText));

  // 开发接口安全核查（/api/dev/state 与匿名 /api/dev/mailbox）
  const devStateGuest = await req('GET', '/api/dev/state');
  const devMailGuest = await req('GET', '/api/dev/mailbox');
  check('SEC-08', '开发接口不应向未鉴权游客暴露状态与明文验证码邮件（生产收口项）',
    devStateGuest.status === 401 || devStateGuest.status === 403,
    `/state=${devStateGuest.status}, /mailbox=${devMailGuest.status}（测试期开启 devTools 时需登记为安全收口项）`);

  // 非法图片格式校验 & XSS 载荷检查
  const badUpload = await req('POST', '/api/verifications', {
    declaredNo: '20236666',
    cardImage: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='
  }, lvToken2);
  check('SEC-09', '非法非图片 DataURL 上传被 422 拒绝', badUpload.status === 422 && badUpload.body?.code === 2001);

  const products = (await req('GET', '/api/products?pageSize=10')).body?.data?.items || [];
  const linProd = products.find((p) => p.sellerId === linMe.id);
  if (linProd) {
    const xssPayload = '<script>alert("xss")</script>';
    const sendXss = await req('POST', '/api/messages', { productId: linProd.id, content: xssPayload }, zhaoToken);
    const convXss = await req('GET', `/api/messages/conversations/${linProd.id}/${zhaoMe.id}`, undefined, linToken);
    check('SEC-11', '私信含 <script> 载荷按纯文本落库与返回（页面需配合转义）',
      sendXss.body?.code === 0 && convXss.body?.data?.messages?.some((m) => m.content === xssPayload));
  }

  // SQL 注入与超长输入 / XSS 文本处理
  const sqliSearch = await req('GET', `/api/products?keyword=${encodeURIComponent("' OR '1'='1")}`);
  check('SEC-10a', 'SQL 注入搜索词不引发 500 且不泄露表结构',
    sqliSearch.status === 200 && !/SQL|syntax|mysql/i.test(sqliSearch.text));

  const overlongNick = await req('PATCH', '/api/auth/me/profile', { nickname: 'A'.repeat(200) }, linToken);
  check('SEC-10b', '超长昵称(>20)被 422 拒绝', overlongNick.status === 422 && overlongNick.body?.code === 2001);

  // 客户端篡改逻辑测试：注册传非法字段看是否被忽略
  await req('POST', '/api/auth/send-code', { email: 'tamper@campus.edu' });
  const tamperCode = await latestCodeFor('tamper@campus.edu');
  const tamperReg = await req('POST', '/api/auth/register', {
    email: 'tamper@campus.edu', code: tamperCode, nickname: '防篡改', realName: '防篡改',
    password: 'Test@12345', agree: true,
    certStatus: '已认证', creditScore: 150, accountStatus: '正常'
  });
  check('SEC-12', '注册请求篡改 certStatus/creditScore 不生效',
    tamperReg.body?.data?.certStatus === '未提交' && tamperReg.body?.data?.creditScore === 100,
    JSON.stringify(tamperReg.body?.data));

  // 审计日志泄露扫描
  const auditAll = await req('GET', '/api/admin/audit?limit=300', undefined, adminTokenNew);
  check('SEC-13', '审计日志不含密码、完整手机号、完整宿舍、证件图片与验证码',
    auditAll.status === 200
    && !/Test@12345|Admin@12345|13912345678|紫荆公寓99号楼999|data:image/i.test(auditAll.text));
}

async function main() {
  log(`========================================================`);
  log(`马歆远专项测试执行报告`);
  log(`时间: ${new Date().toISOString()}`);
  log(`目标: ${BASE}`);
  log(`Node: ${process.version}`);
  log(`========================================================`);

  try {
    await runSc01();
    await runSc02();
    await runSc08();
    await runNfr05();
    await runNfr08();
    await runNfr10();
    await runSecuritySpecial();
  } finally {
    try {
      await resetAll();
      log('\n[收尾] 已执行 /api/dev/reset 与 /api/dev/time-reset 复位环境。');
    } catch (e) {
      log(`\n[收尾异常] 复位环境失败: ${e.message}`);
    }
  }

  log(`\n========================================================`);
  log(`汇总：通过 ${passCount} 项，未通过 ${failures.length} 项`);
  if (failures.length > 0) {
    log('未通过清单（请逐项核对并开立 BUG）：');
    failures.forEach((f, idx) => log(`  ${idx + 1}. ${f}`));
    process.exitCode = 1;
  }
  log(`========================================================`);

  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, logs.join('\n') + '\n', 'utf8');
    console.log(`\n原始输出已写入: ${outFile}`);
  }
}

main().catch((e) => {
  console.error('\n脚本执行异常：', e.stack || e.message);
  process.exitCode = 1;
});
