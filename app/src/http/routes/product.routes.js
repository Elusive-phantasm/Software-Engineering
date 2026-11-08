/**
 * 商品与收藏路由：UC-05 / UC-06 / UC-07 / UC-08 / UC-09 / UC-11 / UC-17 / UC-32。
 */
import express from 'express';
import * as product from '../../domain/product.service.js';
import * as favorite from '../../domain/favorite.service.js';
import { ok } from '../middleware.js';

const router = express.Router();

/* ------------------------------------------------------------------ 分类 */
router.get('/categories', (req, res) => ok(res, product.listCategories()));

/* ------------------------------------------------------- UC-07 / UC-08 列表 */
router.get('/products', (req, res, next) => {
  try {
    ok(res, product.listProducts(req.actor, req.query));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------ UC-17 我的商品 */
router.get('/me/products', (req, res, next) => {
  try {
    ok(res, product.myProducts(req.actor));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ 详情 */
router.get('/products/:id', (req, res, next) => {
  try {
    ok(res, product.getProductDetail(req.actor, req.params.id));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- UC-05 发布 */
router.post('/products', (req, res, next) => {
  try {
    ok(res, product.createProduct(req.actor, req.body || {}), '已提交审核，等待管理员审核');
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------- UC-32 编辑（重审） */
router.patch('/products/:id', (req, res, next) => {
  try {
    ok(res, product.updateProduct(req.actor, req.params.id, req.body || {}), '修改已提交，需重新审核');
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------ UC-11 撤回 / 下架 / 删除 */
router.post('/products/:id/withdraw', (req, res, next) => {
  try {
    ok(res, product.withdrawProduct(req.actor, req.params.id), '已撤回，商品转为已下架（卖家撤回）');
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/take-down', (req, res, next) => {
  try {
    ok(res, product.takeDownProduct(req.actor, req.params.id), '商品已下架');
  } catch (err) {
    next(err);
  }
});

router.delete('/products/:id', (req, res, next) => {
  try {
    ok(res, product.deleteProduct(req.actor, req.params.id), '商品已永久删除');
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/resubmit', (req, res, next) => {
  try {
    ok(res, product.resubmitProduct(req.actor, req.params.id, req.body || {}), '已重新提交审核');
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------- UC-09 收藏 */
router.get('/me/favorites', (req, res, next) => {
  try {
    ok(res, favorite.myFavorites(req.actor));
  } catch (err) {
    next(err);
  }
});

router.post('/favorites', (req, res, next) => {
  try {
    ok(res, favorite.addFavorite(req.actor, req.body?.productId), '已收藏');
  } catch (err) {
    next(err);
  }
});

router.delete('/favorites/:productId', (req, res, next) => {
  try {
    ok(res, favorite.removeFavorite(req.actor, req.params.productId), '已取消收藏');
  } catch (err) {
    next(err);
  }
});

export default router;
