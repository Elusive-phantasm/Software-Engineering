/**
 * 验收测试公共库：最小 HTTP 客户端（带 Cookie jar）与断言工具。
 * 不依赖任何第三方测试框架，便于课程环境直接运行。
 */
export const BASE = process.env.PLATFORM_BASE || 'http://127.0.0.1:3081';

export class Client {
  constructor(base = BASE) {
    this.base = base;
    this.cookies = new Map();
    this.label = 'anon';
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  absorb(res) {
    const raw = res.headers.getSetCookie?.() || [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    this.absorb(res);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, body: json };
  }

  get(path) {
    return this.request('GET', path);
  }
  post(path, body) {
    return this.request('POST', path, body ?? {});
  }
  patch(path, body) {
    return this.request('PATCH', path, body ?? {});
  }
  del(path) {
    return this.request('DELETE', path);
  }

  /** 期望成功，返回 data */
  async ok(method, path, body) {
    const r = await this.request(method, path, body);
    if (!r.body?.ok) {
      throw new Error(`[${this.label}] ${method} ${path} 期望成功，实际 ${r.status} ${JSON.stringify(r.body)}`);
    }
    return r.body.data;
  }
  getOk(path) {
    return this.ok('GET', path);
  }
  postOk(path, body) {
    return this.ok('POST', path, body);
  }
  patchOk(path, body) {
    return this.ok('PATCH', path, body);
  }
  delOk(path) {
    return this.ok('DELETE', path);
  }

  /** 期望失败，返回 {code, message} 并断言错误码 */
  async fail(method, path, body, expectCode) {
    const r = await this.request(method, path, body);
    if (r.body?.ok) {
      throw new Error(`[${this.label}] ${method} ${path} 期望被拒绝，实际成功：${JSON.stringify(r.body.data).slice(0, 200)}`);
    }
    if (expectCode && r.body?.code !== expectCode) {
      throw new Error(
        `[${this.label}] ${method} ${path} 期望错误码 ${expectCode}，实际 ${r.body?.code}（${r.body?.message}）`
      );
    }
    return { code: r.body?.code, message: r.body?.message, status: r.status };
  }
  getFail(path, expectCode) {
    return this.fail('GET', path, undefined, expectCode);
  }
  postFail(path, body, expectCode) {
    return this.fail('POST', path, body ?? {}, expectCode);
  }
  patchFail(path, body, expectCode) {
    return this.fail('PATCH', path, body ?? {}, expectCode);
  }
  delFail(path, expectCode) {
    return this.fail('DELETE', path, undefined, expectCode);
  }

  async loginStudent(email, password = 'Test@12345') {
    const data = await this.postOk('/api/auth/login', { email, password });
    this.label = email;
    return data.student;
  }
  async loginAdmin(adminId = 'ADM-001', password = 'Admin@12345') {
    await this.postOk('/api/admin/auth/login', { adminId, password });
    this.label = `admin:${adminId}`;
    return true;
  }
}

/* ------------------------------------------------------------------ 断言 */
export class Assert {
  constructor() {
    this.pass = 0;
    this.failures = [];
    this.current = null;
  }
  group(name) {
    this.current = name;
    console.log(`\n── ${name} ${'─'.repeat(Math.max(2, 60 - name.length))}`);
  }
  ok(cond, message) {
    if (cond) {
      this.pass++;
      console.log(`  ✓ ${message}`);
    } else {
      this.failures.push(`[${this.current}] ${message}`);
      console.log(`  ✗ ${message}`);
    }
    return !!cond;
  }
  equal(actual, expected, message) {
    return this.ok(
      actual === expected,
      `${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`
    );
  }
  includes(text, sub, message) {
    return this.ok(String(text ?? '').includes(sub), `${message}（应包含「${sub}」）`);
  }
  summary() {
    console.log(`\n${'='.repeat(66)}`);
    console.log(`通过 ${this.pass} 项，失败 ${this.failures.length} 项`);
    if (this.failures.length) {
      console.log('\n失败明细：');
      for (const f of this.failures) console.log(`  ✗ ${f}`);
    }
    return this.failures.length === 0;
  }
}

/** 从开发发件箱里取出指定邮箱最新一条验证码 */
export async function latestCode(adminClient, email) {
  const data = await adminClient.getOk('/api/dev/mailbox?limit=50');
  const item = data.items.find((m) => m.to === email);
  if (!item) throw new Error(`开发发件箱中找不到 ${email} 的邮件`);
  const m = /(\d{6})/.exec(item.text);
  if (!m) throw new Error('邮件正文中未找到 6 位验证码');
  return m[1];
}

/** 便于在测试里断言「近似值」 */
export function near(actual, expected, tol, message) {
  return Math.abs(Number(actual) - Number(expected)) <= tol;
}
