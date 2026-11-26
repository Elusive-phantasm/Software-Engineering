/**
 * 前后端 API 契约测试。
 *
 * 用法：
 *   node tools/api-contract.mjs [backendUrl] [frontendUrl]
 *
 * 环境变量：
 *   API_BASE  后端地址，默认 http://127.0.0.1:8080
 *   WEB_BASE  前端地址；存在时额外验证 Vite 的 /api 与 /uploads 代理
 *
 * 测试会调用 /api/dev/reset 重置演示数据；结束后再重置一次。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const WEB = (process.argv[3] || process.env.WEB_BASE || '').replace(/\/$/, '');
const API_INDEX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/src/api/index.js');

// 1x1 JPEG; the server validates the data URL MIME before decoding.
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z';
const MAILBOX_LIMIT = 100;

let pass = 0;
const failures = [];
const runId = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const registeredEmail = `contract.${runId}@campus.edu`;
const newPassword = 'Contract@123';

function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
    console.log(`  [FAIL] ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function short(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

async function request(method, urlPath, { body, token, headers = {} } = {}) {
  const merged = { ...headers };
  if (body !== undefined) merged['Content-Type'] = 'application/json';
  if (token) merged.Authorization = `Bearer ${token}`;
  const response = await fetch(BASE + urlPath, {
    method,
    headers: merged,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, body: json, text };
}

async function api(method, urlPath, { body, token, expectStatus, expectCode = 0 } = {}) {
  const response = await request(method, urlPath, { body, token });
  if (expectStatus !== undefined) {
    assert(response.status === expectStatus,
      `${method} ${urlPath}: HTTP ${response.status}, expected ${expectStatus}: ${short(response.text)}`);
  }
  if (expectCode !== undefined) {
    assert(response.body && response.body.code === expectCode,
      `${method} ${urlPath}: code ${response.body?.code}, expected ${expectCode}: ${short(response.text)}`);
  }
  return response;
}

async function ok(method, urlPath, body, token) {
  const response = await api(method, urlPath, { body, token, expectStatus: 200, expectCode: 0 });
  return response.body.data;
}

async function expectFailure(method, urlPath, body, token, acceptedCodes, acceptedStatuses) {
  const response = await request(method, urlPath, { body, token });
  assert(response.body && response.body.code !== 0,
    `${method} ${urlPath}: expected rejection, got ${response.status} ${short(response.text)}`);
  assert(acceptedCodes.includes(response.body.code),
    `${method} ${urlPath}: unexpected code ${response.body.code}: ${short(response.text)}`);
  if (acceptedStatuses) {
    assert(acceptedStatuses.includes(response.status),
      `${method} ${urlPath}: unexpected HTTP ${response.status}: ${short(response.text)}`);
  }
  return response;
}

async function rawRequest(urlPath, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(BASE + urlPath, { headers });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let json;
  try {
    json = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, bytes, body: json };
}

function hasFields(value, fields, label) {
  const missing = fields.filter((field) => !(field in (value || {})));
  check(`${label}字段完整`, missing.length === 0, missing.length ? `缺少 ${missing.join(', ')}` : '');
}

async function login(email, password = 'Test@12345') {
  return ok('POST', '/api/auth/login', { email, password });
}

async function adminLogin() {
  return ok('POST', '/api/auth/admin/login', { adminNo: 'ADM-001', password: 'Admin@12345' });
}

function codeFromMailbox(items, email, subjectPart) {
  const mail = items.find((item) => item.to === email && (!subjectPart || item.subject.includes(subjectPart)));
  const match = mail?.text?.match(/\b\d{6}\b/);
  return match ? match[0] : null;
}

async function mailbox() {
  return (await ok('GET', `/api/dev/mailbox?limit=${MAILBOX_LIMIT}`)).items;
}

async function publish(token, adminToken, title, extra = {}) {
  const categories = await ok('GET', '/api/categories');
  const product = await ok('POST', '/api/products', {
    title,
    description: `${title}，接口契约测试用商品，描述完整。`,
    price: '35.00',
    condition: '九成新',
    categoryId: categories[2].id,
    images: [JPEG],
    ...extra
  }, token);
  await ok('POST', `/api/admin/products/${product.id}/approve`, {}, adminToken);
  return product;
}

function frontendApiCoverage() {
  const source = fs.readFileSync(API_INDEX, 'utf8');
  const calls = [...source.matchAll(/http\.(get|post|patch|delete)\(\s*[`'"]([^`'"]+)/g)];
  check('前端 API 定义可解析', calls.length >= 40, `仅识别 ${calls.length} 个调用`);

  const methods = calls.map((call) => `${call[1].toUpperCase()} ${call[2]}`);
  const required = [
    'GET /auth/me', 'POST /auth/login', 'POST /auth/register', 'PATCH /auth/me/profile',
    'GET /categories', 'GET /products', 'POST /products', 'PATCH /products/VALUE',
    'DELETE /products/VALUE', 'POST /orders', 'GET /orders/VALUE', 'DELETE /favorites/VALUE',
    'GET /messages/conversations', 'POST /messages/appeal', 'GET /notifications',
    'POST /notifications/VALUE/read', 'GET /verifications/mine',
    'GET /admin/dashboard', 'GET /admin/verifications', 'POST /admin/verifications/VALUE/approve',
    'GET /admin/products', 'GET /admin/students/VALUE', 'GET /admin/audit', 'GET /admin/meta'
  ];
  const normalized = methods.map((entry) => entry.replace(/\$\{[^}]+\}/g, 'VALUE'));
  const missing = required.filter((entry) => !normalized.includes(entry));
  check('前端关键 API 定义齐全', missing.length === 0, missing.join(', '));

  const axiosSource = fs.readFileSync(API_INDEX.replace('index.js', 'http.js'), 'utf8');
  check('Axios 成功响应返回完整信封', axiosSource.includes('return body;') && !axiosSource.includes('return body.data;'));
  check('Axios 只对 code=0 放行', axiosSource.includes('body.code === 0'));
}

async function proxyTests() {
  if (!WEB) {
    console.log('\n-- 前端代理 --\n  [SKIP] 未提供 WEB_BASE，跳过 Vite 代理检查');
    return;
  }
  const apiResponse = await fetch(`${WEB}/api/categories`);
  const apiBody = await apiResponse.json().catch(() => null);
  check('Vite /api 代理返回分类',
    apiResponse.ok && apiBody?.code === 0 && apiBody.data?.length === 8,
    `HTTP ${apiResponse.status} ${short(apiBody)}`);

  const uploadResponse = await fetch(`${WEB}/uploads/seed-1.svg`);
  const uploadText = await uploadResponse.text();
  check('Vite /uploads 代理返回商品图',
    uploadResponse.ok
      && (uploadResponse.headers.get('content-type') || '').includes('svg')
      && uploadText.includes('<svg'),
    `HTTP ${uploadResponse.status}`);
}

async function writeEvidence() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../evidence');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const file = path.join(dir, `S3-TASK-06-api-contract-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    at: new Date().toISOString(),
    base: BASE,
    web: WEB || null,
    passed: pass,
    failed: failures.length,
    failures
  }, null, 2), 'utf8');
  console.log(`\n证据：${file}`);
}

async function main() {
  console.log(`\n== API 契约测试 ==\n后端：${BASE}${WEB ? `\n前端：${WEB}` : ''}`);
  frontendApiCoverage();
  await api('POST', '/api/dev/reset', { body: {}, expectStatus: 200, expectCode: 0 });

  console.log('\n-- 认证与统一信封 --');
  const categories = await ok('GET', '/api/categories');
  check('分类接口返回 8 项', categories.length === 8, String(categories.length));
  check('分类含在售数量', categories.every((item) => typeof item.onSaleCount === 'number'));
  const guestMe = await ok('GET', '/api/auth/me');
  check('游客 me 返回 guest', guestMe.kind === 'guest');
  await api('GET', '/api/me/products', { expectStatus: 401, expectCode: 1001 });
  check('未登录受保护接口为 401/1001', true);

  const studentLogin = await login('lin@campus.edu');
  const adminAuth = await adminLogin();
  const lin = studentLogin.student;
  const linToken = studentLogin.token;
  const zhaoAuth = await login('zhao@campus.edu');
  const zhao = zhaoAuth.student;
  const zhaoToken = zhaoAuth.token;
  const adminToken = adminAuth.token;
  check('学生登录令牌为 64 位', typeof linToken === 'string' && linToken.length === 64);
  check('管理员登录返回管理员资料', adminAuth.admin.adminNo === 'ADM-001');
  const cookieResponse = await request('POST', '/api/auth/login', {
    body: { email: 'lin@campus.edu', password: 'Test@12345' }
  });
  check('登录响应包含 HttpOnly Cookie',
    (cookieResponse.headers.get('set-cookie') || '').includes('HttpOnly'));

  const me = await ok('GET', '/api/auth/me', undefined, linToken);
  check('当前学生资料身份正确', me.kind === 'student' && me.profile.nickname === '林同学');
  hasFields(me.profile, [
    'id', 'email', 'studentNo', 'nickname', 'realName', 'certStatus', 'accountStatus',
    'creditScore', 'reviewCount', 'verifiedDisputeCount', 'resubmitCount', 'registeredAt'
  ], '学生本人资料');
  await expectFailure('GET', '/api/admin/dashboard', undefined, linToken, [1003], [403]);
  check('学生访问管理端被拒', true);
  await expectFailure('POST', '/api/products', {
    title: 'x', description: 'x', price: '1.00', condition: '全新',
    categoryId: categories[0].id, images: [JPEG]
  }, adminToken, [1003], [403]);
  check('管理员不能调用学生发布接口', true);

  console.log('\n-- 注册、找回密码与会话 --');
  await ok('POST', '/api/auth/send-code', { email: registeredEmail });
  let mails = await mailbox();
  const registerCode = codeFromMailbox(mails, registeredEmail, '注册');
  check('开发邮箱可提取 6 位注册码', /^\d{6}$/.test(registerCode || ''), String(registerCode));
  await expectFailure('POST', '/api/auth/send-code', { email: registeredEmail }, undefined, [4001], [429]);
  check('同邮箱验证码 60 秒频控', true);
  await expectFailure('POST', '/api/auth/register', {
    email: `weak.${runId}@campus.edu`, code: '000000', nickname: '弱密码',
    realName: '测试', password: '12345678', agree: true
  }, undefined, [2001], [422]);
  check('注册强密码校验生效', true);
  await expectFailure('POST', '/api/auth/register', {
    email: registeredEmail, code: registerCode, nickname: '契约用户', realName: '契约测试',
    password: 'Contract@123', agree: false
  }, undefined, [2001], [422]);
  check('注册必须同意协议', true);
  await expectFailure('POST', '/api/auth/register', {
    email: registeredEmail, code: registerCode === '000000' ? '111111' : '000000', nickname: '契约用户',
    realName: '契约测试', password: 'Contract@123', agree: true
  }, undefined, [2001], [422]);
  check('错误验证码被拒', true);

  const registration = await ok('POST', '/api/auth/register', {
    email: registeredEmail,
    code: registerCode,
    nickname: '契约用户',
    realName: '契约测试',
    password: 'Contract@123',
    phone: '13800138000',
    agree: true
  });
  check('注册成功且不自动登录',
    registration.email === registeredEmail && registration.certStatus === '未提交');
  hasFields(registration, [
    'id', 'email', 'nickname', 'realName', 'phone', 'certStatus', 'accountStatus',
    'creditScore', 'reviewCount', 'verifiedDisputeCount', 'resubmitCount', 'registeredAt'
  ], '注册返回资料');
  const newUser = await login(registeredEmail, 'Contract@123');
  const newToken = newUser.token;
  const newId = newUser.student.id;
  check('新注册账号可登录', newUser.student.id === registration.id);

  await expectFailure('PATCH', '/api/auth/me/profile', { phone: '123' }, newToken, [2001], [422]);
  check('非法手机号被拒', true);
  const profile = await ok('PATCH', '/api/auth/me/profile', {
    nickname: '契约昵称', phone: '13900139000', dorm: '东区 1 栋 101'
  }, newToken);
  check('个人资料可更新', profile.nickname === '契约昵称' && profile.phone === '13900139000');
  const cleared = await ok('PATCH', '/api/auth/me/profile', { phone: '', dorm: '' }, newToken);
  check('手机号和宿舍可清空', cleared.phone === undefined && cleared.dorm === undefined);
  await expectFailure('PATCH', '/api/auth/me/profile', { realName: '新名字' }, linToken, [3001], [409]);
  check('已认证学生不可自行改真实姓名', true);

  const oldSession = linToken;
  await ok('POST', '/api/auth/logout', {}, oldSession);
  const afterLogout = await request('GET', '/api/me/products', { token: oldSession });
  check('登出后旧令牌失效', afterLogout.status === 401 && afterLogout.body?.code === 1001);
  const guestAfterLogout = await ok('GET', '/api/auth/me', undefined, oldSession);
  check('登出后的 me 返回 guest', guestAfterLogout.kind === 'guest');

  const linToken2 = (await login('lin@campus.edu')).token;
  const resetSession = (await login('guo@campus.edu')).token;
  await ok('POST', '/api/auth/forgot/send-code', { email: 'guo@campus.edu' });
  mails = await mailbox();
  const resetCode = codeFromMailbox(mails, 'guo@campus.edu', '找回密码');
  check('开发邮箱可提取找回密码验证码', /^\d{6}$/.test(resetCode || ''), String(resetCode));
  await expectFailure('POST', '/api/auth/forgot/reset', {
    email: 'guo@campus.edu', code: resetCode, newPassword: 'Test@12345'
  }, undefined, [2001], [422]);
  check('重置密码拒绝新旧相同', true);
  await ok('POST', '/api/auth/forgot/reset', {
    email: 'guo@campus.edu', code: resetCode, newPassword
  });
  const resetOld = await request('POST', '/api/auth/login', {
    body: { email: 'guo@campus.edu', password: 'Test@12345' }
  });
  check('找回密码后旧密码不可登录', resetOld.status === 401 && resetOld.body.code === 1001);
  check('找回密码后新密码可登录', !!(await login('guo@campus.edu', newPassword)).token);
  const resetSessionAfter = await request('GET', '/api/me/products', { token: resetSession });
  check('找回密码使既有会话失效', resetSessionAfter.status === 401 && resetSessionAfter.body?.code === 1001);
  await ok('POST', '/api/auth/forgot/send-code', { email: `missing.${runId}@campus.edu` });
  check('不存在邮箱找回接口不暴露差异', true);
  await expectFailure('POST', '/api/auth/admin/change-password', {
    oldPassword: 'wrong', newPassword: 'Admin@12345'
  }, adminToken, [2001], [422]);
  check('管理员改密错误原密码被拒', true);

  console.log('\n-- 核验与图片保护 --');
  await expectFailure('POST', '/api/verifications', {
    declaredNo: 'abc', cardImage: JPEG
  }, newToken, [2001], [422]);
  check('核验学号格式校验', true);
  const cert = await ok('POST', '/api/verifications', {
    declaredNo: '20269999', cardImage: JPEG
  }, newToken);
  check('提交核验后进入待审核', cert.certStatus === '待审核' && cert.canSubmit === false);
  hasFields(cert, ['certStatus', 'resubmitCount', 'resubmitLimit', 'canSubmit', 'latest'], '核验状态');
  hasFields(cert.latest, ['id', 'declaredNo', 'reviewStatus', 'forgeryFlag', 'submittedAt'], '核验申请');
  const mineCert = await ok('GET', '/api/verifications/mine', undefined, newToken);
  check('我的核验状态与提交一致',
    mineCert.latest?.id === cert.latest.id && mineCert.latest.declaredNo === '20269999');
  await expectFailure('POST', '/api/verifications', {
    declaredNo: '20269999', cardImage: JPEG
  }, newToken, [3001], [409]);
  check('审核中的核验不可重复提交', true);

  const certQueue = await ok('GET', `/api/admin/verifications?status=${encodeURIComponent('待审核')}`, undefined, adminToken);
  const submittedCert = certQueue.find((item) => item.id === cert.latest.id);
  check('管理端核验队列含新申请', !!submittedCert && submittedCert.studentId === newId);
  hasFields(submittedCert, [
    'id', 'studentId', 'nickname', 'realName', 'email', 'declaredNo',
    'reviewStatus', 'forgeryFlag', 'submittedAt'
  ], '核验队列');

  const image = await rawRequest(`/api/admin/verifications/${cert.latest.id}/image`, adminToken);
  check('管理员可读取学生证图片',
    image.status === 200 && /^image\//.test(image.headers.get('content-type') || '')
      && image.headers.get('cache-control') === 'no-store' && image.bytes.length > 0,
    `HTTP ${image.status}, ${image.headers.get('content-type')}, ${image.bytes.length}`);
  const studentImage = await rawRequest(`/api/admin/verifications/${cert.latest.id}/image`, newToken);
  check('学生不可读取学生证图片',
    studentImage.status === 403 && studentImage.body?.code === 1003,
    `HTTP ${studentImage.status}, ${short(studentImage.body)}`);
  const guestImage = await rawRequest(`/api/admin/verifications/${cert.latest.id}/image`);
  check('游客不可读取学生证图片',
    guestImage.status === 401 && guestImage.body?.code === 1001,
    `HTTP ${guestImage.status}, ${short(guestImage.body)}`);
  await ok('POST', `/api/admin/verifications/${cert.latest.id}/approve`, {}, adminToken);
  const approvedCert = await ok('GET', '/api/verifications/mine', undefined, newToken);
  check('核验通过后状态与学号绑定',
    approvedCert.certStatus === '已认证'
      && approvedCert.studentNo === '20269999'
      && approvedCert.latest.reviewStatus === '已通过');

  console.log('\n-- 商品、搜索与生命周期 --');
  const p1 = await publish(linToken2, adminToken, `契约测试商品 ${runId} A`, {
    price: '19.90', condition: '九成新'
  });
  const p2 = await publish(linToken2, adminToken, `契约测试商品 ${runId} B`, {
    price: '29.50', condition: '七成新'
  });
  check('审核通过后商品回到在售',
    (await ok('GET', `/api/products/${p1.id}`, undefined, linToken2)).status === '在售'
      && (await ok('GET', `/api/products/${p2.id}`, undefined, linToken2)).status === '在售');
  hasFields(p1, [
    'id', 'title', 'description', 'price', 'priceCents', 'condition', 'status', 'categoryId',
    'categoryName', 'seller', 'images', 'publishedAt', 'owner'
  ], '商品视图');
  const keywordList = await ok('GET', `/api/products?keyword=${encodeURIComponent(runId)}&sort=priceAsc&page=1&pageSize=1`);
  check('搜索关键词并分页', keywordList.total >= 2 && keywordList.items.length === 1);
  check('价格升序', keywordList.items[0].priceCents === p1.priceCents);
  check('搜索只返回在售商品', keywordList.items.every((item) => item.status === '在售'));
  const categoryList = await ok('GET', `/api/products?categoryId=${p1.categoryId}&pageSize=60`);
  check('分类筛选生效', categoryList.items.every((item) => item.categoryId === p1.categoryId));
  const priceList = await ok('GET', '/api/products?minPrice=20&maxPrice=30&pageSize=60');
  check('价格区间筛选生效',
    priceList.items.every((item) => item.priceCents >= 2000 && item.priceCents <= 3000));
  const hotList = await ok('GET', '/api/products?sort=hot&pageSize=60');
  check('热度排序返回商品', hotList.items.length >= 1);
  const cappedList = await ok('GET', '/api/products?pageSize=999');
  check('分页大小限制为 60', cappedList.pageSize === 60);

  const myProducts = await ok('GET', '/api/me/products', undefined, linToken2);
  check('我的商品四状态分组齐全',
    ['待审核', '在售', '已售出', '已下架'].every((status) => Array.isArray(myProducts.groups[status])));
  check('我的商品含本轮商品', myProducts.groups['在售'].some((item) => item.id === p1.id));

  const resubmitTarget = await ok('POST', '/api/products', {
    title: `契约测试重提 ${runId}`,
    description: '接口契约测试：撤回后重新提交。',
    price: '11.00',
    condition: '九成新',
    categoryId: p1.categoryId,
    images: [JPEG]
  }, linToken2);
  const withdrawn = await ok('POST', `/api/products/${resubmitTarget.id}/withdraw`, {}, linToken2);
  check('待审核商品可撤回', withdrawn.status === '已下架' && withdrawn.offShelfReason === '卖家撤回');
  const resubmitted = await ok('POST', `/api/products/${resubmitTarget.id}/resubmit`, {}, linToken2);
  check('卖家撤回后重提回到待审核', resubmitted.status === '待审核');
  await ok('POST', `/api/products/${resubmitTarget.id}/withdraw`, {}, linToken2);
  await ok('DELETE', `/api/products/${resubmitTarget.id}`, undefined, linToken2);
  await api('GET', `/api/products/${resubmitTarget.id}`, { expectStatus: 404, expectCode: 3002 });
  check('删除后商品不存在', true);
  await expectFailure('DELETE', `/api/products/${p2.id}`, undefined, linToken2, [3001], [409]);
  check('在售商品不可直接删除', true);

  const adminQueue = await ok('GET',
    `/api/admin/products?status=${encodeURIComponent('在售')}&keyword=${encodeURIComponent(runId)}`,
    undefined, adminToken);
  check('管理端商品筛选生效', adminQueue.some((item) => item.id === p1.id));
  const forbidden = await ok('GET', '/api/admin/products/forbidden-categories', undefined, adminToken);
  check('禁售类目为 18 项', Object.keys(forbidden).length === 18);
  check('禁售类目保留 A1-E2', ['A1', 'A7', 'B4', 'C3', 'D2', 'E2'].every((code) => forbidden[code]));
  check('A1 为武器与管制器具', forbidden.A1 === '武器与管制器具');

  console.log('\n-- 收藏、交易与评价 --');
  await ok('POST', '/api/favorites', { productId: p1.id }, zhaoToken);
  const favorites = await ok('GET', '/api/me/favorites', undefined, zhaoToken);
  check('收藏出现在我的收藏', favorites.some((item) => item.productId === p1.id));
  await ok('DELETE', `/api/favorites/${p1.id}`, undefined, zhaoToken);
  const favoritesAfter = await ok('GET', '/api/me/favorites', undefined, zhaoToken);
  check('取消收藏后不再出现', !favoritesAfter.some((item) => item.productId === p1.id));

  const order = await ok('POST', '/api/orders', { productId: p1.id }, zhaoToken);
  check('下单即成交', order.status === '有效' && order.amount === '19.90');
  const soldProduct = await ok('GET', `/api/products/${p1.id}`, undefined, linToken2);
  check('成交后商品转已售出', soldProduct.status === '已售出');
  const orderDetail = await ok('GET', `/api/orders/${order.id}`, undefined, zhaoToken);
  check('订单详情返回双方角色与评价状态',
    orderDetail.myRole === 'buyer' && orderDetail.myReviewed === false && orderDetail.peerReviewed === false);
  hasFields(orderDetail, [
    'id', 'productId', 'productTitle', 'productStatus', 'amount', 'status', 'createdAt',
    'buyerId', 'sellerId', 'buyer', 'seller', 'myRole', 'peerId', 'peerNickname',
    'canReview', 'canCancel', 'canJudge', 'myReviewed', 'peerReviewed'
  ], '订单详情');
  const adminOrder = await ok('GET', `/api/orders/${order.id}`, undefined, adminToken);
  check('管理员可查看订单详情', adminOrder.myRole === 'admin');
  const outsider = await login('low@campus.edu');
  await expectFailure('GET', `/api/orders/${order.id}`, undefined, outsider.token, [1003], [403]);
  check('第三方不可查看订单', true);

  const zhaoCreditBefore = (await ok('GET', '/api/me/credit', undefined, zhaoToken)).score;
  await ok('POST', `/api/orders/${order.id}/reviews`,
    { content: '契约测试：交易顺利，卖家可靠。' }, zhaoToken);
  const linCreditBefore = (await ok('GET', '/api/me/credit', undefined, linToken2)).score;
  await ok('POST', `/api/orders/${order.id}/reviews`,
    { content: '契约测试：买家沟通顺畅。' }, linToken2);
  const zhaoCreditAfter = (await ok('GET', '/api/me/credit', undefined, zhaoToken)).score;
  const linCreditAfter = (await ok('GET', '/api/me/credit', undefined, linToken2)).score;
  check('双方评价各 +2 分',
    zhaoCreditAfter === zhaoCreditBefore + 2 && linCreditAfter === linCreditBefore + 2);

  const written = await ok('GET', '/api/me/reviews/written', undefined, zhaoToken);
  const received = await ok('GET', '/api/me/reviews/received', undefined, zhaoToken);
  check('我发出的评价可查询',
    written.some((item) => item.orderId === order.id && item.targetId === lin.id));
  check('我收到的评价可查询',
    received.some((item) => item.orderId === order.id && item.reviewerId === lin.id));
  hasFields(written[0], [
    'id', 'orderId', 'reviewerId', 'reviewerNickname', 'targetId', 'content', 'createdAt'
  ], '评价视图');

  const reviewId = written.find((item) => item.orderId === order.id).id;
  await ok('POST', `/api/admin/reviews/${reviewId}/delete`,
    { reason: '契约测试删除评价' }, adminToken);
  const writtenAfterDelete = await ok('GET', '/api/me/reviews/written', undefined, zhaoToken);
  check('删除后发出的评价不再返回', !writtenAfterDelete.some((item) => item.id === reviewId));
  await expectFailure('POST', `/api/admin/reviews/${reviewId}/delete`,
    { reason: '重复删除' }, adminToken, [3001], [409]);
  check('重复删除评价被拒', true);

  console.log('\n-- 举报、异议与通知 --');
  const reportTarget = await publish(linToken2, adminToken,
    `契约测试举报 ${runId}`, { price: '66.00' });
  const report = await ok('POST', '/api/reports', {
    targetType: '商品', targetId: reportTarget.id, type: '虚假描述',
    reason: '契约测试：商品描述与实物不符。'
  }, zhaoToken);
  check('商品举报提交成功', report.handleStatus === '待处理');
  const myReports = await ok('GET', '/api/me/reports', undefined, zhaoToken);
  check('我的举报可查询', myReports.some((item) => item.id === report.id));
  await expectFailure('POST', '/api/reports', {
    targetType: '商品', targetId: reportTarget.id, type: '虚假描述', reason: '再次举报'
  }, zhaoToken, [3001], [409]);
  check('同一对象不可重复举报', true);
  await expectFailure('POST', '/api/reports', {
    targetType: '学生', targetId: zhao.id, type: '其他', reason: '举报自己'
  }, zhaoToken, [3001], [409]);
  check('不能举报自己', true);

  const handled = await ok('POST', `/api/admin/reports/${report.id}/handle`, {
    upheld: true,
    actions: ['强制下架商品', '扣信用分'],
    result: '契约测试：核实成立',
    categoryCode: 'C3'
  }, adminToken);
  check('举报处理成立', handled.handleStatus === '已处理' && handled.violationCodes === 'C3');
  const forcedProduct = await ok('GET', `/api/products/${reportTarget.id}`, undefined, linToken2);
  check('举报成立强制下架商品',
    forcedProduct.status === '已下架' && forcedProduct.offShelfReason === '管理员违规下架');
  const forcedList = await ok('GET', '/api/admin/forced-off-products', undefined, adminToken);
  check('强制下架清单包含商品', forcedList.some((item) => item.id === reportTarget.id));

  const noticeList = await ok('GET', '/api/notifications', undefined, linToken2);
  const notice = noticeList.items.find((item) => !item.read);
  check('存在未读通知', !!notice);
  if (notice) {
    const badgeBefore = await ok('GET', '/api/badge', undefined, linToken2);
    await ok('POST', `/api/notifications/${notice.id}/read`, {}, linToken2);
    const badgeAfter = await ok('GET', '/api/badge', undefined, linToken2);
    check('单条通知已读使红点下降 1',
      badgeAfter.notificationUnread === badgeBefore.notificationUnread - 1);
  }
  await expectFailure('POST', `/api/notifications/${notice?.id || 1}/read`,
    {}, zhaoToken, [1003], [403]);
  check('不可标记他人通知为已读', true);
  await ok('POST', '/api/notifications/read-all', {}, linToken2);
  const badgeReadAll = await ok('GET', '/api/badge', undefined, linToken2);
  check('全部已读后通知红点归零', badgeReadAll.notificationUnread === 0);

  await ok('POST', '/api/messages/appeal', {
    productId: reportTarget.id, content: '契约测试：认为强制下架有误，请复核。'
  }, linToken2);
  const adminConversations = await ok('GET', '/api/messages/conversations', undefined, adminToken);
  const appealConversation = adminConversations.find(
    (item) => item.productId === reportTarget.id && item.peerId === lin.id);
  check('管理员可见处置异议会话', !!appealConversation);
  const unreadCount = await ok('GET', '/api/messages/unread-count', undefined, adminToken);
  check('未读私信接口返回数字', typeof unreadCount.unread === 'number');
  await ok('POST', '/api/admin/messages/reply', {
    productId: reportTarget.id,
    toId: lin.id,
    content: '契约测试：已收到异议，正在复核。'
  }, adminToken);
  const sellerAppealConversation = await ok('GET',
    `/api/messages/conversations/${reportTarget.id}/${adminAuth.admin.id}`,
    undefined, linToken2);
  check('卖家会话出现管理员回复',
    sellerAppealConversation.messages.some(
      (item) => item.senderType === 'admin' && item.content.includes('正在复核')));
  await expectFailure('POST', '/api/admin/messages/reply', {
    productId: p2.id, toId: lin.id, content: '不应允许主动发起'
  }, adminToken, [1003], [403]);
  check('管理员不得主动发起私信', true);

  console.log('\n-- 管理端治理与开发工具 --');
  const dashboard = await ok('GET', '/api/admin/dashboard', undefined, adminToken);
  hasFields(dashboard, ['students', 'products', 'orders'], '管理看板');
  hasFields(dashboard.students, ['total', 'certified', 'pendingCert', 'banned', 'restricted'],
    '看板学生统计');
  hasFields(dashboard.products, ['待审核', '在售', '已售出', '已下架'], '看板商品统计');
  hasFields(dashboard.orders, ['valid', 'cancelled'], '看板订单统计');

  const studentList = await ok('GET',
    `/api/admin/students?keyword=${encodeURIComponent('契约昵称')}`, undefined, adminToken);
  check('管理端学生搜索生效', studentList.some((item) => item.id === newId));
  hasFields(studentList[0], [
    'id', 'nickname', 'email', 'studentNo', 'certStatus', 'accountStatus', 'creditScore',
    'reviewCount', 'verifiedDisputeCount', 'resubmitCount', 'registeredAt'
  ], '学生列表');
  const studentDetail = await ok('GET', `/api/admin/students/${newId}`, undefined, adminToken);
  hasFields(studentDetail,
    ['phone', 'dorm', 'realName', 'failedLoginCount', 'credit', 'products'], '学生详情');
  const creditDetail = await ok('GET', `/api/admin/students/${newId}/credit`, undefined, adminToken);
  hasFields(creditDetail, ['score', 'min', 'max', 'canPublish', 'canOrder', 'records'],
    '管理员信用视图');
  await expectFailure('GET', `/api/admin/students/${newId}/credit`, undefined,
    linToken2, [1003], [403]);
  check('学生不可访问管理员信用接口', true);

  await expectFailure('POST', `/api/admin/students/${newId}/credit`, {
    delta: 5, reason: '非法幅度'
  }, adminToken, [2001], [422]);
  check('信用分非法幅度被拒', true);
  const creditBefore = (await ok('GET',
    `/api/admin/students/${newId}/credit`, undefined, adminToken)).score;
  const creditAdjusted = await ok('POST', `/api/admin/students/${newId}/credit`, {
    delta: 2, reason: '契约测试人工补分'
  }, adminToken);
  check('信用分人工调整生效',
    creditAdjusted.applied === 2 && creditAdjusted.score === creditBefore + 2);

  for (const [action, label] of [
    ['auth.login', '登录审计'],
    ['student.readSensitive', '敏感信息读取审计'],
    ['product.forceOff', '强制下架审计'],
    ['student.adjustCredit', '信用调整审计']
  ]) {
    const logs = await ok('GET',
      `/api/admin/audit?limit=500&action=${encodeURIComponent(action)}`, undefined, adminToken);
    check(`${label}存在`, logs.some((item) => item.action === action));
    if (logs.length) {
      hasFields(logs[0], [
        'id', 'actorType', 'role', 'action', 'targetType', 'targetId', 'result', 'createdAt'
      ], `${label}字段`);
    }
  }

  const meta = await ok('GET', '/api/admin/meta', undefined, adminToken);
  check('管理元数据处置手段 5 项', meta.actions.length === 5);
  check('管理元数据举报类型 6 项', meta.reportTypes.length === 6);
  check('管理元数据区分举报对象',
    meta.reportTypesByTarget['商品']?.length === 5
      && meta.reportTypesByTarget['学生']?.length === 2);
  check('管理元数据禁售类目 18 项', Object.keys(meta.forbiddenCategories).length === 18);
  check('管理元数据撤销/下架/成色闭集',
    meta.cancelReasons.length === 5
      && meta.offShelfReasons.length === 5
      && meta.conditions.length === 4);

  const state = await ok('GET', '/api/dev/state');
  hasFields(state, ['now', 'offsetHours', 'counts', 'devTools'], '开发状态');
  check('开发状态统计表齐全',
    ['students', 'products', 'orders', 'reviews', 'reports', 'messages',
      'notifications', 'credit_records', 'audit_logs']
      .every((key) => typeof state.counts[key] === 'number'));
  check('开发工具已开启', state.devTools === true);
  const shifted = await ok('POST', '/api/dev/time-shift', { hours: 0.02 });
  check('时间偏移接口生效', Math.abs(shifted.offsetHours - 0.02) < 0.0001);
  const resetTime = await ok('POST', '/api/dev/time-reset', {});
  check('时间可归零', resetTime.offsetHours === 0);

  console.log('\n-- 收尾治理 --');
  await ok('POST', `/api/admin/verifications/students/${newId}/revoke`, {
    reason: '契约测试收尾：撤销认证', deductCredit: true
  }, adminToken);
  const revoked = await ok('GET', `/api/admin/students/${newId}`, undefined, adminToken);
  check('撤销认证后认证失败且账号封禁',
    revoked.certStatus === '已驳回' && revoked.accountStatus === '封禁');
  check('撤销认证可按要求扣信用分', revoked.creditScore <= creditAdjusted.score - 10);

  await proxyTests();
  await api('POST', '/api/dev/reset', { body: {}, expectStatus: 200, expectCode: 0 });
  await writeEvidence();
  console.log(`\n结果：通过 ${pass} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  [FAIL] ${failure}`));
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(`\n执行失败：${error.stack || error.message}`);
  failures.push(`执行异常：${error.message}`);
  try {
    await api('POST', '/api/dev/reset', { body: {}, expectStatus: 200, expectCode: 0 });
  } catch {
    // Preserve the original failure; reset is best-effort.
  }
  try {
    await writeEvidence();
  } catch {
    // Do not hide the contract failure because an evidence write failed.
  }
  process.exitCode = 1;
});
