/**
 * 管理后台路由：UC-03 审核学生证、UC-06 审核商品、UC-13 处理举报与违规处置，
 * 以及账号状态处置、扣信用分、删除他人评价、审计查询。
 */
import express from 'express';
import fs from 'node:fs';
import { certImagePath } from '../../core/storage.js';
import * as verification from '../../domain/verification.service.js';
import * as product from '../../domain/product.service.js';
import * as report from '../../domain/report.service.js';
import * as admin from '../../domain/admin.service.js';
import * as review from '../../domain/review.service.js';
import * as message from '../../domain/message.service.js';
import * as order from '../../domain/order.service.js';
import { FORBIDDEN_CATEGORIES, ACTIONS, REPORT_TYPES, REPORT_TYPES_BY_TARGET, CANCEL_REASONS } from '../../core/rules.js';
import { ok, errorHandler } from '../middleware.js';
import { requireAdmin } from '../../domain/guards.js';

const router = express.Router();

/* 全部后台接口都要求管理员会话（UC-04 是 UC-03/06/13 的前置条件） */
router.use((req, res, next) => {
  try {
    requireAdmin(req.actor);
    next();
  } catch (err) {
    errorHandler(err, req, res, next);
  }
});

router.get('/dashboard', (req, res) => ok(res, admin.dashboard()));

/* ------------------------------------------------------- UC-03 学生证审核 */
router.get('/verifications', (req, res, next) => {
  try {
    const status = req.query.status;
    ok(res, status === '待审核' ? verification.pendingApplications() : verification.applicationList({ status }));
  } catch (err) {
    next(err);
  }
});

/** NFR-08：学生证图片专用下发给审核管理员 */
router.get('/verifications/:id/image', (req, res, next) => {
  try {
    const rel = verification.applicationImage(req.actor, req.params.id);
    const abs = certImagePath(rel);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.post('/verifications/:id/approve', (req, res, next) => {
  try {
    ok(res, verification.approveApplication(req.actor, req.params.id), '已通过核验');
  } catch (err) {
    next(err);
  }
});

router.post('/verifications/:id/reject', (req, res, next) => {
  try {
    ok(
      res,
      verification.rejectApplication(req.actor, req.params.id, {
        reason: req.body?.reason,
        forgery: !!req.body?.forgery
      }),
      '已驳回核验申请'
    );
  } catch (err) {
    next(err);
  }
});

router.post('/students/:id/revoke-certification', (req, res, next) => {
  try {
    ok(
      res,
      verification.revokeCertification(req.actor, req.params.id, {
        reason: req.body?.reason,
        deductCredit: req.body?.deductCredit !== false
      }),
      '已撤销认证资格并封禁账号（AT-08）'
    );
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------- UC-06 商品审核 */
router.get('/products', (req, res, next) => {
  try {
    const { status, keyword } = req.query;
    ok(res, status === '待审核' && !keyword ? product.adminPendingProducts() : product.adminAllProducts({ status, keyword }));
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/approve', (req, res, next) => {
  try {
    ok(res, product.approveProduct(req.actor, req.params.id), '审核通过，商品已上架');
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/reject', (req, res, next) => {
  try {
    ok(
      res,
      product.rejectProduct(req.actor, req.params.id, {
        reason: req.body?.reason,
        categoryCode: req.body?.categoryCode
      }),
      '已驳回，商品转为已下架（审核不通过）'
    );
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/force-off', (req, res, next) => {
  try {
    ok(
      res,
      product.forceOffShelfProduct(req.actor, req.params.id, {
        reason: req.body?.reason,
        categoryCode: req.body?.categoryCode,
        deduct: req.body?.deduct !== false
      }),
      '已强制下架并扣信用分'
    );
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/restore', (req, res, next) => {
  try {
    ok(res, product.restoreProduct(req.actor, req.params.id, { reason: req.body?.reason }), '已撤销违规处置，商品恢复在售');
  } catch (err) {
    next(err);
  }
});

router.get('/forced-off-products', (req, res, next) => {
  try {
    ok(res, admin.forcedOffShelfList());
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------ UC-13 举报与处置 */
router.get('/reports', (req, res, next) => {
  try {
    const status = req.query.status;
    ok(res, status === '待处理' ? report.pendingReports() : report.allReports({ status }));
  } catch (err) {
    next(err);
  }
});

router.post('/reports/:id/handle', (req, res, next) => {
  try {
    ok(
      res,
      report.handleReport(req.actor, req.params.id, {
        upheld: !!req.body?.upheld,
        actions: req.body?.actions || [],
        result: req.body?.result,
        categoryCode: req.body?.categoryCode
      }),
      '举报已处理'
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------- 学生账号与信用处置 */
router.get('/students', (req, res, next) => {
  try {
    ok(res, admin.studentList(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/students/:id', (req, res, next) => {
  try {
    ok(res, admin.studentDetail(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/students/:id/account-status', (req, res, next) => {
  try {
    ok(
      res,
      admin.setAccountStatus(req.actor, req.params.id, {
        status: req.body?.status,
        reason: req.body?.reason,
        deductCredit: !!req.body?.deductCredit
      }),
      '账号状态已更新'
    );
  } catch (err) {
    next(err);
  }
});

router.post('/students/:id/credit', (req, res, next) => {
  try {
    ok(res, admin.adjustCredit(req.actor, req.params.id, { delta: req.body?.delta, reason: req.body?.reason }), '信用分已调整');
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------- 评价与订单检索 */
router.post('/reviews/:id/delete', (req, res, next) => {
  try {
    ok(res, review.deleteReview(req.actor, req.params.id, { reason: req.body?.reason }), '评价已删除');
  } catch (err) {
    next(err);
  }
});

router.get('/orders', (req, res, next) => {
  try {
    ok(res, order.adminOrders({ keyword: req.query.keyword }));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------- 处置异议会话（管理员仅可回复） */
router.post('/messages/reply', (req, res, next) => {
  try {
    ok(res, message.adminReply(req.actor, req.body || {}), '已回复');
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ 审计 */
router.get('/audit', (req, res, next) => {
  try {
    ok(res, admin.auditList({ limit: Number(req.query.limit) || 100, action: req.query.action }));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------- 元数据（下拉选项） */
router.get('/meta', (req, res) => {
  ok(res, {
    forbiddenCategories: FORBIDDEN_CATEGORIES,
    actions: ACTIONS,
    reportTypes: REPORT_TYPES,
    reportTypesByTarget: REPORT_TYPES_BY_TARGET,
    cancelReasons: CANCEL_REASONS
  });
});

export default router;
