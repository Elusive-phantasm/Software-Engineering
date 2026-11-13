/**
 * 演示数据（种子）。
 * - ensureSeed()：首次启动时若无管理员则灌入，不覆盖已有数据；
 * - seed({reset:true})：清库重灌，供演示与验收测试使用。
 *
 * 演示账号（密码统一 Test@12345）：
 *   lin@campus.edu     林初仁  已认证 · 信用 100 · 有在售商品
 *   zhao@campus.edu    赵俊豪  已认证 · 信用 100 · 买家
 *   lv@campus.edu      吕锦浩  未提交核验（未认证）
 *   ma@campus.edu      马歆远  待审核（已提交学生证）
 *   guo@campus.edu     过振宇  已驳回（重提 1 次）
 *   ban@campus.edu     违规同学 已认证但账号封禁
 *   low@campus.edu     低信用同学 已认证 · 信用 55（不可发布）
 * 管理端：ADM-001 / Admin@12345
 */
import { CREDIT, UPLOAD_DIR } from '../core/config.js';
import { bizId, hashPassword } from '../core/crypto.js';
import fs from 'node:fs';
import path from 'node:path';
import { all, count, get, initDb, run, truncateAll } from '../core/db.js';
import { seedImage } from '../core/storage.js';
import { iso, nowMs } from '../core/time.js';
import { OFF_REASON, ORDER, P } from '../core/rules.js';

const DEMO_PASSWORD = 'Test@12345';
const ADMIN_PASSWORD = 'Admin@12345';

const ago = (hours) => iso(nowMs() - hours * 3600 * 1000);

const CATEGORIES = [
  ['CAT-01', '教材书籍', 1],
  ['CAT-02', '电子数码', 2],
  ['CAT-03', '生活用品', 3],
  ['CAT-04', '代步工具', 4],
  ['CAT-05', '运动户外', 5],
  ['CAT-06', '服饰鞋包', 6],
  ['CAT-07', '乐器文具', 7],
  ['CAT-08', '其他闲置', 8]
];

function svg(label, c1, c2) {
  const text = String(label).replace(/[<>&]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="660" viewBox="0 0 880 660">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="880" height="660" fill="url(#g)"/>
  <circle cx="720" cy="110" r="120" fill="#ffffff" opacity="0.08"/>
  <circle cx="140" cy="580" r="150" fill="#ffffff" opacity="0.06"/>
  <text x="440" y="300" font-size="40" font-family="Microsoft YaHei, PingFang SC, sans-serif"
        fill="#ffffff" text-anchor="middle" opacity="0.95">${text}</text>
  <text x="440" y="360" font-size="20" font-family="Microsoft YaHei, PingFang SC, sans-serif"
        fill="#ffffff" text-anchor="middle" opacity="0.6">拾光二手 · 校园闲置</text>
</svg>`;
}

function insertStudent({
  id, email, nickname, realName, certStatus, accountStatus = '正常',
  creditScore = CREDIT.initial, studentNo = null, resubmitCount = 0,
  phone = null, dorm = null, registeredHoursAgo = 240, reviewCount = 0, disputeCount = 0
}) {
  run(
    `INSERT INTO students
      (id, email, student_no, nickname, real_name, password_hash, registered_at, cert_status,
       account_status, phone, dorm, credit_score, review_count, verified_dispute_count,
       resubmit_count, failed_login_count, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
    id, email, studentNo, nickname, realName, hashPassword(DEMO_PASSWORD), ago(registeredHoursAgo),
    certStatus, accountStatus, phone, dorm, creditScore, reviewCount, disputeCount, resubmitCount,
    ago(registeredHoursAgo)
  );
}

function insertProduct({
  id, title, description, priceYuan, condition, sellerId, categoryId, status,
  offReason = null, publishedHoursAgo, viewCount = 0, reviewNote = null,
  imageLabel, colors = ['#165c46', '#2f8f6f']
}) {
  const path = seedImage(svg(imageLabel || title, colors[0], colors[1]));
  run(
    `INSERT INTO products
      (id, title, description, price_cents, condition, seller_id, category_id, status,
       off_shelf_reason, published_at, deleted_at, view_count, review_note, reviewed_by, reviewed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)`,
    id, title, description, Math.round(priceYuan * 100), condition, sellerId, categoryId, status,
    offReason, ago(publishedHoursAgo), viewCount, reviewNote,
    status === P.PENDING ? null : 'ADM-001',
    status === P.PENDING ? null : ago(publishedHoursAgo - 2)
  );
  run('INSERT INTO product_images (product_id, seq, path) VALUES (?,?,?)', id, 1, path);
}

export function seed({ reset = false } = {}) {
  initDb();
  if (reset) {
    truncateAll();
    // 清库重灌时一并清掉旧图片，否则每轮种子都会留下新的随机文件名图片，越积越多
    for (const sub of ['product', 'cert']) {
      const dir = path.join(UPLOAD_DIR, sub);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('time_offset_ms','0',?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    ago(0)
  );

  /* -------------------------------------------------------------- 分类 */
  for (const [id, name, sort] of CATEGORIES) {
    run('INSERT INTO categories (id, name, active, sort) VALUES (?,?,1,?)', id, name, sort);
  }

  /* -------------------------------------------------------------- 管理员 */
  run(
    `INSERT INTO admins (id, display_name, password_hash, must_change_password, failed_count, locked_until, created_at)
     VALUES (?,?,?,0,0,NULL,?)`,
    'ADM-001', '平台管理员', hashPassword(ADMIN_PASSWORD), ago(720)
  );

  /* ---------------------------------------------------------- 学生账号 */
  insertStudent({ id: 'STU-LIN', email: 'lin@campus.edu', nickname: '林同学', realName: '林初仁', certStatus: '已认证', studentNo: '20230101', phone: '13800000001', dorm: '紫荆 3 号楼 412', registeredHoursAgo: 720, reviewCount: 1, creditScore: 102 });
  insertStudent({ id: 'STU-ZHAO', email: 'zhao@campus.edu', nickname: '赵同学', realName: '赵俊豪', certStatus: '已认证', studentNo: '20230102', registeredHoursAgo: 700, reviewCount: 1, creditScore: 102 });
  insertStudent({ id: 'STU-LV', email: 'lv@campus.edu', nickname: '吕同学', realName: '吕锦浩', certStatus: '未提交', registeredHoursAgo: 10 });
  insertStudent({ id: 'STU-MA', email: 'ma@campus.edu', nickname: '马同学', realName: '马歆远', certStatus: '待审核', registeredHoursAgo: 60 });
  insertStudent({ id: 'STU-GUO', email: 'guo@campus.edu', nickname: '过同学', realName: '过振宇', certStatus: '已驳回', resubmitCount: 1, registeredHoursAgo: 200 });
  insertStudent({ id: 'STU-BAN', email: 'ban@campus.edu', nickname: '违规同学', realName: '某同学', certStatus: '已认证', accountStatus: '封禁', studentNo: '20230109', creditScore: 80, registeredHoursAgo: 600, disputeCount: 1 });
  insertStudent({ id: 'STU-LOW', email: 'low@campus.edu', nickname: '低信用同学', realName: '低信用', certStatus: '已认证', studentNo: '20230110', creditScore: 55, registeredHoursAgo: 500 });

  /* ------------------------------------------------ 认证申请（待审核 / 已驳回） */
  run(
    `INSERT INTO certification_applications
      (id, student_id, declared_no, card_image, submitted_at, review_status, reviewer_id, reviewed_at, reject_reason, forgery_flag)
     VALUES (?,?,?,?,?,?,NULL,NULL,NULL,0)`,
    'CERT-MA', 'STU-MA', '20230103', seedImage(svg('学生证 · 马歆远', '#1f3b73', '#3f6fb5'), 'svg'), ago(30), '待审核'
  );
  run(
    `INSERT INTO certification_applications
      (id, student_id, declared_no, card_image, submitted_at, review_status, reviewer_id, reviewed_at, reject_reason, forgery_flag)
     VALUES (?,?,?,?,?,?,?,?,?,0)`,
    'CERT-GUO', 'STU-GUO', '20230104', seedImage(svg('学生证 · 过振宇', '#1f3b73', '#3f6fb5'), 'svg'), ago(100), '已驳回',
    'ADM-001', ago(96), '证件照片模糊，姓名与申报学号不一致，请重新拍摄清晰证件页'
  );

  /* ---------------------------------------------------------------- 商品 */
  // 在售
  insertProduct({ id: 'PRD-001', title: '高等数学（第七版）上下册', description: '考研用完，无笔记，书角轻微磨损，内页干净。教材内印制的习题答案不算违规（§4.3.2 第 2 条）。', priceYuan: 35, condition: '九成新', sellerId: 'STU-LIN', categoryId: 'CAT-01', status: P.ON_SALE, publishedHoursAgo: 60, viewCount: 128, imageLabel: '高等数学 教材', colors: ['#165c46', '#2f8f6f'] });
  insertProduct({ id: 'PRD-002', title: 'iPad 9 代 64G WLAN 深空灰', description: '已恢复出厂设置并清除个人数据，不附带任何账号；来源为本人自购，附电子发票截图。', priceYuan: 1450, condition: '九成新', sellerId: 'STU-LIN', categoryId: 'CAT-02', status: P.ON_SALE, publishedHoursAgo: 30, viewCount: 342, imageLabel: 'iPad 9 代', colors: ['#22303c', '#4b6b7f'] });
  insertProduct({ id: 'PRD-003', title: '铝合金折叠书桌（宿舍用）', description: '毕业甩卖，桌面无划痕，可折叠收纳，需自提。宿舍允许使用的小功率用品。', priceYuan: 60, condition: '七成新', sellerId: 'STU-ZHAO', categoryId: 'CAT-03', status: P.ON_SALE, publishedHoursAgo: 20, viewCount: 87, imageLabel: '折叠书桌', colors: ['#5a3d24', '#8b6a45'] });
  insertProduct({ id: 'PRD-004', title: '捷安特通勤自行车', description: '骑了一年，刹车换过新件，链条上过油。可校内自提试骑。', priceYuan: 320, condition: '七成新', sellerId: 'STU-ZHAO', categoryId: 'CAT-04', status: P.ON_SALE, publishedHoursAgo: 12, viewCount: 156, imageLabel: '通勤自行车', colors: ['#123c34', '#2c7a63'] });
  insertProduct({ id: 'PRD-005', title: '雅马哈 FG800 民谣吉他', description: '入手两年，音准稳定，附琴包与拨片。弦已换新。', priceYuan: 620, condition: '九成新', sellerId: 'STU-LIN', categoryId: 'CAT-07', status: P.ON_SALE, publishedHoursAgo: 8, viewCount: 64, imageLabel: '民谣吉他', colors: ['#4a3520', '#8a6a3f'] });
  insertProduct({ id: 'PRD-006', title: '考研英语真题（2010-2024）', description: '做过一遍，答案用铅笔标记已擦除。仅含印刷内容，无他人手写答案。', priceYuan: 28, condition: '七成新', sellerId: 'STU-ZHAO', categoryId: 'CAT-01', status: P.ON_SALE, publishedHoursAgo: 5, viewCount: 41, imageLabel: '考研英语真题', colors: ['#2b3a55', '#5b7396'] });

  // 待审核
  insertProduct({ id: 'PRD-007', title: '罗技 MX Master 3 无线鼠标', description: '换新出，滚轮顺滑，附 Type-C 线。', priceYuan: 260, condition: '九成新', sellerId: 'STU-LIN', categoryId: 'CAT-02', status: P.PENDING, publishedHoursAgo: 3, viewCount: 0, imageLabel: '无线鼠标' });
  insertProduct({ id: 'PRD-008', title: '露营折叠椅两把', description: '只用过两次，承重正常，一起出。', priceYuan: 90, condition: '九成新', sellerId: 'STU-ZHAO', categoryId: 'CAT-05', status: P.PENDING, publishedHoursAgo: 26, viewCount: 0, imageLabel: '露营折叠椅' });

  // 已售出（有成交记录）
  insertProduct({ id: 'PRD-009', title: '人体工学椅（宿舍版）', description: '腰部支撑可调，八成新，成交后私信约取货。', priceYuan: 240, condition: '七成新', sellerId: 'STU-LIN', categoryId: 'CAT-03', status: P.SOLD, publishedHoursAgo: 200, viewCount: 233, imageLabel: '人体工学椅' });

  // 已下架（审核不通过，引用类目编号）
  insertProduct({ id: 'PRD-010', title: '宿舍热得快 1500W', description: '烧水很快，便宜出。', priceYuan: 15, condition: '其他', sellerId: 'STU-ZHAO', categoryId: 'CAT-03', status: P.OFF, offReason: OFF_REASON.REJECTED, publishedHoursAgo: 150, reviewNote: 'E1 违规大功率电器：热得快超出宿舍限电标准' });
  // 已下架（管理员违规下架）
  insertProduct({ id: 'PRD-011', title: '仿真玩具枪（水弹）', description: '收藏品，可发射水弹。', priceYuan: 80, condition: '九成新', sellerId: 'STU-BAN', categoryId: 'CAT-08', status: P.OFF, offReason: OFF_REASON.ADMIN_OFF, publishedHoursAgo: 300, reviewNote: 'A1 武器与管制器具：仿真枪（举报核实成立）' });
  // 已下架（卖家主动下架）
  insertProduct({ id: 'PRD-012', title: 'Nike 运动外套（L）', description: '尺码偏大，穿过几次。', priceYuan: 120, condition: '九成新', sellerId: 'STU-ZHAO', categoryId: 'CAT-06', status: P.OFF, offReason: OFF_REASON.SELLER_OFF, publishedHoursAgo: 240 });

  /* ---------------------------------------------------------------- 订单 */
  // 已成交（有效）
  run(
    `INSERT INTO orders (id, product_id, buyer_id, seller_id, amount_cents, created_at, status)
     VALUES (?,?,?,?,?,?,?)`,
    'ORD-001', 'PRD-009', 'STU-ZHAO', 'STU-LIN', 24000, ago(48), ORDER.VALID
  );
  // 已撤销（待判定，用于演示 7 天免责判定）
  insertProduct({ id: 'PRD-013', title: 'kindle 青春版 8G', description: '看书用，屏幕无坏点，附保护套。', priceYuan: 180, condition: '九成新', sellerId: 'STU-LIN', categoryId: 'CAT-02', status: P.ON_SALE, publishedHoursAgo: 90, viewCount: 51, imageLabel: 'Kindle 阅读器', colors: ['#333a4d', '#5c6785'] });
  run(
    `INSERT INTO orders (id, product_id, buyer_id, seller_id, amount_cents, created_at, status,
                         cancel_initiator_id, cancel_reason, cancelled_at, cancel_judgement, judgement_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`,
    'ORD-002', 'PRD-013', 'STU-ZHAO', 'STU-LIN', 18000, ago(40), ORDER.CANCELLED,
    'STU-ZHAO', '约不上时间', ago(20), '待判定'
  );

  /* ---------------------------------------------------------------- 评价 */
  // 一笔互评（双方均提交 → 可在主页展示）
  run(
    `INSERT INTO reviews (id, order_id, reviewer_id, target_id, content, created_at)
     VALUES (?,?,?,?,?,?)`,
    'REV-001', 'ORD-001', 'STU-ZHAO', 'STU-LIN', '椅子很结实，卖家按约定时间送到了楼下，沟通顺畅。', ago(40)
  );
  run(
    `INSERT INTO reviews (id, order_id, reviewer_id, target_id, content, created_at)
     VALUES (?,?,?,?,?,?)`,
    'REV-002', 'ORD-001', 'STU-LIN', 'STU-ZHAO', '买家很守时，付款爽快，推荐交易。', ago(39)
  );
  run(
    `INSERT INTO credit_records (id, student_id, delta, event_type, reason, created_at, order_id, source_key)
     VALUES (?,?,?,?,?,?,?,?)`,
    bizId('CR'), 'STU-ZHAO', 2, '评价加分', '提交交易评价', ago(40), 'ORD-001', 'review:ORD-001:STU-ZHAO'
  );
  run(
    `INSERT INTO credit_records (id, student_id, delta, event_type, reason, created_at, order_id, source_key)
     VALUES (?,?,?,?,?,?,?,?)`,
    bizId('CR'), 'STU-LIN', 2, '评价加分', '提交交易评价', ago(39), 'ORD-001', 'review:ORD-001:STU-LIN'
  );

  /* ---------------------------------------------------------------- 收藏 */
  run(
    'INSERT INTO favorites (id, student_id, product_id, created_at) VALUES (?,?,?,?)',
    bizId('FAV'), 'STU-ZHAO', 'PRD-002', ago(6)
  );
  run(
    'INSERT INTO favorites (id, student_id, product_id, created_at) VALUES (?,?,?,?)',
    bizId('FAV'), 'STU-ZHAO', 'PRD-012', ago(200)
  );

  /* ---------------------------------------------------------------- 举报 */
  run(
    `INSERT INTO reports (id, reporter_id, target_type, target_product_id, target_student_id, target_key,
                          type, reason, created_at, handle_status, actions, violation_codes, result,
                          handler_admin_id, handled_at)
     VALUES (?,?,?,?,NULL,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL)`,
    'RPT-001', 'STU-ZHAO', '商品', 'PRD-006', 'PRD-006', '虚假描述',
    '描述写「做过一遍答案已擦除」，但实物仍有大量铅笔印记，与描述不符。', ago(8), '待处理'
  );
  run(
    `INSERT INTO reports (id, reporter_id, target_type, target_product_id, target_student_id, target_key,
                          type, reason, created_at, handle_status, actions, violation_codes, result,
                          handler_admin_id, handled_at)
     VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?)`,
    'RPT-002', 'STU-ZHAO', '学生', 'STU-BAN', 'STU-BAN', '收款不履约',
    '约定线下转账后交货，对方收钱后失联，私信不再回复。', ago(72), '已处理',
    JSON.stringify(['警告', '封禁账号', '扣信用分']), null,
    '经核实私信与成交记录，收款不履约成立，已封禁账号并扣信用分。', 'ADM-001', ago(70)
  );

  /* ---------------------------------------------------------------- 私信 */
  run(
    `INSERT INTO messages (id, product_id, sender_id, sender_type, receiver_id, receiver_type, content, created_at, read_status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    bizId('PM'), 'PRD-002', 'STU-ZHAO', 'student', 'STU-LIN', 'student',
    '同学你好，iPad 还在吗？电池健康度大概多少？', ago(10), '已读'
  );
  run(
    `INSERT INTO messages (id, product_id, sender_id, sender_type, receiver_id, receiver_type, content, created_at, read_status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    bizId('PM'), 'PRD-002', 'STU-LIN', 'student', 'STU-ZHAO', 'student',
    '还在的，电池健康 92%，已经恢复出厂设置。你什么时候方便看实物？', ago(9), '已读'
  );
  run(
    `INSERT INTO messages (id, product_id, sender_id, sender_type, receiver_id, receiver_type, content, created_at, read_status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    bizId('PM'), 'PRD-002', 'STU-ZHAO', 'student', 'STU-LIN', 'student',
    '明天下午四点在图书馆西门可以吗？', ago(2), '未读'
  );
  // 违规下架异议会话（卖家 → 管理员）
  run(
    `INSERT INTO messages (id, product_id, sender_id, sender_type, receiver_id, receiver_type, content, created_at, read_status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    bizId('PM'), 'PRD-011', 'STU-BAN', 'student', 'ADM-001', 'admin',
    '管理员你好，我这把水弹枪只是收藏展示用，不发射，能否恢复上架？', ago(60), '未读'
  );

  /* ------------------------------------------------------------ 通知样例 */
  run(
    `INSERT INTO notifications (id, recipient_id, recipient_type, msg_type, title, content, created_at,
                                read_status, related_kind, related_id, product_id, peer_id)
     VALUES (?,?,?,?,?,?,?,'未读',?,?,?,?)`,
    bizId('MSG'), 'STU-LIN', 'student', '成交', '你的商品已成交',
    '《人体工学椅（宿舍版）》已被买家下单成交，成交金额 240.00 元。请在站内私信中与买家约定取货时间与地点。',
    ago(48), 'order', 'ORD-001', 'PRD-009', 'STU-ZHAO'
  );
  run(
    `INSERT INTO notifications (id, recipient_id, recipient_type, msg_type, title, content, created_at,
                                read_status, related_kind, related_id, product_id, peer_id)
     VALUES (?,?,?,?,?,?,?,'未读',?,?,?,?)`,
    bizId('MSG'), 'ADM-001', 'admin', '核验', '新的学生证核验申请',
    '学生「马同学」提交了核验申请（申报学号 20230103），请在 24 小时内审核。',
    ago(30), 'cert', 'CERT-MA', null, null
  );
  run(
    `INSERT INTO notifications (id, recipient_id, recipient_type, msg_type, title, content, created_at,
                                read_status, related_kind, related_id, product_id, peer_id)
     VALUES (?,?,?,?,?,?,?,'未读',?,?,?,NULL)`,
    bizId('MSG'), 'STU-GUO', 'student', '核验', '学生证核验未通过',
    '核验未通过。原因：证件照片模糊，姓名与申报学号不一致，请重新拍摄清晰证件页。',
    ago(96), 'cert', 'CERT-GUO'
  );

  return {
    categories: count('SELECT COUNT(*) FROM categories'),
    students: count('SELECT COUNT(*) FROM students'),
    products: count('SELECT COUNT(*) FROM products'),
    orders: count('SELECT COUNT(*) FROM orders'),
    reports: count('SELECT COUNT(*) FROM reports'),
    messages: count('SELECT COUNT(*) FROM messages')
  };
}

export function ensureSeed() {
  initDb();
  const existing = get('SELECT id FROM admins LIMIT 1');
  if (existing) return { skipped: true };
  console.log('[seed] 首次启动，灌入演示数据…');
  const result = seed({ reset: false });
  console.log('[seed] 完成：', JSON.stringify(result));
  return result;
}

/* 直接运行：node src/seed/seed.js --reset */
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/seed/seed.js');
if (isMain) {
  const reset = process.argv.includes('--reset');
  const result = seed({ reset });
  console.log(`[seed] 已${reset ? '清库重灌' : '灌入'}：`, JSON.stringify(result, null, 2));
  console.log(`[seed] 学生演示账号密码：${DEMO_PASSWORD}    管理员：ADM-001 / ${ADMIN_PASSWORD}`);
}
