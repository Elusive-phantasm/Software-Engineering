import { defineStore } from 'pinia';
import { authApi, socialApi } from '../api';
import { TOKEN_KEY } from '../api/http';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    me: null,
    kind: 'guest',
    badge: { notificationUnread: 0, messageUnread: 0 },
    loaded: false
  }),
  getters: {
    isLogin: (s) => !!s.token && s.kind !== 'guest',
    isStudent: (s) => s.kind === 'student',
    isAdmin: (s) => s.kind === 'admin',
    student: (s) => (s.kind === 'student' ? s.me : null),
    certified: (s) => s.kind === 'student' && s.me?.certStatus === '已认证'
  },
  actions: {
    async fetchMe() {
      if (!this.token) {
        this.kind = 'guest';
        this.me = null;
        this.loaded = true;
        return null;
      }
      try {
        const res = await authApi.me();
        this.kind = res.data.kind;
        this.me = res.data.profile || null;
      } catch {
        this.kind = 'guest';
        this.me = null;
        this.token = '';
        localStorage.removeItem(TOKEN_KEY);
      }
      this.loaded = true;
      return this.me;
    },
    async login(payload) {
      const res = await authApi.login(payload);
      this.token = res.data.token;
      localStorage.setItem(TOKEN_KEY, this.token);
      this.kind = 'student';
      this.me = res.data.student;
      await this.refreshBadge();
      return res;
    },
    async adminLogin(payload) {
      const res = await authApi.adminLogin(payload);
      this.token = res.data.token;
      localStorage.setItem(TOKEN_KEY, this.token);
      this.kind = 'admin';
      this.me = res.data.admin;
      return res;
    },
    async logout() {
      try {
        await authApi.logout();
      } catch {
        /* 忽略退出失败 */
      }
      this.token = '';
      this.kind = 'guest';
      this.me = null;
      this.badge = { notificationUnread: 0, messageUnread: 0 };
      localStorage.removeItem(TOKEN_KEY);
    },
    async refreshBadge() {
      if (!this.token) {
        return;
      }
      try {
        const res = await socialApi.badge();
        this.badge = res.data;
      } catch {
        /* 忽略红点失败 */
      }
    }
  }
});
