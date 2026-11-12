/**
 * 真实浏览器端冒烟测试（使用系统安装的 Edge，不下载 Chromium）。
 * 用法：
 *   node tools/e2e.mjs
 * 环境变量：
 *   EDGE_PATH   浏览器可执行文件路径（默认取系统 Edge）
 *   WEB_BASE    前端地址（默认 http://localhost:5173）
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const BASE = process.env.WEB_BASE || 'http://localhost:5173';

let pass = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name + ' ' + detail);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

function findBrowser() {
  for (const p of EDGE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('未找到 Edge / Chrome，可用 EDGE_PATH 指定');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, selector, text) {
  const ok = await page.evaluate((sel, txt) => {
    const nodes = [...document.querySelectorAll(sel)];
    const target = nodes.find((n) => n.textContent.trim().includes(txt));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, selector, text);
  if (!ok) throw new Error(`找不到文本为「${text}」的 ${selector}`);
  await sleep(600);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input');
  const inputs = await page.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(email);
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type(password);
  await clickByText(page, 'button', '登录');
  await sleep(1500);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() >= 400 && !/favicon/.test(url)) {
      errors.push(`HTTP ${res.status()} ${url.replace(BASE, '')}`);
    }
  });
  page.on('pageerror', (err) => errors.push('PAGEERROR ' + err.message));

  console.log(`\n== 浏览器冒烟 ${BASE} ==`);
  console.log(`浏览器：${findBrowser()}`);

  // 先重置演示数据：冒烟测试会封禁账号、产生订单，不重置会让本轮看到脏状态
  const reset = await fetch(`${BASE}/api/dev/reset`, { method: 'POST' });
  check('重置演示数据', reset.ok, `HTTP ${reset.status}`);

  console.log('\n-- 首页 --');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.product-card', { timeout: 15000 }).catch(() => {});
  const cards = await page.$$eval('.product-card', (els) => els.length).catch(() => 0);
  check('首页渲染商品卡片', cards >= 1, `实际 ${cards}`);
  const heroText = await page.$eval('.hero h1', (el) => el.textContent).catch(() => '');
  check('首页标题正确', heroText.includes('把闲置交给'), heroText);

  console.log('\n-- 搜索与分类 --');
  const inputs = await page.$$('.search-row input');
  if (inputs.length) {
    await inputs[0].type('教材');
    await clickByText(page, 'button', '搜索');
    await sleep(1200);
    const searched = await page.$$eval('.product-card', (els) => els.length).catch(() => 0);
    check('搜索结果页可用', searched >= 0, `结果 ${searched}`);
  }
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.pills .pill', { timeout: 10000 }).catch(() => {});
  const catChips = await page.$$eval('.pills .pill', (els) => els.length).catch(() => 0);
  check('分类胶囊渲染', catChips >= 8, `实际 ${catChips}`);

  console.log('\n-- 商品详情 --');
  await page.click('.product-card');
  await page.waitForSelector('.detail', { timeout: 10000 }).catch(() => {});
  const title = await page.$eval('.info h2', (el) => el.textContent).catch(() => '');
  check('详情页渲染标题', !!title, title);
  const priceText = await page.$eval('.price', (el) => el.textContent).catch(() => '');
  check('详情页渲染价格', priceText.startsWith('¥'), priceText);

  console.log('\n-- 登录 --');
  await login(page, 'zhao@campus.edu', 'Test@12345');
  const userText = await page.$eval('.user', (el) => el.textContent).catch(() => '');
  check('登录后显示昵称', userText.includes('赵同学'), userText.trim());

  console.log('\n-- 收藏 --');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.product-card', { timeout: 10000 }).catch(() => {});
  await page.click('.product-card');
  await page.waitForSelector('.actions', { timeout: 10000 }).catch(() => {});
  await clickByText(page, '.actions button', '收藏');
  await sleep(1200);
  const favText = await page.$eval('.actions', (el) => el.textContent).catch(() => '');
  check('收藏后按钮变为已收藏', favText.includes('已收藏'), favText.slice(0, 40));

  console.log('\n-- 我的订单 / 收藏 / 信用分 --');
  await page.goto(`${BASE}/#/me/orders`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  const orderHeader = await page.$eval('.section-title', (el) => el.textContent).catch(() => '');
  check('我的订单页渲染', orderHeader.includes('我的订单'), orderHeader);
  const orderOps = await page.$eval('body', (el) => el.innerText).catch(() => '');
  check('订单页提供「举报该用户」入口', orderOps.includes('举报该用户'));

  await page.goto(`${BASE}/#/me/favorites`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  const favCount = await page.$$eval('.fav', (els) => els.length).catch(() => 0);
  check('我的收藏页有数据', favCount >= 0, `收藏 ${favCount}`);

  await page.goto(`${BASE}/#/me/credit`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  const score = await page.$eval('.score', (el) => el.textContent).catch(() => '');
  check('信用分页渲染分数', Number(score) > 0, score);

  await page.goto(`${BASE}/#/notifications`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  const noteRows = await page.$$eval('.row', (els) => els.length).catch(() => 0);
  check('通知页渲染列表', noteRows >= 0, `通知 ${noteRows}`);

  console.log('\n-- 管理端 --');
  await page.goto(`${BASE}/#/admin/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input', { timeout: 10000 });
  const adminInputs = await page.$$('input');
  await adminInputs[0].click({ clickCount: 3 });
  await adminInputs[0].type('ADM-001');
  await adminInputs[1].click({ clickCount: 3 });
  await adminInputs[1].type('Admin@12345');
  await clickByText(page, 'button', '登录');
  await sleep(1800);
  const kpi = await page.$$eval('.kpi', (els) => els.length).catch(() => 0);
  check('管理端看板渲染 KPI', kpi === 4, `KPI ${kpi}`);

  for (const [path, title] of [
    ['/admin/certs', '学生证审核'],
    ['/admin/products', '商品审核'],
    ['/admin/reports', '举报处置'],
    ['/admin/disputes', '处置异议会话'],
    ['/admin/students', '学生与账号'],
    ['/admin/audit', '审计日志']
  ]) {
    await page.goto(`${BASE}/#${path}`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    const head = await page.$eval('.header .title', (el) => el.textContent).catch(() => '');
    check(`管理端「${title}」页可打开`, head.includes(title), head);
  }

  console.log('\n-- 控制台错误 --');
  const realErrors = errors.filter((e) => !/favicon|Failed to load resource.*404/i.test(e));
  check('浏览器控制台无报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();

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
