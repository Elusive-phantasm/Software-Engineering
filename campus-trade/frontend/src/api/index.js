import http from './http';

/* ------------------------------------------------------------------ 认证 */
export const authApi = {
  me: () => http.get('/auth/me'),
  login: (payload) => http.post('/auth/login', payload),
  adminLogin: (payload) => http.post('/auth/admin/login', payload),
  logout: () => http.post('/auth/logout'),
  sendCode: (email) => http.post('/auth/send-code', { email }),
  register: (payload) => http.post('/auth/register', payload),
  forgotSendCode: (email) => http.post('/auth/forgot/send-code', { email }),
  resetPassword: (payload) => http.post('/auth/forgot/reset', payload),
  updateProfile: (payload) => http.patch('/auth/me/profile', payload),
  changeAdminPassword: (payload) => http.post('/auth/admin/change-password', payload)
};

/* ------------------------------------------------------------------ 商品 */
export const productApi = {
  categories: () => http.get('/categories'),
  list: (params) => http.get('/products', { params }),
  detail: (id) => http.get(`/products/${id}`),
  create: (payload) => http.post('/products', payload),
  update: (id, payload) => http.patch(`/products/${id}`, payload),
  withdraw: (id) => http.post(`/products/${id}/withdraw`),
  takeDown: (id) => http.post(`/products/${id}/take-down`),
  remove: (id) => http.delete(`/products/${id}`),
  resubmit: (id, payload) => http.post(`/products/${id}/resubmit`, payload || {}),
  mine: () => http.get('/me/products')
};

/* ------------------------------------------------------------------ 交易 */
export const orderApi = {
  create: (productId) => http.post('/orders', { productId }),
  mine: (role) => http.get('/me/orders', { params: { role } }),
  detail: (id) => http.get(`/orders/${id}`),
  cancel: (id, reason) => http.post(`/orders/${id}/cancel`, { reason }),
  judge: (id, judgement) => http.post(`/orders/${id}/cancel-judgement`, { judgement }),
  review: (id, content) => http.post(`/orders/${id}/reviews`, { content }),
  written: () => http.get('/me/reviews/written'),
  received: () => http.get('/me/reviews/received')
};

/* ------------------------------------------------------------ 收藏 / 信用 */
export const favoriteApi = {
  mine: () => http.get('/me/favorites'),
  add: (productId) => http.post('/favorites', { productId }),
  remove: (productId) => http.delete(`/favorites/${productId}`)
};

export const creditApi = {
  mine: () => http.get('/me/credit'),
  ofStudent: (id) => http.get(`/students/${id}/credit`)
};

/* ------------------------------------------------------------ 社交 / 通知 */
export const socialApi = {
  conversations: () => http.get('/messages/conversations'),
  conversation: (productId, peerId) => http.get(`/messages/conversations/${productId}/${peerId}`),
  send: (payload) => http.post('/messages', payload),
  appeal: (payload) => http.post('/messages/appeal', payload),
  unreadCount: () => http.get('/messages/unread-count'),
  notifications: (params) => http.get('/notifications', { params }),
  readNotification: (id) => http.post(`/notifications/${id}/read`),
  readAll: () => http.post('/notifications/read-all'),
  badge: () => http.get('/badge'),
  profile: (id) => http.get(`/students/${id}/profile`),
  report: (payload) => http.post('/reports', payload),
  myReports: () => http.get('/me/reports')
};

/* -------------------------------------------------------------- 核验 */
export const verificationApi = {
  submit: (payload) => http.post('/verifications', payload),
  mine: () => http.get('/verifications/mine')
};

/* -------------------------------------------------------------- 管理端 */
export const adminApi = {
  dashboard: () => http.get('/admin/dashboard'),
  verifications: (status) => http.get('/admin/verifications', { params: { status } }),
  approveCert: (id) => http.post(`/admin/verifications/${id}/approve`),
  rejectCert: (id, payload) => http.post(`/admin/verifications/${id}/reject`, payload),
  revokeCert: (studentId, payload) => http.post(`/admin/verifications/students/${studentId}/revoke`, payload),
  certImageUrl: (id) => `/api/admin/verifications/${id}/image`,
  products: (params) => http.get('/admin/products', { params }),
  approveProduct: (id) => http.post(`/admin/products/${id}/approve`),
  rejectProduct: (id, payload) => http.post(`/admin/products/${id}/reject`, payload),
  forceOff: (id, payload) => http.post(`/admin/products/${id}/force-off`, payload),
  restore: (id, payload) => http.post(`/admin/products/${id}/restore`, payload),
  forbidden: () => http.get('/admin/products/forbidden-categories'),
  reports: (status) => http.get('/admin/reports', { params: { status } }),
  handleReport: (id, payload) => http.post(`/admin/reports/${id}/handle`, payload),
  students: (params) => http.get('/admin/students', { params }),
  student: (id) => http.get(`/admin/students/${id}`),
  accountStatus: (id, payload) => http.post(`/admin/students/${id}/account-status`, payload),
  adjustCredit: (id, payload) => http.post(`/admin/students/${id}/credit`, payload),
  audit: (params) => http.get('/admin/audit', { params }),
  replyMessage: (payload) => http.post('/admin/messages/reply', payload),
  forcedOffList: () => http.get('/admin/forced-off-products'),
  meta: () => http.get('/admin/meta'),
  deleteReview: (id, reason) => http.post(`/admin/reviews/${id}/delete`, { reason })
};

/* -------------------------------------------------------------- 开发工具 */
export const devApi = {
  state: () => http.get('/dev/state'),
  reset: () => http.post('/dev/reset'),
  shift: (hours) => http.post('/dev/time-shift', { hours }),
  resetTime: () => http.post('/dev/time-reset'),
  runScheduler: () => http.post('/dev/scheduler/run'),
  mailbox: (limit = 20) => http.get('/dev/mailbox', { params: { limit } })
};
