/**
 * 学生证核验路由：UC-02（学生侧）。审核侧 UC-03 见 admin.routes.js。
 */
import express from 'express';
import * as verification from '../../domain/verification.service.js';
import { ok } from '../middleware.js';

const router = express.Router();

router.get('/verifications/mine', (req, res, next) => {
  try {
    ok(res, verification.myCertificationState(req.actor));
  } catch (err) {
    next(err);
  }
});

router.get('/verifications/mine/applications', (req, res, next) => {
  try {
    ok(res, verification.myApplications(req.actor));
  } catch (err) {
    next(err);
  }
});

router.post('/verifications', (req, res, next) => {
  try {
    ok(res, verification.submitVerification(req.actor, req.body || {}), '核验申请已提交');
  } catch (err) {
    next(err);
  }
});

export default router;
