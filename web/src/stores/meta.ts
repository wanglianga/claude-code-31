import { defineStore } from 'pinia';
import { api } from '../api';
import type { Meta } from '../types';

// 元数据缓存：厅 / 菜单 / 用户 / 字典
export const useMetaStore = defineStore('meta', {
  state: () => ({
    meta: null as Meta | null,
    loading: null as Promise<void> | null,
  }),
  actions: {
    async load(force = false) {
      if (this.meta && !force) return;
      if (!this.loading) {
        this.loading = (async () => {
          this.meta = await api<Meta>('/meta');
        })();
      }
      await this.loading;
      this.loading = null;
    },
  },
  getters: {
    halls: (s) => s.meta?.halls || [],
    menus: (s) => s.meta?.menus || [],
    users: (s) => s.meta?.users || [],
    changeTypes: (s) => s.meta?.changeTypes || [],
    roleLabels: (s) => s.meta?.roleLabels || {},
    statusLabels: (s) => s.meta?.statusLabels || {},
    sourceLabels: (s) => s.meta?.sourceLabels || {},
  },
});
