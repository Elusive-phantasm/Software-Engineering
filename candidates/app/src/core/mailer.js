/**
 * 邮件发送。
 *
 * 需求文档 §8.11 / 遗留项 12 指出：邮箱验证码依赖 SMTP 邮件服务，是本项目唯一的外部依赖。
 * 本模块实现两条通道：
 *   1) transport = 'smtp'：真实发信（零依赖手写 SMTP 客户端，支持 465 隐式 TLS 与
 *      587 STARTTLS，AUTH PLAIN / AUTH LOGIN）。凭据放 config/mail.json，不写库、不进日志、不进 git。
 *   2) transport = 'local'：本地开发邮箱。邮件写入 data/mailbox.jsonl，
 *      可通过 /api/dev/mailbox 或后台「开发工具」页查看，保证离线也能完整演示。
 *
 * 无论哪条通道，验证码明文都不会进入审计与运行日志（NFR-10 ②）。
 */
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { config, DATA_DIR } from './config.js';
import { bizId } from './crypto.js';
import { nowIso } from './time.js';

const MAILBOX_FILE = path.join(DATA_DIR, 'mailbox.jsonl');

/* ------------------------------------------------------------------ 发件箱 */
function recordOutbox(entry) {
  try {
    fs.appendFileSync(MAILBOX_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.warn('[mail] 写入开发发件箱失败：', err.message);
  }
}

export function readOutbox(limit = 50) {
  if (!fs.existsSync(MAILBOX_FILE)) return [];
  const lines = fs.readFileSync(MAILBOX_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

export function clearOutbox() {
  if (fs.existsSync(MAILBOX_FILE)) fs.writeFileSync(MAILBOX_FILE, '', 'utf8');
}

/* ------------------------------------------------------------ SMTP 协议层 */
function makeReader(socket) {
  let buf = '';
  let multi = [];
  const queue = [];
  const waiters = [];

  function pump() {
    for (;;) {
      const idx = buf.indexOf('\r\n');
      if (idx < 0) return;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const m = /^(\d{3})([ -])?/.exec(line);
      if (!m) continue;
      const code = Number(m[1]);
      const sep = m[2] || '-';
      multi.push(line.slice(4));
      if (sep === '-') continue;
      const resp = { code, text: multi.join('\n') };
      multi = [];
      const w = waiters.shift();
      if (w) w(resp);
      else queue.push(resp);
    }
  }

  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    pump();
  });

  return {
    next(timeoutMs = 20000) {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const handler = (r) => {
          clearTimeout(timer);
          resolve(r);
        };
        const timer = setTimeout(() => {
          const i = waiters.indexOf(handler);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error('SMTP 响应超时'));
        }, timeoutMs);
        waiters.push(handler);
      });
    }
  };
}

function write(socket, text) {
  socket.write(text.endsWith('\r\n') ? text : text + '\r\n');
}

function expect(resp, codes, what) {
  if (!codes.includes(resp.code)) {
    throw new Error(`${what} 失败：${resp.code} ${resp.text}`);
  }
  return resp;
}

function bareAddress(addr) {
  const m = /<([^>]+)>/.exec(String(addr));
  return m ? m[1] : String(addr).trim();
}

function encodeHeaderUtf8(text) {
  return `=?UTF-8?B?${Buffer.from(String(text), 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, subject, text }) {
  const bodyB64 = Buffer.from(String(text), 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderUtf8(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${bizId('MAIL')}@campus-reuse.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64
  ].join('\r\n');
}

async function smtpSend({ host, port, secure, user, pass, from, to, subject, text, timeoutMs = 20000 }) {
  let socket = secure
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: config.mail.allowInvalidCert !== true })
    : net.connect({ host, port });

  const readyEvent = secure ? 'secureConnect' : 'connect';
  await new Promise((resolve, reject) => {
    const onErr = (e) => reject(e);
    socket.once('error', onErr);
    socket.once(readyEvent, () => {
      socket.removeListener('error', onErr);
      resolve();
    });
    socket.setTimeout(timeoutMs, () => reject(new Error('SMTP 连接超时')));
  });

  let reader = makeReader(socket);
  const hostname = config.mail.ehloName || 'campus-reuse.local';

  try {
    expect(await reader.next(), [220], '服务器问候');
    write(socket, `EHLO ${hostname}`);
    let ehlo = expect(await reader.next(), [250], 'EHLO');

    if (!secure) {
      const supportsStartTls = /STARTTLS/i.test(ehlo.text);
      if (supportsStartTls) {
        write(socket, 'STARTTLS');
        expect(await reader.next(), [220], 'STARTTLS');
        socket = tls.connect({
          socket,
          servername: host,
          rejectUnauthorized: config.mail.allowInvalidCert !== true
        });
        await new Promise((resolve, reject) => {
          socket.once('secureConnect', resolve);
          socket.once('error', reject);
        });
        reader = makeReader(socket);
        write(socket, `EHLO ${hostname}`);
        ehlo = expect(await reader.next(), [250], 'EHLO(STARTTLS)');
      } else if (config.mail.requireTLS) {
        throw new Error('服务器不支持 STARTTLS，已按配置拒绝明文发信');
      }
    }

    if (user && pass) {
      if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) {
        const blob = Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64');
        write(socket, `AUTH PLAIN ${blob}`);
        expect(await reader.next(), [235], '身份认证');
      } else {
        write(socket, 'AUTH LOGIN');
        expect(await reader.next(), [334], 'AUTH LOGIN');
        write(socket, Buffer.from(user, 'utf8').toString('base64'));
        expect(await reader.next(), [334], 'AUTH 用户名');
        write(socket, Buffer.from(pass, 'utf8').toString('base64'));
        expect(await reader.next(), [235], 'AUTH 密码');
      }
    }

    write(socket, `MAIL FROM:<${bareAddress(from)}>`);
    expect(await reader.next(), [250], 'MAIL FROM');
    write(socket, `RCPT TO:<${bareAddress(to)}>`);
    expect(await reader.next(), [250, 251], 'RCPT TO');
    write(socket, 'DATA');
    expect(await reader.next(), [354], 'DATA');
    socket.write(buildMime({ from, to, subject, text }) + '\r\n.\r\n');
    expect(await reader.next(), [250], '邮件正文投递');
    write(socket, 'QUIT');
    try {
      await reader.next(2000);
    } catch {
      /* QUIT 不需要强一致 */
    }
  } finally {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 发送邮件。
 * @returns {Promise<{ok:boolean, transport:string, error?:string}>}
 */
export async function sendMail({ to, subject, text }) {
  const mail = config.mail;
  const from = mail.from || '拾光二手 <no-reply@campus-reuse.local>';
  const entry = {
    id: bizId('MAIL'),
    at: nowIso(),
    to,
    subject,
    text,
    transport: mail.transport
  };

  if (mail.transport === 'smtp') {
    try {
      await smtpSend({
        host: mail.host,
        port: Number(mail.port) || (mail.secure ? 465 : 587),
        secure: mail.secure === true,
        user: mail.user,
        pass: mail.pass,
        from,
        to,
        subject,
        text
      });
      recordOutbox({ ...entry, ok: true });
      return { ok: true, transport: 'smtp' };
    } catch (err) {
      recordOutbox({ ...entry, ok: false, error: err.message });
      console.warn('[mail] SMTP 发送失败：', err.message);
      return { ok: false, transport: 'smtp', error: err.message };
    }
  }

  recordOutbox({ ...entry, ok: true });
  return { ok: true, transport: 'local' };
}

/** 自检：npm run mail:test 使用 */
export async function mailSelfTest(to) {
  const res = await sendMail({
    to,
    subject: '拾光二手 · 邮件通道自检',
    text: `这是一封自检邮件。\n发送时间：${nowIso()}\n通道：${config.mail.transport}`
  });
  return res;
}
