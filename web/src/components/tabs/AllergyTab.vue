<template>
  <div>
    <!-- 汇总与操作 -->
    <div class="card">
      <div class="row-between">
        <div class="row">
          <span class="badge" style="background:#fdf0f2;color:var(--rose-dark)">过敏宾客 {{ guests.length }} 位</span>
          <span class="badge task-pending">待厨房确认 {{ countBy('submitted') }}</span>
          <span class="badge task-done">已确认 {{ countBy('confirmed') }}</span>
          <span v-if="countBy('issue')" class="badge change-open">事故 {{ countBy('issue') }}</span>
        </div>
        <button v-if="canEdit" class="btn" @click="openAdd">＋ 登记过敏宾客</button>
      </div>
      <p class="small muted mb8" style="margin-top: 8px">
        新人提交名单后，姓名、桌号、禁忌食材与替代菜品同步给厨房与服务员；临场换桌时过敏餐提示随宾客移动，并联动桌卡、厨房出餐与服务员分区。
      </p>
    </div>

    <!-- 过敏宾客名单 -->
    <div class="card">
      <h3 class="card-title">过敏宾客名单</h3>
      <table class="table">
        <thead>
          <tr><th>宾客</th><th>桌号</th><th>禁忌食材</th><th>替代菜品</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in guests" :key="g.id">
            <td style="font-weight: 600">{{ g.guest_name }}</td>
            <td>
              <span class="badge" style="background:#e3f2fd;color:#1565c0">{{ g.table_no }}</span>
              <span v-if="g.zone" class="badge" style="margin-left:4px">{{ g.zone }}区</span>
            </td>
            <td><span class="badge" style="background:#ffebee;color:#c62828">{{ g.allergens }}</span></td>
            <td>{{ g.substitute_dish || '—' }}</td>
            <td><span class="badge" :class="statusClass(g.status)">{{ statusLabel(g.status) }}</span></td>
            <td>
              <div class="row" style="gap: 4px">
                <button v-if="auth.hasRole('kitchen') && g.status === 'submitted'" class="btn btn-sm btn-green" @click="confirm(g)">厨房确认</button>
                <button v-if="canEdit" class="btn btn-sm btn-ghost" @click="openMove(g)">换桌</button>
                <button v-if="g.status !== 'issue'" class="btn btn-sm btn-ghost" style="color:#c62828;border-color:#c62828" @click="openWrong(g)">上错菜</button>
                <button v-if="auth.hasRole('manager') && g.status === 'issue'" class="btn btn-sm" @click="openResolve(g)">沟通处理</button>
              </div>
            </td>
          </tr>
          <tr v-if="!guests.length"><td colspan="6" class="empty">暂无过敏宾客登记</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 三视图联动：厨房出餐 / 服务员分区 / 桌卡提示 -->
    <div class="grid grid-3">
      <div class="card">
        <h3 class="card-title">厨房出餐单</h3>
        <div v-if="!confirmed.length" class="empty">厨房确认后显示出餐信息</div>
        <div v-for="g in confirmed" :key="g.id" class="task-row">
          <span class="badge" style="background:#e3f2fd;color:#1565c0">{{ g.table_no }}</span>
          <div class="flex1">
            <div style="font-weight: 600">{{ g.substitute_dish || '替代菜品待定' }}</div>
            <div class="small muted">{{ g.guest_name }} · 禁忌 {{ g.allergens }} · 单独出餐</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">服务员分区提醒</h3>
        <div v-if="!zoneGroups.length" class="empty">暂无分区提醒</div>
        <div v-for="z in zoneGroups" :key="z.zone" class="mb8">
          <b>{{ z.zone || '未分区' }}区</b>
          <div v-for="g in z.guests" :key="g.id" class="small" style="padding: 3px 0 3px 10px">
            <span class="badge" style="background:#e3f2fd;color:#1565c0">{{ g.table_no }}</span>
            {{ g.guest_name }} · 忌 {{ g.allergens }}
            <span class="badge" :class="statusClass(g.status)" style="margin-left:4px">{{ statusLabel(g.status) }}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">桌卡提示</h3>
        <div v-if="!tableCards.length" class="empty">暂无桌卡提示</div>
        <div class="row" style="gap: 6px">
          <span v-for="t in tableCards" :key="t.table" class="badge" style="background:#fdf0f2;color:var(--rose-dark);padding:6px 10px">
            {{ t.table }} · 过敏餐×{{ t.n }}
          </span>
        </div>
        <p class="small muted mt8">换桌后桌卡提示自动跟随宾客新桌号。</p>
      </div>
    </div>

    <!-- 事件与客户沟通记录 -->
    <div class="card">
      <h3 class="card-title">事件与客户沟通记录</h3>
      <ul class="timeline">
        <li v-for="e in events" :key="e.id">
          <div class="row">
            <span class="badge" :class="eventClass(e.kind)">{{ eventLabel(e.kind) }}</span>
            <b v-if="guestName(e.allergy_id)">{{ guestName(e.allergy_id) }}</b>
            <span v-if="e.from_table" class="small muted">{{ e.from_table }} → {{ e.to_table }}</span>
          </div>
          <div class="small">{{ e.detail }}</div>
          <div v-if="e.client_note" class="small" style="color: var(--ok); background:#f1f8e9; padding:6px 8px; border-radius:6px; margin-top:4px">
            客户沟通记录：{{ e.client_note }}
          </div>
          <div class="t-time">{{ e.created_by_name }} · {{ fmtTime(e.created_at) }}</div>
        </li>
      </ul>
      <div v-if="!events.length" class="empty">暂无事件记录</div>
    </div>

    <!-- 登记过敏宾客 -->
    <Modal v-model="showAdd" title="登记过敏宾客">
      <div class="form-grid">
        <div class="field"><label>宾客姓名 <span class="req">*</span></label><input v-model="addForm.guest_name" class="input" placeholder="如 王阿姨" /></div>
        <div class="field">
          <label>桌号 <span class="req">*</span></label>
          <select v-model="addForm.table_no" class="select">
            <option v-for="t in tableOptions" :key="t.label" :value="t.label">{{ t.label }}{{ t.zone ? '（' + t.zone + '区）' : '' }}</option>
          </select>
        </div>
        <div class="field full"><label>禁忌食材 <span class="req">*</span></label><input v-model="addForm.allergens" class="input" placeholder="如 海鲜（虾、蟹）/ 花生、坚果" /></div>
        <div class="field full"><label>替代菜品</label><input v-model="addForm.substitute_dish" class="input" placeholder="如 清蒸童子鸡（替代清蒸石斑鱼）" /></div>
      </div>
      <p class="small muted">提交后自动生成厨房备餐确认任务，并同步服务员线。</p>
      <template #foot>
        <button class="btn btn-ghost" @click="showAdd = false">取消</button>
        <button class="btn" @click="addGuest">提交并同步厨房</button>
      </template>
    </Modal>

    <!-- 临场换桌 -->
    <Modal v-model="showMove" title="临场换桌 · 过敏餐提示随宾客移动">
      <template v-if="moveTarget">
        <dl class="kv">
          <dt>宾客</dt><dd>{{ moveTarget.guest_name }}</dd>
          <dt>当前桌号</dt><dd>{{ moveTarget.table_no }}（{{ moveTarget.zone || '未分区' }}区）</dd>
          <dt>禁忌</dt><dd>{{ moveTarget.allergens }}</dd>
        </dl>
        <div class="field mt8">
          <label>换至桌号</label>
          <select v-model="moveForm.table_no" class="select">
            <option v-for="t in tableOptions.filter((t) => t.label !== moveTarget?.table_no)" :key="t.label" :value="t.label">
              {{ t.label }}{{ t.zone ? '（' + t.zone + '区）' : '' }}
            </option>
          </select>
        </div>
        <p class="small muted">换桌后：桌卡提示、厨房出餐桌号、服务员分区提醒将同步更新。</p>
      </template>
      <template #foot>
        <button class="btn btn-ghost" @click="showMove = false">取消</button>
        <button class="btn" @click="doMove">确认换桌</button>
      </template>
    </Modal>

    <!-- 上错菜登记 -->
    <Modal v-model="showWrong" title="上错菜事故登记">
      <template v-if="wrongTarget">
        <dl class="kv">
          <dt>宾客</dt><dd>{{ wrongTarget.guest_name }}（{{ wrongTarget.table_no }}桌）</dd>
          <dt>禁忌</dt><dd><span class="badge" style="background:#ffebee;color:#c62828">{{ wrongTarget.allergens }}</span></dd>
        </dl>
        <div class="field mt8">
          <label>事故情况</label>
          <textarea v-model="wrongForm.detail" class="textarea" :placeholder="`如：误上了含${wrongTarget.allergens}的菜品，已撤下`"></textarea>
        </div>
        <p class="small muted">登记后事件进入宴会经理处理队列与客户沟通记录。</p>
      </template>
      <template #foot>
        <button class="btn btn-ghost" @click="showWrong = false">取消</button>
        <button class="btn" style="background:#c62828;border-color:#c62828" @click="doWrong">登记事故</button>
      </template>
    </Modal>

    <!-- 沟通处理 -->
    <Modal v-model="showResolve" title="客户沟通处理">
      <template v-if="resolveTarget">
        <dl class="kv">
          <dt>宾客</dt><dd>{{ resolveTarget.guest_name }}（{{ resolveTarget.table_no }}桌）</dd>
          <dt>事故</dt><dd>{{ latestWrongDetail }}</dd>
        </dl>
        <div class="field mt8">
          <label>客户沟通记录 <span class="req">*</span></label>
          <textarea v-model="resolveForm.client_note" class="textarea" placeholder="与新人/宾客沟通的处理结果，如：已更换菜品并致歉，赠送果盘，新人表示理解"></textarea>
        </div>
      </template>
      <template #foot>
        <button class="btn btn-ghost" @click="showResolve = false">取消</button>
        <button class="btn btn-green" @click="doResolve">登记沟通结果并结案</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { api, submit } from '../../api';
import { fmtTime } from '../../fmt';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../toast';
import type { AllergyEvent, AllergyGuest, ProjectDetail } from '../../types';
import Modal from '../Modal.vue';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();

const events = ref<AllergyEvent[]>([]);
const guests = computed(() => props.d.allergies || []);
const canEdit = computed(() => auth.hasRole('sales', 'planner', 'manager'));

const STATUS_LABELS: Record<string, string> = { submitted: '待厨房确认', confirmed: '厨房已确认', issue: '事故处理中' };
const EVENT_LABELS: Record<string, string> = {
  created: '名单提交', kitchen_confirmed: '厨房确认', reminder: '桌边提醒',
  moved: '临场换桌', wrong_dish: '上错菜事故', resolved: '沟通处理完成',
};
const statusLabel = (s: string) => STATUS_LABELS[s] || s;
const eventLabel = (k: string) => EVENT_LABELS[k] || k;
const statusClass = (s: string) => (s === 'confirmed' ? 'task-done' : s === 'issue' ? 'change-open' : 'task-pending');
const eventClass = (k: string) =>
  k === 'wrong_dish' ? 'change-open' : k === 'moved' ? 'src-rehearsal' : k === 'resolved' ? 'task-done' : 'src-plan';

const countBy = (s: string) => guests.value.filter((g) => g.status === s).length;
const confirmed = computed(() => guests.value.filter((g) => g.status !== 'submitted'));
const zoneGroups = computed(() => {
  const map = new Map<string, AllergyGuest[]>();
  for (const g of guests.value) {
    const z = g.zone || '';
    if (!map.has(z)) map.set(z, []);
    map.get(z)!.push(g);
  }
  return [...map.entries()].map(([zone, list]) => ({ zone, guests: list }));
});
const tableCards = computed(() => {
  const map = new Map<string, number>();
  for (const g of guests.value) map.set(g.table_no, (map.get(g.table_no) || 0) + 1);
  return [...map.entries()].map(([table, n]) => ({ table, n }));
});
const tableOptions = computed(() =>
  props.d.layout
    .filter((i) => ['table', 'main_table', 'kids', 'elderly'].includes(i.kind))
    .map((i) => ({ label: i.label, zone: i.zone })),
);
const guestName = (id: number) => guests.value.find((g) => g.id === id)?.guest_name || '';

async function loadEvents() {
  const res = await api(`/projects/${props.d.project.id}/allergies`);
  events.value = res.events;
}

// ---- 登记 ----
const showAdd = ref(false);
const addForm = reactive({ guest_name: '', table_no: '', allergens: '', substitute_dish: '' });
function openAdd() {
  addForm.guest_name = ''; addForm.allergens = ''; addForm.substitute_dish = '';
  addForm.table_no = tableOptions.value[0]?.label || '';
  showAdd.value = true;
}
async function addGuest() {
  if (!addForm.guest_name || !addForm.table_no || !addForm.allergens) {
    return toast('请填写宾客姓名、桌号与禁忌食材', 'err');
  }
  const res = await submit(`/projects/${props.d.project.id}/allergies`, { ...addForm });
  if (res) {
    toast(`已登记 ${addForm.guest_name} 的过敏餐，厨房备餐任务已生成`);
    showAdd.value = false;
    emit('changed');
    loadEvents();
  }
}

// ---- 厨房确认 ----
async function confirm(g: AllergyGuest) {
  const res = await submit(`/allergies/${g.id}/confirm`, {});
  if (res) {
    toast(`厨房已确认 ${g.guest_name} 的过敏餐，服务员桌边提醒已生成`);
    emit('changed');
    loadEvents();
  }
}

// ---- 换桌 ----
const showMove = ref(false);
const moveTarget = ref<AllergyGuest | null>(null);
const moveForm = reactive({ table_no: '' });
function openMove(g: AllergyGuest) {
  moveTarget.value = g;
  moveForm.table_no = tableOptions.value.find((t) => t.label !== g.table_no)?.label || '';
  showMove.value = true;
}
async function doMove() {
  if (!moveTarget.value) return;
  const res = await submit(`/allergies/${moveTarget.value.id}`, { table_no: moveForm.table_no }, 'PATCH');
  if (res) {
    toast(`${moveTarget.value.guest_name} 已换至 ${moveForm.table_no}，桌卡/出餐/分区提醒已同步`);
    showMove.value = false;
    emit('changed');
    loadEvents();
  }
}

// ---- 上错菜 ----
const showWrong = ref(false);
const wrongTarget = ref<AllergyGuest | null>(null);
const wrongForm = reactive({ detail: '' });
function openWrong(g: AllergyGuest) {
  wrongTarget.value = g;
  wrongForm.detail = '';
  showWrong.value = true;
}
async function doWrong() {
  if (!wrongTarget.value) return;
  const res = await submit(`/allergies/${wrongTarget.value.id}/wrong-dish`, { detail: wrongForm.detail });
  if (res) {
    toast('事故已登记，宴会经理处理任务与客户沟通记录已生成');
    showWrong.value = false;
    emit('changed');
    loadEvents();
  }
}

// ---- 沟通处理 ----
const showResolve = ref(false);
const resolveTarget = ref<AllergyGuest | null>(null);
const resolveForm = reactive({ client_note: '' });
const latestWrongDetail = computed(() => {
  if (!resolveTarget.value) return '';
  const e = events.value.find((e) => e.allergy_id === resolveTarget.value!.id && e.kind === 'wrong_dish');
  return e?.detail || '—';
});
function openResolve(g: AllergyGuest) {
  resolveTarget.value = g;
  resolveForm.client_note = '';
  showResolve.value = true;
}
async function doResolve() {
  if (!resolveTarget.value) return;
  if (!resolveForm.client_note.trim()) return toast('请填写客户沟通记录', 'err');
  const res = await submit(`/allergies/${resolveTarget.value.id}/resolve`, { client_note: resolveForm.client_note });
  if (res) {
    toast('沟通处理结果已登记，事故结案');
    showResolve.value = false;
    emit('changed');
    loadEvents();
  }
}

loadEvents();
</script>
