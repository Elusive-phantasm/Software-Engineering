/**
 * 配置装载。
 * 业务参数（阈值、时限、上限）全部来自 config/default.json，代码不硬编码，
 * 对应需求文档中大量「建议值，待确认」的条目。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_FILE = path.join(DATA_DIR, 'platform.db');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const base = readJson(path.join(ROOT, 'config', 'default.json'));

// 真实 SMTP 凭据放在 config/mail.json（不入库、不进日志）；缺省走本地开发邮箱
let mailOverride = {};
const mailFile = path.join(ROOT, 'config', 'mail.json');
if (fs.existsSync(mailFile)) {
  try {
    mailOverride = readJson(mailFile);
  } catch (err) {
    console.warn('[config] config/mail.json 解析失败，回退本地开发邮箱：', err.message);
  }
}

export const config = {
  ...base,
  mail: { ...base.mail, ...mailOverride }
};

if (process.env.PORT) config.server.port = Number(process.env.PORT);
if (process.env.HOST) config.server.host = process.env.HOST;

export const L = config.limits;
export const CREDIT = config.credit;
export const DL = config.deadlines;

/** 元 → 分 */
export const toCents = (yuan) => Math.round(Number(yuan) * 100);
/** 分 → 元（两位小数字符串） */
export const toYuan = (cents) => (Number(cents) / 100).toFixed(2);
