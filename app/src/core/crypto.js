/**
 * 密码学与标识工具。
 * - 登录密码：scrypt 单向哈希，只存不可逆摘要（NFR-05、§6.2.1）
 * - 邮箱验证码：只存 HMAC-SHA256 摘要，明文不落库、不进日志（NFR-10）
 * - 会话令牌：随机 48 字节，库里只存其 SHA-256
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const secretPath = path.join(DATA_DIR, 'secret.key');
function loadSecret() {
  if (fs.existsSync(secretPath)) {
    return Buffer.from(fs.readFileSync(secretPath, 'utf8').trim(), 'hex');
  }
  const s = crypto.randomBytes(32);
  fs.writeFileSync(secretPath, s.toString('hex'), { mode: 0o600 });
  return s;
}
export const SERVER_SECRET = loadSecret();

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(plain, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(String(plain), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p)
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function hmac(s) {
  return crypto.createHmac('sha256', SERVER_SECRET).update(String(s)).digest('hex');
}

/** 邮箱验证码摘要：与邮箱、用途、验证码同时绑定，两种用途不可互换（§6.2.1） */
export function codeDigest(email, purpose, code) {
  return hmac(`${String(email).toLowerCase()}|${purpose}|${code}`);
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const ID_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function randomIdSuffix(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

/** 业务编号，如 PRD-7K3M2Q8Z、ORD-... （前缀可读，便于答辩演示） */
export function bizId(prefix) {
  return `${prefix}-${randomIdSuffix(8)}`;
}

/** 邮箱验证码：6 位数字（NFR-10 ①） */
export function numericCode(length = 6) {
  let s = '';
  for (let i = 0; i < length; i++) s += String(crypto.randomInt(0, 10));
  return s;
}

export function randomToken() {
  return crypto.randomBytes(48).toString('hex');
}

/** SQL 通配 LIKE 转义 */
export function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, (m) => '\\' + m);
}
