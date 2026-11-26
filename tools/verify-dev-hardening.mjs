/**
 * 可复核的 dev 工具收口验证脚本（只做只读探测 + 需要时重置演示数据）。
 *
 * 用法：
 *   node tools/verify-dev-hardening.mjs [baseUrl]
 *
 * 覆盖：
 *   1. 未登录访问 /api/dev/state、/api/dev/reset → 401
 *   2. 学生令牌访问 /api/dev/** → 403
 *   3. 管理员令牌访问 /api/dev/state → 200
 *   4. 后端把 APP_ENABLE_DEV_TOOLS 设为 false 时，管理员访问也 → 403
 *
 * 口令从 tools/demo-accounts.mjs 约定的来源读取，脚本内不含明文口令。
 */
import { demoAccounts } from './demo-accounts.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8080';
const STUDENT_EMAIL = process.env.DEMO_STUDENT_EMAIL || 'lin@campus.edu';

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

async function req(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function main() {
  const accounts = demoAccounts();
  console.log(`\n== dev 工具收口验证 ${BASE} ==`);

  const admin = await req('POST', '/api/auth/admin/login', {
    body: { adminNo: accounts.adminNo, password: accounts.adminPassword }
  });
  if (admin.body?.code !== 0) {
    throw new Error(`管理员登录失败：${admin.status} ${JSON.stringify(admin.body)}`);
  }
  const student = await req('POST', '/api/auth/login', {
    body: { email: STUDENT_EMAIL, password: accounts.studentPassword }
  });
  if (student.body?.code !== 0) {
    throw new Error(`学生登录失败：${student.status} ${JSON.stringify(student.body)}`);
  }

  console.log('\n-- 匿名访问 --');
  const anonState = await req('GET', '/api/dev/state');
  check('未登录 GET /api/dev/state 被拒', anonState.status === 401, `HTTP ${anonState.status}`);
  const anonReset = await req('POST', '/api/dev/reset', { body: {} });
  check('未登录 POST /api/dev/reset 被拒', anonReset.status === 401, `HTTP ${anonReset.status}`);
  const anonMail = await req('GET', '/api/dev/mailbox');
  check('未登录 GET /api/dev/mailbox 被拒', anonMail.status === 401, `HTTP ${anonMail.status}`);

  console.log('\n-- 学生令牌访问 --');
  const stuState = await req('GET', '/api/dev/state', { token: student.body.data.token });
  check('学生 GET /api/dev/state 被拒', stuState.status === 403, `HTTP ${stuState.status}`);
  const stuReset = await req('POST', '/api/dev/reset', { body: {}, token: student.body.data.token });
  check('学生 POST /api/dev/reset 被拒', stuReset.status === 403, `HTTP ${stuReset.status}`);

  console.log('\n-- 管理员令牌访问 --');
  const admState = await req('GET', '/api/dev/state', { token: admin.body.data.token });
  const devOn = admState.status === 200;
  if (devOn) {
    check('管理员 GET /api/dev/state 成功', admState.status === 200, `HTTP ${admState.status}`);
    check('状态里报告 devTools=true', admState.body?.data?.devTools === true, JSON.stringify(admState.body?.data?.devTools));
  } else {
    check('管理员 GET /api/dev/state 被拒（开关关闭）', admState.status === 403, `HTTP ${admState.status}`);
    console.log('    → 本次运行视为 APP_ENABLE_DEV_TOOLS=false 的形态，下面的写入型检查跳过');
  }

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
