/**
 * 演示账号口令的读取约定（供 smoke / e2e / bench 共用）。
 *
 * 仓库里不再写死任何演示口令。口令来源按优先级：
 *   1) 环境变量：DEMO_STUDENT_PASSWORD / DEMO_ADMIN_NO / DEMO_ADMIN_PASSWORD
 *   2) 后端首次启动生成的凭据文件（默认 backend/data/seed-credentials.txt）
 *
 * 若两处都拿不到，抛错并提示具体做法，绝不回退到仓库默认口令。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const DEFAULT_CREDENTIALS_FILE = path.join(repoRoot, 'backend', 'data', 'seed-credentials.txt');

export const STUDENT_EMAIL = process.env.DEMO_STUDENT_EMAIL || 'lin@campus.edu';

function readCredentialsFile() {
  const file = process.env.DEMO_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE;
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function resolve() {
  const file = readCredentialsFile();
  const studentPassword = process.env.DEMO_STUDENT_PASSWORD || file['student-password'];
  const adminNo = process.env.DEMO_ADMIN_NO || file['admin-no'] || 'ADM-001';
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || file['admin-password'];

  if (!studentPassword || !adminPassword) {
    throw new Error(
      '缺少演示口令：请设置 DEMO_STUDENT_PASSWORD / DEMO_ADMIN_PASSWORD，\n' +
      `或确认后端首次启动已生成 ${process.env.DEMO_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE}。\n` +
      '若该文件不存在，先启动一次后端（默认会随机生成并写入），或显式设置 APP_SEED_* 环境变量。'
    );
  }
  return { studentPassword, adminNo, adminPassword };
}

let cached;
/** @returns {{studentPassword: string, adminNo: string, adminPassword: string}} */
export function demoAccounts() {
  cached ??= resolve();
  return cached;
}
