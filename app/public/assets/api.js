/**
 * 前端 API 客户端。
 * 统一约定：后端返回 {ok:true,data} 或 {ok:false,code,message}。
 * 失败时抛出 ApiError（带 code / message / extra），由视图决定如何提示。
 */
export class ApiError extends Error {
  constructor(code, message, extra, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.extra = extra;
    this.status = status;
  }
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', `服务返回异常（HTTP ${res.status}）`, null, res.status);
  }
  if (!payload?.ok) {
    throw new ApiError(payload?.code || 'ERROR', payload?.message || '操作失败', payload?.extra, res.status);
  }
  return payload.data;
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body = {}) => request('POST', path, body);
export const apiPatch = (path, body = {}) => request('PATCH', path, body);
export const apiDelete = (path) => request('DELETE', path);

export const qs = (params = {}) => {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
};

/* ------------------------------------------------------------- 会话缓存 */
let meCache = null;
let badgeCache = { notificationUnread: 0, messageUnread: 0 };

export async function fetchMe(force = false) {
  if (meCache && !force) return meCache;
  meCache = await apiGet('/api/auth/me');
  return meCache;
}
export function setMe(value) {
  meCache = value;
}
export function clearMe() {
  meCache = null;
  badgeCache = { notificationUnread: 0, messageUnread: 0 };
}

export async function fetchBadge(force = true) {
  if (!force && badgeCache) return badgeCache;
  try {
    badgeCache = await apiGet('/api/badge');
  } catch {
    badgeCache = { notificationUnread: 0, messageUnread: 0 };
  }
  return badgeCache;
}
export const getBadgeCache = () => badgeCache;

/* ------------------------------------------------------- 开发工具接口 */
export const devMailbox = (limit = 20) => apiGet(`/api/dev/mailbox${qs({ limit })}`);
export const devState = () => apiGet('/api/dev/state');
export const devShiftTime = (hours) => apiPost('/api/dev/time-shift', { hours });
export const devRunScheduler = () => apiPost('/api/dev/scheduler/run');
export const devReset = () => apiPost('/api/dev/reset');
export const devRules = () => apiGet('/api/dev/rules');
