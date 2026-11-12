import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/',
    component: () => import('../layouts/StudentLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('../views/student/Home.vue') },
      { path: 'product/:id', name: 'product', component: () => import('../views/student/ProductDetail.vue') },
      { path: 'publish', name: 'publish', component: () => import('../views/student/Publish.vue'), meta: { auth: true } },
      { path: 'product/:id/edit', name: 'edit', component: () => import('../views/student/Publish.vue'), meta: { auth: true } },
      { path: 'me/products', name: 'myProducts', component: () => import('../views/student/MyProducts.vue'), meta: { auth: true } },
      { path: 'me/orders', name: 'orders', component: () => import('../views/student/Orders.vue'), meta: { auth: true } },
      { path: 'me/favorites', name: 'favorites', component: () => import('../views/student/Favorites.vue'), meta: { auth: true } },
      { path: 'me/credit', name: 'credit', component: () => import('../views/student/Credit.vue'), meta: { auth: true } },
      { path: 'me/reports', name: 'myReports', component: () => import('../views/student/MyReports.vue'), meta: { auth: true } },
      { path: 'verification', name: 'verification', component: () => import('../views/student/Verification.vue'), meta: { auth: true } },
      { path: 'messages', name: 'messages', component: () => import('../views/student/Messages.vue'), meta: { auth: true } },
      { path: 'messages/:productId/:peerId', name: 'conversation', component: () => import('../views/student/Conversation.vue'), meta: { auth: true } },
      { path: 'notifications', name: 'notifications', component: () => import('../views/student/Notifications.vue'), meta: { auth: true } },
      { path: 'u/:id', name: 'profile', component: () => import('../views/student/Profile.vue'), meta: { auth: true } }
    ]
  },
  { path: '/login', name: 'login', component: () => import('../views/student/Login.vue') },
  { path: '/register', name: 'register', component: () => import('../views/student/Register.vue') },
  { path: '/forgot', name: 'forgot', component: () => import('../views/student/Forgot.vue') },
  { path: '/admin/login', name: 'adminLogin', component: () => import('../views/admin/AdminLogin.vue') },
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { admin: true },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/admin/Dashboard.vue') },
      { path: 'certs', name: 'certs', component: () => import('../views/admin/CertAudit.vue') },
      { path: 'products', name: 'adminProducts', component: () => import('../views/admin/ProductAudit.vue') },
      { path: 'reports', name: 'adminReports', component: () => import('../views/admin/Reports.vue') },
      { path: 'disputes', name: 'adminDisputes', component: () => import('../views/admin/Disputes.vue') },
      { path: 'students', name: 'adminStudents', component: () => import('../views/admin/Students.vue') },
      { path: 'audit', name: 'adminAudit', component: () => import('../views/admin/AuditLogs.vue') }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) {
    await auth.fetchMe();
  }
  if (to.meta.auth && !auth.isLogin) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.admin) {
    if (!auth.isAdmin) {
      return { name: 'adminLogin', query: { redirect: to.fullPath } };
    }
  }
  if (to.name === 'login' && auth.isStudent) {
    return { name: 'home' };
  }
  return true;
});

export default router;
