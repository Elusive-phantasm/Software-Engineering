/**
 * Express 应用装配。
 * 路由顺序很重要：学生端与管理端共用的登录路由先挂载，
 * 之后才挂 /api/admin（其内部统一 requireAdmin）。
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './core/config.js';
import { publicImagePath } from './core/storage.js';
import { attachActor, devOnly, errorHandler } from './http/middleware.js';
import authRoutes from './http/routes/auth.routes.js';
import productRoutes from './http/routes/product.routes.js';
import verificationRoutes from './http/routes/verification.routes.js';
import orderRoutes from './http/routes/order.routes.js';
import socialRoutes from './http/routes/social.routes.js';
import adminRoutes from './http/routes/admin.routes.js';
import devRoutes from './http/routes/dev.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '40mb' }));
  app.use(attachActor);

  /* ------------------------------------------------------------ 静态资源 */
  // 前端资源不设强缓存：本地演示与改码后避免浏览器命中旧的 student.js，导致“修好了却看不到”
  app.use(
    '/assets',
    express.static(path.join(ROOT, 'public', 'assets'), {
      etag: true,
      lastModified: true,
      maxAge: 0,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
    })
  );
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
  app.get(['/admin', '/admin/', '/admin.html'], (req, res) =>
    res.sendFile(path.join(ROOT, 'public', 'admin.html'))
  );

  /** 商品图片（公开） */
  app.get('/uploads/:name', (req, res, next) => {
    try {
      const abs = publicImagePath(req.params.name);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(abs).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- API */
  app.use('/api', authRoutes);
  app.use('/api', productRoutes);
  app.use('/api', verificationRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', socialRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/dev', devOnly(config), devRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '接口不存在' });
  });

  /* ------------------------------------------------------- SPA 前端回退 */
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(ROOT, 'public', 'index.html'));
  });

  app.use(errorHandler);
  return app;
}
