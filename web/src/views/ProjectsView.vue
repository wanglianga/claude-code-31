<template>
  <div>
    <div class="card">
      <div class="row-between">
        <div class="row">
          <select v-model="filterStatus" class="select" style="width: 140px" @change="load">
            <option value="">全部状态</option>
            <option v-for="(label, key) in meta.statusLabels" :key="key" :value="key">{{ label }}</option>
          </select>
          <input v-model="keyword" class="input" style="width: 220px" placeholder="搜索新人 / 项目编号" @keyup.enter="load" />
          <button class="btn btn-ghost btn-sm" @click="load">查询</button>
        </div>
        <button v-if="auth.hasRole('sales')" class="btn" @click="openCreate">＋ 新建宴会项目</button>
      </div>
    </div>

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>项目编号</th><th>新人</th><th>婚期 / 场次</th><th>宴会厅</th><th>桌数</th>
            <th>菜单</th><th>销售</th><th>状态</th><th>变更 / 任务</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in items" :key="p.id" style="cursor: pointer" @click="$router.push(`/projects/${p.id}`)">
            <td class="link">{{ p.code }}</td>
            <td style="font-weight: 600">{{ p.couple_names }}</td>
            <td>{{ fmtDate(p.wedding_date) }} · {{ p.meal_session }}</td>
            <td>{{ p.hall_name }}</td>
            <td>{{ p.planned_tables }}<span class="muted small"> +{{ p.reserve_tables }}备</span></td>
            <td>{{ p.menu_name }}</td>
            <td>{{ p.sales_name || '—' }}</td>
            <td><span class="badge" :class="'status-' + p.status">{{ meta.statusLabels[p.status] }}</span></td>
            <td>
              <span v-if="p.open_changes" class="badge change-open">{{ p.open_changes }} 变更</span>
              <span v-if="p.open_tasks" class="badge task-pending" style="margin-left:4px">{{ p.open_tasks }} 任务</span>
              <span v-if="!p.open_changes && !p.open_tasks" class="muted small">—</span>
            </td>
          </tr>
          <tr v-if="!items.length"><td colspan="9" class="empty">暂无项目</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 新建宴会项目（销售录入） -->
    <Modal v-model="showCreate" title="新建宴会项目 · 销售录入" wide>
      <div class="form-grid">
        <div class="field">
          <label>新人姓名 <span class="req">*</span></label>
          <input v-model="form.couple_names" class="input" placeholder="如 张先生 & 李女士" />
        </div>
        <div class="field">
          <label>联系电话</label>
          <input v-model="form.contact_phone" class="input" placeholder="新人或家人联系电话" />
        </div>
        <div class="field">
          <label>婚期 <span class="req">*</span></label>
          <input v-model="form.wedding_date" type="date" class="input" />
        </div>
        <div class="field">
          <label>场次</label>
          <select v-model="form.meal_session" class="select">
            <option>午宴</option><option>晚宴</option>
          </select>
        </div>
        <div class="field">
          <label>宴会厅 <span class="req">*</span></label>
          <select v-model="form.hall_id" class="select">
            <option :value="0" disabled>请选择</option>
            <option v-for="h in meta.halls" :key="h.id" :value="h.id">
              {{ h.name }}（{{ h.length_m }}×{{ h.width_m }}m，≤{{ h.max_tables }}桌）
            </option>
          </select>
        </div>
        <div class="field">
          <label>菜单套餐 <span class="req">*</span></label>
          <select v-model="form.menu_id" class="select">
            <option :value="0" disabled>请选择</option>
            <option v-for="m in meta.menus" :key="m.id" :value="m.id">
              {{ m.name }}（{{ fmtMoney(m.price_per_table) }}/桌）
            </option>
          </select>
        </div>
        <div class="field">
          <label>计划桌数 <span class="req">*</span></label>
          <input v-model.number="form.planned_tables" type="number" min="1" class="input" />
        </div>
        <div class="field">
          <label>备桌数</label>
          <input v-model.number="form.reserve_tables" type="number" min="0" class="input" />
        </div>
        <div class="field full">
          <label>仪式需求</label>
          <textarea v-model="form.ceremony_req" class="textarea" placeholder="证婚形式、道具、特殊环节…"></textarea>
        </div>
        <div class="field full">
          <label>灯光音响</label>
          <textarea v-model="form.lighting_audio" class="textarea" placeholder="灯光组数、追光、LED 屏、麦克风数量…"></textarea>
        </div>
        <div class="field full">
          <label>花艺要求</label>
          <textarea v-model="form.floral_req" class="textarea" placeholder="色系、桌花、拱门、花柱、是否外部团队…"></textarea>
        </div>
        <div class="field full">
          <label>宾客动线</label>
          <textarea v-model="form.guest_flow" class="textarea" placeholder="签到 → 合影 → 入席动线，老人儿童优先安排…"></textarea>
        </div>
        <div class="field full">
          <label>备注</label>
          <textarea v-model="form.notes" class="textarea" placeholder="过敏宾客、特殊禁忌等"></textarea>
        </div>
      </div>

      <div class="divider"></div>
      <div class="row-between mb8">
        <b>付款节点</b>
        <button class="btn btn-ghost btn-sm" @click="form.payments.push({ kind: '节点款', label: '', amount: 0, due_date: form.wedding_date })">＋ 添加节点</button>
      </div>
      <div v-for="(p, i) in form.payments" :key="i" class="row mb8">
        <select v-model="p.kind" class="select" style="width: 110px">
          <option>定金</option><option>中期款</option><option>尾款</option><option>节点款</option>
        </select>
        <input v-model="p.label" class="input" style="width: 150px" placeholder="名称" />
        <input v-model.number="p.amount" type="number" min="0" class="input" style="width: 130px" placeholder="金额（元）" />
        <input v-model="p.due_date" type="date" class="input" style="width: 160px" />
        <button class="btn-link" @click="form.payments.splice(i, 1)">删除</button>
      </div>

      <template #foot>
        <button class="btn btn-ghost" @click="showCreate = false">取消</button>
        <button class="btn" :disabled="saving" @click="createProject">{{ saving ? '创建中…' : '创建项目' }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, submit } from '../api';
import Modal from '../components/Modal.vue';
import { fmtDate, fmtMoney } from '../fmt';
import { useAuthStore } from '../stores/auth';
import { useMetaStore } from '../stores/meta';
import { toast } from '../toast';
import type { Project } from '../types';

const auth = useAuthStore();
const meta = useMetaStore();
const router = useRouter();

const items = ref<Project[]>([]);
const filterStatus = ref('');
const keyword = ref('');
const showCreate = ref(false);
const saving = ref(false);

const form = reactive<any>({
  couple_names: '', contact_phone: '', wedding_date: '', meal_session: '晚宴',
  hall_id: 0, menu_id: 0, planned_tables: 20, reserve_tables: 2,
  ceremony_req: '', lighting_audio: '', floral_req: '', guest_flow: '', notes: '',
  payments: [
    { kind: '定金', label: '签约定金', amount: 20000, due_date: '' },
    { kind: '中期款', label: '婚前中期款', amount: 50000, due_date: '' },
    { kind: '尾款', label: '婚礼尾款', amount: 0, due_date: '' },
  ],
});

async function load() {
  const params = new URLSearchParams();
  if (filterStatus.value) params.set('status', filterStatus.value);
  if (keyword.value) params.set('q', keyword.value);
  const res = await api(`/projects?${params}`);
  items.value = res.items;
}

function openCreate() {
  const today = new Date();
  const def = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  form.wedding_date = def;
  form.payments.forEach((p: any) => { if (!p.due_date) p.due_date = def; });
  showCreate.value = true;
}

async function createProject() {
  if (!form.couple_names || !form.wedding_date || !form.hall_id || !form.menu_id) {
    return toast('请填写新人姓名、婚期、宴会厅与菜单', 'err');
  }
  saving.value = true;
  const res = await submit('/projects', { ...form });
  saving.value = false;
  if (res) {
    toast(`项目 ${res.code} 创建成功，已生成原计划版本`);
    showCreate.value = false;
    router.push(`/projects/${res.id}`);
  }
}

onMounted(async () => {
  await meta.load();
  await load();
});
</script>
