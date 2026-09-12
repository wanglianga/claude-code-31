<template>
  <div class="grid" style="grid-template-columns: 3fr 2fr">
    <div>
      <div class="card">
        <h3 class="card-title">应收明细</h3>
        <table class="table">
          <thead><tr><th>项目</th><th class="text-right">金额</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in d.settlement.lines" :key="i">
              <td>{{ l.label }}</td>
              <td class="text-right" :class="l.amount < 0 ? 'money neg' : 'money'">
                {{ l.amount < 0 ? '-' : '' }}{{ fmtMoney(Math.abs(l.amount)) }}
              </td>
            </tr>
            <tr style="font-weight: 700; background: #fdf6f0">
              <td>应收合计</td>
              <td class="text-right money">{{ fmtMoney(d.settlement.total) }}</td>
            </tr>
            <tr>
              <td>已收合计</td>
              <td class="text-right money neg">{{ fmtMoney(d.settlement.paid) }}</td>
            </tr>
            <tr style="font-weight: 700">
              <td>尾款余额</td>
              <td class="text-right money">{{ fmtMoney(d.settlement.balance) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="small muted mb8" style="margin-top: 8px">
          计费桌数：{{ d.settlement.billableTables }} 桌（{{ d.postEvent ? '按婚后实际桌数' : '按计划桌数，归档后按实际桌数' }}）× {{ fmtMoney(d.settlement.pricePerTable) }}/桌；临场加桌、临场加项与优惠自动计入。
        </p>
      </div>

      <div class="card">
        <div class="row-between mb8">
          <h3 class="card-title" style="margin: 0">付款节点</h3>
          <button v-if="auth.hasRole('sales', 'cashier')" class="btn btn-ghost btn-sm" @click="showAdd = true">＋ 添加节点</button>
        </div>
        <table class="table">
          <thead>
            <tr><th>节点</th><th>金额</th><th>应收日期</th><th>状态</th><th>收款方式</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in d.payments" :key="p.id">
              <td><b>{{ p.kind }}</b> · {{ p.label }}</td>
              <td class="money">{{ fmtMoney(p.amount) }}</td>
              <td>{{ fmtDate(p.due_date) }}</td>
              <td>
                <span class="badge" :class="p.status === 'paid' ? 'pay-paid' : 'pay-unpaid'">
                  {{ p.status === 'paid' ? '已收' : '未收' }}
                </span>
                <div v-if="p.paid_at" class="small muted">{{ fmtTime(p.paid_at) }}</div>
              </td>
              <td>{{ p.method || '—' }}</td>
              <td>
                <button
                  v-if="p.status !== 'paid' && auth.hasRole('cashier')"
                  class="btn btn-sm btn-green"
                  @click="collect(p)"
                >收款</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <div class="card">
        <h3 class="card-title">结算概览</h3>
        <dl class="kv">
          <dt>宴席费用</dt><dd class="money">{{ fmtMoney(d.settlement.baseAmount) }}</dd>
          <dt>变更调整</dt><dd class="money">{{ d.settlement.changeDelta ? fmtMoney(d.settlement.changeDelta) : '—' }}</dd>
          <dt>临场加项</dt><dd class="money">{{ d.settlement.additionsAmount ? fmtMoney(d.settlement.additionsAmount) : '—' }}</dd>
          <dt>优惠减免</dt><dd class="money neg">{{ d.settlement.discount ? '-' + fmtMoney(d.settlement.discount) : '—' }}</dd>
          <dt>应收合计</dt><dd class="money" style="font-size: 18px">{{ fmtMoney(d.settlement.total) }}</dd>
          <dt>待收尾款</dt><dd class="money" style="font-size: 18px">{{ fmtMoney(d.settlement.balance) }}</dd>
        </dl>
      </div>
      <div class="card">
        <h3 class="card-title">说明</h3>
        <p class="small muted">
          · 临场变更（如加桌）提交后自动生成收银任务并计入应收；<br />
          · 收银在此页确认各节点收款，尾款到账后「婚前筹备 · 尾款支付」自动完成；<br />
          · 婚后归档录入的实际桌数、临场加项与优惠会重算应收合计。
        </p>
      </div>
    </div>

    <!-- 添加付款节点 -->
    <Modal v-model="showAdd" title="添加付款节点">
      <div class="form-grid">
        <div class="field">
          <label>节点类型</label>
          <select v-model="addForm.kind" class="select"><option>定金</option><option>中期款</option><option>尾款</option><option>加项款</option></select>
        </div>
        <div class="field"><label>名称</label><input v-model="addForm.label" class="input" placeholder="如 临场加项款" /></div>
        <div class="field"><label>金额（元）</label><input v-model.number="addForm.amount" type="number" min="0" class="input" /></div>
        <div class="field"><label>应收日期</label><input v-model="addForm.due_date" type="date" class="input" /></div>
      </div>
      <template #foot>
        <button class="btn btn-ghost" @click="showAdd = false">取消</button>
        <button class="btn" @click="addPayment">保存</button>
      </template>
    </Modal>

    <!-- 收款 -->
    <Modal v-model="showCollect" title="确认收款">
      <template v-if="collectTarget">
        <dl class="kv">
          <dt>节点</dt><dd>{{ collectTarget.kind }} · {{ collectTarget.label }}</dd>
          <dt>金额</dt><dd class="money">{{ fmtMoney(collectTarget.amount) }}</dd>
        </dl>
        <div class="field mt8">
          <label>收款方式</label>
          <select v-model="collectMethod" class="select">
            <option>银行转账</option><option>POS 刷卡</option><option>现金</option><option>微信/支付宝</option>
          </select>
        </div>
      </template>
      <template #foot>
        <button class="btn btn-ghost" @click="showCollect = false">取消</button>
        <button class="btn btn-green" @click="doCollect">确认收款</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { submit } from '../../api';
import { fmtDate, fmtMoney, fmtTime } from '../../fmt';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../toast';
import type { Payment, ProjectDetail } from '../../types';
import Modal from '../Modal.vue';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();

const showAdd = ref(false);
const addForm = reactive({ kind: '节点款', label: '', amount: 0, due_date: '' });

const showCollect = ref(false);
const collectTarget = ref<Payment | null>(null);
const collectMethod = ref('银行转账');

async function addPayment() {
  if (!addForm.label || !(addForm.amount > 0)) return toast('请填写节点名称与金额', 'err');
  const res = await submit(`/projects/${props.d.project.id}/payments`, { ...addForm });
  if (res) {
    toast('付款节点已添加');
    showAdd.value = false;
    emit('changed');
  }
}

function collect(p: Payment) {
  collectTarget.value = p;
  showCollect.value = true;
}

async function doCollect() {
  if (!collectTarget.value) return;
  const res = await submit(`/payments/${collectTarget.value.id}/collect`, { method: collectMethod.value });
  if (res) {
    toast(`已收款 ${fmtMoney(collectTarget.value.amount)}`);
    showCollect.value = false;
    emit('changed');
  }
}
</script>
