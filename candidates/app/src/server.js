/**
 * 服务入口。
 * 启动：npm start（默认 http://127.0.0.1:3081）
 */
import { config } from './core/config.js';
import { get, initDb } from './core/db.js';
import { setTimeOffset, nowIso } from './core/time.js';
import { startScheduler } from './domain/scheduler.service.js';
import { createApp } from './app.js';
import { ensureSeed } from './seed/seed.js';

initDb();

// 恢复演示时间偏移（若有）
const offsetRow = get(`SELECT value FROM settings WHERE key='time_offset_ms'`);
if (offsetRow) setTimeOffset(Number(offsetRow.value));

// 首次启动自动灌入演示数据；已有数据则跳过
ensureSeed();

const app = createApp();
const { port, host } = config.server;

app.listen(port, host, () => {
  const banner = [
    '',
    '  ┌──────────────────────────────────────────────────────────┐',
    '  │  拾光二手 · 校园二手交易平台（需求规格说明书 V2.1 实现）  │',
    '  └──────────────────────────────────────────────────────────┘',
    `  学生端： http://${host}:${port}/`,
    `  管理端： http://${host}:${port}/admin`,
    `  时间：   ${nowIso()}    邮件通道：${config.mail.transport}`,
    ''
  ].join('\n');
  console.log(banner);
  startScheduler(30000);
});
