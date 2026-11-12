/**
 * 订单与评价路由：UC-10 / UC-14 / UC-16 / UC-31。
 */
import express from 'express';
import * as order from '../../domain/order.service.js';
import * as review from '../../domain/review.service.js';
import { ok } from '../middleware.js';

const router = express.Router();

/* --------------------------------------------------- UC-10 下单成交 */
router.post('/orders', (req, res, next) => {
  try {
    ok(res, order.createOrder(req.actor, { productId: req.body?.productId }), '下单成功，交易已成交');
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------- UC-16 我的订单 */
router.get('/me/orders', (req, res, next) => {
  try {
    ok(res, order.myOrders(req.actor, { role: req.query.role || 'all' }));
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:id', (req, res, next) => {
  try {
    ok(res, order.orderDetail(req.actor, req.params.id));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------- UC-31 撤销成交 / 免责判定 */
router.post('/orders/:id/cancel', (req, res, next) => {
  try {
    ok(res, order.cancelOrder(req.actor, req.params.id, { reason: req.body?.reason }), '撤销已生效，等待对方在 7 天内判定');
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:id/cancel-judgement', (req, res, next) => {
  try {
    ok(res, order.judgeCancellation(req.actor, req.params.id, { judgement: req.body?.judgement }), '判定已提交');
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------- UC-14 评价 */
router.post('/orders/:id/reviews', (req, res, next) => {
  try {
    ok(res, review.submitReview(req.actor, req.params.id, { content: req.body?.content }), '评价已提交');
  } catch (err) {
    next(err);
  }
});

router.get('/me/reviews/written', (req, res, next) => {
  try {
    ok(res, review.reviewsWrittenBy(req.actor));
  } catch (err) {
    next(err);
  }
});

router.get('/me/reviews/received', (req, res, next) => {
  try {
    ok(res, review.reviewsReceivedBy(req.actor));
  } catch (err) {
    next(err);
  }
});

export default router;
