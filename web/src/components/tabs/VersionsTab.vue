<template>
  <div>
    <div class="card">
      <div class="row-between">
        <div class="muted small" style="max-width: 720px">
          每次客户确认都会留存版本快照，并标注来源（原计划 / 彩排调整 / 现场临时）。婚后处理投诉与争议时，可对照版本厘清责任。
        </div>
        <button v-if="auth.hasRole('sales', 'planner', 'manager')" class="btn" @click="showCreate = true">＋ 生成客户确认版本</button>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">版本时间线</h3>
      <ul class="timeline">
        <li v-for="v in d.versions" :key="v.id">
          <div class="row">
            <b>V{{ v.version_no }} · {{ v.label }}</b>
            <span class="badge" :class="'src-' + v.source">{{ meta.sourceLabels[v.source] }}</span>
          </div>
          <div class="small">
            客户确认人：{{ v.confirmed_by || '—' }}
            <span v-if="v.note"> · {{ v.note }}</span>
          </div>
          <div class="t-time">{{ fmtTime(v.created_at) }}</div>
          <div class="row mt8">
            <button class="btn btn-ghost btn-sm" @click="viewSnapshot(v.id)">查看快照</button>
            <button class="btn btn-ghost btn-sm" @click="diffWithCurrent(v.id)">与当前方案对比</button>
          </div>
        </li>
      </ul>
      <div v-if="!d.versions.length" class="empty">暂无确认版本</div>
    </div>

    <!-- 生成版本 -->
    <Modal v-model="showCreate" title="生成客户确认版本">
      <div class="form-grid">
        <div class="field">
          <label>版本来源 <span class="req">*</span></label>
          <select v-model="createForm.source" class="select">
            <option value="plan">原计划</option>
            <option value="rehearsal">彩排调整</option>
            <option value="live">现场临时</option>
          </select>
        </div>
        <div class="field">
          <label>客户确认人</label>
          <input v-model="createForm.confirmed_by" class="input" placeholder="如 张先生" />
        </div>
        <div class="field full">
          <label>版本名称</label>
          <input v-model="createForm.label" class="input" placeholder="如 彩排后调整方案" />
        </div>
        <div class="field full">
          <label>确认备注</label>
          <textarea v-model="createForm.note" class="textarea" placeholder="本次确认调整了哪些内容…"></textarea>
        </div>
      </div>
      <template #foot>
        <button class="btn btn-ghost" @click="showCreate = false">取消</button>
        <button class="btn" @click="createVersion">保存版本快照</button>
      </template>
    </Modal>

    <!-- 快照查看 -->
    <Modal v-model="showSnap" :title="snapTitle" wide>
      <template v-if="snap">
        <h4 class="mb8">基本信息</h4>
        <dl class="kv">
          <dt>新人</dt><dd>{{ snap.project.couple_names }}</dd>
          <dt>婚期场次</dt><dd>{{ fmtDate(snap.project.wedding_date) }} · {{ snap.project.meal_session }}</dd>
          <dt>宴会厅 / 菜单</dt><dd>{{ snap.project.hall }} / {{ snap.project.menu }}（{{ fmtMoney(snap.project.price_per_table) }}/桌）</dd>
          <dt>桌数</dt><dd>{{ snap.project.planned_tables }} 桌 + 备 {{ snap.project.reserve_tables }}</dd>
          <dt>仪式需求</dt><dd>{{ snap.project.ceremony_req || '—' }}</dd>
          <dt>灯光音响</dt><dd>{{ snap.project.lighting_audio || '—' }}</dd>
          <dt>花艺</dt><dd>{{ snap.project.floral_req || '—' }}</dd>
          <dt>宾客动线</dt><dd>{{ snap.project.guest_flow || '—' }}</dd>
        </dl>
        <div class="divider"></div>
        <h4 class="mb8">付款节点（{{ snap.payments?.length || 0 }}）</h4>
        <table class="table">
          <thead><tr><th>节点</th><th>金额</th><th>应收日期</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="(p, i) in snap.payments || []" :key="i">
              <td>{{ p.label }}</td><td>{{ fmtMoney(p.amount) }}</td>
              <td>{{ fmtDate(p.due_date) }}</td>
              <td><span class="badge" :class="p.status === 'paid' ? 'pay-paid' : 'pay-unpaid'">{{ p.status === 'paid' ? '已收' : '未收' }}</span></td>
            </tr>
          </tbody>
        </table>
        <div class="divider"></div>
        <h4 class="mb8">筹备事项（{{ (snap.prep || []).filter((p: any) => p.status === 'done').length }}/{{ snap.prep?.length || 0 }} 完成）· 布置元素 {{ snap.layout?.length || 0 }} 个 · 变更 {{ snap.changes?.length || 0 }} 条</h4>
        <div v-for="(c, i) in snap.changes || []" :key="i" class="small muted">
          · {{ c.title }}（{{ meta.sourceLabels[c.source] }}，{{ c.status === 'resolved' ? '已解决' : '处理中' }}）
        </div>
      </template>
    </Modal>

    <!-- 与当前对比 -->
    <Modal v-model="showDiff" :title="diffTitle" wide>
      <div v-if="!diffRows.length" class="empty">该版本与当前方案一致，无差异</div>
      <table v-else class="table">
        <thead><tr><th>字段</th><th>该版本（V{{ diffVersion }}）</th><th>当前方案</th></tr></thead>
        <tbody>
          <tr v-for="r in diffRows" :key="r.field">
            <td style="white-space: nowrap">{{ r.field }}</td>
            <td>{{ r.oldVal }}</td>
            <td style="color: var(--rose-dark); font-weight: 600">{{ r.newVal }}</td>
          </tr>
        </tbody>
      </table>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { api, submit } from '../../api';
import { fmtDate, fmtMoney, fmtTime } from '../../fmt';
import { useAuthStore } from '../../stores/auth';
import { useMetaStore } from '../../stores/meta';
import { toast } from '../../toast';
import type { ProjectDetail } from '../../types';
import Modal from '../Modal.vue';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();
const meta = useMetaStore();

const showCreate = ref(false);
const createForm = reactive({ source: 'rehearsal', label: '', confirmed_by: '', note: '' });

const showSnap = ref(false);
const snapTitle = ref('');
const snap = ref<any>(null);

const showDiff = ref(false);
const diffTitle = ref('');
const diffRows = ref<{ field: string; oldVal: string; newVal: string }[]>([]);
const diffVersion = ref(0);

async function createVersion() {
  const res = await submit(`/projects/${props.d.project.id}/versions`, { ...createForm });
  if (res) {
    toast(`版本 V${res.version_no} 已保存（${meta.sourceLabels[createForm.source]}）`);
    showCreate.value = false;
    emit('changed');
  }
}

async function viewSnapshot(id: number) {
  const v = await api(`/versions/${id}`);
  snap.value = v.snapshot;
  snapTitle.value = `V${v.version_no} · ${v.label}（${meta.sourceLabels[v.source]}）`;
  showSnap.value = true;
}

const FIELD_LABELS: Record<string, string> = {
  couple_names: '新人', wedding_date: '婚期', meal_session: '场次', hall: '宴会厅', menu: '菜单',
  planned_tables: '计划桌数', reserve_tables: '备桌数', ceremony_req: '仪式需求',
  lighting_audio: '灯光音响', floral_req: '花艺', guest_flow: '宾客动线',
};

async function diffWithCurrent(id: number) {
  const v = await api(`/versions/${id}`);
  const s = v.snapshot?.project || {};
  const p = props.d.project;
  const current: Record<string, any> = {
    couple_names: p.couple_names,
    wedding_date: String(p.wedding_date).slice(0, 10),
    meal_session: p.meal_session,
    hall: props.d.hall?.name,
    menu: props.d.menu?.name,
    planned_tables: p.planned_tables,
    reserve_tables: p.reserve_tables,
    ceremony_req: p.ceremony_req,
    lighting_audio: p.lighting_audio,
    floral_req: p.floral_req,
    guest_flow: p.guest_flow,
  };
  const rows: any[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const oldVal = s[key] ?? '';
    const newVal = current[key] ?? '';
    if (String(oldVal) !== String(newVal)) {
      rows.push({ field: label, oldVal: String(oldVal) || '—', newVal: String(newVal) || '—' });
    }
  }
  // 付款节点数与筹备完成度对比
  const oldPay = (v.snapshot?.payments || []).length;
  if (oldPay !== props.d.payments.length) {
    rows.push({ field: '付款节点数', oldVal: `${oldPay} 个`, newVal: `${props.d.payments.length} 个` });
  }
  const oldPrepDone = (v.snapshot?.prep || []).filter((x: any) => x.status === 'done').length;
  const newPrepDone = props.d.prep.filter((x) => x.status === 'done').length;
  if (oldPrepDone !== newPrepDone) {
    rows.push({ field: '筹备完成事项', oldVal: `${oldPrepDone} 项`, newVal: `${newPrepDone} 项` });
  }
  diffRows.value = rows;
  diffVersion.value = v.version_no;
  diffTitle.value = `V${v.version_no}（${meta.sourceLabels[v.source]}） vs 当前方案`;
  showDiff.value = true;
}
</script>
