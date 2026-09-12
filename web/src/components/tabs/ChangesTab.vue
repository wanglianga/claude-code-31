<template>
  <div>
    <div class="card">
      <div class="row-between">
        <div class="muted small" style="max-width: 720px">
          临场变更会自动拆解为<b>跨岗位任务</b>：厨房看到备料影响、宴会经理看到服务调整、策划看到流程/布置影响、收银看到结算影响——所有人看到的是同一条变更。
        </div>
        <button class="btn" @click="openCreate">⚡ 发起临场变更</button>
      </div>
    </div>

    <div v-if="!d.changes.length" class="card empty">暂无临场变更。婚礼当天的加桌、换位、设备故障、仪式延迟等都在此发起。</div>

    <div v-for="c in d.changes" :key="c.id" class="change-card" :class="c.status">
      <div class="row-between">
        <div class="row">
          <b style="font-size: 15px">{{ c.title }}</b>
          <span class="badge" :class="'src-' + c.source">{{ meta.sourceLabels[c.source] }}</span>
          <span class="badge" :class="'change-' + c.status">
            {{ c.status === 'open' ? '处理中' : c.status === 'resolved' ? '已解决' : '已作废' }}
          </span>
          <span v-if="Number(c.amount_delta)" class="money">结算 {{ Number(c.amount_delta) > 0 ? '+' : '' }}{{ fmtMoney(c.amount_delta) }}</span>
        </div>
        <div class="small muted">{{ c.created_by_name || '系统' }} · {{ fmtTime(c.created_at) }}</div>
      </div>
      <div v-if="c.detail" class="muted mt8">{{ c.detail }}</div>

      <div class="impact-chips" v-if="c.impacts?.length">
        <span v-for="(s, i) in c.impacts" :key="i" class="chip">影响：{{ s }}</span>
      </div>

      <!-- 跨岗位任务 -->
      <div class="mt8">
        <div class="small muted mb8">跨岗位任务（{{ tasksOf(c.id).filter((t) => t.status === 'done').length }}/{{ tasksOf(c.id).length }} 完成）</div>
        <div v-for="t in tasksOf(c.id)" :key="t.id" class="task-row">
          <span class="role-chip" :class="'role-' + t.role">{{ meta.roleLabels[t.role] }}</span>
          <div class="flex1">
            <div style="font-weight: 600">{{ t.title }}</div>
            <div class="small muted">{{ t.detail }}</div>
          </div>
          <span v-if="t.assignee_name" class="small muted">{{ t.assignee_name }}</span>
          <span class="badge" :class="'task-' + t.status">{{ taskLabel(t.status) }}</span>
          <div class="row" v-if="canAct(t) && c.status === 'open'">
            <button v-if="t.status === 'pending'" class="btn btn-sm btn-ghost" @click="setTask(t, 'doing')">开始</button>
            <button v-if="t.status !== 'done'" class="btn btn-sm btn-green" @click="setTask(t, 'done')">完成</button>
          </div>
        </div>
      </div>

      <div class="row mt8" v-if="c.status === 'open' && auth.hasRole('manager')">
        <button class="btn btn-ghost btn-sm" @click="resolveChange(c)">全部处理完，标记变更已解决</button>
      </div>
    </div>

    <!-- 发起变更 -->
    <Modal v-model="showCreate" title="发起临场变更" wide>
      <div class="form-grid">
        <div class="field">
          <label>变更类型 <span class="req">*</span></label>
          <select v-model="form.type" class="select" @change="onTypeChange">
            <option v-for="t in meta.changeTypes" :key="t.type" :value="t.type">{{ t.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>变更来源</label>
          <select v-model="form.source" class="select">
            <option value="live">现场临时</option>
            <option value="rehearsal">彩排调整</option>
            <option value="plan">原计划修正</option>
          </select>
        </div>
        <div class="field full">
          <label>标题</label>
          <input v-model="form.title" class="input" />
        </div>
        <div v-for="f in currentDef?.fields || []" :key="f.key" class="field">
          <label>{{ f.label }}</label>
          <input
            v-model="form.payload[f.key]"
            :type="f.kind === 'number' ? 'number' : 'text'"
            class="input"
            :placeholder="f.placeholder"
          />
        </div>
        <div class="field full">
          <label>情况说明</label>
          <textarea v-model="form.detail" class="textarea" placeholder="现场情况、新人要求、时间节点…"></textarea>
        </div>
      </div>

      <div v-if="currentDef" class="mt8">
        <div class="small muted mb8">提交后将自动生成以下岗位任务：</div>
        <div class="row">
          <span v-for="r in currentDef.roles" :key="r" class="role-chip" :class="'role-' + r">{{ meta.roleLabels[r] }}</span>
        </div>
      </div>

      <template #foot>
        <button class="btn btn-ghost" @click="showCreate = false">取消</button>
        <button class="btn" :disabled="saving" @click="createChange">{{ saving ? '提交中…' : '提交变更并生成任务' }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { submit } from '../../api';
import { fmtMoney, fmtTime, TASK_STATUS_LABELS } from '../../fmt';
import { useAuthStore } from '../../stores/auth';
import { useMetaStore } from '../../stores/meta';
import { toast } from '../../toast';
import type { Change, ProjectDetail, Task } from '../../types';
import Modal from '../Modal.vue';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();
const meta = useMetaStore();

const showCreate = ref(false);
const saving = ref(false);
const form = reactive<any>({ type: 'add_tables', source: 'live', title: '', detail: '', payload: {} });

const currentDef = computed(() => meta.changeTypes.find((t) => t.type === form.type));

function onTypeChange() {
  form.title = currentDef.value?.label || '';
  form.payload = {};
}

function openCreate() {
  form.type = 'add_tables';
  form.source = 'live';
  form.detail = '';
  onTypeChange();
  showCreate.value = true;
}
defineExpose({ openCreate });

const tasksOf = (changeId: number) => props.d.tasks.filter((t) => (t as any).change_id === changeId);
const taskLabel = (s: string) => TASK_STATUS_LABELS[s] || s;
const canAct = (t: Task) => auth.user && (t.role === auth.user.role || auth.hasRole('manager'));

async function createChange() {
  saving.value = true;
  const res = await submit(`/projects/${props.d.project.id}/changes`, {
    type: form.type, source: form.source, title: form.title, detail: form.detail, payload: form.payload,
  });
  saving.value = false;
  if (res) {
    const taskCount = res.tasks?.length || 0;
    const amount = Number(res.impact?.amountDelta || 0);
    toast(`变更已提交：生成 ${taskCount} 个跨岗位任务${amount ? `，结算影响 ¥${amount.toLocaleString('zh-CN')}` : ''}`);
    showCreate.value = false;
    emit('changed');
  }
}

async function setTask(t: Task, status: string) {
  const res = await submit(`/tasks/${t.id}`, { status }, 'PATCH');
  if (res) {
    toast(`任务「${t.title}」已${TASK_STATUS_LABELS[status]}`);
    emit('changed');
  }
}

async function resolveChange(c: Change) {
  const res = await submit(`/changes/${c.id}`, { status: 'resolved' }, 'PATCH');
  if (res) {
    toast('变更已标记解决');
    emit('changed');
  }
}
</script>
