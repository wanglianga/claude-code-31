<template>
  <div>
    <div class="card">
      <div class="row-between">
        <h3 class="card-title" style="margin: 0">厅期档期 · {{ year }} 年 {{ month }} 月</h3>
        <div class="row">
          <button class="btn btn-ghost btn-sm" @click="shift(-1)">← 上月</button>
          <button class="btn btn-ghost btn-sm" @click="goToday">本月</button>
          <button class="btn btn-ghost btn-sm" @click="shift(1)">下月 →</button>
        </div>
      </div>
      <div class="legend mt8 mb8">
        <span><i class="dot" style="background:#64b5f6"></i>已确认</span>
        <span><i class="dot" style="background:#ffb74d"></i>筹备中</span>
        <span><i class="dot" style="background:#e57373"></i>婚礼进行中</span>
        <span><i class="dot" style="background:#81c784"></i>已完结</span>
        <span><i class="dot" style="background:#b0bec5"></i>已归档</span>
      </div>
      <div style="overflow-x: auto">
        <table class="sched-table">
          <thead>
            <tr>
              <th style="min-width: 90px">宴会厅</th>
              <th v-for="d in days" :key="d" :class="{ today: isToday(d) }">{{ d }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in meta.halls" :key="h.id">
              <th style="text-align: left; padding-left: 8px">
                {{ h.name }}
                <div class="small muted" style="font-weight: 400">≤{{ h.max_tables }} 桌</div>
              </th>
              <td v-for="d in days" :key="d" :class="{ today: isToday(d) }">
                <span
                  v-for="p in bookings[h.id]?.[d] || []"
                  :key="p.id + p.meal_session"
                  class="sched-chip"
                  :class="'status-' + p.status"
                  :title="`${p.couple_names} ${p.meal_session} ${p.planned_tables}桌（${p.menu_name || ''}）`"
                  @click="$router.push(`/projects/${p.id}`)"
                >{{ p.meal_session === '午宴' ? '午' : '晚' }}·{{ p.couple_names }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">本月场次列表（{{ items.length }}）</h3>
      <table class="table">
        <thead>
          <tr><th>日期</th><th>场次</th><th>新人</th><th>宴会厅</th><th>桌数</th><th>菜单</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in items" :key="p.id">
            <td>{{ fmtDate(p.wedding_date) }}</td>
            <td>{{ p.meal_session }}</td>
            <td><span class="link" @click="$router.push(`/projects/${p.id}`)">{{ p.couple_names }}</span></td>
            <td>{{ p.hall_name }}</td>
            <td>{{ p.planned_tables }} 桌</td>
            <td>{{ p.menu_name }}</td>
            <td><span class="badge" :class="'status-' + p.status">{{ meta.statusLabels[p.status] }}</span></td>
          </tr>
          <tr v-if="!items.length"><td colspan="7" class="empty">本月暂无场次</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtDate } from '../fmt';
import { useMetaStore } from '../stores/meta';

const meta = useMetaStore();
const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1);
const items = ref<any[]>([]);

const daysInMonth = computed(() => new Date(year.value, month.value, 0).getDate());
const days = computed(() => Array.from({ length: daysInMonth.value }, (_, i) => i + 1));

const bookings = computed(() => {
  const map: Record<number, Record<number, any[]>> = {};
  for (const p of items.value) {
    const d = Number(String(p.wedding_date).slice(8, 10));
    if (!map[p.hall_id]) map[p.hall_id] = {};
    if (!map[p.hall_id][d]) map[p.hall_id][d] = [];
    map[p.hall_id][d].push(p);
  }
  return map;
});

function isToday(d: number) {
  const t = new Date();
  return t.getFullYear() === year.value && t.getMonth() + 1 === month.value && t.getDate() === d;
}

async function load() {
  const from = `${year.value}-${String(month.value).padStart(2, '0')}-01`;
  const toMonth = month.value === 12 ? 1 : month.value + 1;
  const toYear = month.value === 12 ? year.value + 1 : year.value;
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01`;
  const res = await api(`/schedule?from=${from}&to=${to}`);
  items.value = res.items;
}

function shift(n: number) {
  let m = month.value + n;
  let y = year.value;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  year.value = y; month.value = m;
  load();
}
function goToday() {
  year.value = now.getFullYear(); month.value = now.getMonth() + 1;
  load();
}

onMounted(async () => {
  await meta.load();
  await load();
});
</script>
