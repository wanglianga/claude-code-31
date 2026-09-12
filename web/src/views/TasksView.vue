<template>
  <div>
    <div class="card">
      <div class="row">
        <span class="muted small">岗位：</span>
        <select v-model="role" class="select" style="width: 140px" @change="load">
          <option v-for="(label, key) in meta.roleLabels" :key="key" :value="key">{{ label }}</option>
        </select>
        <span class="muted small">状态：</span>
        <select v-model="status" class="select" style="width: 120px" @change="load">
          <option value="">全部</option>
          <option value="pending">待处理</option>
          <option value="doing">处理中</option>
          <option value="done">已完成</option>
        </select>
        <span class="muted small">共 {{ items.length }} 条</span>
      </div>
    </div>

    <div v-for="group in grouped" :key="group.code" class="card">
      <div class="row-between mb8">
        <b>
          <span class="link" style="color: var(--rose); cursor: pointer" @click="$router.push(`/projects/${group.projectId}?tab=changes`)">
            {{ group.couple }}
          </span>
          <span class="muted small"> · {{ group.code }} · {{ fmtDate(group.date) }}</span>
        </b>
      </div>
      <div v-for="t in group.tasks" :key="t.id" class="task-row">
        <span class="role-chip" :class="'role-' + t.role">{{ meta.roleLabels[t.role] }}</span>
        <div class="flex1">
          <div style="font-weight: 600">{{ t.title }}</div>
          <div class="small muted">{{ t.detail }}</div>
          <div class="small muted" v-if="t.change_title">
            来源变更：{{ t.change_title }}
            <span class="badge" :class="'src-' + t.change_source" style="margin-left: 4px">{{ meta.sourceLabels[t.change_source] }}</span>
          </div>
        </div>
        <span class="badge" :class="'task-' + t.status">{{ taskLabel(t.status) }}</span>
        <span v-if="t.assignee_name" class="small muted">{{ t.assignee_name }}</span>
        <div class="row" v-if="canAct(t)">
          <button v-if="t.status === 'pending'" class="btn btn-sm btn-ghost" @click="setStatus(t, 'doing')">开始处理</button>
          <button v-if="t.status !== 'done'" class="btn btn-sm btn-green" @click="setStatus(t, 'done')">完成</button>
          <button v-if="t.status === 'done'" class="btn btn-sm btn-ghost" @click="setStatus(t, 'pending')">重开</button>
        </div>
      </div>
    </div>
    <div v-if="!items.length" class="card empty">暂无任务</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, submit } from '../api';
import { fmtDate, TASK_STATUS_LABELS } from '../fmt';
import { useAuthStore } from '../stores/auth';
import { useMetaStore } from '../stores/meta';
import { toast } from '../toast';
import type { Task } from '../types';

const auth = useAuthStore();
const meta = useMetaStore();
const role = ref(auth.user?.role || 'manager');
const status = ref('');
const items = ref<Task[]>([]);

const taskLabel = (s: string) => TASK_STATUS_LABELS[s] || s;

const grouped = computed(() => {
  const map = new Map<string, any>();
  for (const t of items.value) {
    const key = `${t.project_id}`;
    if (!map.has(key)) {
      map.set(key, { projectId: t.project_id, couple: t.couple_names, code: t.project_code, date: t.wedding_date, tasks: [] });
    }
    map.get(key).tasks.push(t);
  }
  return [...map.values()];
});

function canAct(t: Task) {
  return auth.user && (t.role === auth.user.role || auth.hasRole('manager'));
}

async function setStatus(t: Task, s: string) {
  const res = await submit(`/tasks/${t.id}`, { status: s }, 'PATCH');
  if (res) {
    toast(`任务「${t.title}」已${TASK_STATUS_LABELS[s]}`);
    await load();
  }
}

async function load() {
  const params = new URLSearchParams();
  if (role.value) params.set('role', role.value);
  if (status.value) params.set('status', status.value);
  const res = await api(`/tasks?${params}`);
  items.value = res.items;
}

onMounted(async () => {
  await meta.load();
  await load();
});
</script>
