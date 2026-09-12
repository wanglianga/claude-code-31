<template>
  <div>
    <header v-if="auth.user" class="topbar">
      <div class="brand" @click="$router.push('/')">
        <span class="brand-mark">囍</span>
        <span class="brand-name">囍宴云 · 婚礼宴会厅管理</span>
      </div>
      <nav class="nav">
        <RouterLink to="/" exact-active-class="active">仪表盘</RouterLink>
        <RouterLink to="/schedule" active-class="active">厅期档期</RouterLink>
        <RouterLink to="/projects" active-class="active">宴会项目</RouterLink>
        <RouterLink to="/tasks" active-class="active">
          任务中心
          <span v-if="myOpenTasks" class="nav-badge">{{ myOpenTasks }}</span>
        </RouterLink>
      </nav>
      <div class="user-box">
        <span class="role-chip" :class="'role-' + auth.user.role">{{ auth.roleLabel }}</span>
        <span class="user-name">{{ auth.user.name }}</span>
        <button class="btn btn-ghost btn-sm" @click="logout">退出</button>
      </div>
    </header>

    <main :class="auth.user ? 'page' : ''">
      <RouterView />
    </main>

    <div class="toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useMetaStore } from './stores/meta';
import { toasts } from './toast';
import { api } from './api';

const auth = useAuthStore();
const meta = useMetaStore();
const router = useRouter();
const myOpenTasks = ref(0);

onMounted(async () => {
  if (auth.token) {
    await auth.fetchMe();
    if (auth.user) {
      await meta.load();
      refreshBadge();
    }
  }
});

async function refreshBadge() {
  try {
    const d = await api('/dashboard');
    myOpenTasks.value = d.stats.myPendingTasks;
  } catch { /* 忽略 */ }
}
setInterval(refreshBadge, 60000);

function logout() {
  auth.logout();
  router.push('/login');
}
</script>
