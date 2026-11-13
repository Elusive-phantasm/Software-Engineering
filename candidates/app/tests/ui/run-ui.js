/**
 * 前端渲染级验收测试（Node + jsdom 真实执行 student.js / admin.js）。
 *
 * 为什么要它：此前所有测试只打 HTTP 接口，前端从未被真正执行，
 * 结果一个 page() 只接收单个 children 的签名错误，把首页搜索栏、商品网格、
 * 各类列表全部丢掉，页面只剩标题区（看起来"空白"），而接口测试全绿。
 *
 * 运行：npm run test:ui（需先启动服务；未安装 jsdom 时自动跳过，不算失败）
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.PLATFORM_BASE || 'http://127.0.0.1:3081';
const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('跳过前端渲染测试：未安装 jsdom（npm install 后会随依赖一起装好）');
  process.exit(0);
}

/* ------------------------------------------------------------------ 工具 */
const pass = [];
const fail = [];
const ok = (cond, msg) => {
  (cond ? pass : fail).push(msg);
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
};

const realFetch = globalThis.fetch.bind(globalThis);
let jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function shimFetch(input, init = {}) {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : String(input);
  const headers = { ...(init.headers || {}) };
  if (jar.size) headers.Cookie = cookieHeader();
  const res = await realFetch(url, { ...init, headers, redirect: 'manual' });
  for (const line of res.headers.getSetCookie?.() || []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return res;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jsErrors = [];

function makeDom(url, tag) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url,
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.scrollTo = () => {};
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.history = window.history;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.fetch = shimFetch;
  globalThis.Image = window.Image;
  globalThis.FileReader = window.FileReader;
  try {
    Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  } catch {
    /* ignore */
  }
  window.addEventListener('error', (e) => jsErrors.push(`[${tag}] ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => jsErrors.push(`[${tag}] ${e.reason?.message || e.reason}`));
  return dom;
}

async function go(dom, hash) {
  dom.window.location.hash = hash;
  await sleep(800);
}

async function apiLogin(method, path2, body) {
  return shimFetch(path2, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/* ================================================================ 学生端 */
console.log('=== 学生端渲染检查 ===');
jar = new Map();
// 先重置演示数据，保证断言基线稳定（与其它套件一致，互不污染）
const reset = await shimFetch('/api/dev/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
ok(reset.status === 200, '前置：演示数据已重置');
jar = new Map();

const stu = makeDom(`${BASE}/`, 'student');
const loginRes = await apiLogin('POST', '/api/auth/login', { email: 'lin@campus.edu', password: 'Test@12345' });
ok(loginRes.status === 200, '前置：登录接口可用');

await import(pathToFileURL(path.join(ROOT, 'public/assets/student.js')).href + `?t=${Date.now()}`);
await sleep(1400);

const doc = stu.window.document;
const q = (sel) => doc.querySelectorAll(sel).length;
const txt = () => (doc.body.textContent || '').replace(/\s+/g, '');

ok(!!doc.querySelector('.topbar'), '顶栏渲染');
ok(q('.pcard') >= 5, `首页渲染商品卡片 ${q('.pcard')} 张（应 ≥5）`);
ok(q('.chip') >= 8, `首页渲染分类胶囊 ${q('.chip')} 个`);
ok(txt().includes('在售'), '首页出现「在售」统计文案');

await go(stu, '#/p/PRD-001');
ok(q('.detail') === 1, '商品详情页渲染 detail 区块');
ok(txt().includes('立即购买') || txt().includes('联系卖家') || txt().includes('编辑'), '详情页渲染操作按钮');

await go(stu, '#/me');
ok(txt().includes('信用分'), '我的页渲染统计');
ok(q('.menu-item') >= 6, `我的页渲染功能入口 ${q('.menu-item')} 个`);

await go(stu, '#/me/products');
ok(txt().includes('待审核') && txt().includes('在售'), '我的商品页渲染四状态分组');

await go(stu, '#/me/orders');
ok(txt().includes('成交记录') || txt().includes('ORD-'), '我的订单页渲染成交记录');

await go(stu, '#/me/credit');
ok(q('table') >= 1 || txt().includes('评分规则'), '信用分页渲染规则或流水');

await go(stu, '#/notifications');
ok(txt().includes('消息通知'), '通知页渲染');
ok(q('.list-item') >= 1, `通知页渲染 ${q('.list-item')} 条通知`);

await go(stu, '#/messages');
ok(txt().includes('我的私信'), '私信页渲染');

await go(stu, '#/publish');
ok(q('.field') >= 5, `发布页渲染 ${q('.field')} 个表单项`);

await go(stu, '#/verify');
ok(txt().includes('学生证核验'), '核验页渲染');

await go(stu, '#/u/STU-LIN');
ok(txt().includes('在售商品'), '个人主页渲染在售商品区块');

/* ================================================================ 管理端 */
console.log('\n=== 管理端渲染检查 ===');
jar = new Map();
const adm = makeDom(`${BASE}/admin`, 'admin');
const admLogin = await apiLogin('POST', '/api/admin/auth/login', { adminId: 'ADM-001', password: 'Admin@12345' });
ok(admLogin.status === 200, '前置：管理员登录接口可用');

await import(pathToFileURL(path.join(ROOT, 'public/assets/admin.js')).href + `?t=${Date.now()}`);
await sleep(1400);

const adoc = adm.window.document;
const aq = (sel) => adoc.querySelectorAll(sel).length;
const atxt = () => (adoc.body.textContent || '').replace(/\s+/g, '');

ok(!!adoc.querySelector('.sidebar'), '后台侧边栏渲染');
ok(aq('.kpi') >= 8, `看板渲染 ${aq('.kpi')} 个 KPI`);
ok(aq('.side-link') >= 9, `侧边栏渲染 ${aq('.side-link')} 个入口`);

await go(adm, '#/certifications');
ok(atxt().includes('学生证审核'), '学生证审核页渲染');
await go(adm, '#/products');
ok(atxt().includes('禁售品类清单') || atxt().includes('商品审核'), '商品审核页渲染');
await go(adm, '#/reports');
ok(atxt().includes('举报'), '举报处置页渲染');
await go(adm, '#/students');
ok(aq('table') >= 1, '学生与账号页渲染表格');
await go(adm, '#/orders');
ok(aq('table') >= 1, '成交记录页渲染表格');
await go(adm, '#/audit');
ok(aq('table') >= 1, '审计日志页渲染表格');

/* ================================================================ 汇总 */
if (jsErrors.length) {
  console.log('\n前端运行时错误：');
  for (const e of jsErrors) console.log('  ✗ ' + e);
}
console.log(`\n${'='.repeat(60)}`);
console.log(`通过 ${pass.length} 项，失败 ${fail.length + jsErrors.length} 项`);
if (fail.length) console.log('失败项：\n  ' + fail.join('\n  '));
process.exit(fail.length === 0 && jsErrors.length === 0 ? 0 : 1);
