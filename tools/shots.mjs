/**
 * 截图：用于人工比对原型风格。
 * 用法：node tools/shots.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { demoAccounts } from './demo-accounts.mjs';

const EDGE = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean).find((p) => fs.existsSync(p));

const BASE = process.env.WEB_BASE || 'http://localhost:5173';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'docs', 'test', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,960']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
await fetch(`${BASE}/api/dev/reset`, { method: 'POST' }).catch(() => {});

async function shot(name, url, waitFor) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 12000 }).catch(() => {});
  await sleep(800);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
}

async function login(email, password) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input');
  const inputs = await page.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(email);
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type(password);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '登录')?.click();
  });
  await sleep(1600);
}

await shot('01-home', BASE, '.product-card');
await login('lin@campus.edu', demoAccounts().studentPassword);
await shot('02-home-logged-in', BASE, '.product-card');
await page.click('.product-card');
await sleep(1500);
await page.screenshot({ path: path.join(OUT, '03-detail.png') });
console.log('saved 03-detail.png');
await shot('04-orders', `${BASE}/#/me/orders`, '.section-title');
await shot('05-publish', `${BASE}/#/publish`, 'form');
await shot('06-admin-login', `${BASE}/#/admin/login`, 'input');

await browser.close();
console.log('done ->', OUT);
