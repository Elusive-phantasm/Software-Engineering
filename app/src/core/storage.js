/**
 * 图片落地存储（商品图 1～9 张、学生证图片）。
 *
 * 学生证图片属敏感个人信息（NFR-08）：落到 data/uploads/cert/ 下，
 * 文件名随机、不可枚举；只有「审核职责内的管理员」可通过专用接口读取，
 * 其它任何路由都不会返回其地址，也不进入日志与导出。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { L, UPLOAD_DIR } from './config.js';
import { E } from './errors.js';
import { M } from './errors.js';

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 保存 data URL 形式的图片。
 * @param {string} dataUrl 形如 data:image/png;base64,....
 * @param {'product'|'cert'} kind
 * @returns {string} 相对访问路径，如 /uploads/product/ab12.png
 */
export function saveDataUrl(dataUrl, kind = 'product') {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw E.validation('图片格式不支持，请上传 PNG / JPG / WEBP / GIF');
  const mime = m[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw E.validation('图片格式不支持，请上传 PNG / JPG / WEBP / GIF');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw E.validation('图片内容为空');
  if (buf.length > L.imageMaxBytes) throw E.validation('图片超过 5MB 上限，请压缩后重试');
  return writeBuffer(buf, ext, kind);
}

export function writeBuffer(buf, ext, kind = 'product') {
  const dir = path.join(UPLOAD_DIR, kind);
  ensureDir(dir);
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  const prefix = kind === 'cert' ? '/secure/cert' : '/uploads';
  return `${prefix}/${name}`;
}

/** 仅管理员审核时可读的绝对路径解析（NFR-08） */
export function certImagePath(relPath) {
  const name = path.basename(String(relPath || ''));
  const p = path.join(UPLOAD_DIR, 'cert', name);
  if (!name || !fs.existsSync(p)) throw E.notFound('学生证图片不存在');
  return p;
}

/** 商品图相对路径 → 磁盘路径 */
export function publicImagePath(relPath) {
  const name = path.basename(String(relPath || ''));
  const p = path.join(UPLOAD_DIR, 'product', name);
  if (!fs.existsSync(p)) throw E.notFound(M.PRODUCT_GONE);
  return p;
}

/** 预置演示图片：把 seed 内置的占位图写入 uploads/product */
export function seedImage(svgText, ext = 'svg') {
  const dir = path.join(UPLOAD_DIR, 'product');
  ensureDir(dir);
  const name = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), svgText);
  return `/uploads/${name}`;
}
