<template>
  <div>
    <div class="grid grid-4 mb16">
      <div class="stat-card"><div class="num">{{ data?.stats.todayWeddings ?? '—' }}</div><div class="label">今日婚礼场次</div></div>
      <div class="stat-card"><div class="num">{{ data?.stats.openChanges ?? '—' }}</div><div class="label">进行中临场变更</div></div>
      <div class="stat-card"><div class="num">{{ data?.stats.myPendingTasks ?? '—' }}</div><div class="label">我的待办任务</div></div>
      <div class="stat-card"><div class="num">{{ fmtMoney(data?.stats.monthRevenue) }}</div><div class="label">本月已收款项</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3 class="card-title">今日婚礼</h3>
        <div v-if="!data?.todayProjects?.length" class="empty">今日暂无婚礼场次</div>
        <div v-for="p in data?.todayProjects" :key="p.id" class="row-between" style="padding: 8px 0; border-bottom: 1px dashed var(--line)">
          <div>
            <span class="link" style="color: var(--rose); font-weight: 600; cursor: pointer" @click="$router.push(`/projects/${p.id}`)">{{ p.couple_names }}</span>
            <span class="muted small"> · {{ p.hall_name }} · {{ p.meal_session }} · {{ p.planned_tables }} 桌</span>
          </div>
          <span class="badge" :class="'status-' + p.status">{{ statusLabel(p.status) }}</span>
        </div>

        <h3 class="card-title mt16">最新临场变更</h3>
        <div v-if="!data?.recentChanges?.length" class="empty">暂无变更</div>
        <div v-for="c in data?.recentChanges" :key="c.id" class="row-between" style="padding: 7px 0; border-bottom: 1px dashed var(--line)">
          <div style="min-width: 0">
            <span class="badge" :class="'src-' + c.source">{{ sourceLabel(c.source) }}</span>
            <span style="margin-left: 6px; cursor: pointer" class="link" @click="$router.push(`/projects/${c.project_id}?tab=changes`)">{{ c.title }}</span>
            <div class="small muted">{{ c.couple_names }} · {{ fmtTime(c.created_at) }}</div>
          </div>
          <span class="badge" :class="'change-' + c.status">{{ c.status === 'open' ? '处理中' : c.status === 'resolved' ? '已解决' : '作废' }}</span>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">我的待办任务（{{ auth.roleLabel }}）</h3>
        <div v-if="!data?.myTasks?.length" class="empty">暂无待办任务</div>
        <div v-for="t in data?.myTasks" :key="t.id" class="task-row">
          <span class="badge" :class="'task-' + t.status">{{ t.status === 'pending' ? '待处理' : '处理中' }}</span>
          <div class="flex1">
            <div style="font-weight: 600">{{ t.title }}</div>
            <div class="small muted">{{ t.couple_names }} · {{ fmtDate(t.wedding_date) }}</div>
          </div>
          <button class="btn btn-sm btn-ghost" @click="$router.push(`/projects/${t.project_id}?tab=changes`)">去处理</button>
        </div>
        <div class="mt8 text-right">
          <button class="btn-link" @click="$router.push('/tasks')">进入任务中心 →</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtDate, fmtMoney, fmtTime } from '../fmt';
import { useAuthStore } from '../stores/auth';
import { useMetaStore } from '../stores/meta';

const auth = useAuthStore();
const meta = useMetaStore();
const data = ref<any>(null);

const statusLabel = (s: string) => meta.statusLabels[s] || s;
const sourceLabel = (s: string) => meta.sourceLabels[s] || s;

onMounted(async () => {
  data.value = await api('/dashboard');
});
</script>
