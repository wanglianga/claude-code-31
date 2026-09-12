<template>
  <div class="card">
    <div class="row-between mb16">
      <h3 class="card-title" style="margin: 0">销售录入信息</h3>
      <span v-if="!editable" class="muted small">当前岗位仅可查看（销售/宴会经理可编辑）</span>
    </div>
    <div class="form-grid">
      <div class="field"><label>新人姓名</label><input v-model="f.couple_names" class="input" :disabled="!editable" /></div>
      <div class="field"><label>联系电话</label><input v-model="f.contact_phone" class="input" :disabled="!editable" /></div>
      <div class="field"><label>婚期</label><input v-model="f.wedding_date" type="date" class="input" :disabled="!editable" /></div>
      <div class="field">
        <label>场次</label>
        <select v-model="f.meal_session" class="select" :disabled="!editable"><option>午宴</option><option>晚宴</option></select>
      </div>
      <div class="field">
        <label>宴会厅</label>
        <select v-model.number="f.hall_id" class="select" :disabled="!editable">
          <option v-for="h in meta.halls" :key="h.id" :value="h.id">{{ h.name }}（≤{{ h.max_tables }}桌）</option>
        </select>
      </div>
      <div class="field">
        <label>菜单套餐</label>
        <select v-model.number="f.menu_id" class="select" :disabled="!editable">
          <option v-for="m in meta.menus" :key="m.id" :value="m.id">{{ m.name }}（{{ fmtMoney(m.price_per_table) }}/桌）</option>
        </select>
      </div>
      <div class="field"><label>计划桌数</label><input v-model.number="f.planned_tables" type="number" min="1" class="input" :disabled="!editable" /></div>
      <div class="field"><label>备桌数</label><input v-model.number="f.reserve_tables" type="number" min="0" class="input" :disabled="!editable" /></div>
      <div class="field">
        <label>策划师</label>
        <select v-model.number="f.planner_id" class="select" :disabled="!editable">
          <option :value="null">未指派</option>
          <option v-for="u in planners" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
      </div>
      <div class="field full"><label>仪式需求</label><textarea v-model="f.ceremony_req" class="textarea" :disabled="!editable"></textarea></div>
      <div class="field full"><label>灯光音响</label><textarea v-model="f.lighting_audio" class="textarea" :disabled="!editable"></textarea></div>
      <div class="field full"><label>花艺要求</label><textarea v-model="f.floral_req" class="textarea" :disabled="!editable"></textarea></div>
      <div class="field full"><label>宾客动线</label><textarea v-model="f.guest_flow" class="textarea" :disabled="!editable"></textarea></div>
      <div class="field full"><label>备注</label><textarea v-model="f.notes" class="textarea" :disabled="!editable"></textarea></div>
    </div>
    <div v-if="editable" class="mt16 text-right">
      <button class="btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存修改' }}</button>
    </div>
    <p class="small muted mt8">提示：付款节点在「结算支付」页维护；桌数的临场增减请通过「临场变更」发起，系统会自动联动备料、分区与结算。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { submit } from '../../api';
import { fmtMoney } from '../../fmt';
import { useAuthStore } from '../../stores/auth';
import { useMetaStore } from '../../stores/meta';
import { toast } from '../../toast';
import type { ProjectDetail } from '../../types';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();
const meta = useMetaStore();
const saving = ref(false);

const editable = computed(() => auth.hasRole('sales', 'manager'));
const planners = computed(() => meta.users.filter((u) => u.role === 'planner'));

const f = reactive<any>({ ...props.d.project, wedding_date: String(props.d.project.wedding_date).slice(0, 10) });

async function save() {
  saving.value = true;
  const res = await submit(`/projects/${props.d.project.id}`, {
    couple_names: f.couple_names, contact_phone: f.contact_phone, wedding_date: f.wedding_date,
    meal_session: f.meal_session, hall_id: f.hall_id, menu_id: f.menu_id,
    planned_tables: f.planned_tables, reserve_tables: f.reserve_tables,
    ceremony_req: f.ceremony_req, lighting_audio: f.lighting_audio,
    floral_req: f.floral_req, guest_flow: f.guest_flow, notes: f.notes,
    planner_id: f.planner_id || null,
  }, 'PATCH');
  saving.value = false;
  if (res) {
    toast('项目信息已保存');
    emit('changed');
  }
}
</script>
