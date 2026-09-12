<template>
  <div v-if="d">
    <!-- 项目头 -->
    <div class="card">
      <div class="row-between">
        <div>
          <div class="row">
            <h2 style="margin: 0">{{ d.project.couple_names }}</h2>
            <span class="badge" :class="'status-' + d.project.status">{{ meta.statusLabels[d.project.status] }}</span>
          </div>
          <div class="muted mt8">
            {{ d.project.code }} · {{ fmtDate(d.project.wedding_date) }} {{ d.project.meal_session }} ·
            {{ d.hall?.name }} · {{ d.project.planned_tables }} 桌（备 {{ d.project.reserve_tables }}）·
            {{ d.menu?.name }} {{ fmtMoney(d.menu?.price_per_table) }}/桌
          </div>
        </div>
        <div class="row">
          <template v-if="auth.hasRole('manager', 'sales')">
            <button v-if="d.project.status === 'confirmed'" class="btn btn-ghost btn-sm" @click="setStatus('preparing')">开始筹备</button>
            <button v-if="d.project.status === 'preparing'" class="btn btn-gold btn-sm" @click="setStatus('live')">婚礼开始</button>
            <button v-if="d.project.status === 'live'" class="btn btn-green btn-sm" @click="setStatus('done')">礼成完结</button>
          </template>
          <button class="btn btn-sm" @click="openChange">⚡ 发起临场变更</button>
        </div>
      </div>
      <!-- 状态进度 -->
      <div class="row mt16" style="gap: 0">
        <template v-for="(s, i) in statusFlow" :key="s">
          <div class="status-step" :class="{ active: statusIdx >= i }">
            <span class="dot"></span>{{ meta.statusLabels[s] }}
          </div>
          <div v-if="i < statusFlow.length - 1" class="status-line" :class="{ active: statusIdx > i }"></div>
        </template>
      </div>
    </div>

    <!-- 标签页 -->
    <div class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ active: tab === t.key }" @click="switchTab(t.key)">
        {{ t.label }}
        <span v-if="t.count" class="tab-count">{{ t.count }}</span>
      </button>
    </div>

    <OverviewTab v-if="tab === 'overview'" :d="d" />
    <IntakeTab v-if="tab === 'intake'" :d="d" @changed="load" />
    <LayoutTab v-if="tab === 'layout'" :d="d" @changed="load" />
    <PrepTab v-if="tab === 'prep'" :d="d" @changed="load" />
    <ChangesTab v-if="tab === 'changes'" ref="changesRef" :d="d" @changed="load" />
    <VersionsTab v-if="tab === 'versions'" :d="d" @changed="load" />
    <SettlementTab v-if="tab === 'settlement'" :d="d" @changed="load" />
    <ArchiveTab v-if="tab === 'archive'" :d="d" @changed="load" />
  </div>
  <div v-else class="card empty">加载中…</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, submit } from '../api';
import ChangesTab from '../components/tabs/ChangesTab.vue';
import ArchiveTab from '../components/tabs/ArchiveTab.vue';
import IntakeTab from '../components/tabs/IntakeTab.vue';
import LayoutTab from '../components/tabs/LayoutTab.vue';
import OverviewTab from '../components/tabs/OverviewTab.vue';
import PrepTab from '../components/tabs/PrepTab.vue';
import SettlementTab from '../components/tabs/SettlementTab.vue';
import VersionsTab from '../components/tabs/VersionsTab.vue';
import { fmtDate, fmtMoney, STATUS_FLOW } from '../fmt';
import { useAuthStore } from '../stores/auth';
import { useMetaStore } from '../stores/meta';
import { toast } from '../toast';
import type { ProjectDetail } from '../types';

const route = useRoute();
const auth = useAuthStore();
const meta = useMetaStore();
const d = ref<ProjectDetail | null>(null);
const tab = ref('overview');
const changesRef = ref<any>(null);
const statusFlow = STATUS_FLOW;

const pid = Number(route.params.id);
const statusIdx = computed(() => (d.value ? statusFlow.indexOf(d.value.project.status) : 0));

const tabs = computed(() => {
  if (!d.value) return [];
  const openTasks = d.value.tasks.filter((t) => t.status !== 'done').length;
  const openChanges = d.value.changes.filter((c) => c.status === 'open').length;
  return [
    { key: 'overview', label: '概览' },
    { key: 'intake', label: '销售录入' },
    { key: 'layout', label: '厅内布置' },
    { key: 'prep', label: '婚前筹备', count: d.value.prep.filter((p) => p.status !== 'done').length || '' },
    { key: 'changes', label: '临场变更', count: openChanges || '' },
    { key: 'versions', label: '确认版本', count: d.value.versions.length || '' },
    { key: 'settlement', label: '结算支付' },
    { key: 'archive', label: '婚后档案' },
  ];
});

function switchTab(key: string) {
  tab.value = key;
}

function openChange() {
  tab.value = 'changes';
  setTimeout(() => changesRef.value?.openCreate(), 50);
}

async function setStatus(s: string) {
  const res = await submit(`/projects/${pid}`, { status: s }, 'PATCH');
  if (res) {
    toast(`项目状态已更新为「${meta.statusLabels[s]}」`);
    await load();
  }
}

async function load() {
  d.value = await api(`/projects/${pid}`);
}

onMounted(async () => {
  await meta.load();
  await load();
  if (route.query.tab) tab.value = String(route.query.tab);
});
</script>

<style scoped>
.status-step {
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted);
  white-space: nowrap;
}
.status-step .dot {
  width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line);
  background: #fff; display: inline-block;
}
.status-step.active { color: var(--rose-dark); font-weight: 700; }
.status-step.active .dot { background: var(--rose); border-color: var(--rose); }
.status-line { flex: 1; height: 2px; background: var(--line); margin: 0 8px; min-width: 24px; }
.status-line.active { background: var(--rose); }
</style>
