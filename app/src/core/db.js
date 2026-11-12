/**
 * 数据库访问层（node:sqlite 内置驱动，零第三方原生依赖）。
 *
 * 事务与并发：所有关键业务动作（下单成交 BR-06、撤销 ST-10、扣分 BR-14、
 * 封禁联动 ST-13）都包在 tx() 内。驱动为同步 API 且 Node 单线程，
 * 因此事务临界区不会被其它请求插入 —— 天然满足 §5.5 第 7 条
 * 「并发以服务端先成功者为准」，另外数据库层还有唯一索引兜底
 * （ux_orders_one_valid 保证同商品最多 1 条有效成交）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, ROOT } from './config.js';

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA synchronous = NORMAL;');

const stmtCache = new Map();
function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

/** node:sqlite 只接受 null / number / string / bigint / Uint8Array */
function normalize(args) {
  return args.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

export function get(sql, ...params) {
  return stmt(sql).get(...normalize(params)) ?? null;
}
export function all(sql, ...params) {
  return stmt(sql).all(...normalize(params));
}
export function run(sql, ...params) {
  return stmt(sql).run(...normalize(params));
}
export function pluck(sql, ...params) {
  const row = get(sql, ...params);
  if (!row) return null;
  return Object.values(row)[0];
}
export function count(sql, ...params) {
  return Number(pluck(sql, ...params) ?? 0);
}

let txDepth = 0;
/**
 * 串行事务。异常一律回滚，保证不出现半成品数据
 * （§6.4.1：不得留下「有成交记录但商品仍在售」之类的状态）。
 */
export function tx(fn) {
  if (txDepth > 0) {
    // 嵌套调用复用外层事务
    return fn();
  }
  db.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    txDepth--;
  }
}

export function initDb() {
  const schema = fs.readFileSync(path.join(ROOT, 'src', 'core', 'schema.sql'), 'utf8');
  db.exec(schema);
}

/** 单元测试 / 演示重置用：清空全部业务表 */
export function truncateAll() {
  const tables = [
    'messages', 'notifications', 'credit_records', 'reports', 'reviews', 'orders',
    'favorites', 'product_images', 'products', 'categories',
    'certification_applications', 'email_codes', 'sessions', 'audit_logs', 'students', 'admins'
  ];
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const t of tables) db.exec(`DELETE FROM ${t};`);
  db.exec('PRAGMA foreign_keys = ON;');
}
