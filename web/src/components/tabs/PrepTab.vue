<template>
  <div>
    <div class="card">
      <h3 class="card-title">婚前筹备串联</h3>
      <p class="muted small" style="margin-top: -6px">
        菜单试吃意见、桌数增减、酒水寄存、彩排时间、外部婚庆进场、消防通道、尾款支付在此串联跟踪；「尾款支付」与结算页联动，桌数临场增减会自动同步到这里。
      </p>
    </div>
    <div class="grid grid-2">
      <div v-for="item in d.prep" :key="item.id" class="prep-card" :class="item.status">
        <div class="row-between mb8">
          <b>{{ item.title }}</b>
          <div class="row">
            <span class="role-chip" :class="'role-' + item.owner_role">{{ meta.roleLabels[item.owner_role] || item.owner_role }}</span>
            <span class="badge" :class="item.status === 'done' ? 'task-done' : 'task-pending'">
              {{ item.status === 'done' ? '已完成' : '待跟进' }}
            </span>
          </div>
        </div>
        <textarea
          v-model="drafts[item.id]"
          class="textarea"
          :placeholder="placeholderOf(item.kind)"
          style="min-height: 52px"
        ></textarea>
        <div class="row-between mt8">
          <span class="small muted">{{ item.updated_at ? '更新于 ' + fmtTime(item.updated_at) : '暂未更新' }}</span>
          <div class="row">
            <button class="btn btn-ghost btn-sm" @click="save(item, undefined)">保存内容</button>
            <button
              class="btn btn-sm"
              :class="item.status === 'done' ? 'btn-ghost' : 'btn-green'"
              @click="save(item, item.status === 'done' ? 'pending' : 'done')"
            >{{ item.status === 'done' ? '重新打开' : '标记完成' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { submit } from '../../api';
import { fmtTime } from '../../fmt';
import { useMetaStore } from '../../stores/meta';
import { toast } from '../../toast';
import type { PrepItem, ProjectDetail } from '../../types';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const meta = useMetaStore();

const drafts = reactive<Record<number, string>>({});
for (const p of props.d.prep) drafts[p.id] = p.detail || '';

function placeholderOf(kind: string) {
  const map: Record<string, string> = {
    tasting: '记录试吃反馈：菜品调整、口味意见、新人确认情况…',
    table_change: '桌数增减确认记录（临场加桌变更会自动同步到这里）…',
    alcohol: '自带酒水寄存：品类、数量、寄存编号、领取方式…',
    rehearsal: '彩排时间、参与人员、联排内容…',
    vendor: '外部婚庆/花艺进场时间、对接人、进场通道…',
    fire_lane: '消防通道检查结果、检查人、检查时间…',
    final_payment: '尾款金额与收取情况（收银在结算页收款后自动更新）…',
  };
  return map[kind] || '填写跟进内容…';
}

async function save(item: PrepItem, status?: string) {
  const body: any = { detail: drafts[item.id] };
  if (status) body.status = status;
  const res = await submit(`/prep/${item.id}`, body, 'PATCH');
  if (res) {
    toast(`「${item.title}」已更新`);
    emit('changed');
  }
}
</script>
