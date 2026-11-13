/**
 * 开发与演示工具（默认开启，config.server.enableDevTools=false 可关闭）。
 *
 * 为什么需要它：需求文档里的判定窗口是 7 天 / 24 小时，答辩与验收现场无法自然等待。
 * 这里提供「服务端时间偏移」与「立即执行定时判定」两个能力，
 * 让 SC-07（未评价 −1）、SC-10（7 天自动计违约）、AT-06/07 可被当场验证。
 * 业务代码一律读服务端 nowMs()，不受客户端时间影响（§4.1.1 第 4 条）。
 */
import express from 'express';
import { config, CREDIT, DL, L } from '../../core/config.js';
import { get, run, count } from '../../core/db.js';
import { clearOutbox, readOutbox } from '../../core/mailer.js';
import { setTimeOffset, getTimeOffset, nowIso } from '../../core/time.js';
import { runScheduler } from '../../domain/scheduler.service.js';
import { FORBIDDEN_CATEGORIES, CANCEL_REASONS, ACTIONS } from '../../core/rules.js';
import { ok } from '../middleware.js';

const router = express.Router();

router.get('/mailbox', (req, res) => {
  ok(res, { transport: config.mail.transport, items: readOutbox(Number(req.query.limit) || 30) });
});

router.delete('/mailbox', (req, res) => {
  clearOutbox();
  ok(res, { ok: true });
});

router.get('/rules', (req, res) => {
  ok(res, {
    limits: L,
    credit: CREDIT,
    deadlines: DL,
    certification: config.certification,
    security: config.security,
    retention: config.retention,
    forbiddenCategories: FORBIDDEN_CATEGORIES,
    cancelReasons: CANCEL_REASONS,
    actions: ACTIONS
  });
});

router.get('/time', (req, res) => {
  ok(res, { offsetMs: getTimeOffset(), offsetHours: getTimeOffset() / 3600000, now: nowIso() });
});

/** 服务端时间偏移：hours 可为负数 */
router.post('/time-shift', (req, res) => {
  const hours = Number(req.body?.hours ?? 0);
  const next = getTimeOffset() + hours * 3600 * 1000;
  setTimeOffset(next);
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('time_offset_ms', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    String(next),
    nowIso()
  );
  ok(res, { offsetMs: next, offsetHours: next / 3600000, now: nowIso() }, `时间偏移已设为 ${next / 3600000} 小时`);
});

router.post('/time-reset', (req, res) => {
  setTimeOffset(0);
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('time_offset_ms','0',?)
     ON CONFLICT(key) DO UPDATE SET value='0', updated_at=excluded.updated_at`,
    nowIso()
  );
  ok(res, { offsetMs: 0, now: nowIso() }, '时间偏移已归零');
});

router.post('/scheduler/run', (req, res) => {
  ok(res, runScheduler(), '定时判定已执行');
});

/** 清库重灌演示数据（仅开发模式），供演示与验收测试使用 */
router.post('/reset', async (req, res, next) => {
  try {
    const { seed } = await import('../../seed/seed.js');
    setTimeOffset(0);
    const result = seed({ reset: true });
    ok(res, result, '演示数据已重置');
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------- 测试钩子
 * 用于验收脚本快速构造前置状态（正常业务路径不提供这些能力）：
 *   set-credit   直接把信用分设为指定值，用于验证 BR-13 的 60 / 40 阈值
 *   set-cert     直接把认证状态改为已认证，节省走查时间
 *   set-account  直接改账号状态
 * 生产部署时把 config.server.enableDevTools 关闭即可整体移除。 */
router.post('/set-credit', (req, res) => {
  const { studentId, score } = req.body || {};
  run('UPDATE students SET credit_score=? WHERE id=?', Math.max(0, Math.min(150, Number(score))), studentId);
  ok(res, { studentId, score: get('SELECT credit_score FROM students WHERE id=?', studentId)?.credit_score });
});

router.post('/set-cert', (req, res) => {
  const { studentId, status = '已认证', studentNo = null } = req.body || {};
  run('UPDATE students SET cert_status=?, student_no=? WHERE id=?', status, studentNo, studentId);
  ok(res, { studentId, status });
});

router.post('/set-account', (req, res) => {
  const { studentId, status = '正常' } = req.body || {};
  run('UPDATE students SET account_status=? WHERE id=?', status, studentId);
  ok(res, { studentId, status });
});

router.get('/state', (req, res) => {  ok(res, {
    now: nowIso(),
    offsetHours: getTimeOffset() / 3600000,
    counts: {
      students: count('SELECT COUNT(*) FROM students'),
      products: count('SELECT COUNT(*) FROM products'),
      orders: count('SELECT COUNT(*) FROM orders'),
      reviews: count('SELECT COUNT(*) FROM reviews'),
      reports: count('SELECT COUNT(*) FROM reports'),
      messages: count('SELECT COUNT(*) FROM messages'),
      notifications: count('SELECT COUNT(*) FROM notifications'),
      creditRecords: count('SELECT COUNT(*) FROM credit_records'),
      auditLogs: count('SELECT COUNT(*) FROM audit_logs')
    },
    mailTransport: config.mail.transport
  });
});

export default router;
