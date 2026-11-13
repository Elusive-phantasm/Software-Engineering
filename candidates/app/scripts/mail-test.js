/**
 * 邮件通道自检：npm run mail:test <收件邮箱>
 * - transport=local 时只写入开发发件箱（data/mailbox.jsonl）
 * - transport=smtp 时走真实 SMTP（配置见 config/mail.json）
 */
import { config } from '../src/core/config.js';
import { mailSelfTest } from '../src/core/mailer.js';
import { nowIso } from '../src/core/time.js';

const to = process.argv[2];
if (!to) {
  console.error('用法：npm run mail:test -- <收件邮箱>');
  process.exit(1);
}

console.log(`邮件通道：${config.mail.transport}`);
if (config.mail.transport === 'smtp') {
  console.log(`SMTP：${config.mail.host}:${config.mail.port} secure=${config.mail.secure} user=${config.mail.user}`);
} else {
  console.log('当前为本地开发邮箱模式：邮件写入 data/mailbox.jsonl，可通过 /api/dev/mailbox 查看。');
  console.log('如需真实发信：复制 config/mail.example.json 为 config/mail.json 并填入 SMTP 凭据。');
}

const t0 = Date.now();
const res = await mailSelfTest(to);
console.log(`结果：${JSON.stringify(res)}（${Date.now() - t0} ms，${nowIso()}）`);
process.exit(res.ok ? 0 : 2);
