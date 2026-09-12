<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand">
        <span class="mark">囍</span>
        <h1>囍宴云</h1>
        <p>城市婚礼宴会厅档期布置与临场变更协同平台</p>
      </div>

      <div class="field mb8">
        <label>用户名</label>
        <input v-model="username" class="input" placeholder="请输入用户名" @keyup.enter="doLogin" />
      </div>
      <div class="field mb16">
        <label>密码</label>
        <input v-model="password" type="password" class="input" placeholder="请输入密码" @keyup.enter="doLogin" />
      </div>
      <button class="btn" style="width: 100%" :disabled="loading" @click="doLogin">
        {{ loading ? '登录中…' : '登 录' }}
      </button>

      <div class="divider"></div>
      <div class="small muted mb8">演示账号（密码均为 123456，点击填充）：</div>
      <div class="demo-accounts">
        <button v-for="a in demoAccounts" :key="a.u" @click="fill(a.u)">{{ a.label }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useMetaStore } from '../stores/meta';
import { toast } from '../toast';

const username = ref('');
const password = ref('');
const loading = ref(false);
const auth = useAuthStore();
const meta = useMetaStore();
const router = useRouter();
const route = useRoute();

const demoAccounts = [
  { u: 'sales01', label: '销售·王敏' },
  { u: 'planner01', label: '策划·李婉' },
  { u: 'manager01', label: '宴会经理·张强' },
  { u: 'kitchen01', label: '厨房·陈国栋' },
  { u: 'cashier01', label: '收银·赵燕' },
  { u: 'admin', label: '管理员' },
];

function fill(u: string) {
  username.value = u;
  password.value = '123456';
}

async function doLogin() {
  if (!username.value || !password.value) return toast('请输入用户名和密码', 'err');
  loading.value = true;
  try {
    await auth.login(username.value.trim(), password.value);
    await meta.load(true);
    toast(`欢迎，${auth.user?.name}（${auth.roleLabel}）`);
    router.push(String(route.query.redirect || '/'));
  } catch (e: any) {
    toast(e.message || '登录失败', 'err');
  } finally {
    loading.value = false;
  }
}
</script>
