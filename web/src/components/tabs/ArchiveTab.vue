<template>
  <div>
    <!-- 已归档：档案视图 -->
    <template v-if="d.postEvent && !editing">
      <div class="grid" style="grid-template-columns: 3fr 2fr">
        <div>
          <div class="card">
            <div class="row-between mb8">
              <h3 class="card-title" style="margin: 0">婚后项目档案</h3>
              <button v-if="auth.hasRole('manager')" class="btn btn-ghost btn-sm" @click="startEdit">修订档案</button>
            </div>
            <dl class="kv">
              <dt>实际桌数</dt><dd><b>{{ d.postEvent.actual_tables }}</b> 桌（计划 {{ d.project.planned_tables }} 桌）</dd>
              <dt>酒水消耗</dt><dd>{{ d.postEvent.alcohol_consumption || '—' }}</dd>
              <dt>优惠</dt><dd class="money neg">{{ d.postEvent.discount ? '-' + fmtMoney(d.postEvent.discount) : '无' }}</dd>
              <dt>尾款收取</dt>
              <dd>
                <span class="money">{{ fmtMoney(d.settlement.paid) }}</span> 已收 /
                余额 <span class="money">{{ fmtMoney(d.settlement.balance) }}</span>
              </dd>
              <dt>归档时间</dt><dd>{{ fmtTime(d.postEvent.archived_at) }}</dd>
            </dl>
          </div>

          <div class="card">
            <h3 class="card-title">临场加项（计入结算）</h3>
            <table class="table" v-if="d.postEvent.onsite_additions?.length">
              <thead><tr><th>加项</th><th class="text-right">金额</th></tr></thead>
              <tbody>
                <tr v-for="(a, i) in d.postEvent.onsite_additions" :key="i">
                  <td>{{ a.label }}</td>
                  <td class="text-right money">{{ fmtMoney(a.amount) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty">无临场加项</div>
          </div>

          <div class="card">
            <h3 class="card-title">投诉与处理（对照版本来源厘清责任）</h3>
            <div v-if="!d.postEvent.complaints?.length" class="empty">无投诉记录</div>
            <div v-for="(c, i) in d.postEvent.complaints" :key="i" class="change-card">
              <div class="row-between">
                <b>{{ c.title }}</b>
                <div class="row">
                  <span class="badge" :class="'src-' + c.related_source">
                    关联：{{ meta.sourceLabels[c.related_source] || '未关联' }}
                  </span>
                  <span class="badge" :class="c.status === '已解决' ? 'task-done' : 'task-pending'">{{ c.status || '处理中' }}</span>
                </div>
              </div>
              <div class="muted mt8">{{ c.detail }}</div>
              <div v-if="c.resolution" class="mt8 small" style="color: var(--ok)">处理结果：{{ c.resolution }}</div>
            </div>
            <p class="small muted">
              提示：投诉定责时可在「确认版本」页对照原计划 / 彩排调整 / 现场临时三个来源的版本快照。
            </p>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="card-title">复盘笔记</h3>
            <p class="muted" style="white-space: pre-wrap">{{ d.postEvent.review_notes || '暂无复盘笔记' }}</p>
          </div>
          <div class="card">
            <h3 class="card-title">最终结算</h3>
            <dl class="kv">
              <dt>应收合计</dt><dd class="money">{{ fmtMoney(d.settlement.total) }}</dd>
              <dt>已收</dt><dd class="money neg">{{ fmtMoney(d.settlement.paid) }}</dd>
              <dt>未收余额</dt><dd class="money">{{ fmtMoney(d.settlement.balance) }}</dd>
            </dl>
          </div>
        </div>
      </div>
    </template>

    <!-- 归档表单 -->
    <div v-else class="card">
      <div class="row-between mb16">
        <h3 class="card-title" style="margin: 0">{{ d.postEvent ? '修订婚后档案' : '婚礼归档 · 录入婚后信息' }}</h3>
        <button v-if="d.postEvent" class="btn btn-ghost btn-sm" @click="editing = false">取消</button>
      </div>

      <template v-if="auth.hasRole('manager')">
        <div class="form-grid">
          <div class="field">
            <label>实际桌数</label>
            <input v-model.number="form.actual_tables" type="number" min="0" class="input" />
          </div>
          <div class="field">
            <label>优惠金额（元）</label>
            <input v-model.number="form.discount" type="number" min="0" class="input" />
          </div>
          <div class="field full">
            <label>酒水消耗</label>
            <textarea v-model="form.alcohol_consumption" class="textarea" placeholder="自带酒水消耗、店内加开酒水…"></textarea>
          </div>
        </div>

        <div class="divider"></div>
        <div class="row-between mb8">
          <b>临场加项</b>
          <button class="btn btn-ghost btn-sm" @click="form.onsite_additions.push({ label: '', amount: 0 })">＋ 添加加项</button>
        </div>
        <div v-for="(a, i) in form.onsite_additions" :key="i" class="row mb8">
          <input v-model="a.label" class="input flex1" placeholder="加项内容（如 店内红酒 4 瓶）" />
          <input v-model.number="a.amount" type="number" min="0" class="input" style="width: 140px" placeholder="金额（元）" />
          <button class="btn-link" @click="form.onsite_additions.splice(i, 1)">删除</button>
        </div>

        <div class="divider"></div>
        <div class="row-between mb8">
          <b>投诉记录</b>
          <button class="btn btn-ghost btn-sm" @click="form.complaints.push({ title: '', detail: '', related_source: 'live', resolution: '', status: '处理中' })">＋ 添加投诉</button>
        </div>
        <div v-for="(c, i) in form.complaints" :key="i" class="prep-card mb8">
          <div class="row mb8">
            <input v-model="c.title" class="input flex1" placeholder="投诉标题" />
            <select v-model="c.related_source" class="select" style="width: 150px">
              <option value="plan">关联：原计划</option>
              <option value="rehearsal">关联：彩排调整</option>
              <option value="live">关联：现场临时</option>
            </select>
            <select v-model="c.status" class="select" style="width: 110px">
              <option>处理中</option><option>已解决</option>
            </select>
            <button class="btn-link" @click="form.complaints.splice(i, 1)">删除</button>
          </div>
          <textarea v-model="c.detail" class="textarea mb8" placeholder="投诉详情…"></textarea>
          <textarea v-model="c.resolution" class="textarea" placeholder="处理结果 / 和解方案…" style="min-height: 44px"></textarea>
        </div>

        <div class="field mt16">
          <label>复盘笔记</label>
          <textarea v-model="form.review_notes" class="textarea" placeholder="本次婚礼执行的经验教训、流程改进建议…"></textarea>
        </div>

        <div class="mt16 text-right">
          <button class="btn" :disabled="saving" @click="archive">{{ saving ? '归档中…' : '保存并归档项目' }}</button>
        </div>
      </template>
      <div v-else class="empty">婚礼结束后由宴会经理录入实际桌数、酒水消耗、临场加项、投诉与优惠，完成归档。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { submit } from '../../api';
import { fmtMoney, fmtTime } from '../../fmt';
import { useAuthStore } from '../../stores/auth';
import { useMetaStore } from '../../stores/meta';
import { toast } from '../../toast';
import type { ProjectDetail } from '../../types';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();
const meta = useMetaStore();

const editing = ref(false);
const saving = ref(false);

const form = reactive<any>({
  actual_tables: props.d.postEvent?.actual_tables ?? props.d.project.planned_tables,
  alcohol_consumption: props.d.postEvent?.alcohol_consumption || '',
  onsite_additions: (props.d.postEvent?.onsite_additions || []).map((a: any) => ({ ...a })),
  complaints: (props.d.postEvent?.complaints || []).map((c: any) => ({ ...c })),
  discount: props.d.postEvent?.discount || 0,
  review_notes: props.d.postEvent?.review_notes || '',
});

function startEdit() {
  editing.value = true;
}

async function archive() {
  saving.value = true;
  const res = await submit(`/projects/${props.d.project.id}/archive`, { ...form });
  saving.value = false;
  if (res) {
    toast('项目已归档，档案与结算已更新');
    editing.value = false;
    emit('changed');
  }
}
</script>
