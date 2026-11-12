/**
 * 拾光二手 · 学生端单页应用（原生 ES 模块，零构建、零 CDN）
 *
 * 用例覆盖：UC-01/02/05/07/08/09/10/11/12/14/15/16/17/18/29/30/31/32/33/34
 * 路由用 hash，形如 #/p/PRD-001、#/messages/PRD-002/STU-LIN
 */
import {
  h, mount, frag, icon, toast, modal, confirmDialog, money, dt, timeAgo, remain,
  badge, statusBadge, certBadge, empty, loading, field, errorBox, okBox,
  fileToDataUrl, handleError, promptDialog
} from './ui.js';
import {
  apiGet, apiPost, apiPatch, apiDelete, qs, fetchMe, setMe, clearMe, fetchBadge,
  ApiError, devMailbox, devState, devShiftTime, devRunScheduler, devReset
} from './api.js';

/* ==================================================================== 状态 */
const S = {
  me: { kind: 'guest' },
  badge: { notificationUnread: 0, messageUnread: 0 },
  categories: [],
  rules: null
};

const isStudent = () => S.me.kind === 'student';
const isAdmin = () => S.me.kind === 'admin';
const student = () => S.me.student || null;
const certified = () => isStudent() && S.me.student.certStatus === '已认证';

async function reloadMe() {
  setMe(null);
  S.me = await fetchMe(true);
  S.badge = await fetchBadge();
  return S.me;
}
async function reloadBadge() {
  S.badge = await fetchBadge();
  paintBadges();
}

/* ==================================================================== 壳层 */
const app = () => document.getElementById('app');
let currentNav = '';

function logo() {
  return h(
    'a',
    { class: 'brand', href: '#/' },
    h('span', { class: 'brand-logo' }, icon('bag', 20)),
    h(
      'span',
      {},
      h('span', { class: 'brand-name', text: '拾光二手' }),
      h('span', { class: 'brand-sub', text: 'CAMPUS REUSE' })
    )
  );
}

function navLink(href, text, key) {
  return h('a', { href, class: currentNav === key ? 'active' : '', text });
}

function header() {
  const st = student();
  const right = [];
  if (isStudent()) {
    right.push(
      h('a', { class: 'btn btn-primary btn-sm', href: '#/publish' }, icon('plus', 15), '发布闲置')
    );
    right.push(
      h(
        'a',
        { class: 'icon-btn', href: '#/notifications', title: '消息通知' },
        icon('bell', 17),
        S.badge.notificationUnread > 0
          ? h('span', { class: 'badge-dot', text: S.badge.notificationUnread > 99 ? '99+' : S.badge.notificationUnread })
          : null
      )
    );
    right.push(
      h(
        'a',
        { class: 'icon-btn', href: '#/messages', title: '我的私信' },
        icon('chat', 17),
        S.badge.messageUnread > 0
          ? h('span', { class: 'badge-dot', text: S.badge.messageUnread > 99 ? '99+' : S.badge.messageUnread })
          : null
      )
    );
    right.push(
      h(
        'a',
        { class: 'row', href: '#/me', style: { gap: '8px' }, title: '我的' },
        h('span', { class: 'avatar', text: (st?.nickname || '我').slice(0, 1) }),
        h('span', { class: 'text-sm', style: { color: 'var(--ink-2)' }, text: st?.nickname || '我的' })
      )
    );
  } else if (isAdmin()) {
    right.push(h('a', { class: 'chip-cert', href: '/admin' }, icon('shield', 14), '管理员会话'));
    right.push(h('a', { class: 'btn btn-sm', href: '#/login' }, '切换学生账号'));
  } else {
    right.push(h('a', { class: 'btn btn-sm', href: '#/login' }, '登录'));
    right.push(h('a', { class: 'btn btn-primary btn-sm', href: '#/register' }, '注册'));
  }

  const certChip = isStudent()
    ? h(
        'a',
        {
          class: `chip-cert ${st.certStatus === '已认证' ? '' : st.certStatus === '已驳回' ? 'bad' : 'warn'}`,
          href: '#/verify'
        },
        icon('shield', 14),
        st.certStatus === '已认证' ? '校内已认证' : st.certStatus === '待审核' ? '核验审核中' : st.certStatus === '已驳回' ? '核验未通过' : '未认证'
      )
    : null;

  return h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      logo(),
      h(
        'nav',
        { class: 'nav' },
        navLink('#/', '首页', 'home'),
        navLink('#/me/products', '我的商品', 'myproducts'),
        navLink('#/me/orders', '我的订单', 'orders'),
        navLink('#/messages', '私信', 'messages'),
        navLink('#/me/favorites', '收藏', 'favorites'),
        navLink('#/me/credit', '信用分', 'credit')
      ),
      h('div', { class: 'topbar-actions' }, certChip, ...right)
    )
  );
}

function paintBadges() {
  const headerEl = document.querySelector('.topbar');
  if (!headerEl) return;
  const fresh = header();
  headerEl.replaceWith(fresh);
}

function shell(content) {
  mount(app(), header(), content, devFab());
}

/**
 * 页面容器。注意：必须接收**可变数量**的 children——所有视图都是
 * page(标题区, 内容卡片, 列表…) 这样多段拼装的；早先写成 page(children) 只取第一个参数，
 * 导致除首块以外的内容（搜索栏、商品网格、列表）全部丢失，页面看起来像空白。
 */
function page(...children) {
  return h(
    'main',
    { class: 'wrap', style: { paddingBottom: '60px', paddingTop: '22px' } },
    children
  );
}

/* ============================================================ 开发工具浮层 */
let devPanelOpen = false;
function devFab() {
  const fab = h(
    'button',
    { class: 'dev-fab', title: '演示工具（时间推进 / 开发邮箱 / 重置数据）', onClick: toggleDev },
    icon('tools', 19)
  );
  return h('div', { id: 'dev-wrap' }, fab);
}

async function toggleDev() {
  const wrap = document.getElementById('dev-wrap');
  if (!wrap) return;
  const old = wrap.querySelector('.dev-panel');
  if (old) {
    old.remove();
    devPanelOpen = false;
    return;
  }
  const panel = h('div', { class: 'dev-panel' }, loading('读取演示状态…'));
  wrap.appendChild(panel);
  devPanelOpen = true;
  try {
    const [state, mailbox] = await Promise.all([devState(), devMailbox(12)]);
    panel.innerHTML = '';
    panel.append(
      h('h4', {}, '演示工具（仅开发模式）'),
      h('div', { class: 'text-xs text-muted mb-2' }, `服务端时间：${dt(state.now)}（偏移 ${state.offsetHours} 小时）`),
      h(
        'div',
        { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } },
        h('button', { class: 'btn btn-sm', onClick: () => shift(1) }, '+1 小时'),
        h('button', { class: 'btn btn-sm', onClick: () => shift(24) }, '+1 天'),
        h('button', { class: 'btn btn-sm', onClick: () => shift(168) }, '+7 天'),
        h('button', { class: 'btn btn-sm', onClick: () => shift(-168) }, '−7 天'),
        h(
          'button',
          {
            class: 'btn btn-sm btn-primary',
            onClick: async () => {
              const r = await devRunScheduler();
              toast(`定时判定已执行：未评价扣分 ${r.noReviewPenalties} 次、撤销自动计违约 ${r.cancelAutoJudgements} 次`, 'ok', 5000);
            }
          },
          '执行定时判定'
        ),
        h(
          'button',
          {
            class: 'btn btn-sm btn-danger',
            onClick: async () => {
              if (!(await confirmDialog({ title: '重置演示数据', message: '将清空当前全部数据并重新灌入演示种子数据，确定继续？', danger: true, okText: '重置' }))) return;
              await devReset();
              await reloadMe();
              toast('演示数据已重置', 'ok');
              location.hash = '#/';
              location.reload();
            }
          },
          '重置数据'
        )
      ),
      h('h4', {}, '开发邮箱（验证码）'),
      !mailbox.items.length
        ? h('div', { class: 'text-xs text-muted' }, '暂无邮件')
        : mailbox.items.map((m) => {
            const code = /(\d{6})/.exec(m.text || '')?.[1];
            return h(
              'div',
              { class: 'mail' },
              h('div', { class: 'text-xs text-muted' }, `${m.to} · ${dt(m.at)}`),
              h('div', { class: 'text-xs', text: m.subject }),
              code
                ? h(
                    'div',
                    { class: 'row', style: { gap: '8px', alignItems: 'center' } },
                    h('span', { class: 'code', text: code }),
                    h(
                      'button',
                      {
                        class: 'btn btn-sm',
                        onClick: () => {
                          navigator.clipboard?.writeText(code);
                          toast('验证码已复制', 'ok');
                        }
                      },
                      '复制'
                    )
                  )
                : null
            );
          })
    );
  } catch (err) {
    panel.innerHTML = '';
    panel.append(h('div', { class: 'text-xs' }, `演示工具不可用：${err.message}（可在 config/default.json 关闭）`));
  }
}

async function shift(hours) {
  const r = await devShiftTime(hours);
  toast(`服务端时间偏移 ${r.offsetHours} 小时`, 'ok');
  toggleDev();
  toggleDev();
}

/* ================================================================== 路由表 */
const routes = [
  [/^#\/$/, () => homeView()],
  [/^#\/login$/, () => loginView()],
  [/^#\/register$/, () => registerView()],
  [/^#\/forgot$/, () => forgotView()],
  [/^#\/publish$/, () => publishView()],
  [/^#\/edit\/([^/]+)$/, (m) => publishView(m[1])],
  [/^#\/p\/([^/]+)$/, (m) => productView(m[1])],
  [/^#\/me$/, () => meView()],
  [/^#\/me\/products$/, () => myProductsView()],
  [/^#\/me\/orders$/, () => ordersView()],
  [/^#\/me\/favorites$/, () => favoritesView()],
  [/^#\/me\/credit$/, () => creditView()],
  [/^#\/me\/reports$/, () => reportsView()],
  [/^#\/me\/profile$/, () => profileEditView()],
  [/^#\/u\/([^/]+)$/, (m) => userView(m[1])],
  [/^#\/verify$/, () => verifyView()],
  [/^#\/messages$/, () => messagesView()],
  [/^#\/messages\/([^/]+)\/([^/]+)$/, (m) => messagesView(m[1], m[2])],
  [/^#\/notifications$/, () => notificationsView()]
];

const NAV_BY_ROUTE = [
  [/^#\/me\/products/, 'myproducts'],
  [/^#\/me\/orders/, 'orders'],
  [/^#\/messages/, 'messages'],
  [/^#\/me\/favorites/, 'favorites'],
  [/^#\/me\/credit/, 'credit'],
  [/^#\//, 'home']
];

async function router() {
  const hash = location.hash || '#/';
  currentNav = (NAV_BY_ROUTE.find(([re]) => re.test(hash)) || [null, ''])[1];
  const hit = routes.find(([re]) => re.test(hash));
  try {
    if (!hit) return homeView();
    await hit[1](hash.match(hit[0]));
  } catch (err) {
    handleError(err, '页面加载失败');
    shell(page(h('div', { class: 'card card-pad' }, empty('页面加载失败', err.message))));
  }
}

/* ================================================================ 首页/搜索 */
async function homeView(params = {}) {
  const state = { keyword: params.keyword || '', categoryId: params.categoryId || '', condition: '', sort: 'latest', page: 1 };
  const gridWrap = h('div', {});
  const countLabel = h('span', { class: 'text-sm text-muted' });

  async function load(append = false) {
    if (!append) gridWrap.innerHTML = '' , gridWrap.appendChild(loading());
    try {
      const data = await apiGet(
        `/api/products${qs({
          keyword: state.keyword,
          categoryId: state.categoryId,
          condition: state.condition,
          sort: state.sort,
          page: state.page,
          pageSize: 12
        })}`
      );
      if (!append) gridWrap.innerHTML = '';
      countLabel.textContent = state.keyword
        ? `「${state.keyword}」共 ${data.total} 件在售`
        : `全部在售 ${data.total} 件`;
      if (!data.items.length && !append) {
        gridWrap.appendChild(empty('没有找到相关商品', '试试更换关键词或放宽筛选条件（UC-07 辅事件流 A）'));
        return;
      }
      const grid = append ? gridWrap.querySelector('.grid') : h('div', { class: 'grid' });
      for (const p of data.items) grid.appendChild(productCard(p));
      if (!append) gridWrap.appendChild(grid);
      if (data.page * data.pageSize < data.total) {
        const more = h('div', { class: 'center mt-3' }, h('button', { class: 'btn', onClick: () => { state.page++; load(true); } }, '加载更多'));
        if (append) gridWrap.querySelector('.center')?.remove();
        gridWrap.appendChild(more);
      } else {
        gridWrap.querySelector('.center')?.remove();
      }
    } catch (err) {
      gridWrap.innerHTML = '';
      gridWrap.appendChild(h('div', { class: 'card card-pad' }, empty('检索失败', err.message)));
    }
  }

  if (!S.categories.length) {
    S.categories = await apiGet('/api/categories');
  }

  const searchInput = h('input', {
    class: 'search-input',
    placeholder: '搜索商品、关键词，例如「教材」「iPad」',
    value: state.keyword,
    onKeydown: (e) => {
      if (e.key === 'Enter') doSearch();
    }
  });
  const doSearch = () => {
    state.keyword = searchInput.value.trim();
    state.page = 1;
    load();
  };

  const catWrap = h('div', { class: 'filters', style: { borderTop: '0', marginTop: '0', paddingTop: '0' } });
  const renderCats = () => {
    catWrap.innerHTML = '';
    const all = h('button', {
      class: `chip ${state.categoryId === '' ? 'active' : ''}`,
      onClick: () => {
        state.categoryId = '';
        state.page = 1;
        renderCats();
        load();
      }
    }, '全部');
    catWrap.appendChild(all);
    for (const c of S.categories) {
      catWrap.appendChild(
        h('button', {
          class: `chip ${state.categoryId === c.id ? 'active' : ''}`,
          onClick: () => {
            state.categoryId = c.id;
            state.page = 1;
            renderCats();
            load();
          }
        }, c.name, h('span', { class: 'count', text: c.onSaleCount }))
      );
    }
  };
  renderCats();

  const sortSelect = h('select', {
    class: 'select',
    style: { width: '140px', height: '38px' },
    onChange: (e) => {
      state.sort = e.target.value;
      state.page = 1;
      load();
    }
  },
    h('option', { value: 'latest', text: '最新发布' }),
    h('option', { value: 'priceAsc', text: '价格从低到高' }),
    h('option', { value: 'priceDesc', text: '价格从高到低' }),
    h('option', { value: 'hot', text: '最多浏览' })
  );

  const condSelect = h('select', {
    class: 'select',
    style: { width: '130px', height: '38px' },
    onChange: (e) => {
      state.condition = e.target.value;
      state.page = 1;
      load();
    }
  },
    h('option', { value: '', text: '全部成色' }),
    ...['全新', '九成新', '七成新', '其他'].map((c) => h('option', { value: c, text: c }))
  );

  shell(
    page(
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          {},
          h(
            'div',
            { class: 'row', style: { gap: '8px' } },
            h('span', { class: 'badge badge-green' }, '仅限校内认证学生'),
            h('span', { class: 'badge badge-gray' }, '线下面交 · 平台不碰钱货')
          ),
          h('h1', { class: 'hero-title' }, '把闲置交给', h('br'), '下一位同学'),
          h('p', { class: 'hero-sub', text: '教材、数码、宿舍好物，和同校同学在站内私信约个地方当面交付。平台只做撮合与成交登记。' })
        ),
        h(
          'div',
          { class: 'hero-card' },
          h(
            'div',
            { class: 'row-between' },
            h(
              'div',
              {},
              h('div', { class: 'hc-title' }, '有闲置要卖？'),
              h('div', { class: 'hc-sub' }, '发布 → 管理员审核 → 在售 → 下单成交')
            ),
            h('span', { class: 'hc-pill', text: '4 步走完' })
          ),
          h(
            'div',
            { class: 'mt-2' },
            h('a', { class: 'btn btn-accent btn-block', href: '#/publish' }, icon('plus', 16), '发布闲置')
          )
        )
      ),
      h(
        'section',
        { class: 'card card-pad mt-3' },
        h('div', { class: 'searchbar' },
          h('div', { class: 'search-input-wrap' }, icon('search', 18), searchInput),
          h('button', { class: 'btn btn-primary', style: { height: '44px', padding: '0 22px' }, onClick: doSearch }, '搜索')
        ),
        catWrap,
        h('div', { class: 'row mt-2', style: { gap: '10px', flexWrap: 'wrap' } }, countLabel, h('div', { class: 'grow' }), condSelect, sortSelect)
      ),
      h('div', { class: 'mt-3' }, gridWrap)
    )
  );
  load();
}

function productCard(p) {
  const img = p.images?.[0];
  return h(
    'a',
    { class: 'pcard', href: `#/p/${p.id}` },
    h('div', { class: 'pcard-img' },
      img ? h('img', { src: img, alt: p.title, loading: 'lazy' }) : null,
      p.status !== '在售' ? h('span', { class: 'pcard-flag' }, statusBadge(p.status)) : null
    ),
    h(
      'div',
      { class: 'pcard-body' },
      h('div', { class: 'pcard-title', text: p.title }),
      h('div', { class: 'pcard-price' }, h('small', { text: '¥' }), p.price),
      h(
        'div',
        { class: 'pcard-meta' },
        h('span', { class: 'tag', text: p.condition }),
        h('span', { text: `${p.viewCount} 次浏览` })
      )
    )
  );
}

/* ================================================================ 商品详情 */
async function productView(id) {
  let p;
  try {
    p = await apiGet(`/api/products/${id}`);
  } catch (err) {
    return shell(page(h('div', { class: 'card card-pad' }, empty('商品不可用', err.message, h('a', { class: 'btn', href: '#/' }, '回到首页')))));
  }
  const mainImg = h('img', { src: p.images?.[0] || '', alt: p.title });
  const thumbs = h('div', { class: 'thumbs' },
    (p.images || []).map((src, i) =>
      h('img', {
        src,
        class: i === 0 ? 'active' : '',
        onClick: (e) => {
          mainImg.src = src;
          thumbs.querySelectorAll('img').forEach((x) => x.classList.remove('active'));
          e.currentTarget.classList.add('active');
        }
      })
    )
  );

  const mine = isStudent() && student().id === p.sellerId;
  const actions = [];

  if (p.status === '在售') {
    if (!mine) {
      actions.push(
        h('button', { class: 'btn btn-primary btn-lg', onClick: () => buyNow(p) }, '立即购买')
      );
      actions.push(
        h('button', { class: 'btn btn-lg', onClick: () => openChat(p) }, icon('chat', 16), '联系卖家')
      );
      actions.push(
        h(
          'button',
          {
            class: 'btn btn-lg',
            onClick: async () => {
              if (!isStudent()) return goLogin('收藏');
              try {
                if (p.favorited) {
                  await apiDelete(`/api/favorites/${p.id}`);
                  p.favorited = false;
                  toast('已取消收藏', 'ok');
                } else {
                  await apiPost('/api/favorites', { productId: p.id });
                  p.favorited = true;
                  toast('已收藏', 'ok');
                }
                location.hash = `#/p/${p.id}`;
                productView(p.id);
              } catch (err) {
                handleError(err);
              }
            }
          },
          icon('heart', 16),
          p.favorited ? '已收藏' : '收藏'
        )
      );
    }
  }

  if (p.status === '已售出') {
    const orders = isStudent() ? await apiGet('/api/me/orders?role=buyer').catch(() => []) : [];
    const myOrder = orders.find((o) => o.productId === p.id && o.status === '有效');
    if (myOrder) {
      actions.push(h('a', { class: 'btn btn-primary btn-lg', href: `#/me/orders` }, '查看我的订单'));
      actions.push(h('button', { class: 'btn btn-lg', onClick: () => openChat(p) }, icon('chat', 16), '继续沟通取货'));
    } else {
      actions.push(h('button', { class: 'btn btn-lg', disabled: true }, '该商品已售出'));
    }
  }

  if (mine) {
    if (p.status === '待审核') actions.push(h('button', { class: 'btn btn-lg', onClick: () => withdraw(p) }, '撤回'));
    if (p.status === '在售') {
      actions.push(h('a', { class: 'btn btn-lg', href: `#/edit/${p.id}` }, icon('edit', 15), '编辑'));
      actions.push(h('button', { class: 'btn btn-lg btn-danger', onClick: () => takeDown(p) }, '下架'));
    }
    if (p.status === '已下架') {
      actions.push(h('a', { class: 'btn btn-lg', href: '#/me/products' }, '在「我的商品」处理'));
    }
  } else if (isStudent()) {
    actions.push(h('button', { class: 'btn btn-lg btn-danger', onClick: () => reportDialog('商品', p.id, p.title) }, icon('flag', 15), '举报'));
  }

  shell(
    page(
      h('div', { class: 'row text-sm text-muted mb-2' }, h('a', { href: '#/' }, '首页'), '/',
        h('span', { text: p.categoryName || '' }), '/', h('span', { text: p.title })),
      h(
        'div',
        { class: 'detail' },
        h('div', { class: 'detail-gallery' }, h('div', { class: 'detail-main-img' }, mainImg), thumbs),
        h(
          'div',
          { class: 'card card-pad' },
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } },
            statusBadge(p.status),
            badge(p.condition, 'gray'),
            p.status === '已下架' && p.offShelfReason ? badge(`下架原因：${p.offShelfReason}`, 'red') : null
          ),
          h('h1', { style: { fontSize: '22px', margin: '0 0 8px', lineHeight: '1.35', color: '#173d31' }, text: p.title }),
          h('div', { class: 'price-lg' }, h('small', { text: '¥' }), p.price),
          h('div', { class: 'divider' }),
          h('dl', { class: 'kv' },
            h('dt', { text: '分类' }), h('dd', { text: p.categoryName || '—' }),
            h('dt', { text: '成色' }), h('dd', { text: p.condition }),
            h('dt', { text: '发布时间' }), h('dd', { text: dt(p.publishedAt) }),
            h('dt', { text: '浏览数' }), h('dd', { text: String(p.viewCount) }),
            h('dt', { text: '收藏' }), h('dd', { text: `${p.favoriteCount ?? 0} 人` })
          ),
          h('div', { class: 'divider' }),
          h(
            'a',
            { class: 'row', href: `#/u/${p.sellerId}`, style: { gap: '10px' } },
            h('span', { class: 'avatar', text: (p.seller?.nickname || '?').slice(0, 1) }),
            h(
              'span',
              {},
              h('div', { class: 'row', style: { gap: '6px' } },
                h('span', { style: { fontWeight: '600' }, text: p.seller?.nickname || '卖家' }),
                p.seller ? certBadge(p.seller.certStatus) : null
              ),
              h('div', { class: 'text-xs text-muted', text: `信用分 ${p.seller?.creditScore ?? '—'} · 评价 ${p.seller?.reviewCount ?? 0} · 被核实争议 ${p.seller?.verifiedDisputeCount ?? 0}` })
            ),
            h('span', { class: 'grow' }),
            h('span', { class: 'text-sm', style: { color: 'var(--brand)' }, text: '查看主页 →' })
          ),
          h('div', { class: 'detail-actions' }, ...actions),
          p.reviewNote ? h('div', { class: 'form-error mt-2', text: `审核/处置说明：${p.reviewNote}` }) : null
        )
      ),
      h(
        'section',
        { class: 'card card-pad mt-3' },
        h('h3', { class: 'section-title', text: '商品描述' }),
        h('p', { class: 'section-sub', text: '平台不介入资金与交付：成交只表示下单成功，取货由双方在站内私信约定。' }),
        h('div', { style: { whiteSpace: 'pre-wrap', marginTop: '12px', lineHeight: '1.8', color: 'var(--ink-2)' }, text: p.description })
      )
    )
  );
}

function goLogin(action = '') {
  toast(`请先登录${action ? '后再' + action : ''}`, 'warn');
  location.hash = '#/login';
}

async function buyNow(p) {
  if (!isStudent()) return goLogin('下单');
  if (!certified()) return toast('请先完成学生证核验（BR-01）', 'warn'), (location.hash = '#/verify');
  const ok = await confirmDialog({
    title: '确认下单成交',
    message: `商品：${p.title}\n成交金额：¥${p.price}（等于当前标价，平台不议价）\n\n下单即成交，成交后请在站内私信中与卖家约定取货。平台不展示对方手机号，也不介入支付与交付。`,
    okText: '确认下单'
  });
  if (!ok) return;
  try {
    const order = await apiPost('/api/orders', { productId: p.id });
    await reloadMe();
    const m = modal({
      title: '下单成功，交易已成交',
      body: h(
        'div',
        {},
        h('div', { class: 'form-ok', text: `订单编号：${order.id}` }),
        h('p', { class: 'text-sm text-muted' }, '下一步：进入该商品的站内私信，与卖家约定取货时间与地点。平台不记录交付事实。'),
        h('div', { class: 'text-xs text-muted' }, '若之后无法履约，任一方都可在「我的订单」单方撤销成交（对方 7 天内可判是否计违约）。')
      ),
      footer: [
        h('button', { class: 'btn', onClick: () => { m.close(); location.hash = '#/'; } }, '继续浏览'),
        h('button', {
          class: 'btn btn-primary',
          onClick: () => { m.close(); location.hash = `#/messages/${p.id}/${p.sellerId}`; }
        }, '去私信卖家')
      ]
    });
    productView(p.id);
  } catch (err) {
    handleError(err, '下单失败');
  }
}

async function openChat(p) {
  if (!isStudent()) return goLogin('联系卖家');
  if (!certified()) return toast('请先完成学生证核验，再联系卖家（BR-20）', 'warn'), (location.hash = '#/verify');
  if (student().id === p.sellerId) return toast('不能与自己对话', 'warn');
  location.hash = `#/messages/${p.id}/${p.sellerId}`;
}

async function withdraw(p) {
  if (!(await confirmDialog({ title: '撤回商品', message: '撤回后商品转为「已下架（卖家撤回）」，可修改后重新提交审核。', okText: '撤回' }))) return;
  try {
    await apiPost(`/api/products/${p.id}/withdraw`);
    toast('已撤回', 'ok');
    productView(p.id);
  } catch (err) {
    handleError(err);
  }
}

async function takeDown(p) {
  if (!(await confirmDialog({ title: '下架商品', message: '下架后商品从搜索与分类列表移除，收藏过它的买家会收到通知。', okText: '下架', danger: true }))) return;
  try {
    await apiPost(`/api/products/${p.id}/take-down`);
    toast('已下架', 'ok');
    productView(p.id);
  } catch (err) {
    handleError(err);
  }
}

/* ============================================================ 发布 / 编辑 */
async function publishView(editId = null) {
  if (!isStudent()) return goLogin('发布商品');
  if (!certified()) {
    return shell(
      page(
        h('div', { class: 'card card-pad' },
          h('h2', { class: 'section-title', text: '发布前需完成学生证核验' }),
          h('p', { class: 'section-sub', text: 'BR-01：只有已认证学生才能发布商品与下单。' }),
          h('div', { class: 'mt-2' }, h('a', { class: 'btn btn-primary', href: '#/verify' }, '去核验'))
        )
      )
    );
  }
  if (!S.categories.length) S.categories = await apiGet('/api/categories');

  let existing = null;
  if (editId) {
    existing = await apiGet(`/api/products/${editId}`);
    if (existing.sellerId !== student().id) return handleError({ message: '仅限本人发布的商品' });
  }

  const images = [...(existing?.images || [])];
  const state = {
    title: existing?.title || '',
    categoryId: existing?.categoryId || '',
    price: existing?.price || '',
    condition: existing?.condition || '',
    description: existing?.description || ''
  };

  const errBox = h('div', {});
  const upWrap = h('div', { class: 'uploader' });

  const paintImages = () => {
    upWrap.innerHTML = '';
    images.forEach((src, i) => {
      upWrap.appendChild(
        h('div', { class: 'up-item' },
          h('img', { src }),
          h('button', {
            class: 'rm',
            onClick: () => {
              images.splice(i, 1);
              paintImages();
            }
          }, icon('close', 12))
        )
      );
    });
    if (images.length < 9) {
      const fileInput = h('input', {
        type: 'file',
        accept: 'image/*',
        multiple: true,
        style: { display: 'none' },
        onChange: async (e) => {
          for (const f of [...e.target.files].slice(0, 9 - images.length)) {
            try {
              images.push(await fileToDataUrl(f));
            } catch (err) {
              toast(err.message, 'error');
            }
          }
          paintImages();
        }
      });
      upWrap.appendChild(
        h('label', { class: 'up-item up-add' }, icon('upload', 20), `上传图片 ${images.length}/9`, fileInput)
      );
    }
  };
  paintImages();

  const doSubmit = async () => {
    errBox.innerHTML = '';
    try {
      const payload = {
        title: state.title,
        categoryId: state.categoryId,
        price: state.price,
        condition: state.condition,
        description: state.description,
        images
      };
      if (editId) {
        await apiPatch(`/api/products/${editId}`, payload);
        toast('修改已提交，需重新审核', 'ok');
        location.hash = '#/me/products';
      } else {
        await apiPost('/api/products', payload);
        await reloadMe();
        toast('已提交审核，等待管理员审核', 'ok');
        location.hash = '#/me/products';
      }
    } catch (err) {
      errBox.innerHTML = '';
      errBox.appendChild(errorBox(err.message));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  shell(
    page(
      h(
        'div',
        { class: 'row-between mb-3' },
        h('div', {},
          h('h2', { class: 'section-title', text: editId ? '编辑商品' : '发布闲置' }),
          h('p', { class: 'section-sub', text: editId ? '提交后商品回到「待审核」重新审核（BR-22）；发布人 / 状态 / 下架原因 / 发布时间为系统字段，不可修改。' : '发布后为「待审核」，管理员通过后才对外展示（BR-03）。' })
        ),
        h('a', { class: 'btn', href: '#/me/products' }, '我的商品')
      ),
      h(
        'div',
        { class: 'card card-pad' },
        errBox,
        field('商品标题', h('input', {
          class: 'input',
          maxlength: 50,
          placeholder: '例如：高等数学（第七版）上下册',
          value: state.title,
          onInput: (e) => { state.title = e.target.value; }
        }), '1～50 个字符', true),
        h(
          'div',
          { class: 'form-grid' },
          field('分类', h('select', {
            class: 'select',
            onChange: (e) => { state.categoryId = e.target.value; }
          },
            h('option', { value: '', text: '请选择分类' }),
            S.categories.map((c) => h('option', { value: c.id, text: c.name, selected: existing?.categoryId === c.id }))
          ), '单层分类，一件商品恰属一个分类', true),
          field('成色', h('select', {
            class: 'select',
            onChange: (e) => { state.condition = e.target.value; }
          },
            h('option', { value: '', text: '请选择成色' }),
            ['全新', '九成新', '七成新', '其他'].map((c) => h('option', { value: c, text: c, selected: existing?.condition === c }))
          ), '封闭四值', true)
        ),
        field('价格（元）', h('input', {
          class: 'input',
          type: 'number',
          step: '0.01',
          min: '0.01',
          max: '50000',
          placeholder: '不超过 50000 元，最多 2 位小数',
          value: state.price,
          onInput: (e) => { state.price = e.target.value; }
        }), 'BR-05：大于 0 且不超过 50000 元；平台不做议价，下单即以标价成交', true),
        field('商品图片', upWrap, '1～9 张，至少 1 张；不得含水印联系方式（站外导流）', true),
        field('商品描述', h('textarea', {
          class: 'textarea',
          maxlength: 1000,
          placeholder: '品相、使用时长、瑕疵、来源与权属等；二手电子产品请说明已清除个人数据并恢复出厂设置',
          onInput: (e) => { state.description = e.target.value; }
        }, existing?.description || ''), '1～1000 个字符，纯文本；不得填写站外联系方式', true),
        h('div', { class: 'row mt-2' },
          h('button', { class: 'btn btn-primary btn-lg', onClick: doSubmit }, editId ? '提交修改（需重审）' : '提交审核'),
          h('a', { class: 'btn btn-lg', href: '#/me/products' }, '取消')
        )
      )
    )
  );
}

/* ================================================================== 我的 */
async function meView() {
  if (!isStudent()) {
    if (isAdmin()) {
      return shell(page(h('div', { class: 'card card-pad' },
        h('h2', { class: 'section-title', text: '当前是管理员会话' }),
        h('p', { class: 'section-sub', text: '管理员不能以学生身份发布、下单、评价或举报（§5.2）。' }),
        h('div', { class: 'row mt-2' }, h('a', { class: 'btn btn-primary', href: '/admin' }, '进入后台'), h('a', { class: 'btn', href: '#/login' }, '登录学生账号'))
      )));
    }
    return goLogin();
  }
  const me = await reloadMe();
  const st = me.student;
  const [mine, orders, favs, credit, badgeData] = await Promise.all([
    apiGet('/api/me/products'),
    apiGet('/api/me/orders'),
    apiGet('/api/me/favorites'),
    apiGet('/api/me/credit'),
    fetchBadge()
  ]);

  shell(
    page(
      h(
        'section',
        { class: 'hero-profile' },
        h('div', { class: 'avatar-lg', text: (st.nickname || '我').slice(0, 1) }),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
            h('span', { class: 'nick', text: st.nickname }),
            h('span', { class: 'badge badge-dark', text: st.certStatus }),
            st.accountStatus !== '正常' ? h('span', { class: 'badge badge-red', text: st.accountStatus }) : null
          ),
          h('div', { class: 'sub', text: `学号 ${st.studentNo || '（未绑定，需核验通过）'} · 注册于 ${dt(st.registeredAt)}` }),
          h('div', { class: 'sub', text: `信用分 ${credit.score} ${credit.canPublish ? '' : '· 低于 60 不可发布新商品'}${credit.canOrder ? '' : ' · 低于 40 不可下单'}` })
        ),
        h('a', { class: 'btn btn-accent', href: '#/u/' + st.id }, '查看我的主页')
      ),
      h(
        'div',
        { class: 'stat-grid mt-3' },
        statCard(credit.score, '信用分'),
        statCard(mine.groups['在售']?.length || 0, '在售商品'),
        statCard(mine.groups['待审核']?.length || 0, '待审核'),
        statCard(orders.length, '成交记录'),
        statCard(favs.total, '收藏'),
        statCard(badgeData.messageUnread, '私信未读')
      ),
      st.certStatus !== '已认证'
        ? h('div', { class: 'card card-pad mt-3' },
            h('div', { class: 'row-between' },
              h('div', {},
                h('div', { class: 'card-title', text: st.certStatus === '待审核' ? '核验审核中' : st.certStatus === '已驳回' ? '核验未通过，可修改后重新提交' : '尚未提交学生证核验' }),
                h('div', { class: 'text-sm text-muted', text: '未通过核验时：可浏览与收藏，不能发布、下单、评价、举报（§5.2）' })
              ),
              h('a', { class: 'btn btn-primary', href: '#/verify' }, st.certStatus === '待审核' ? '查看进度' : '去核验')
            )
          )
        : null,
      h(
        'div',
        { class: 'menu-list mt-3' },
        menuItem('我的商品', '发布 / 编辑 / 下架 / 重新提交', 'bag', '#/me/products'),
        menuItem('我的订单', '成交记录 / 评价 / 撤销成交', 'list', '#/me/orders'),
        menuItem('我的收藏', `${favs.total}/${favs.limit} 件`, 'heart', '#/me/favorites'),
        menuItem('我的私信', `${badgeData.messageUnread} 条未读`, 'chat', '#/messages'),
        menuItem('消息通知', `${badgeData.notificationUnread} 条未读`, 'bell', '#/notifications'),
        menuItem('信用分', `当前 ${credit.score} 分`, 'star', '#/me/credit'),
        menuItem('我的举报', '查看举报处理进度', 'flag', '#/me/reports'),
        menuItem('资料设置', '真实姓名 / 手机号 / 宿舍地址', 'settings', '#/me/profile')
      ),
      h('div', { class: 'card card-pad mt-3' },
        h('div', { class: 'card-title mb-2', text: '会话与账号' }),
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
          h('a', { class: 'btn', href: '#/verify' }, '学生证核验'),
          h('button', {
            class: 'btn',
            onClick: async () => {
              await apiPost('/api/auth/logout');
              await reloadMe();
              toast('已退出登录', 'ok');
              location.hash = '#/';
            }
          }, '退出登录')
        )
      )
    )
  );
}

const statCard = (num, label) => h('div', { class: 'stat' }, h('div', { class: 'stat-num', text: String(num) }), h('div', { class: 'stat-label', text: label }));

const menuItem = (title, sub, iconName, href) =>
  h('a', { class: 'menu-item', href },
    h('span', { class: 'mi-icon' }, icon(iconName, 17)),
    h('span', {}, h('div', { class: 'mi-title', text: title }), h('div', { class: 'mi-sub', text: sub }))
  );

/* ============================================================== 我的商品 */
async function myProductsView() {
  if (!isStudent()) return goLogin();
  const data = await apiGet('/api/me/products');
  const tabs = ['待审核', '在售', '已售出', '已下架'];
  let active = tabs[0];
  const body = h('div', {});

  const paint = () => {
    body.innerHTML = '';
    const items = data.groups[active] || [];
    if (!items.length) {
      body.appendChild(empty(`暂无「${active}」商品`, active === '待审核' ? '发布后需管理员审核通过才会在售' : ''));
      return;
    }
    const list = h('div', { class: 'list' });
    for (const p of items) {
      const acts = [];
      if (p.canEdit) acts.push(h('a', { class: 'btn btn-sm', href: `#/edit/${p.id}` }, '编辑'));
      if (p.canWithdraw) acts.push(h('button', { class: 'btn btn-sm', onClick: () => act(() => apiPost(`/api/products/${p.id}/withdraw`), '已撤回') }, '撤回'));
      if (p.canTakeDown) acts.push(h('button', { class: 'btn btn-sm btn-danger', onClick: () => act(() => apiPost(`/api/products/${p.id}/take-down`), '已下架') }, '下架'));
      if (p.canResubmit) acts.push(h('button', { class: 'btn btn-sm btn-primary', onClick: () => act(() => apiPost(`/api/products/${p.id}/resubmit`, {}), '已重新提交审核') }, '修改后重新提交'));
      if (p.canDelete) acts.push(h('button', {
        class: 'btn btn-sm btn-danger',
        onClick: async () => {
          if (!(await confirmDialog({ title: '永久删除商品', message: '删除后从所有列表永久移除、不可恢复（历史成交与收藏记录保留）。', danger: true, okText: '删除' }))) return;
          act(() => apiDelete(`/api/products/${p.id}`), '已删除');
        }
      }, '删除'));

      list.appendChild(
        h('div', { class: 'list-item' },
          h('a', { class: 'thumb', href: `#/p/${p.id}` }, p.images?.[0] ? h('img', { src: p.images[0] }) : null),
          h('div', { class: 'grow' },
            h('a', { class: 'li-title', href: `#/p/${p.id}`, text: p.title }),
            h('div', { class: 'li-sub' },
              `${money(p.price)} · ${p.condition} · 浏览 ${p.viewCount} · 收藏 ${p.favoriteCount}`,
              p.offShelfReason ? ` · 下架原因：${p.offShelfReason}` : ''
            ),
            p.reviewNote ? h('div', { class: 'text-xs', style: { color: 'var(--danger)' }, text: p.reviewNote }) : null
          ),
          h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, statusBadge(p.status), ...acts)
        )
      );
    }
    body.appendChild(h('div', { class: 'card' }, list));
  };

  const act = async (fn, okMsg) => {
    try {
      await fn();
      toast(okMsg, 'ok');
      await myProductsView();
    } catch (err) {
      handleError(err);
    }
  };

  const tabBar = h('div', { class: 'tabs' },
    tabs.map((t) =>
      h('button', {
        class: `tab ${t === active ? 'active' : ''}`,
        onClick: (e) => {
          active = t;
          tabBar.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          paint();
        }
      }, t, h('span', { class: 'text-xs', text: ` ${(data.groups[t] || []).length}` }))
    )
  );

  shell(
    page(
      h('div', { class: 'row-between mb-3' },
        h('div', {}, h('h2', { class: 'section-title', text: '我的商品' }), h('p', { class: 'section-sub', text: `共 ${data.total} 件；「待审核」只能撤回，「已售出」不可下架（§7.4.1）` })),
        h('a', { class: 'btn btn-primary', href: '#/publish' }, icon('plus', 15), '发布闲置')
      ),
      tabBar,
      body
    )
  );
  paint();
}

/* ============================================================== 我的订单 */
async function ordersView() {
  if (!isStudent()) return goLogin();
  let role = 'all';
  const wrap = h('div', {});
  const tabs = [['all', '全部'], ['buyer', '我买到的'], ['seller', '我卖出的']];

  const paint = async () => {
    wrap.innerHTML = '';
    wrap.appendChild(loading());
    const orders = await apiGet(`/api/me/orders${qs({ role })}`);
    wrap.innerHTML = '';
    if (!orders.length) {
      wrap.appendChild(h('div', { class: 'card' }, empty('还没有成交记录', '去首页看看有没有想买的东西（UC-16 辅事件流 A）', h('a', { class: 'btn btn-primary', href: '#/' }, '去逛逛'))));
      return;
    }
    const list = h('div', { class: 'list' });
    for (const o of orders) list.appendChild(orderRow(o));
    wrap.appendChild(h('div', { class: 'card' }, list));
  };

  shell(
    page(
      h('div', { class: 'mb-3' },
        h('h2', { class: 'section-title', text: '我的订单（成交记录）' }),
        h('p', { class: 'section-sub', text: '本版订单没有状态机：只有「有效 / 已撤销」与「撤销免责判定」两个标记（§7.1）' })
      ),
      h('div', { class: 'tabs' },
        tabs.map(([v, label]) =>
          h('button', {
            class: `tab ${v === role ? 'active' : ''}`,
            onClick: (e) => {
              role = v;
              e.currentTarget.parentElement.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
              e.currentTarget.classList.add('active');
              paint();
            }
          }, label)
        )
      ),
      wrap
    )
  );
  paint();
}

function orderRow(o) {
  const flags = [badge(o.status === '有效' ? '成交有效' : '已撤销', o.status === '有效' ? 'green' : 'gray')];
  if (o.status === '已撤销') flags.push(badge(`免责判定：${o.cancelJudgement}`, o.cancelJudgement === '计违约' ? 'red' : o.cancelJudgement === '已免责' ? 'green' : 'amber'));
  const acts = [];
  if (o.canReview) acts.push(h('button', { class: 'btn btn-sm btn-primary', onClick: () => reviewDialog(o) }, '去评价'));
  if (o.canCancel) acts.push(h('button', { class: 'btn btn-sm btn-danger', onClick: () => cancelDialog(o) }, '撤销成交'));
  if (o.canJudge) acts.push(h('button', { class: 'btn btn-sm', onClick: () => judgeDialog(o) }, '判定免责'));
  acts.push(h('button', { class: 'btn btn-sm', onClick: () => orderDetailDialog(o) }, '详情'));
  acts.push(h('a', { class: 'btn btn-sm', onClick: () => { location.hash = `#/messages/${o.productId}/${o.peerId}`; } }, '私信'));

  return h('div', { class: 'list-item' },
    h('div', { class: 'grow' },
      h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
        h('span', { class: 'li-title', text: o.productTitle || '商品' }),
        ...flags,
        o.myRole === 'buyer' ? badge('我是买家', 'blue') : badge('我是卖家', 'gray')
      ),
      h('div', { class: 'li-sub', text: `订单 ${o.id} · 成交 ${money(o.amount)} · ${dt(o.createdAt)} · 对方 ${o.peerNickname || '—'}` }),
      o.status === '已撤销'
        ? h('div', { class: 'text-xs text-muted', text: `撤销方：${o.cancelInitiatorId === (student()?.id || '') ? '我' : '对方'} · 原因：${o.cancelReason} · 时间：${dt(o.cancelledAt)}` })
        : null,
      o.status === '有效' && o.canCancel === false && !o.myReview
        ? h('div', { class: 'text-xs text-muted', text: o.reviewRemaining === '已到期' ? '评价期限已过（7 天内未评价将 −1 分）' : `评价剩余时间：${o.reviewRemaining}` })
        : null
    ),
    h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', flexDirection: 'column', alignItems: 'flex-end' } }, ...acts)
  );
}

async function orderDetailDialog(o) {
  const d = await apiGet(`/api/orders/${o.id}`);
  modal({
    title: '成交详情',
    wide: true,
    body: h('div', {},
      h('dl', { class: 'kv', style: { gridTemplateColumns: '110px 1fr' } },
        h('dt', { text: '订单编号' }), h('dd', { class: 'mono', text: d.id }),
        h('dt', { text: '商品' }), h('dd', {}, h('a', { href: `#/p/${d.productId}`, style: { color: 'var(--brand)' }, text: d.productTitle }), ` （当前状态：${d.productStatus}）`),
        h('dt', { text: '成交金额' }), h('dd', { text: money(d.amount) }),
        h('dt', { text: '成交时间' }), h('dd', { text: dt(d.createdAt) }),
        h('dt', { text: '成交状态' }), h('dd', { text: d.status }),
        h('dt', { text: '买家' }), h('dd', { text: d.buyer?.nickname || '—' }),
        h('dt', { text: '卖家' }), h('dd', { text: d.seller?.nickname || '—' })
      ),
      d.status === '已撤销'
        ? h('div', { class: 'form-error mt-2' },
            `撤销信息：发起人 ${d.cancelInitiatorId === student()?.id ? '我' : '对方'} · 原因 ${d.cancelReason} · 时间 ${dt(d.cancelledAt)}`,
            h('br'),
            `免责判定：${d.cancelJudgement}${d.judgeDeadline ? `（截止 ${dt(d.judgeDeadline)}，剩余 ${remain(d.judgeDeadline)}）` : ''}`
          )
        : null,
      h('div', { class: 'divider' }),
      h('div', { class: 'card-title mb-2', text: '评价' }),
      d.reviews?.length
        ? d.reviews.map((r) => h('div', { class: 'list-item', style: { border: '1px solid var(--line-2)', borderRadius: '10px', marginBottom: '8px' } },
            h('div', { class: 'grow' },
              h('div', { class: 'text-sm', style: { fontWeight: '600' }, text: r.reviewerNickname }),
              h('div', { class: 'text-sm text-muted', text: r.content }),
              h('div', { class: 'text-xs text-muted', text: dt(r.createdAt) })
            )
          ))
        : h('div', { class: 'text-sm text-muted', text: '双方尚未评价。评价只有文字、不设星级；7 天内未评价将失去评价资格并 −1 分（BR-08、BR-14 ③）。' })
    ),
    footer: [
      d.canReview ? h('button', { class: 'btn btn-primary', onClick: () => { reviewDialog(d); } }, '去评价') : null,
      d.canCancel ? h('button', { class: 'btn btn-danger', onClick: () => { cancelDialog(d); } }, '撤销成交') : null,
      d.canJudge ? h('button', { class: 'btn', onClick: () => { judgeDialog(d); } }, '同意免责 / 计违约') : null
    ].filter(Boolean)
  });
}

function reviewDialog(o) {
  const ta = h('textarea', { class: 'textarea', maxlength: 500, placeholder: '说说这次交易的体验（仅文字，不设星级；不可修改）' });
  const m = modal({
    title: '评价这次交易',
    body: h('div', {},
      h('div', { class: 'form-ok', text: '提交评价后你本人 +2 信用分（BR-14 ①），评价不可修改。' }),
      field('评价内容', ta, '1～500 字；不得含联系方式、广告或辱骂（BR-04）', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          try {
            await apiPost(`/api/orders/${o.id}/reviews`, { content: ta.value.trim() });
            m.close();
            toast('评价已提交，信用分 +2', 'ok');
            await reloadMe();
            ordersView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '提交评价')
    ]
  });
}

function cancelDialog(o) {
  const reasons = ['买家不想要了', '卖家不卖了', '货物与描述不符', '约不上时间', '其他'];
  let pick = reasons[0];
  const m = modal({
    title: '撤销成交',
    body: h('div', {},
      h('div', { class: 'form-error', text: '撤销即时生效、不可回滚：商品会回到「在售」，原成交记录保留为历史。对方可在 7 天内判「已免责」或「计违约」；7 天未处理默认计违约（违约方 −2 分）。' }),
      field('撤销原因', h('select', { class: 'select', onChange: (e) => { pick = e.target.value; } },
        reasons.map((r) => h('option', { value: r, text: r }))
      ), '仅需单方决定，不需要对方同意（BR-21）', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-danger',
        onClick: async () => {
          try {
            await apiPost(`/api/orders/${o.id}/cancel`, { reason: pick });
            m.close();
            toast('撤销已生效，商品回到在售', 'ok');
            ordersView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '确认撤销')
    ]
  });
}

function judgeDialog(o) {
  const m = modal({
    title: '撤销免责判定',
    body: h('div', {},
      h('p', { class: 'text-sm text-muted', text: `对方撤销了这笔成交（原因：${o.cancelReason}）。你可以选择：` }),
      h('div', { class: 'form-ok', text: '同意免责：对方不扣分，仅保留撤销记录。' }),
      h('div', { class: 'form-error', text: '计违约：对方信用分 −2（每笔成交最多一次）。' }),
      h('p', { class: 'text-xs text-muted', text: `剩余判定时间：${o.judgeRemaining || '—'}；超时未处理系统自动计违约。` })
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '稍后'),
      h('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          try {
            await apiPost(`/api/orders/${o.id}/cancel-judgement`, { judgement: '已免责' });
            m.close();
            toast('已选择同意免责', 'ok');
            ordersView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '同意免责'),
      h('button', {
        class: 'btn btn-danger',
        onClick: async () => {
          try {
            await apiPost(`/api/orders/${o.id}/cancel-judgement`, { judgement: '计违约' });
            m.close();
            toast('已判定计违约', 'ok');
            ordersView();
          } catch (err) {
            handleError(err);
          }
        }
      }, '计违约')
    ]
  });
}

/* ============================================================== 我的收藏 */
async function favoritesView() {
  if (!isStudent()) return goLogin();
  const data = await apiGet('/api/me/favorites');
  shell(
    page(
      h('div', { class: 'mb-3' },
        h('h2', { class: 'section-title', text: '我的收藏' }),
        h('p', { class: 'section-sub', text: `共 ${data.total}/${data.limit} 件；收藏不锁定商品，商品售出或下架后标记为「已失效」（BR-11）` })
      ),
      data.items.length
        ? h('div', { class: 'card' }, h('div', { class: 'list' },
            data.items.map((it) =>
              h('div', { class: 'list-item' },
                h('a', { class: 'thumb', href: `#/p/${it.product.id}` }),
                h('div', { class: 'grow' },
                  h('a', { class: 'li-title', href: `#/p/${it.product.id}`, text: it.product.title }),
                  h('div', { class: 'li-sub', text: `${money(it.product.price)} · ${it.product.condition} · 收藏于 ${dt(it.favoriteAt)}` })
                ),
                h('div', { class: 'row', style: { gap: '6px' } },
                  it.invalid ? badge('已失效', 'gray') : statusBadge(it.product.status),
                  h('button', {
                    class: 'btn btn-sm',
                    onClick: async () => {
                      await apiDelete(`/api/favorites/${it.product.id}`);
                      toast('已取消收藏', 'ok');
                      favoritesView();
                    }
                  }, '取消收藏')
                )
              )
            )
          ))
        : h('div', { class: 'card' }, empty('还没有收藏', '在商品详情页点「收藏」即可保留（UC-09）', h('a', { class: 'btn btn-primary', href: '#/' }, '去逛逛')))
    )
  );
}

/* ============================================================== 信用分 */
async function creditView(studentId) {
  if (!isStudent() && !isAdmin()) return goLogin();
  const data = await apiGet(studentId ? `/api/students/${studentId}/credit` : '/api/me/credit');
  const rows = data.records || [];
  shell(
    page(
      h('div', { class: 'mb-3' },
        h('h2', { class: 'section-title', text: '信用分' }),
        h('p', { class: 'section-sub', text: '初始 100 分，范围 0～150；低于 60 不可发布新商品，低于 40 不可下单（BR-13）。他人仅可见分数，不可见明细。' })
      ),
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { gap: '20px', flexWrap: 'wrap' } },
          h('div', {},
            h('div', { class: 'price-lg', style: { color: 'var(--brand)' }, text: String(data.score) }),
            h('div', { class: 'text-sm text-muted', text: '当前信用分' })
          ),
          h('div', { class: 'grow' },
            h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
              data.canPublish ? badge('可发布商品', 'green') : badge('不可发布新商品（<60）', 'red'),
              data.canOrder ? badge('可下单', 'green') : badge('不可下单（<40）', 'red')
            ),
            h('div', { class: 'text-xs text-muted mt-1', text: `阈值：发布 ≥ ${data.publishThreshold}，下单 ≥ ${data.orderThreshold}；越界按 0 / 150 截断` })
          )
        ),
        data.rules
          ? h('div', { class: 'divider' })
          : null,
        data.rules
          ? h('div', {},
              h('div', { class: 'card-title mb-2', text: '评分规则' }),
              h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' } },
                data.rules.events.map((e) =>
                  h('div', { class: 'stat' },
                    h('div', { style: { fontWeight: '700', color: e.delta.startsWith('+') ? 'var(--brand)' : 'var(--danger)' }, text: `${e.name} ${e.delta}` }),
                    h('div', { class: 'text-xs text-muted', text: e.desc })
                  )
                )
              )
            )
          : null
      ),
      data.records === null
        ? h('div', { class: 'card card-pad mt-3' }, h('div', { class: 'text-sm text-muted', text: data.hint || '仅本人与管理员可见变动明细' }))
        : h('div', { class: 'card mt-3' },
            h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: '信用变动明细' })),
            rows.length
              ? h('table', { class: 'table' },
                  h('thead', {}, h('tr', {}, h('th', { text: '时间' }), h('th', { text: '事件' }), h('th', { class: 'num', text: '变动' }), h('th', { text: '原因' }), h('th', { text: '关联订单' }))),
                  h('tbody', {}, rows.map((r) =>
                    h('tr', {},
                      h('td', { class: 'nowrap', text: dt(r.createdAt) }),
                      h('td', { text: r.eventType }),
                      h('td', { class: 'num', style: { color: r.delta > 0 ? 'var(--brand)' : 'var(--danger)', fontWeight: '700' }, text: r.delta > 0 ? `+${r.delta}` : String(r.delta) }),
                      h('td', { text: r.reason }),
                      h('td', { class: 'mono text-xs', text: r.orderId || '—' })
                    )
                  ))
                )
              : empty('暂无变动记录', '新用户初始 100 分，完成首笔交易并提交评价后开始累积')
          )
    )
  );
}

/* ============================================================== 我的举报 */
async function reportsView() {
  if (!isStudent()) return goLogin();
  const list = await apiGet('/api/me/reports');
  shell(
    page(
      h('div', { class: 'mb-3' },
        h('h2', { class: 'section-title', text: '我的举报' }),
        h('p', { class: 'section-sub', text: '举报须核实后才会处置；提交举报本身不扣分（BR-14 说明）' })
      ),
      list.length
        ? h('div', { class: 'card' }, h('div', { class: 'list' },
            list.map((r) =>
              h('div', { class: 'list-item' },
                h('div', { class: 'grow' },
                  h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
                    h('span', { class: 'li-title', text: `${r.targetType}举报 · ${r.type}` }),
                    badge(r.handleStatus, r.handleStatus === '已处理' ? 'green' : r.handleStatus === '已驳回' ? 'gray' : 'amber'),
                    r.violationCodes ? badge(`§4.3 ${r.violationCodes}`, 'blue') : null
                  ),
                  h('div', { class: 'li-sub', text: `${r.targetProductTitle || r.targetStudentNickname || ''} · 提交于 ${dt(r.createdAt)}` }),
                  h('div', { class: 'text-sm text-muted', text: `说明：${r.reason}` }),
                  r.result ? h('div', { class: 'text-sm', style: { color: 'var(--brand)' }, text: `处理结果：${r.result}` }) : null
                ),
                h('div', { class: 'text-xs text-muted mono', text: r.id })
              )
            )
          ))
        : h('div', { class: 'card' }, empty('还没有提交过举报', '在商品详情页或成交/私信页面可发起举报（UC-12）'))
    )
  );
}

/* ============================================================== 资料设置 */
async function profileEditView() {
  if (!isStudent()) return goLogin();
  const st = student();
  const state = { nickname: st.nickname, realName: st.realName, phone: st.phone || '', dorm: st.dorm || '' };
  const errWrap = h('div', {});
  shell(
    page(
      h('div', { class: 'mb-3' },
        h('h2', { class: 'section-title', text: '资料设置' }),
        h('p', { class: 'section-sub', text: '手机号与宿舍地址仅本人与管理员可见，平台不向任何交易对家展示（NFR-04）' })
      ),
      h('div', { class: 'card card-pad', style: { maxWidth: '560px' } },
        errWrap,
        field('昵称', h('input', { class: 'input', value: state.nickname, maxlength: 20, onInput: (e) => { state.nickname = e.target.value; } }), '公开展示的称呼，1～20 字符', true),
        field('真实姓名', h('input', { class: 'input', value: state.realName, maxlength: 20, onInput: (e) => { state.realName = e.target.value; } }), '仅用于学生证核验时与证件比对，不公开', true),
        field('手机号（可选）', h('input', { class: 'input', value: state.phone, placeholder: '11 位手机号', onInput: (e) => { state.phone = e.target.value; } }), '仅本人与管理员可见，任何交易对家都看不到'),
        field('宿舍地址（可选）', h('input', { class: 'input', value: state.dorm, maxlength: 100, onInput: (e) => { state.dorm = e.target.value; } }), '仅本人与管理员可见'),
        h('button', {
          class: 'btn btn-primary',
          onClick: async () => {
            try {
              await apiPatch('/api/me/profile', {
                nickname: state.nickname,
                realName: state.realName,
                phone: state.phone,
                dorm: state.dorm
              });
              await reloadMe();
              toast('资料已更新', 'ok');
            } catch (err) {
              errWrap.innerHTML = '';
              errWrap.appendChild(errorBox(err.message));
            }
          }
        }, '保存')
      )
    )
  );
}

/* ============================================================== 个人主页 */
async function userView(id) {
  if (!isStudent() && !isAdmin()) {
    return shell(page(h('div', { class: 'card card-pad' }, empty('登录后可查看用户主页', '游客不可查看他人主页（UC-33 辅事件流 C）', h('a', { class: 'btn btn-primary', href: '#/login' }, '去登录')))));
  }
  let data;
  try {
    data = await apiGet(`/api/students/${id}/profile`);
  } catch (err) {
    return shell(page(h('div', { class: 'card card-pad' }, empty('用户不存在', err.message))));
  }
  const st = data.student;
  const actions = [];
  if (!data.isSelf && isStudent()) {
    actions.push(h('button', { class: 'btn btn-danger btn-sm', onClick: () => reportDialog('学生', st.id, st.nickname) }, icon('flag', 14), '举报该用户'));
  }

  shell(
    page(
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap' } },
          h('div', { class: 'avatar-lg', style: { background: 'var(--brand-light)', color: 'var(--brand)' }, text: (st.nickname || '?').slice(0, 1) }),
          h('div', { class: 'grow' },
            h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
              h('span', { style: { fontSize: '19px', fontWeight: '800', color: '#173d31' }, text: st.nickname }),
              certBadge(st.certStatus),
              st.banned ? badge('该账号已被封禁', 'red') : null
            ),
            h('div', { class: 'text-sm text-muted', text: `信用分 ${st.creditScore} · 评价 ${st.reviewCount} · 在售 ${st.inSaleCount} · 被核实争议 ${st.verifiedDisputeCount}` })
          ),
          h('div', { class: 'row', style: { gap: '8px' } }, ...actions)
        ),
        st.verifiedDisputeCount > 0
          ? h('div', { class: 'form-error mt-2', text: `该用户有 ${st.verifiedDisputeCount} 次「对人举报经核实成立」的记录（只显示计数，不公开具体内容与举报人）。` })
          : null
      ),
      h('div', { class: 'card mt-3' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: `在售商品（${data.inSaleProducts.length}）` })),
        data.inSaleProducts.length
          ? h('div', { class: 'card-body' }, h('div', { class: 'grid' }, data.inSaleProducts.map((p) =>
              h('a', { class: 'pcard', href: `#/p/${p.id}` },
                h('div', { class: 'pcard-body' },
                  h('div', { class: 'pcard-title', text: p.title }),
                  h('div', { class: 'pcard-price' }, h('small', { text: '¥' }), p.price),
                  h('div', { class: 'pcard-meta' }, h('span', { class: 'tag', text: p.condition }), h('span', { text: dt(p.publishedAt) }))
                )
              )
            )))
          : empty('暂无在售商品', st.banned ? '账号封禁后其在售商品已被联动下架（BR-10）' : '')
      ),
      h('div', { class: 'card mt-3' },
        h('div', { class: 'card-head' },
          h('div', { class: 'card-title', text: `收到的评价（${data.reviews.length}）` }),
          h('div', { class: 'text-xs text-muted', text: '仅展示双方均已提交的评价（BR-08）' })
        ),
        data.reviews.length
          ? h('div', { class: 'list' }, data.reviews.map((r) =>
              h('div', { class: 'list-item' },
                h('div', { class: 'grow' },
                  h('div', { class: 'text-sm', style: { fontWeight: '600' }, text: r.reviewerNickname }),
                  h('div', { class: 'text-sm text-muted', text: r.content })
                ),
                h('div', { class: 'text-xs text-muted', text: dt(r.createdAt) })
              )
            ))
          : empty('暂无公开评价')
      )
    )
  );
}

/* ============================================================== 学生证核验 */
async function verifyView() {
  if (!isStudent()) return goLogin('提交学生证核验');
  const info = await apiGet('/api/verifications/mine');
  const apps = await apiGet('/api/verifications/mine/applications');
  const errWrap = h('div', {});
  const state = { studentNo: info.declaredNo || '', image: null };
  let imagePreview = null;

  const form = () => {
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' },
      onChange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          state.image = await fileToDataUrl(f, 1600);
          imagePreview.innerHTML = '';
          imagePreview.appendChild(h('img', { src: state.image, style: { width: '100%', borderRadius: '10px' } }));
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    });
    imagePreview = h('div', {});
    return h('div', {},
      errWrap,
      field('申报学号', h('input', {
        class: 'input',
        placeholder: '请输入本人学号（6～20 位数字）',
        value: state.studentNo,
        onInput: (e) => { state.studentNo = e.target.value.trim(); }
      }), '核验通过后学号与本账号绑定，且全局唯一（一学号一账号）', true),
      field('学生证照片', h('div', {},
        h('label', { class: 'btn' }, icon('upload', 15), '选择图片', fileInput),
        imagePreview
      ), '需含姓名、学号、本人照片的证件页；仅审核职责内的管理员可见（NFR-08）', true),
      h('button', {
        class: 'btn btn-primary btn-lg',
        onClick: async () => {
          errWrap.innerHTML = '';
          try {
            if (!state.image) throw new Error('请上传学生证照片');
            await apiPost('/api/verifications', { studentNo: state.studentNo, image: state.image });
            await reloadMe();
            toast('核验申请已提交，管理员将在 24 小时内审核', 'ok');
            verifyView();
          } catch (err) {
            errWrap.innerHTML = '';
            errWrap.appendChild(errorBox(err.message));
          }
        }
      }, info.certStatus === '已驳回' ? '重新提交核验' : '提交核验')
    );
  };

  const statusCard = h('div', { class: 'card card-pad' },
    h('div', { class: 'row-between' },
      h('div', {},
        h('div', { class: 'card-title', text: `当前认证状态：${info.certStatus}` }),
        h('div', { class: 'text-sm text-muted' },
          info.certStatus === '已认证' ? '已具备发布、下单、评价、举报资格。核验通过不解除账号封禁（BR-19）。'
            : info.certStatus === '待审核' ? '管理员将在 24 小时内作出结论；超时不自动通过（AT-06）。'
            : info.certStatus === '已驳回' ? `可修改后重新提交，剩余重提次数 ${info.resubmitLimit - info.resubmitCount} 次（BR-17）。`
            : '注册后 7 天内须提交核验申请（BR-16）。'
        )
      ),
      certBadge(info.certStatus)
    ),
    info.latest?.rejectReason
      ? h('div', { class: 'form-error mt-2', text: `驳回原因：${info.latest.rejectReason}` })
      : null,
    h('div', { class: 'text-xs text-muted mt-2', text: `已重提 ${info.resubmitCount}/${info.resubmitLimit} 次${info.declaredNo ? ` · 本次申报学号 ${info.declaredNo}` : ''}` })
  );

  shell(
    page(
      h('div', { class: 'mb-3' },
        h('h2', { class: 'section-title', text: '学生证核验' }),
        h('p', { class: 'section-sub', text: '平台自建账号体系：邮箱注册 → 申报学号并上传学生证 → 管理员人工核验 → 取得发布与交易资格' })
      ),
      statusCard,
      info.canSubmit
        ? h('div', { class: 'card card-pad mt-3' }, h('div', { class: 'card-title mb-2', text: '提交核验申请' }), form())
        : h('div', { class: 'card card-pad mt-3' }, h('div', { class: 'text-sm text-muted', text: info.verified ? '已认证，无需重复提交。' : '当前状态不可提交新的核验申请。' })),
      h('div', { class: 'card mt-3' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: '历史申请' })),
        apps.length
          ? h('div', { class: 'list' }, apps.map((a) =>
              h('div', { class: 'list-item' },
                h('div', { class: 'grow' },
                  h('div', { class: 'text-sm', text: `申报学号 ${a.declaredNo}` }),
                  h('div', { class: 'text-xs text-muted', text: `提交 ${dt(a.submittedAt)}${a.reviewedAt ? ` · 审核 ${dt(a.reviewedAt)}` : ''}` }),
                  a.rejectReason ? h('div', { class: 'text-xs', style: { color: 'var(--danger)' }, text: `驳回原因：${a.rejectReason}` }) : null
                ),
                badge(a.reviewStatus, a.reviewStatus === '已通过' ? 'green' : a.reviewStatus === '已驳回' ? 'red' : 'amber')
              )
            ))
          : empty('暂无申请记录')
      )
    )
  );
}

/* ================================================================ 私信 */
async function messagesView(activeProductId = null, activePeerId = null) {
  if (!isStudent() && !isAdmin()) return goLogin('查看私信');
  const data = await apiGet('/api/messages/conversations');
  const listEl = h('div', { class: 'inbox-list' });
  const chatEl = h('div', { class: 'chat' });

  const paintList = () => {
    listEl.innerHTML = '';
    if (!data.items.length) {
      listEl.appendChild(empty('还没有会话', '在商品详情页点「联系卖家」发起沟通（UC-29）'));
      return;
    }
    for (const c of data.items) {
      const active = c.productId === activeProductId && c.peerId === activePeerId;
      listEl.appendChild(
        h('div', {
          class: `conv-item ${active ? 'active' : ''}`,
          onClick: () => { location.hash = `#/messages/${c.productId}/${c.peerId}`; }
        },
          h('div', { class: 'conv-top' },
            h('span', { class: 'conv-name', text: c.peerNickname }),
            h('span', { class: 'conv-time', text: timeAgo(c.lastAt) })
          ),
          h('div', { class: 'conv-preview', text: `${c.lastFromMe ? '我：' : ''}${c.lastContent || ''}` }),
          h('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } },
            h('span', { class: 'text-xs text-muted', text: `《${c.productTitle}》` }),
            h('span', { class: 'grow' }),
            c.unread ? h('span', { class: 'conv-unread', text: c.unread }) : null
          )
        )
      );
    }
  };

  const paintChat = async () => {
    chatEl.innerHTML = '';
    if (!activeProductId || !activePeerId) {
      chatEl.appendChild(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon' }, icon('chat', 44)),
        h('div', { class: 'empty-title', text: '选择左侧会话来查看消息' }),
        h('div', { class: 'text-sm', text: '私信必须绑定一件具体商品；同一（商品，双方）只有一条会话（BR-20）' })
      ));
      return;
    }
    let conv = null;
    try {
      conv = await apiGet(`/api/messages/conversations/${activeProductId}/${activePeerId}`);
    } catch (err) {
      if (err.code !== 'PERMISSION_DENIED') {
        chatEl.appendChild(empty('会话不可用', err.message));
        return;
      }
      // 尚未产生消息：展示空会话以便发起第一条消息
      conv = { productId: activeProductId, peerId: activePeerId, peerNickname: '', messages: [], productTitle: '' };
    }

    const product = await apiGet(`/api/products/${activeProductId}`).catch(() => null);
    const title = conv.productTitle || product?.title || '商品会话';

    chatEl.appendChild(
      h('div', { class: 'chat-head' },
        h('div', {},
          h('div', { style: { fontWeight: '700' }, text: conv.peerNickname || product?.seller?.nickname || '对方' }),
          h('div', { class: 'text-xs text-muted' },
            `关于《${title}》`, product ? ` · 当前状态 ${product.status}` : '',
            conv.peerBanned ? ' · 对方账号当前不可用' : ''
          )
        ),
        product ? h('a', { class: 'btn btn-sm', href: `#/p/${product.id}` }, '查看商品') : null
      )
    );

    const bodyEl = h('div', { class: 'chat-body' });
    if (!conv.messages.length) {
      bodyEl.appendChild(h('div', { class: 'text-sm text-muted center', style: { margin: 'auto' }, text: '还没有消息。发送第一条消息开始沟通，例如约定取货时间与地点。' }));
    }
    for (const m of conv.messages) {
      bodyEl.appendChild(
        h('div', { class: `msg ${m.mine ? 'mine' : ''}` },
          h('div', { class: 'msg-bubble', text: m.content }),
          h('div', { class: 'msg-time', text: di(m.createdAt) })
        )
      );
    }
    chatEl.appendChild(bodyEl);

    const ta = h('textarea', {
      class: 'textarea',
      maxlength: 500,
      placeholder: '输入消息（纯文本，1～500 字）',
      onKeydown: (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
      }
    });
    const send = async () => {
      const content = ta.value.trim();
      if (!content) return toast('消息内容不能为空', 'warn');
      try {
        await apiPost('/api/messages', { productId: activeProductId, content, toId: activePeerId });
        ta.value = '';
        await reloadBadge();
        await paintChat();
        const d2 = await apiGet('/api/messages/conversations');
        data.items = d2.items;
        paintList();
      } catch (err) {
        handleError(err, '发送失败');
      }
    };
    chatEl.appendChild(
      h('div', { class: 'chat-input' },
        ta,
        h('button', { class: 'btn btn-primary', onClick: send }, '发送')
      )
    );
    bodyEl.scrollTop = bodyEl.scrollHeight;
  };

  shell(
    page(
      h('div', { class: 'mb-3 row-between' },
        h('div', {},
          h('h2', { class: 'section-title', text: '我的私信' }),
          h('p', { class: 'section-sub', text: `共 ${data.total} 个会话、${data.unreadTotal} 条未读；平台不展示对方手机号，沟通全部在站内（NFR-04）` })
        ),
        h('a', { class: 'btn', href: '#/' }, '去逛商品')
      ),
      h('div', { class: 'card' }, h('div', { class: 'inbox' }, listEl, chatEl))
    )
  );
  paintList();
  await paintChat();
}

const di = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ================================================================ 通知 */
async function notificationsView() {
  if (!isStudent() && !isAdmin()) return goLogin('查看消息通知');
  const data = await apiGet('/api/notifications?pageSize=50');
  const typeKind = { 核验: 'blue', 商品审核: 'amber', 成交: 'green', 处置: 'red', 信用: 'gray', 私信: 'green', 账号: 'gray' };
  shell(
    page(
      h('div', { class: 'mb-3 row-between' },
        h('div', {},
          h('h2', { class: 'section-title', text: '消息通知' }),
          h('p', { class: 'section-sub', text: `共 ${data.total} 条，未读 ${data.unread} 条；仅保留最近 ${data.retentionDays} 天的记录（UC-18 辅事件流 D）` })
        ),
        h('button', {
          class: 'btn',
          onClick: async () => {
            await apiPost('/api/notifications/read-all');
            await reloadBadge();
            notificationsView();
          }
        }, '全部标为已读')
      ),
      data.items.length
        ? h('div', { class: 'card' }, h('div', { class: 'list' },
            data.items.map((n) =>
              h('div', {
                class: 'list-item clickable',
                style: n.read ? {} : { background: '#fbfdfb' },
                onClick: async () => {
                  try {
                    if (!n.read) await apiPost(`/api/notifications/${n.id}/read`);
                  } catch { /* ignore */ }
                  await reloadBadge();
                  navigateForNotification(n);
                }
              },
                n.read ? h('span', { class: 'thumb', style: { display: 'grid', placeItems: 'center' } }, icon('bell', 18)) : h('span', { class: 'thumb', style: { display: 'grid', placeItems: 'center', background: 'var(--brand-light)', color: 'var(--brand)' } }, icon('bell', 18)),
                h('div', { class: 'grow' },
                  h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
                    h('span', { class: 'li-title', text: n.title }),
                    badge(n.msgType, typeKind[n.msgType] || 'gray'),
                    n.read ? null : badge('未读', 'red')
                  ),
                  h('div', { class: 'text-sm text-muted', text: n.content }),
                  h('div', { class: 'text-xs text-muted', text: timeAgo(n.createdAt) })
                )
              )
            )
          ))
        : h('div', { class: 'card' }, empty('没有消息', '有新的核验结果、商品审核、成交与私信时会在这里提醒（UC-18 辅事件流 A）'))
    )
  );
}

function navigateForNotification(n) {
  switch (n.relatedKind) {
    case 'product':
      location.hash = `#/p/${n.relatedId}`;
      break;
    case 'order':
      location.hash = '#/me/orders';
      break;
    case 'report':
      location.hash = '#/me/reports';
      break;
    case 'cert':
      location.hash = '#/verify';
      break;
    case 'conversation':
      if (n.productId && n.peerId) location.hash = `#/messages/${n.productId}/${n.peerId}`;
      break;
    default:
      location.hash = '#/me';
  }
}

/* ================================================================ 登录注册 */
async function loginView() {
  const state = { email: '', password: '' };
  const errWrap = h('div', {});
  shell(
    page(
      h('div', { class: 'auth-wrap' },
        h('div', { class: 'auth-card card card-pad' },
          h('div', { class: 'auth-title', text: '登录拾光二手' }),
          h('div', { class: 'auth-sub', text: '邮箱 + 密码登录；学号不参与登录，核验通过后自动绑定' }),
          h('div', { class: 'mt-3' }, errWrap),
          field('邮箱', h('input', { class: 'input', type: 'email', placeholder: 'you@campus.edu', onInput: (e) => { state.email = e.target.value.trim(); } }), '', true),
          field('密码', h('input', {
            class: 'input',
            type: 'password',
            placeholder: '请输入密码',
            onKeydown: (e) => { if (e.key === 'Enter') doLogin(); },
            onInput: (e) => { state.password = e.target.value; }
          }), '', true),
          h('div', { class: 'row-between', style: { marginBottom: '14px' } },
            h('a', { class: 'text-sm', href: '#/register', style: { color: 'var(--brand)' }, text: '注册新账号' }),
            h('a', { class: 'text-sm', href: '#/forgot', style: { color: 'var(--muted)' }, text: '忘记密码？' })
          ),
          h('button', { class: 'btn btn-primary btn-lg btn-block', onClick: doLogin }, '登录'),
          h('div', { class: 'text-xs text-muted mt-2', text: '连续 5 次密码错误将锁定 15 分钟（NFR-05）' }),
          h('div', { class: 'divider' }),
          h('div', { class: 'text-xs text-muted', html: '演示账号：<b>lin@campus.edu</b> / <b>zhao@campus.edu</b> / <b>ma@campus.edu</b> / <b>guo@campus.edu</b>，密码均为 <b>Test@12345</b>' }),
          h('div', { class: 'text-xs text-muted', html: '管理员后台：<a href="/admin" style="color:var(--brand)">/admin</a>，账号 <b>ADM-001</b> / <b>Admin@12345</b>' })
        )
      )
    )
  );

  async function doLogin() {
    errWrap.innerHTML = '';
    try {
      await apiPost('/api/auth/login', { email: state.email, password: state.password });
      await reloadMe();
      toast('登录成功', 'ok');
      location.hash = '#/';
    } catch (err) {
      errWrap.innerHTML = '';
      errWrap.appendChild(errorBox(err.message));
    }
  }
}

async function registerView() {
  const state = { email: '', code: '', nickname: '', realName: '', password: '', phone: '', agree: false };
  const errWrap = h('div', {});
  const codeBtn = h('button', { class: 'btn', onClick: sendCode }, '获取验证码');
  let cooldown = 0;

  async function sendCode() {
    errWrap.innerHTML = '';
    try {
      if (!state.email) throw new Error('请先填写邮箱');
      await apiPost('/api/auth/send-code', { email: state.email });
      toast('验证码已发送（演示环境请点右下角扳手图标查看开发邮箱）', 'ok', 5000);
      cooldown = 60;
      const tick = () => {
        if (cooldown <= 0) {
          codeBtn.disabled = false;
          codeBtn.textContent = '重新获取';
          return;
        }
        codeBtn.disabled = true;
        codeBtn.textContent = `${cooldown}s`;
        cooldown--;
        setTimeout(tick, 1000);
      };
      tick();
    } catch (err) {
      errWrap.innerHTML = '';
      errWrap.appendChild(errorBox(err.message));
    }
  }

  shell(
    page(
      h('div', { class: 'auth-wrap' },
        h('div', { class: 'auth-card card card-pad' },
          h('div', { class: 'auth-title', text: '注册账号' }),
          h('div', { class: 'auth-sub', text: '以邮箱为唯一账号；注册后需提交学生证核验才能交易' }),
          h('div', { class: 'mt-3' }, errWrap),
          field('邮箱', h('input', { class: 'input', type: 'email', placeholder: 'you@campus.edu', onInput: (e) => { state.email = e.target.value.trim(); } }), '邮箱唯一，须符合邮箱格式', true),
          field('邮箱验证码', h('div', { class: 'code-row' },
            h('input', { class: 'input', maxlength: 6, placeholder: '6 位数字', onInput: (e) => { state.code = e.target.value.trim(); } }),
            codeBtn
          ), '10 分钟内有效、一次性；错误 5 次作废（NFR-10）', true),
          field('昵称', h('input', { class: 'input', maxlength: 20, placeholder: '公开展示的称呼', onInput: (e) => { state.nickname = e.target.value; } }), '1～20 字符', true),
          field('真实姓名', h('input', { class: 'input', maxlength: 20, placeholder: '与证件一致，仅核验使用', onInput: (e) => { state.realName = e.target.value; } }), '不公开，仅用于核验比对', true),
          field('手机号（可选）', h('input', { class: 'input', placeholder: '11 位手机号，可不填', onInput: (e) => { state.phone = e.target.value.trim(); } }), '仅本人与管理员可见'),
          field('登录密码', h('input', { class: 'input', type: 'password', placeholder: '至少 8 位，含字母与数字', onInput: (e) => { state.password = e.target.value; } }), '只存不可逆哈希', true),
          h('label', { class: 'checkbox mb-2' },
            h('input', { type: 'checkbox', onChange: (e) => { state.agree = e.target.checked; } }),
            h('span', { text: '我已阅读并同意《用户协议》与《隐私政策》' })
          ),
          h('button', {
            class: 'btn btn-primary btn-lg btn-block',
            onClick: async () => {
              errWrap.innerHTML = '';
              try {
                await apiPost('/api/auth/register', {
                  email: state.email,
                  code: state.code,
                  nickname: state.nickname,
                  realName: state.realName,
                  password: state.password,
                  phone: state.phone || undefined,
                  agree: state.agree
                });
                await apiPost('/api/auth/login', { email: state.email, password: state.password });
                await reloadMe();
                toast('注册成功，请提交学生证核验', 'ok');
                location.hash = '#/verify';
              } catch (err) {
                errWrap.innerHTML = '';
                errWrap.appendChild(errorBox(err.message));
              }
            }
          }, '注册'),
          h('div', { class: 'text-sm mt-2 center' }, h('a', { href: '#/login', style: { color: 'var(--brand)' }, text: '已有账号？去登录' }))
        )
      )
    )
  );
}

async function forgotView() {
  const state = { email: '', code: '', password: '' };
  const errWrap = h('div', {});
  shell(
    page(
      h('div', { class: 'auth-wrap' },
        h('div', { class: 'auth-card card card-pad' },
          h('div', { class: 'auth-title', text: '找回密码' }),
          h('div', { class: 'auth-sub', text: '通过注册邮箱验证码重置；重置后该账号所有登录会话立即失效' }),
          h('div', { class: 'mt-3' }, errWrap),
          field('注册邮箱', h('input', { class: 'input', type: 'email', placeholder: 'you@campus.edu', onInput: (e) => { state.email = e.target.value.trim(); } }), '无论邮箱是否存在，提示一致（防账号枚举）', true),
          h('button', {
            class: 'btn mb-3',
            onClick: async () => {
              errWrap.innerHTML = '';
              try {
                const r = await apiPost('/api/auth/forgot/send-code', { email: state.email });
                toast(r.message || '若该邮箱已注册，验证码已发送', 'ok', 4500);
              } catch (err) {
                errWrap.innerHTML = '';
                errWrap.appendChild(errorBox(err.message));
              }
            }
          }, '发送验证码'),
          field('验证码', h('input', { class: 'input', maxlength: 6, placeholder: '6 位数字', onInput: (e) => { state.code = e.target.value.trim(); } }), '', true),
          field('新密码', h('input', { class: 'input', type: 'password', placeholder: '至少 8 位，含字母与数字', onInput: (e) => { state.password = e.target.value; } }), '不得与当前密码相同', true),
          h('button', {
            class: 'btn btn-primary btn-lg btn-block',
            onClick: async () => {
              errWrap.innerHTML = '';
              try {
                await apiPost('/api/auth/forgot/reset', { email: state.email, code: state.code, newPassword: state.password });
                toast('密码已重置，请用新密码登录', 'ok');
                location.hash = '#/login';
              } catch (err) {
                errWrap.innerHTML = '';
                errWrap.appendChild(errorBox(err.message));
              }
            }
          }, '重置密码'),
          h('div', { class: 'text-sm mt-2 center' }, h('a', { href: '#/login', style: { color: 'var(--brand)' }, text: '返回登录' }))
        )
      )
    )
  );
}

/* ================================================================ 举报弹窗 */
function reportDialog(targetType, targetId, targetName) {
  if (!isStudent()) return goLogin('举报');
  if (!certified()) return toast('请先完成学生证核验（§5.2）', 'warn');
  const types = targetType === '商品'
    ? ['违禁品', '虚假描述', '价格欺诈', '站外导流', '其他']
    : ['收款不履约', '其他'];
  let pick = types[0];
  const ta = h('textarea', { class: 'textarea', maxlength: 500, placeholder: '请描述具体情况，可说明时间、沟通内容等' });
  const hint = targetType === '学生'
    ? '对学生的举报仅受理「与该学生的成交或沟通中发生的行为」，且你必须与对方有过成交或私信（UC-12 辅事件流 C）'
    : '「违禁品」对应 §4.3 禁售品类清单（A1–E2），管理员会核实具体类目编号；「站外导流」指在描述或图片中发布与本次交易无关的联系方式或广告';
  const m = modal({
    title: `举报${targetType}：${targetName}`,
    body: h('div', {},
      h('div', { class: 'form-ok', text: hint }),
      field('举报类型', h('select', { class: 'select', onChange: (e) => { pick = e.target.value; } },
        types.map((t) => h('option', { value: t, text: t }))
      ), '', true),
      field('举报说明', ta, '1～500 字；同一对象只能举报一次', true)
    ),
    footer: [
      h('button', { class: 'btn', onClick: () => m.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          try {
            await apiPost('/api/reports', { targetType, targetId, type: pick, reason: ta.value.trim() });
            m.close();
            toast('举报已提交，管理员将在 24 小时内处理', 'ok');
            location.hash = '#/me/reports';
          } catch (err) {
            handleError(err);
          }
        }
      }, '提交举报')
    ]
  });
}

/* ==================================================================== 启动 */
(async function boot() {
  try {
    S.me = await fetchMe(true);
    S.badge = await fetchBadge();
  } catch {
    S.me = { kind: 'guest' };
  }
  window.addEventListener('hashchange', router);
  await router();
})();

window.__SHIGUANG__ = { S, reloadMe };
