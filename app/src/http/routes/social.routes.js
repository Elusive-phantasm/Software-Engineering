/**
 * 私信、通知、举报、个人主页与信用分路由：
 * UC-12 举报、UC-15 信用分、UC-18 消息通知、UC-29 联系卖家、UC-30 我的私信、UC-33 个人主页。
 */
import express from 'express';
import * as message from '../../domain/message.service.js';
import * as notification from '../../domain/notification.service.js';
import * as report from '../../domain/report.service.js';
import * as profile from '../../domain/profile.service.js';
import { ok } from '../middleware.js';

const router = express.Router();

/* ------------------------------------------------- UC-29 / UC-30 站内私信 */
router.get('/messages/conversations', (req, res, next) => {
  try {
    ok(res, message.listConversations(req.actor));
  } catch (err) {
    next(err);
  }
});

router.get('/messages/conversations/:productId/:peerId', (req, res, next) => {
  try {
    ok(res, message.getConversation(req.actor, req.params.productId, req.params.peerId));
  } catch (err) {
    next(err);
  }
});

router.post('/messages', (req, res, next) => {
  try {
    ok(res, message.sendMessage(req.actor, req.body || {}), '已发送');
  } catch (err) {
    next(err);
  }
});

router.get('/messages/unread-count', (req, res) => {
  ok(res, { unread: message.unreadMessageCount(req.actor) });
});

/* ------------------------------------------------------------ UC-18 通知 */
router.get('/notifications', (req, res, next) => {
  try {
    ok(res, notification.listNotifications(req.actor, req.query));
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/read-all', (req, res, next) => {
  try {
    ok(res, notification.markAllRead(req.actor));
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/read', (req, res, next) => {
  try {
    ok(res, notification.markRead(req.actor, req.params.id));
  } catch (err) {
    next(err);
  }
});

/** 红点：通知与私信分别统计（NFR-09：两者相互独立） */
router.get('/badge', (req, res) => ok(res, notification.badge(req.actor)));

/* ------------------------------------------------------------ UC-12 举报 */
router.post('/reports', (req, res, next) => {
  try {
    ok(res, report.submitReport(req.actor, req.body || {}), '举报已提交，管理员将在 24 小时内处理');
  } catch (err) {
    next(err);
  }
});

router.get('/me/reports', (req, res, next) => {
  try {
    ok(res, report.myReports(req.actor));
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------- UC-33 个人主页 / UC-15 信用分 */
router.get('/students/:id/profile', (req, res, next) => {
  try {
    ok(res, profile.viewProfile(req.actor, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/students/:id/credit', (req, res, next) => {
  try {
    ok(res, profile.creditInfo(req.actor, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/me/credit', (req, res, next) => {
  try {
    ok(res, profile.creditInfo(req.actor, req.actor.kind === 'student' ? req.actor.id : null));
  } catch (err) {
    next(err);
  }
});

export default router;
