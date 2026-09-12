<template>
  <div class="grid" style="grid-template-columns: 2fr 1fr">
    <div>
      <div class="card">
        <h3 class="card-title">项目信息</h3>
        <dl class="kv">
          <dt>新人</dt><dd>{{ d.project.couple_names }}（{{ d.project.contact_phone || '无联系电话' }}）</dd>
          <dt>婚期场次</dt><dd>{{ fmtDate(d.project.wedding_date) }} · {{ d.project.meal_session }}</dd>
          <dt>宴会厅</dt><dd>{{ d.hall?.name }}（{{ d.hall?.length_m }}m × {{ d.hall?.width_m }}m，{{ d.hall?.features }}）</dd>
          <dt>舞台</dt><dd>{{ d.hall?.stage_desc || '—' }}</dd>
          <dt>消防通道</dt><dd>{{ d.hall?.fire_exits || '—' }}</dd>
          <dt>菜单</dt><dd>{{ d.menu?.name }}（{{ fmtMoney(d.menu?.price_per_table) }}/桌）</dd>
          <dt>桌数</dt>
          <dd>
            计划 {{ d.project.planned_tables }} 桌 + 备桌 {{ d.project.reserve_tables }} 桌
            <span v-if="d.postEvent?.actual_tables != null" class="money">；实际 {{ d.postEvent.actual_tables }} 桌</span>
          </dd>
          <dt>销售 / 策划</dt><dd>{{ d.sales?.name || '—' }} / {{ d.planner?.name || '未指派' }}</dd>
          <dt>备注</dt><dd>{{ d.project.notes || '—' }}</dd>
        </dl>
      </div>

      <div class="card">
        <h3 class="card-title">菜单菜品（{{ d.menu?.dishes?.length || 0 }} 道/桌）</h3>
        <div class="row" style="gap: 6px">
          <span v-for="(dish, i) in d.menu?.dishes || []" :key="i" class="badge" style="background:#fdf0f2;color:var(--rose-dark)">{{ dish }}</span>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card"><h3 class="card-title">仪式需求</h3><p class="muted" style="margin:0">{{ d.project.ceremony_req || '未填写' }}</p></div>
        <div class="card"><h3 class="card-title">灯光音响</h3><p class="muted" style="margin:0">{{ d.project.lighting_audio || '未填写' }}</p></div>
        <div class="card"><h3 class="card-title">花艺要求</h3><p class="muted" style="margin:0">{{ d.project.floral_req || '未填写' }}</p></div>
        <div class="card"><h3 class="card-title">宾客动线</h3><p class="muted" style="margin:0">{{ d.project.guest_flow || '未填写' }}</p></div>
      </div>
    </div>

    <div>
      <div class="card">
        <h3 class="card-title">结算摘要</h3>
        <dl class="kv">
          <dt>应收合计</dt><dd class="money">{{ fmtMoney(d.settlement.total) }}</dd>
          <dt>已收</dt><dd class="money neg">{{ fmtMoney(d.settlement.paid) }}</dd>
          <dt>尾款余额</dt><dd class="money">{{ fmtMoney(d.settlement.balance) }}</dd>
        </dl>
      </div>
      <div class="card">
        <h3 class="card-title">项目动态</h3>
        <ul class="timeline">
          <li v-for="a in d.audits" :key="a.id">
            <div style="font-weight: 600">{{ a.action }}</div>
            <div class="small">{{ a.detail }}</div>
            <div class="t-time">{{ a.user_name }} · {{ fmtTime(a.created_at) }}</div>
          </li>
        </ul>
        <div v-if="!d.audits.length" class="empty">暂无动态</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { fmtDate, fmtMoney, fmtTime } from '../../fmt';
import type { ProjectDetail } from '../../types';

defineProps<{ d: ProjectDetail }>();
</script>
