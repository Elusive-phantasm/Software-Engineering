/**
 * 前端交互库：极简 DOM 构建 + 图标 + 弹窗 + 格式化。
 * 不依赖任何前端框架与 CDN，保证离线与答辩现场可用。
 */

/* ------------------------------------------------------------------- DOM */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

export function mount(root, ...children) {
  root.innerHTML = '';
  append(root, children);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ----------------------------------------------------------------- 图标 */
const PATHS = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  bell: 'M12 3a6 6 0 0 0-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z',
  chat: 'M4 4h16v12H8l-4 4V4Zm3 3v2h10V7H7Zm0 4v2h7v-2H7Z',
  heart: 'M12 20s-7-4.4-7-9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.8C19 15.6 12 20 12 20Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10c4 0 7 2 7 4.5V20H5v-1.5C5 16 8 14 12 14Z',
  arrowRight: 'M13 5l7 7-7 7v-5H4v-4h9V5Z',
  arrowLeft: 'M11 5v5h9v4h-9v5l-7-7 7-7Z',
  check: 'M9.6 16.2 4.8 11.4l-1.4 1.4 6.2 6.2L20.6 7.8l-1.4-1.4L9.6 16.2Z',
  close: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 10.6 10.6 4.3 4.3 5.7 2.9 12 9.2l4.9-4.9 1.4 1.4Z',
  alert: 'M12 3 22 20H2L12 3Zm-1 6v5h2V9h-2Zm0 6v2h2v-2h-2Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 4v5.2l3.6 2.1-1 1.7L11 13.5V7h2Z',
  shield: 'M12 2 20 5v7c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V5l8-3Zm-1 12.4 4.7-4.7-1.4-1.4L11 11.6 9.2 9.8 7.8 11.2 11 14.4Z',
  tag: 'M11 3h8a2 2 0 0 1 2 2v8l-9 9-10-10 9-9Zm5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  bag: 'M8 8V6a4 4 0 0 1 8 0v2h3v13H5V8h3Zm2 0h4V6a2 2 0 0 0-4 0v2Z',
  doc: 'M6 2h8l4 4v16H6V2Zm7 2v3h3l-3-3ZM8 11h8v2H8v-2Zm0 4h8v2H8v-2Z',
  upload: 'M12 3 6 9h4v7h4V9h4l-6-6ZM4 19h16v2H4v-2Z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-2.1-.9.5-2.2-2-1.5-1.9 1.2L13 7.3 12.6 5h-2.2L10 7.3l-2.4.4L5.6 6.5l-2 1.5.5 2.2L2 12l2.1.9-.5 2.2 2 1.5 2.4-1.2 1.4 1.3.4 2.3h2.4l.4-2.3 2.4-.4 1.9 1.2 2-1.5-.5-2.2L21 12Z',
  list: 'M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z',
  cash: 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm1 3v1.2c1 .2 1.8.9 1.8 1.9h-1.7c0-.4-.5-.7-1.1-.7s-1.1.3-1.1.7.5.6 1.4.8c1.2.3 2.5.7 2.5 2.1 0 1-.8 1.7-1.8 1.9V18h-2v-1.1c-1.1-.2-1.9-1-1.9-2h1.8c0 .4.5.7 1.2.7s1.2-.3 1.2-.7-.6-.6-1.5-.8c-1.2-.3-2.4-.7-2.4-2.1 0-1 .8-1.7 1.9-1.9V9h2Z',
  star: 'M12 3l2.6 5.6 6.1.8-4.5 4.3 1.1 6-5.3-3-5.3 3 1.1-6L3.3 9.4l6.1-.8L12 3Z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z',
  home: 'M12 3 3 10h2v10h5v-6h4v6h5V10h2L12 3Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2ZM6 9h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9Z',
  edit: 'M4 17.2 15.5 5.7l3 3L7 20.2H4v-3ZM17 4.2l1.4-1.4a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1 0 1.4L19.8 7l-2.8-2.8Z',
  eye: 'M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  flag: 'M6 3v18H4V3h2Zm2 1h11l-2.5 4L19 12H8V4Z',
  inbox: 'M4 4h16v10h-5l-1 2h-4l-1-2H4V4Zm0 12h4.5l1 2h5l1-2H20v6H4v-6Z',
  download: 'M12 3v9h4l-6 6-6-6h4V3h4ZM4 20h16v2H4v-2Z',
  tools: 'M14 3a5 5 0 0 0-4.9 6.1L3 15.2 5.8 18l6.1-6.1A5 5 0 0 0 18 7l-2 2-2-2 2-2a5 5 0 0 0-2-2Z'
};

export function icon(name, size = 18, cls = '') {
  const d = PATHS[name] || PATHS.info;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`.trim());
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

/* -------------------------------------------------------------- 提示条 */
let toastBox = null;
export function toast(message, type = 'info', ms = 3200) {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    document.body.appendChild(toastBox);
  }
  const el = h('div', { class: `toast ${type}` }, h('span', { class: 'grow', text: String(message) }));
  toastBox.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* -------------------------------------------------------------- 弹窗 */
export function modal({ title, body, footer, wide = false, onClose }) {
  const mask = h('div', { class: 'mask' });
  const close = () => {
    mask.remove();
    onClose?.();
  };
  const box = h(
    'div',
    { class: `modal${wide ? ' wide' : ''}` },
    h(
      'div',
      { class: 'modal-head' },
      h('div', { class: 'modal-title', text: title || '' }),
      h('button', { class: 'icon-btn', onClick: close, 'aria-label': '关闭' }, icon('close', 15))
    ),
    h('div', { class: 'modal-body' }, body),
    footer ? h('div', { class: 'modal-foot' }, footer) : null
  );
  mask.appendChild(box);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  document.body.appendChild(mask);
  return { close, el: box };
}

export function confirmDialog({ title = '确认操作', message = '', okText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: h('div', { class: 'text-sm', style: { lineHeight: '1.7' } }, message),
      footer: [
        h('button', { class: 'btn', onClick: () => { m.close(); resolve(false); } }, cancelText),
        h(
          'button',
          { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => { m.close(); resolve(true); } },
          okText
        )
      ],
      onClose: () => resolve(false)
    });
  });
}

export function promptDialog({ title, label, placeholder = '', value = '', multiline = false, okText = '提交' }) {
  return new Promise((resolve) => {
    const input = multiline
      ? h('textarea', { class: 'textarea', placeholder, value })
      : h('input', { class: 'input', placeholder, value });
    const m = modal({
      title,
      body: h('div', { class: 'field' }, label ? h('label', { class: 'label', text: label }) : null, input),
      footer: [
        h('button', { class: 'btn', onClick: () => { m.close(); resolve(null); } }, '取消'),
        h('button', { class: 'btn btn-primary', onClick: () => { const v = input.value.trim(); m.close(); resolve(v); } }, okText)
      ],
      onClose: () => resolve(null)
    });
    setTimeout(() => input.focus(), 50);
  });
}

/* -------------------------------------------------------------- 格式化 */
export const money = (v) => `¥${Number(v ?? 0).toFixed(2)}`;

export function dt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return dt(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h2 = Math.floor(m / 60);
  if (h2 < 24) return `${h2} 小时前`;
  const d = Math.floor(h2 / 24);
  if (d < 30) return `${d} 天前`;
  return dt(iso);
}

export function remain(deadlineIso) {
  if (!deadlineIso) return '';
  const diff = new Date(deadlineIso).getTime() - Date.now();
  if (diff <= 0) return '已到期';
  const d = Math.floor(diff / 86400000);
  const h2 = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d} 天 ${h2} 小时`;
  if (h2 > 0) return `${h2} 小时 ${m} 分`;
  return `${m} 分`;
}

/* -------------------------------------------------------------- 组件helpers */
export const badge = (text, kind = 'gray') => h('span', { class: `badge badge-${kind}`, text });

export function statusBadge(status) {
  const map = { 在售: 'green', 待审核: 'amber', 已售出: 'blue', 已下架: 'gray' };
  return badge(status, map[status] || 'gray');
}

export function certBadge(status) {
  const map = { 已认证: ['green', '已认证'], 待审核: ['amber', '核验中'], 已驳回: ['red', '核验未通过'], 未提交: ['gray', '未认证'] };
  const [kind, label] = map[status] || ['gray', status];
  return badge(label, kind);
}

export function empty(title, hint, action) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon('inbox', 44)),
    h('div', { class: 'empty-title', text: title }),
    hint ? h('div', { class: 'text-sm', text: hint }) : null,
    action ? h('div', { class: 'mt-2' }, action) : null
  );
}

export function loading(text = '加载中…') {
  return h('div', { class: 'empty' }, h('div', { class: 'text-sm', text }));
}

export function field(label, control, hint, required = false) {
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'label' }, label, required ? h('span', { class: 'req', text: '*' }) : null),
    control,
    hint ? h('div', { class: 'hint', text: hint }) : null
  );
}

export function errorBox(message) {
  return message ? h('div', { class: 'form-error', text: message }) : null;
}

export function okBox(message) {
  return message ? h('div', { class: 'form-ok', text: message }) : null;
}

/** 图片压缩：把用户选择的文件转成 dataURL（最长边 1200px，JPEG 0.82） */
export function fileToDataUrl(file, maxSide = 1200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片格式不支持'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h2 = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h2;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h2);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** 统一处理接口错误 */
export function handleError(err, fallback = '操作失败') {
  toast(err?.message || fallback, 'error', 4200);
  if (err?.code === 'AUTH_REQUIRED') setTimeout(() => { location.hash = '#/login'; }, 900);
}
