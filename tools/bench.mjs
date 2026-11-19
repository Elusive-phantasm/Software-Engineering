/**
 * NFR-01 / NFR-02 性能抽样（非正式验收，只给出量级参考）。
 * 用法：node tools/bench.mjs
 */
import autocannon from 'autocannon';
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://127.0.0.1:8080';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function call(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = performance.now();
  const res = await fetch(API + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ms: performance.now() - started, status: res.status, data };
}

async function login(email, password = 'Test@12345') {
  const r = await call('POST', '/api/auth/login', { email, password });
  return r.data.data.token;
}

function report(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`请求数 ${result.requests.total}，失败 ${result.errors + result.timeouts}`);
  console.log(`吞吐 ${result.requests.average}/s`);
  console.log(`延迟: p50 ${result.latency.p50}ms  p95 ${result.latency.p97_5}ms  p99 ${result.latency.p99}ms  max ${result.latency.max}ms`);
  return {
    title,
    total: result.requests.total,
    failed: result.errors + result.timeouts,
    rps: result.requests.average,
    p50: result.latency.p50,
    p95: result.latency.p97_5,
    p99: result.latency.p99,
    max: result.latency.max
  };
}

async function main() {
  // 干净起点
  await call('POST', '/api/dev/reset', {});

  console.log('\n== NFR-01 商品列表性能：50 个连接并发 15 秒 ==');
  const listResult = await autocannon({
    url: `${API}/api/products?pageSize=12`,
    connections: 50,
    duration: 15,
    pipelining: 1
  });
  const nfr01 = report('NFR-01 商品列表（目标：每次 ≤ 2000ms）', listResult);

  console.log('\n== NFR-02 下单响应：小样本（10 笔合法下单，串行）==');
  const lin = await login('lin@campus.edu');
  const zhao = await login('zhao@campus.edu');
  const admin = (await call('POST', '/api/auth/admin/login', { adminNo: 'ADM-001', password: 'Admin@12345' })).data.data.token;
  const cats = await call('GET', '/api/categories');
  const categoryId = cats.data.data[2].id;

  const samples = [];
  for (let i = 0; i < 10; i++) {
    const seller = i % 2 === 0 ? lin : zhao;
    const buyer = i % 2 === 0 ? zhao : lin;
    // 两个卖家轮流发布，避免单个卖家触发在售 5 件上限
    const created = await call('POST', '/api/products', {
      title: `压测商品${i}`,
      description: '压测用商品描述，内容完整。',
      price: '1.00',
      condition: '九成新',
      categoryId,
      images: [PNG]
    }, seller);
    if (created.status !== 200) {
      console.log('发布失败，跳过：', created.data.message);
      continue;
    }
    const id = created.data.data.id;
    await call('POST', `/api/admin/products/${id}/approve`, {}, admin);
    const order = await call('POST', '/api/orders', { productId: id }, buyer);
    if (order.status === 200) {
      samples.push(order.ms);
    } else {
      console.log('下单失败：', order.data.message);
    }
  }

  samples.sort((a, b) => a - b);
  const p = (q) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))] ?? 0;
  const nfr02 = {
    title: 'NFR-02 下单成交（目标：每次 ≤ 3000ms）',
    samples: samples.length,
    min: Math.round(samples[0] || 0),
    p50: Math.round(p(0.5)),
    max: Math.round(samples[samples.length - 1] || 0)
  };
  console.log(`\n=== ${nfr02.title} ===`);
  console.log(`有效样本 ${nfr02.samples} 笔 · min ${nfr02.min}ms · p50 ${nfr02.p50}ms · max ${nfr02.max}ms`);

  const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '')), '..', 'docs', 'test', '压测结果.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), nfr01, nfr02 }, null, 2), 'utf8');
  console.log(`\n结果已写入 ${out}`);
}

main().catch((e) => {
  console.error('压测失败：', e.message);
  process.exitCode = 1;
});
