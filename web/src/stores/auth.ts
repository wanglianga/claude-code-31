import { defineStore } from 'pinia';
import { api, getToken, setToken } from '../api';
import type { User } from '../types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    token: getToken(),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token && !!s.user,
    roleLabel(): string {
      const map: Record<string, string> = {
        admin: '管理员', sales: '销售', planner: '策划师',
        manager: '宴会经理', kitchen: '厨房', cashier: '收银', waiter: '服务员',
      };
      return this.user ? map[this.user.role] || this.user.role : '';
    },
  },
  actions: {
    async login(username: string, password: string) {
      const res = await api('/auth/login', { method: 'POST', body: { username, password } });
      this.token = res.token;
      this.user = res.user;
      setToken(res.token);
    },
    async fetchMe() {
      if (!this.token) return;
      try {
        const res = await api('/me');
        this.user = res.user;
      } catch {
        this.logout();
      }
    },
    logout() {
      this.user = null;
      this.token = '';
      setToken('');
    },
    hasRole(...roles: string[]) {
      return !!this.user && (roles.includes(this.user.role) || this.user.role === 'admin');
    },
  },
});
