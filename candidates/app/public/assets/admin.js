/**
 * 拾光二手 · 管理后台（学生端同源的零构建原生模块）
 *
 * 用例覆盖：UC-03 审核学生证、UC-04 管理员登录、UC-06 审核商品、
 *          UC-13 处理举报与违规处置、UC-18 消息通知、UC-30 处置异议会话
 */
import {
  h, mount, icon, toast, modal, confirmDialog, dt, timeAgo, money,
  badge, statusBadge, empty, loading, field, errorBox, handleError
} from './ui.js';
import { apiGet, apiPost, fetchMe, setMe, clearMe, qs } from './api.js';

const S = { me: { kind: 'guest' }, meta: null, counts: {} };
const app = () => document.getElementById('app');
let currentRoute = '#/dashboard';

/* ==================================================================== 布局 */
function sidebar() {
  const link = (href, label, iconName, pill) =>
    h(
      'a',
      { class: `side-link ${currentRoute === href ? 'active' : ''}`, href },
      icon(iconName, 16),
      h('span', { text: label }),
      pill ? h('span', { class: 'pill', text: String(pill) }) : null
    );
  return h(
    'aside',
    { class: 'sidebar' },
    h('div', { class: 'side-group', text: '审核队列' }),
    link('#/certifications', '学生证审核', 'shield', S.counts.pendingCert || ''),
    link('#/products', '商品审核', 'bag', S.counts.pendingProducts || ''),
    link('#/reports', '举报处置', 'flag', S.counts.pendingReports || ''),
    h('div', { class: 'side-group', text: '平台治理' }),
    link('#/students', '学生与账号', 'user'),
    link('#/off-shelf', '违规下架', 'alert'),
    link('#/messages', '处置异议会话', 'chat', S.counts.pendingAdminMsgs || ''),
    h('div', { class: 'side-group', text: '系统' }),
    link('#/orders', '成交记录', 'list'),
    link('#/audit', '审计日志', 'doc'),
    link('#/dashboard', '数据看板', 'home')
  );
}

function topbar() {
  return h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      h(
        'a',
        { class: 'brand', href: '#/dashboard' },
        h('span', { class: 'brand-logo' }, icon('shield', 19)),
        h('span', {}, h('span', { class: 'brand-name', text: '拾光二手' }), h('span', { class: 'brand-sub', text: 'ADMIN CONSOLE' }))
      ),
      h('nav', { class: 'nav' }, h('a', { href: '/', text: '← 回到学生端' })),
      h(
        'div',
        { class: 'topbar-actions' },
        h('span', { class: 'chip-cert' }, icon('user', 13), S.me.admin?.displayName || '管理员'),
        S.me.admin?.mustChangePassword
          ? h('span', { class: 'badge badge-red', text: '请修改初始密码' })
          : null,
        h('button', { class: 'btn btn-sm', onClick: () => changePasswordDialog() }, '修改密码'),
        h('button', {
          class: 'btn btn-sm',
          onClick: async () => {
            await apiPost('/api/auth/logout');
            clearMe();
            S.me = { kind: 'guest' };
            location.hash = '#/login';
          }
        }, '退出')
      )
    )
  );
}

function shell(content) {
  mount(app(), topbar(), h('div', { class: 'admin-shell' }, sidebar(), h('main', { class: 'admin-main' }, content)));
}

/** UC-04 主事件流第 4 步：首登或重置后强制修改初始密码 */
function changePasswordDialog() {
  const oldInput = h('input', { class: 'input', type: 'password', placeholder: '当前密码' });
  const newInput = h('input', { class: 'input', type: 'password', placeholder: '新密码：至少 8 位且含字母与数字' });
  const repeatInput = h('input', { class: 'input', type: 'password', placeholder: '再次输入新密码' });
  const m = modal({
    title: '修改管理员密码',
    body: h('div', {},
      field('当前密码', oldInput, '', true),
      field('新密码', newInput, '不得与当前密码相同', true),
      field('确认新密码', repeatInput, '', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          if (newInput.value !== repeatInput.value) return toast('两次输入的新密码不一致', 'warn');
          try {
            await apiPost('/api/admin/auth/change-password', {
              oldPassword: oldInput.value,
              newPassword: newInput.value
            });
            m.close();
            toast('密码已修改', 'ok');
            S.me = await fetchMe(true);
            router();
          } catch (err) {
            handleError(err);
          }
        }
      }, '保存')
    ]
  });
}

function pageHead(title, sub, actions = []) {
  return h(
    'div',
    { class: 'admin-head' },
    h('div', {}, h('div', { class: 'admin-h1', text: title }), sub ? h('div', { class: 'text-sm text-muted', text: sub }) : null),
    h('div', { class: 'row', style: { gap: '8px' } }, ...actions)
  );
}

async function withLoading(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED' || err.code === 'PERMISSION_DENIED') {
      location.hash = '#/login';
      return;
    }
    throw err;
  }
}

/* ================================================================== 登录页 */
function loginView() {
  const state = { adminId: 'ADM-001', password: '' };
  const errWrap = h('div', {});
  mount(
    app(),
    h(
      'div',
      { class: 'auth-wrap' },
      h(
        'div',
        { class: 'auth-card card card-pad' },
        h('div', { class: 'auth-title', text: '管理后台登录' }),
        h('div', { class: 'auth-sub', text: '管理员账号由系统预置，不开放注册；管理员不经过学生证核验' }),
        h('div', { class: 'mt-3' }, errWrap),
        field('管理员编号', h('input', { class: 'input', value: state.adminId, onInput: (e) => { state.adminId = e.target.value.trim(); } }), '', true),
        field('密码', h('input', {
          class: 'input', type: 'password', placeholder: '请输入密码',
          onKeydown: (e) => { if (e.key === 'Enter') doLogin(); },
          onInput: (e) => { state.password = e.target.value; }
        }), '', true),
        h('button', { class: 'btn btn-primary btn-lg btn-block', onClick: doLogin }, '登录后台'),
        h('div', { class: 'text-xs text-muted mt-2', html: '演示账号：<b>ADM-001</b> / <b>Admin@12345</b>；连续失败 5 次锁定 15 分钟（NFR-05）' }),
        h('div', { class: 'text-sm mt-2 center' }, h('a', { href: '/', style: { color: 'var(--brand)' }, text: '← 回到学生端' }))
      )
    )
  );

  async function doLogin() {
    errWrap.innerHTML = '';
    try {
      await apiPost('/api/admin/auth/login', { adminId: state.adminId, password: state.password });
      setMe(null);
      S.me = await fetchMe(true);
      toast('登录成功', 'ok');
      location.hash = '#/dashboard';
      router(true);
    } catch (err) {
      errWrap.innerHTML = '';
      errWrap.appendChild(errorBox(err.message));
    }
  }
}

/* ================================================================== 看板 */
async function dashboardView() {
  const d = await apiGet('/api/admin/dashboard');
  S.counts = {
    pendingCert: d.students.pendingCert,
    pendingProducts: d.products.pending,
    pendingReports: d.reports.pending,
    pendingAdminMsgs: d.messages.pendingAdmin
  };
  const kpi = (num, label, warn = false) =>
    h('div', { class: `kpi ${warn ? 'warn' : ''}` }, h('div', { class: 'k-num', text: String(num) }), h('div', { class: 'k-label', text: label }));

  shell(
    h('div', {},
      pageHead('数据看板', 'BR-12：成交笔数与金额以成交记录去重统计；技术口径之外不夸大'),
      h('div', { class: 'kpi-grid' },
        kpi(d.students.total, '注册学生'),
        kpi(d.students.certified, '已认证'),
        kpi(d.students.pendingCert, '待审核核验', true),
        kpi(d.students.banned, '封禁账号', true),
        kpi(d.products.onSale, '在售商品'),
        kpi(d.products.pending, '待审核商品', true),
        kpi(d.products.sold, '已售出'),
        kpi(d.products.off, '已下架'),
        kpi(d.orders.valid, '有效成交笔数'),
        kpi(d.orders.cancelled, '已撤销成交', true),
        kpi(`¥${d.orders.amountValidYuan}`, '有效成交金额'),
        kpi(d.reports.pending, '待处理举报', true)
      ),
      h('div', { class: 'card mt-3' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: '平台边界（答辩要点）' })),
        h('div', { class: 'card-body text-sm', style: { lineHeight: '1.9', color: 'var(--ink-2)' } },
          h('div', {}, '· 平台完全不涉及资金：不托管、不代收、不记录收款状态，也不采集任何支付信息（BR-07）。'),
          h('div', {}, '· 平台不做交付确认：成交只是「下单成功」，取货由双方在站内私信约定，平台不记录交付事实。'),
          h('div', {}, '· 平台不展示、不转交手机号与宿舍地址，即使成交对家也看不到（NFR-04）。'),
          h('div', {}, '· 成交撤销是本版唯一的「已售出」出口：单方即时生效，对方 7 天内可判免责或计违约（BR-21）。')
        )
      ),
      h('div', { class: 'card mt-3' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: '快捷处理' })),
        h('div', { class: 'card-body row', style: { gap: '10px', flexWrap: 'wrap' } },
          h('a', { class: 'btn btn-primary', href: '#/certifications' }, `学生证审核（${d.students.pendingCert}）`),
          h('a', { class: 'btn', href: '#/products' }, `商品审核（${d.products.pending}）`),
          h('a', { class: 'btn', href: '#/reports' }, `举报处置（${d.reports.pending}）`),
          h('a', { class: 'btn', href: '#/students' }, '学生与账号')
        )
      )
    )
  );
}

/* ============================================================ UC-03 学生证审核 */
async function certificationsView() {
  const list = await apiGet('/api/admin/verifications?status=待审核');
  const rows = list.map((a) =>
    h('tr', {},
      h('td', {},
        h('div', { style: { fontWeight: '600' }, text: a.nickname }),
        h('div', { class: 'text-xs text-muted', text: `${a.realName} · ${a.email}` })
      ),
      h('td', { class: 'mono', text: a.declaredNo }),
      h('td', {},
        h('a', {
          class: 'btn btn-sm',
          href: 'javascript:void(0)',
          onClick: () => showCertImage(a)
        }, icon('eye', 14), '查看学生证')
      ),
      h('td', {},
        h('div', { class: 'text-xs', text: dt(a.submittedAt) }),
        h('div', { class: 'text-xs text-muted', text: `重提 ${a.resubmitCount} 次` })
      ),
      h('td', {},
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'btn btn-sm btn-primary', onClick: () => approveCert(a) }, '通过'),
          h('button', { class: 'btn btn-sm btn-danger', onClick: () => rejectCert(a) }, '驳回')
        )
      )
    )
  );

  shell(
    h('div', {},
      pageHead('学生证审核', '核对「证件姓名 ↔ 账号真实姓名」「证件学号 ↔ 本次申报学号」；24 小时未出结论只提醒，不自动通过（AT-06）', [
        h('button', { class: 'btn btn-sm', onClick: () => certificationsView() }, icon('list', 14), '刷新')
      ]),
      h('div', { class: 'card' },
        list.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '申请人' }), h('th', { text: '申报学号' }), h('th', { text: '证件' }), h('th', { text: '提交时间' }), h('th', { text: '操作' }))),
              h('tbody', {}, rows)
            )
          : empty('没有待审核的核验申请', '学生提交核验后会出现在这里')
      ),
      h('div', { class: 'card card-pad mt-3' },
        h('div', { class: 'card-title mb-2', text: '审核口径' }),
        h('div', { class: 'text-sm text-muted', style: { lineHeight: '1.9' } },
          h('div', {}, '· 通过：证件姓名与账号真实姓名一致、证件学号与申报学号一致且图片清晰 → 认证状态置「已认证」，学号写入学生实体并全局唯一锁定。'),
          h('div', {}, '· 驳回：不一致 / 模糊 / 信息不全 → 认证状态置「已驳回」，重提次数 +1（上限 3 次，BR-17）。'),
          h('div', {}, '· 疑似伪造、拼接、冒用：勾选「疑似伪造」后驳回 → 按 BR-18 必须封禁账号，并连带下架其在售与待审核商品（ST-13）。'),
          h('div', {}, '· 认证状态与账号状态分开记录：核验通过不解封，封禁也不撤销认证（BR-19）。')
        )
      )
    )
  );
}

function showCertImage(a) {
  modal({
    title: `学生证 · ${a.nickname}`,
    wide: true,
    body: h('div', {},
      h('div', { class: 'form-ok', text: '学生证图片属敏感个人信息：仅审核职责内的管理员可见，且不进入日志、导出与审计正文（NFR-08）' }),
      h('img', { src: `/api/admin/verifications/${a.id}/image`, alt: '学生证', style: { width: '100%', borderRadius: '10px', border: '1px solid var(--line)' } }),
      h('dl', { class: 'kv mt-2' },
        h('dt', { text: '账号昵称' }), h('dd', { text: a.nickname }),
        h('dt', { text: '真实姓名' }), h('dd', { text: a.realName }),
        h('dt', { text: '申报学号' }), h('dd', { class: 'mono', text: a.declaredNo }),
        h('dt', { text: '提交时间' }), h('dd', { text: dt(a.submittedAt) })
      )
    )
  });
}

async function approveCert(a) {
  if (!(await confirmDialog({ title: '通过核验', message: `确认「${a.realName}」的证件与申报学号 ${a.declaredNo} 一致且清晰可辨？通过后该学号将与该账号绑定。`, okText: '通过' }))) return;
  try {
    await apiPost(`/api/admin/verifications/${a.id}/approve`);
    toast('已通过核验', 'ok');
    certificationsView();
  } catch (err) {
    handleError(err);
  }
}

function rejectCert(a) {
  const ta = h('textarea', { class: 'textarea', maxlength: 200, placeholder: '请填写驳回原因（会展示给学生，1～200 字）' });
  const forgery = h('input', { type: 'checkbox' });
  const m = modal({
    title: `驳回核验 · ${a.nickname}`,
    body: h('div', {},
      field('驳回原因', ta, '学生将看到该原因，并可修改后重新提交（剩余次数按 BR-17 计算）', true),
      h('label', { class: 'checkbox' }, forgery, h('span', { text: '疑似伪造 / 拼接 / 冒用他人证件（勾选后按 BR-18 必须封禁账号并联动下架商品）' })),
      h('div', { class: 'form-error mt-2', text: '注意：勾选伪造将同时执行封禁账号 + 下架其在售与待审核商品（ST-13），不可只改认证状态。' })
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-danger',
        onClick: async () => {
          try {
            await apiPost(`/api/admin/verifications/${a.id}/reject`, { reason: ta.value.trim(), forgery: forgery.checked });
            m.close();
            toast(forgery.checked ? '已驳回并封禁账号、联动下架商品' : '已驳回', 'ok');
            certificationsView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '确认驳回')
    ]
  });
}

/* ============================================================= UC-06 商品审核 */
async function productsView() {
  const [pending, meta] = await Promise.all([apiGet('/api/admin/products?status=待审核'), getMeta()]);
  const rows = pending.map((p) =>
    h('tr', {},
      h('td', {},
        h('div', { class: 'row', style: { gap: '8px' } },
          p.images?.[0] ? h('img', { src: p.images[0], style: { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' } }) : null,
          h('div', {},
            h('a', { href: `/p/${p.id}`, style: { fontWeight: '600' }, text: p.title }),
            h('div', { class: 'text-xs text-muted', text: `${p.categoryName} · ${p.condition} · ${money(p.price)}` })
          )
        )
      ),
      h('td', { style: { maxWidth: '260px' } }, h('div', { class: 'text-xs', text: p.description?.slice(0, 90) + (p.description?.length > 90 ? '…' : '') })),
      h('td', {},
        h('div', { class: 'text-xs', text: dt(p.publishedAt) }),
        h('div', { class: 'text-xs', style: { color: (p.waitingHours || 0) >= 24 ? 'var(--danger)' : 'var(--muted)' }, text: `已等待 ${p.waitingHours || 0} 小时` })
      ),
      h('td', {},
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'btn btn-sm btn-primary', onClick: () => approveProduct(p) }, '通过'),
          h('button', { class: 'btn btn-sm btn-danger', onClick: () => rejectProduct(p, meta) }, '不通过'),
          h('button', { class: 'btn btn-sm', onClick: () => forceOff(p, meta) }, '违规下架')
        )
      )
    )
  );

  shell(
    h('div', {},
      pageHead('商品审核', '逐项比对 §4.3 禁售品类清单（A1–E2 共 18 类）；驳回原因必须引用类目编号', [
        h('button', { class: 'btn btn-sm', onClick: () => showForbidden(meta) }, icon('doc', 14), '查看禁售清单'),
        h('button', { class: 'btn btn-sm', onClick: () => productsView() }, icon('list', 14), '刷新')
      ]),
      h('div', { class: 'card' },
        pending.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '商品' }), h('th', { text: '描述' }), h('th', { text: '提交时间' }), h('th', { text: '操作' }))),
              h('tbody', {}, rows)
            )
          : empty('没有待审核商品', '卖家发布后进入该队列')
      ),
      h('div', { class: 'card card-pad mt-3' },
        h('div', { class: 'card-title mb-2', text: '判定口径（§4.3.2）' }),
        h('div', { class: 'text-sm text-muted', style: { lineHeight: '1.9' } },
          h('div', {}, '1. 以物品主体判定，不以卖家声明的用途判定。'),
          h('div', {}, '2. 教材与教辅允许售卖，但不得随附他人已填写的作业、实验报告或考试答案。'),
          h('div', {}, '3. 二手电子产品允许售卖（须已清除个人数据、不随附他人账号、说明来源与权属），不得仅凭「二手」驳回。'),
          h('div', {}, '4. 虚拟类商品一律禁止（账号、卡券、代练代刷、游戏币）。'),
          h('div', {}, '5. 清单为闭集，管理员不得自行扩容；清单外明显违规标注「清单外待裁定」并提交组长。')
        )
      )
    )
  );
}

async function getMeta() {
  if (!S.meta) S.meta = await apiGet('/api/admin/meta');
  return S.meta;
}

function showForbidden(meta) {
  modal({
    title: '§4.3 禁售品类清单（闭集 18 类）',
    wide: true,
    body: h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', { text: '编号' }), h('th', { text: '类目' }), h('th', { text: '典型物品' }), h('th', { text: '禁售原因' }))),
      h('tbody', {}, meta.forbiddenCategories.map((c) =>
        h('tr', {},
          h('td', { class: 'mono', text: c.code }),
          h('td', { text: c.name }),
          h('td', { class: 'text-xs', text: c.examples }),
          h('td', { class: 'text-xs', text: c.why })
        )
      ))
    )
  });
}

async function approveProduct(p) {
  if (!(await confirmDialog({ title: '审核通过', message: `确认《${p.title}》符合 §4.3 清单且信息完整？通过后立即对外展示。`, okText: '通过' }))) return;
  try {
    await apiPost(`/api/admin/products/${p.id}/approve`);
    toast('已通过，商品已上架', 'ok');
    productsView();
  } catch (err) {
    handleError(err);
  }
}

function rejectProduct(p, meta) {
  const codeSelect = h('select', { class: 'select' }, meta.forbiddenCategories.map((c) => h('option', { value: c.code, text: `${c.code} ${c.name}` })));
  const ta = h('textarea', { class: 'textarea', maxlength: 200, placeholder: '具体违规说明（会与类目编号一起展示给卖家）' });
  const m = modal({
    title: `审核不通过 · ${p.title}`,
    body: h('div', {},
      field('命中类目（§4.3）', codeSelect, '驳回原因必须引用类目编号，不得只写「其他违规」', true),
      field('补充说明', ta, '1～200 字', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-danger',
        onClick: async () => {
          try {
            await apiPost(`/api/admin/products/${p.id}/reject`, { categoryCode: codeSelect.value, reason: ta.value.trim() });
            m.close();
            toast('已驳回，商品转为「已下架（审核不通过）」', 'ok');
            productsView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '确认驳回')
    ]
  });
}

function forceOff(p, meta) {
  const codeSelect = h('select', { class: 'select' }, meta.forbiddenCategories.map((c) => h('option', { value: c.code, text: `${c.code} ${c.name}` })));
  const ta = h('textarea', { class: 'textarea', placeholder: '处置理由（会通知卖家，并可被卖家在私信中就其提出异议）' });
  const m = modal({
    title: `违规下架 · ${p.title}`,
    body: h('div', {},
      h('div', { class: 'form-error', text: '强制下架将按 BR-14 ② 扣卖家信用分 −10 并写信用记录（ST-07），操作需留痕。' }),
      field('命中类目（§4.3）', codeSelect, '', true),
      field('处置理由', ta, '1～200 字', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-danger',
        onClick: async () => {
          try {
            await apiPost(`/api/admin/products/${p.id}/force-off`, { reason: ta.value.trim(), categoryCode: codeSelect.value });
            m.close();
            toast('已强制下架并扣信用分', 'ok');
            productsView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '确认下架')
    ]
  });
}

/* ============================================================ UC-13 举报处置 */
async function reportsView() {
  const [list, meta] = await Promise.all([apiGet('/api/admin/reports?status=待处理'), getMeta()]);
  const rows = list.map((r) =>
    h('tr', {},
      h('td', {},
        h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
          badge(r.targetType === '商品' ? '对商品' : '对学生', r.targetType === '商品' ? 'blue' : 'amber'),
          badge(r.type, 'red')
        ),
        h('div', { class: 'text-xs text-muted', text: `举报人 ${r.reporterNickname} · ${dt(r.createdAt)}` })
      ),
      h('td', {},
        h('div', { style: { fontWeight: '600' }, text: r.targetProductTitle || r.targetStudentNickname || '—' }),
        h('div', { class: 'text-xs text-muted', text: r.targetProductStatus ? `商品状态：${r.targetProductStatus}` : '' })
      ),
      h('td', { style: { maxWidth: '280px' } }, h('div', { class: 'text-xs', text: r.reason })),
      h('td', {},
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'btn btn-sm btn-primary', onClick: () => handleReport(r, meta, true) }, '核实成立'),
          h('button', { class: 'btn btn-sm', onClick: () => handleReport(r, meta, false) }, '不成立')
        )
      )
    )
  );

  shell(
    h('div', {},
      pageHead('举报处置', '举报成立后方可处置：处置手段固定五项；对象为学生的举报不含「强制下架商品」；收款不履约成立应同时封禁'),
      h('div', { class: 'card' },
        list.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '举报' }), h('th', { text: '对象' }), h('th', { text: '说明' }), h('th', { text: '处理' }))),
              h('tbody', {}, rows)
            )
          : empty('没有待处理举报', '学生提交举报后会进入该队列')
      )
    )
  );
}

function handleReport(r, meta, upheld) {
  const allowed = meta.reportTypesByTarget[r.targetType] || meta.actions;
  const actionChecks = meta.actions
    .filter((a) => r.targetType === '商品' || a !== '强制下架商品')
    .map((a) => ({ a, el: h('input', { type: 'checkbox' }) }));
  const codeSelect = h('select', { class: 'select' },
    h('option', { value: '', text: '（不引用类目编号）' }),
    meta.forbiddenCategories.map((c) => h('option', { value: c.code, text: `${c.code} ${c.name}` }))
  );
  const ta = h('textarea', { class: 'textarea', maxlength: 500, placeholder: upheld ? '处理结论（会通知双方）' : '不成立的理由（会通知举报人）' });

  const m = modal({
    title: `${upheld ? '核实成立并处置' : '举报不成立'} · ${r.id}`,
    wide: true,
    body: h('div', {},
      h('dl', { class: 'kv', style: { gridTemplateColumns: '96px 1fr' } },
        h('dt', { text: '对象类型' }), h('dd', { text: r.targetType }),
        h('dt', { text: '对象' }), h('dd', { text: r.targetProductTitle || r.targetStudentNickname || '—' }),
        h('dt', { text: '举报类型' }), h('dd', { text: `${r.type}（可选类型：${allowed.join(' / ')}）` }),
        h('dt', { text: '举报说明' }), h('dd', { text: r.reason })
      ),
      h('div', { class: 'divider' }),
      upheld
        ? h('div', {},
            h('div', { class: 'card-title mb-2', text: '处置手段（可多选）' }),
            h('div', { class: 'col', style: { gap: '6px' } },
              actionChecks.map(({ a, el }) => h('label', { class: 'checkbox' }, el, h('span', { text: a })))
            ),
            h('div', { class: 'text-xs text-muted mt-1', text: '说明：勾「强制下架商品」或「扣信用分」将扣被处置方 −10 分（每份举报最多扣一次）；勾「封禁账号」会同一动作内联动下架其在售与待审核商品（BR-10、ST-13）。' }),
            h('div', { class: 'mt-2' }, field('命中类目（§4.3，违禁品类举报建议填写）', codeSelect))
          )
        : h('div', { class: 'form-ok', text: '不成立：标记「已驳回」，不产生任何处置记录、不扣分、不公开（UC-13 辅事件流 H）。' }),
      field('处理结论', ta, '1～500 字', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: `btn ${upheld ? 'btn-danger' : 'btn-primary'}`,
        onClick: async () => {
          try {
            await apiPost(`/api/admin/reports/${r.id}/handle`, {
              upheld,
              actions: actionChecks.filter((x) => x.el.checked).map((x) => x.a),
              result: ta.value.trim(),
              categoryCode: codeSelect.value || null
            });
            m.close();
            toast('举报已处理', 'ok');
            reportsView();
          } catch (err) {
            handleError(err);
          }
        }
      }, upheld ? '确认处置' : '确认驳回')
    ]
  });
}

/* ============================================================ 学生与账号管理 */
async function studentsView(keyword = '') {
  const list = await apiGet(`/api/admin/students${qs({ keyword })}`);
  const searchInput = h('input', { class: 'input', style: { width: '220px' }, placeholder: '昵称 / 邮箱 / 学号', value: keyword });

  shell(
    h('div', {},
      pageHead('学生与账号', '账号状态（正常 / 受限 / 封禁）与认证状态相互独立；封禁须连带下架在售与待审核商品（BR-10、BR-19）', [
        searchInput,
        h('button', {
          class: 'btn btn-sm',
          onClick: () => studentsView(searchInput.value.trim())
        }, icon('search', 14), '搜索')
      ]),
      h('div', { class: 'card' },
        list.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '学生' }), h('th', { text: '认证状态' }), h('th', { text: '账号状态' }), h('th', { class: 'num', text: '信用分' }), h('th', { class: 'num', text: '争议' }), h('th', { text: '操作' }))),
              h('tbody', {}, list.map((s) =>
                h('tr', {},
                  h('td', {},
                    h('div', { style: { fontWeight: '600' }, text: s.nickname }),
                    h('div', { class: 'text-xs text-muted', text: `${s.realName} · ${s.email} · 学号 ${s.studentNo || '—'}` })
                  ),
                  h('td', {}, badge(s.certStatus, s.certStatus === '已认证' ? 'green' : s.certStatus === '已驳回' ? 'red' : 'amber')),
                  h('td', {}, badge(s.accountStatus, s.accountStatus === '正常' ? 'green' : 'red')),
                  h('td', { class: 'num', text: String(s.creditScore) }),
                  h('td', { class: 'num', text: String(s.verifiedDisputeCount) }),
                  h('td', {}, h('button', { class: 'btn btn-sm', onClick: () => studentDetail(s) }, '详情 / 处置'))
                )
              ))
            )
          : empty('没有匹配的学生')
      )
    )
  );
}

async function studentDetail(s) {
  const d = await apiGet(`/api/admin/students/${s.id}`);
  const reasonInput = h('input', { class: 'input', placeholder: '处置理由（必填，会通知该学生）' });
  const reviewsWrap = h('div', {});
  const m = modal({
    title: `学生：${d.nickname}`,
    wide: true,
    body: h('div', {},
      h('dl', { class: 'kv', style: { gridTemplateColumns: '110px 1fr' } },
        h('dt', { text: '邮箱' }), h('dd', { text: d.email }),
        h('dt', { text: '真实姓名' }), h('dd', { text: d.realName }),
        h('dt', { text: '学号' }), h('dd', { class: 'mono', text: d.studentNo || '—（未绑定）' }),
        h('dt', { text: '认证状态' }), h('dd', { text: d.certStatus }),
        h('dt', { text: '账号状态' }), h('dd', { text: d.accountStatus }),
        h('dt', { text: '信用分' }), h('dd', { text: String(d.creditScore) }),
        h('dt', { text: '评价 / 争议' }), h('dd', { text: `${d.reviewCount} / ${d.verifiedDisputeCount}` }),
        h('dt', { text: '登录失败' }), h('dd', { text: `${d.failedLoginCount} 次${d.lockedUntil ? ` · 锁定至 ${dt(d.lockedUntil)}` : ''}` }),
        h('dt', { text: '手机号 / 宿舍' }), h('dd', { class: 'text-xs', text: `${d.phone || '未填写'} / ${d.dorm || '未填写'}（最小必要原则查看）` })
      ),
      h('div', { class: 'divider' }),
      h('div', { class: 'card-title mb-2', text: '账号处置' }),
      field('处置理由', reasonInput, '封禁会同时下架其在售与待审核商品（ST-13），并通知学生', true),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-danger', onClick: () => setStatus('封禁') }, '封禁账号'),
        h('button', { class: 'btn', onClick: () => setStatus('受限') }, '限制账号'),
        h('button', { class: 'btn', onClick: () => setStatus('正常') }, '恢复正常'),
        h('button', { class: 'btn', onClick: () => adjustCredit() }, '调整信用分'),
        d.certStatus === '已认证'
          ? h('button', { class: 'btn btn-danger', onClick: () => revokeCert() }, '核实伪造·撤销认证')
          : null
      ),
      h('div', { class: 'divider' }),
      h('div', { class: 'card-title mb-2', text: '名下商品' }),
      d.products.length
        ? h('table', { class: 'table' }, h('tbody', {}, d.products.map((p) =>
            h('tr', {},
              h('td', {}, h('a', { href: `/p/${p.id}`, text: p.title })),
              h('td', { text: p.status }),
              h('td', { class: 'text-xs text-muted', text: p.offShelfReason || '' })
            )
          )))
        : h('div', { class: 'text-sm text-muted', text: '无' }),
      h('div', { class: 'divider' }),
      h('div', { class: 'card-title mb-2', text: '信用变动明细（仅管理员可见）' }),
      d.creditRecords.length
        ? h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, h('th', { text: '时间' }), h('th', { text: '事件' }), h('th', { class: 'num', text: '变动' }), h('th', { text: '原因' }))),
            h('tbody', {}, d.creditRecords.map((r) =>
              h('tr', {},
                h('td', { class: 'text-xs', text: dt(r.createdAt) }),
                h('td', { text: r.eventType }),
                h('td', { class: 'num', text: r.delta > 0 ? `+${r.delta}` : String(r.delta) }),
                h('td', { class: 'text-xs', text: r.reason })
              )
            ))
          )
        : h('div', { class: 'text-sm text-muted', text: '暂无记录' }),
      h('div', { class: 'divider' }),
      h('div', { class: 'card-title mb-2', text: '收到的评价（管理员可删除）' }),
      reviewsWrap
    )
  });

  /** 评价列表：依据 BR-04 的处置范围，管理员可删除他人评价 */
  async function loadReviews() {
    reviewsWrap.innerHTML = '';
    try {
      const profile = await apiGet(`/api/students/${d.id}/profile`);
      if (!profile.reviews.length) {
        reviewsWrap.appendChild(h('div', { class: 'text-sm text-muted', text: '暂无已公开评价（双方均提交后才展示，BR-08）' }));
        return;
      }
      const tbl = h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { text: '评价人' }), h('th', { text: '内容' }), h('th', { text: '时间' }), h('th', { text: '操作' }))),
        h('tbody', {}, profile.reviews.map((r) =>
          h('tr', {},
            h('td', { class: 'text-xs', text: r.reviewerNickname }),
            h('td', { class: 'text-xs', text: r.content }),
            h('td', { class: 'text-xs', text: dt(r.createdAt) }),
            h('td', {}, h('button', { class: 'btn btn-sm btn-danger', onClick: () => deleteReview(r) }, '删除'))
          )
        ))
      );
      reviewsWrap.appendChild(tbl);
    } catch (err) {
      reviewsWrap.appendChild(h('div', { class: 'text-sm text-muted', text: `评价加载失败：${err.message}` }));
    }
  }

  async function deleteReview(r) {
    const reason = window.prompt('删除评价的依据（必填）', '含违规内容，按 BR-04 处置');
    if (!reason) return;
    try {
      await apiPost(`/api/admin/reviews/${r.id}/delete`, { reason });
      toast('评价已删除', 'ok');
      await loadReviews();
    } catch (err) {
      handleError(err);
    }
  }

  loadReviews();

  async function setStatus(status) {
    if (!reasonInput.value.trim()) return toast('请填写处置理由', 'warn');
    try {
      const r = await apiPost(`/api/admin/students/${d.id}/account-status`, { status, reason: reasonInput.value.trim() });
      toast(`账号状态已置「${status}」${status === '封禁' ? `，联动下架 ${r.offShelf} 件商品` : ''}`, 'ok');
      m.close();
      studentsView();
    } catch (err) {
      handleError(err);
    }
  }

  async function adjustCredit() {
    const delta = window.prompt('调整幅度（+2 / -1 / -2 / -10）', '-10');
    if (delta === null) return;
    const reason = window.prompt('调整原因（必填）', '');
    if (!reason) return;
    try {
      await apiPost(`/api/admin/students/${d.id}/credit`, { delta: Number(delta), reason });
      toast('信用分已调整', 'ok');
      m.close();
      studentsView();
    } catch (err) {
      handleError(err);
    }
  }

  async function revokeCert() {
    const reason = window.prompt('核实伪造的依据（必填，将执行：改回「已驳回」+ 封禁账号 + 联动下架）', '');
    if (!reason) return;
    try {
      await apiPost(`/api/admin/students/${d.id}/revoke-certification`, { reason });
      toast('已撤销认证并封禁账号（AT-08）', 'ok');
      m.close();
      studentsView();
    } catch (err) {
      handleError(err);
    }
  }
}

/* ======================================================= 违规下架与恢复 */
async function offShelfView() {
  const list = await apiGet('/api/admin/forced-off-products');
  shell(
    h('div', {},
      pageHead('违规下架清单', '下架原因为「管理员违规下架」的商品；复核通过可撤销处置恢复在售（ST-09）——已扣信用分不回滚'),
      h('div', { class: 'card' },
        list.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '商品' }), h('th', { text: '卖家' }), h('th', { text: '处置说明' }), h('th', { text: '处置时间' }), h('th', { text: '操作' }))),
              h('tbody', {}, list.map((p) =>
                h('tr', {},
                  h('td', {}, h('a', { href: `/p/${p.id}`, text: p.title })),
                  h('td', { text: p.sellerNickname }),
                  h('td', { class: 'text-xs', text: p.note || '—' }),
                  h('td', { class: 'text-xs', text: dt(p.reviewedAt) }),
                  h('td', {}, h('button', { class: 'btn btn-sm btn-primary', onClick: () => restore(p) }, '复核恢复在售'))
                )
              ))
            )
          : empty('没有违规下架的商品')
      )
    )
  );

  async function restore(p) {
    const reason = window.prompt('复核结论（必填）', '卖家异议成立，原处置依据不足，恢复在售');
    if (!reason) return;
    try {
      await apiPost(`/api/admin/products/${p.id}/restore`, { reason });
      toast('已恢复在售（信用分不回滚）', 'ok');
      offShelfView();
    } catch (err) {
      handleError(err);
    }
  }
}

/* ===================================================== 处置异议会话（UC-30） */
async function messagesView() {
  const data = await apiGet('/api/messages/conversations');
  const listEl = h('div', { class: 'inbox-list' });
  const chatEl = h('div', { class: 'chat' });

  const paint = async (conv) => {
    chatEl.innerHTML = '';
    if (!conv) {
      chatEl.appendChild(empty('选择左侧会话回复卖家异议', '管理员仅可回复「管理员违规下架」商品的异议私信，不得主动发起（BR-20）'));
      return;
    }
    const detail = await apiGet(`/api/messages/conversations/${conv.productId}/${conv.peerId}`).catch((e) => ({ error: e }));
    if (detail.error) {
      chatEl.appendChild(empty('会话不可用', detail.error.message));
      return;
    }
    chatEl.appendChild(
      h('div', { class: 'chat-head' },
        h('div', {},
          h('div', { style: { fontWeight: '700' }, text: `${detail.peerNickname} · 《${detail.productTitle}》` }),
          h('div', { class: 'text-xs text-muted', text: `商品状态 ${detail.productStatus} · 下架原因 ${detail.offShelfReason || '—'}` })
        ),
        h('a', { class: 'btn btn-sm', href: `/p/${conv.productId}` }, '查看商品')
      )
    );
    const bodyEl = h('div', { class: 'chat-body' });
    for (const m of detail.messages) {
      bodyEl.appendChild(
        h('div', { class: `msg ${m.mine ? 'mine' : ''}` },
          h('div', { class: 'msg-bubble', text: m.content }),
          h('div', { class: 'msg-time', text: dt(m.createdAt) })
        )
      );
    }
    chatEl.appendChild(bodyEl);
    const ta = h('textarea', { class: 'textarea', maxlength: 500, placeholder: '回复处置异议（纯文本 1～500 字）' });
    chatEl.appendChild(
      h('div', { class: 'chat-input' },
        ta,
        h('button', {
          class: 'btn btn-primary',
          onClick: async () => {
            try {
              await apiPost('/api/admin/messages/reply', { productId: conv.productId, toId: conv.peerId, content: ta.value.trim() });
              toast('已回复', 'ok');
              paint(conv);
            } catch (err) {
              handleError(err);
            }
          }
        }, '发送')
      )
    );
  };

  if (!data.items.length) {
    listEl.appendChild(empty('暂无异议会话'));
  }
  for (const c of data.items) {
    listEl.appendChild(
      h('div', { class: 'conv-item', onClick: (e) => {
        listEl.querySelectorAll('.conv-item').forEach((x) => x.classList.remove('active'));
        e.currentTarget.classList.add('active');
        paint(c);
      } },
        h('div', { class: 'conv-top' }, h('span', { class: 'conv-name', text: c.peerNickname }), h('span', { class: 'conv-time', text: timeAgo(c.lastAt) })),
        h('div', { class: 'conv-preview', text: `《${c.productTitle}》` }),
        c.unread ? h('span', { class: 'conv-unread', text: c.unread }) : null
      )
    );
  }

  shell(
    h('div', {},
      pageHead('处置异议会话', '仅在商品下架原因为「管理员违规下架」时可回复；管理员不得读取学生之间的交易会话（§5.4）'),
      h('div', { class: 'card' }, h('div', { class: 'inbox' }, listEl, chatEl))
    )
  );
  if (data.items.length) paint(data.items[0]);
}

/* ============================================================== 成交记录 */
async function ordersView() {
  const list = await apiGet('/api/admin/orders');
  shell(
    h('div', {},
      pageHead('成交记录', '订单即成交记录，没有状态机；「有效 / 已撤销」与免责判定见 §7.1'),
      h('div', { class: 'card' },
        list.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '订单' }), h('th', { text: '商品' }), h('th', { text: '买家 / 卖家' }), h('th', { class: 'num', text: '金额' }), h('th', { text: '成交时间' }), h('th', { text: '状态' }))),
              h('tbody', {}, list.map((o) =>
                h('tr', {},
                  h('td', { class: 'mono text-xs', text: o.id }),
                  h('td', {}, h('a', { href: `/p/${o.productId}`, text: o.productTitle }), h('div', { class: 'text-xs text-muted', text: `商品现状态：${o.productStatus}` })),
                  h('td', { class: 'text-xs', text: `${o.buyer?.nickname} / ${o.seller?.nickname}` }),
                  h('td', { class: 'num', text: money(o.amount) }),
                  h('td', { class: 'text-xs', text: dt(o.createdAt) }),
                  h('td', {}, badge(o.status, o.status === '有效' ? 'green' : 'gray'),
                    o.status === '已撤销' ? h('div', { class: 'text-xs text-muted', text: `判定：${o.cancelJudgement}` }) : null)
                )
              ))
            )
          : empty('暂无成交记录')
      )
    )
  );
}

/* ============================================================== 审计日志 */
async function auditView() {
  const list = await apiGet('/api/admin/audit?limit=150');
  shell(
    h('div', {},
      pageHead('审计日志', '记录权限拒绝、敏感信息读取与管理操作；不写入密码、完整手机号、宿舍地址与学生证图片内容（§5.5 第 5 条）'),
      h('div', { class: 'card' },
        list.length
          ? h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', { text: '时间' }), h('th', { text: '角色' }), h('th', { text: '动作' }), h('th', { text: '对象' }), h('th', { text: '结果' }), h('th', { text: '详情' }))),
              h('tbody', {}, list.map((a) =>
                h('tr', {},
                  h('td', { class: 'text-xs nowrap', text: dt(a.at) }),
                  h('td', { class: 'text-xs', text: `${a.role}${a.actorId ? `(${a.actorId})` : ''}` }),
                  h('td', { class: 'mono text-xs', text: a.action }),
                  h('td', { class: 'text-xs', text: `${a.targetType || ''} ${a.targetId || ''}` }),
                  h('td', {}, badge(a.result, a.result === 'allowed' ? 'green' : a.result === 'denied' ? 'red' : 'amber')),
                  h('td', { class: 'text-xs text-muted', text: a.detail ? JSON.stringify(a.detail).slice(0, 90) : a.reasonCode || '' })
                )
              ))
            )
          : empty('暂无审计记录')
      )
    )
  );
}

/* ==================================================================== 路由 */
const routes = {
  '#/login': () => loginView(),
  '#/dashboard': () => dashboardView(),
  '#/certifications': () => certificationsView(),
  '#/products': () => productsView(),
  '#/reports': () => reportsView(),
  '#/students': () => studentsView(),
  '#/off-shelf': () => offShelfView(),
  '#/messages': () => messagesView(),
  '#/orders': () => ordersView(),
  '#/audit': () => auditView()
};

/** 侧边栏待办角标：进入任何页面时刷新一次，避免只在看板才准 */
async function refreshCounts() {
  try {
    const d = await apiGet('/api/admin/dashboard');
    S.counts = {
      pendingCert: d.students.pendingCert,
      pendingProducts: d.products.pending,
      pendingReports: d.reports.pending,
      pendingAdminMsgs: d.messages.pendingAdmin
    };
  } catch {
    /* 忽略：角标不是关键路径 */
  }
}

async function router(force = false) {
  const hash = (location.hash || '#/dashboard').split('?')[0];
  currentRoute = hash;
  if (hash === '#/login') return loginView();

  if (S.me.kind !== 'admin') {
    try {
      S.me = await fetchMe(true);
    } catch {
      S.me = { kind: 'guest' };
    }
    if (S.me.kind !== 'admin') {
      location.hash = '#/login';
      return loginView();
    }
  }
  await refreshCounts();
  const view = routes[hash] || dashboardView;
  try {
    await view();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED' || err.code === 'PERMISSION_DENIED') {
      location.hash = '#/login';
      return;
    }
    shell(h('div', { class: 'card card-pad' }, empty('加载失败', err.message)));
  }
}

(async function boot() {
  try {
    S.me = await fetchMe(true);
  } catch {
    S.me = { kind: 'guest' };
  }
  window.addEventListener('hashchange', () => router());
  await router(true);
})();
