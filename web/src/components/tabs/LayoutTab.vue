<template>
  <div>
    <div class="card">
      <div class="row-between">
        <div>
          <h3 class="card-title" style="margin: 0">{{ d.hall?.name }} 布置图</h3>
          <div class="muted small mt8">
            厅内尺寸 {{ d.hall?.length_m }}m × {{ d.hall?.width_m }}m · {{ d.hall?.stage_desc }} ·
            消防：{{ d.hall?.fire_exits }} · 最大 {{ d.hall?.max_tables }} 桌
          </div>
        </div>
        <div class="row" v-if="editable">
          <button class="btn btn-ghost btn-sm" @click="autoPlace">一键摆台（{{ d.project.planned_tables }} 桌）</button>
          <button class="btn btn-sm" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存布置图' }}</button>
        </div>
        <span v-else class="muted small">策划师/宴会经理可编辑布置</span>
      </div>
      <div class="row mt8" v-if="editable">
        <span class="small muted">添加元素：</span>
        <div class="palette">
          <button @click="addItem('table')">＋ 圆桌</button>
          <button @click="addItem('main_table')">＋ 主桌</button>
          <button @click="addItem('stage')">＋ 舞台</button>
          <button @click="addItem('welcome')">＋ 迎宾区</button>
          <button @click="addItem('kids')">＋ 儿童桌</button>
          <button @click="addItem('elderly')">＋ 老人席</button>
          <button @click="addItem('camera')">＋ 摄影机位</button>
          <button @click="addItem('entrance')">＋ 入口</button>
          <button @click="addItem('fire_exit')">＋ 消防通道</button>
        </div>
      </div>
    </div>

    <div class="floor-wrap">
      <div class="card" style="margin: 0">
        <FloorPlan
          v-if="d.hall"
          :hall="d.hall"
          :items="items"
          :editable="editable"
          :selected="selected"
          @select="selected = $event"
          @changed="dirty = true"
        />
        <div class="legend mt8">
          <span><i class="dot" style="background:#c9a227"></i>主桌</span>
          <span><i class="dot" style="background:#f4b8c1"></i>A 区</span>
          <span><i class="dot" style="background:#a8d3ea"></i>B 区</span>
          <span><i class="dot" style="background:#b5dcb6"></i>C 区</span>
          <span><i class="dot" style="background:#90caf9"></i>老人席</span>
          <span><i class="dot" style="background:#a5d6a7"></i>儿童桌</span>
          <span><i class="dot" style="background:#ffebee;border:1px dashed #e57373"></i>消防通道</span>
          <span class="muted">（拖拽元素调整摆位，点击选中后右侧编辑）</span>
        </div>
      </div>

      <div class="card" style="margin: 0">
        <h3 class="card-title">元素属性</h3>
        <template v-if="cur">
          <div class="field mb8">
            <label>类型</label>
            <input class="input" :value="kindLabel(cur.kind)" disabled />
          </div>
          <div class="field mb8">
            <label>名称 / 桌号</label>
            <input v-model="cur.label" class="input" :disabled="!editable" @input="dirty = true" />
          </div>
          <div class="field mb8" v-if="['table', 'main_table', 'kids', 'elderly'].includes(cur.kind)">
            <label>服务分区</label>
            <select v-model="cur.zone" class="select" :disabled="!editable" @change="dirty = true">
              <option value="">未分区</option>
              <option>A</option><option>B</option><option>C</option><option>D</option>
            </select>
          </div>
          <div class="field mb8" v-if="['table', 'main_table', 'kids', 'elderly'].includes(cur.kind)">
            <label>席位数</label>
            <input v-model.number="cur.seats" type="number" min="0" class="input" :disabled="!editable" @input="dirty = true" />
          </div>
          <div class="field mb8" v-if="['stage', 'welcome', 'entrance', 'fire_exit'].includes(cur.kind)">
            <label>宽 × 高（米）</label>
            <div class="row">
              <input v-model.number="cur.w" type="number" step="0.2" min="0.4" class="input" :disabled="!editable" @input="dirty = true" />
              <input v-model.number="cur.h" type="number" step="0.2" min="0.4" class="input" :disabled="!editable" @input="dirty = true" />
            </div>
          </div>
          <div class="small muted mb8">位置：({{ cur.x }}, {{ cur.y }}) 米</div>
          <button v-if="editable" class="btn btn-ghost btn-sm" @click="removeSelected">删除该元素</button>
        </template>
        <div v-else class="empty">点击布置图中的元素进行编辑</div>

        <div class="divider"></div>
        <h3 class="card-title">摆位统计</h3>
        <dl class="kv">
          <dt>圆桌</dt><dd>{{ countOf('table') }} 桌</dd>
          <dt>主桌</dt><dd>{{ countOf('main_table') }}</dd>
          <dt>老人席 / 儿童桌</dt><dd>{{ countOf('elderly') }} / {{ countOf('kids') }}</dd>
          <dt>摄影机位</dt><dd>{{ countOf('camera') }} 个</dd>
          <dt>服务分区</dt>
          <dd>
            <span v-for="z in zoneSummary" :key="z.zone" class="badge" style="margin-right:4px">{{ z.zone }}区 {{ z.n }} 桌</span>
          </dd>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { submit } from '../../api';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../toast';
import type { LayoutItem, ProjectDetail } from '../../types';
import FloorPlan from '../FloorPlan.vue';

const props = defineProps<{ d: ProjectDetail }>();
const emit = defineEmits(['changed']);
const auth = useAuthStore();

const editable = computed(() => auth.hasRole('planner', 'manager'));
const items = ref<LayoutItem[]>(props.d.layout.map((it) => ({ ...it })));
const selected = ref(-1);
const saving = ref(false);
const dirty = ref(false);

const cur = computed(() => (selected.value >= 0 ? items.value[selected.value] : null));

const KIND_DEFAULTS: Record<string, Partial<LayoutItem>> = {
  table: { label: '', seats: 10, zone: 'A' },
  main_table: { label: '主桌', seats: 12, zone: 'A' },
  stage: { label: '舞台', w: 8, h: 4 },
  welcome: { label: '迎宾区', w: 5, h: 2.4 },
  kids: { label: '儿童桌', seats: 8, zone: 'C' },
  elderly: { label: '老人席', seats: 10, zone: 'B' },
  camera: { label: '机位' },
  entrance: { label: '入口', w: 3, h: 0.6 },
  fire_exit: { label: '消防通道', w: 0.6, h: 3 },
};

const KIND_LABELS: Record<string, string> = {
  stage: '舞台', main_table: '主桌', table: '圆桌', welcome: '迎宾区', kids: '儿童桌',
  elderly: '老人席', camera: '摄影机位', entrance: '入口', fire_exit: '消防通道',
};
const kindLabel = (k: string) => KIND_LABELS[k] || k;

function addItem(kind: string) {
  const L = Number(props.d.hall.length_m);
  const W = Number(props.d.hall.width_m);
  const def = KIND_DEFAULTS[kind] || {};
  const it: LayoutItem = {
    kind,
    label: def.label ?? '',
    x: Math.round(L / 2 * 10) / 10,
    y: Math.round(W / 2 * 10) / 10,
    w: def.w || 0,
    h: def.h || 0,
    seats: def.seats || 0,
    zone: def.zone || '',
    meta: {},
  };
  if (kind === 'table') {
    const n = items.value.filter((i) => i.kind === 'table').length;
    it.label = `T${n + 1}`;
  }
  items.value.push(it);
  selected.value = items.value.length - 1;
  dirty.value = true;
}

function removeSelected() {
  if (selected.value >= 0) {
    items.value.splice(selected.value, 1);
    selected.value = -1;
    dirty.value = true;
  }
}

// 一键摆台：避开舞台区域，网格排布圆桌
function autoPlace() {
  const L = Number(props.d.hall.length_m);
  const n = props.d.project.planned_tables;
  items.value = items.value.filter((i) => i.kind !== 'table');
  const stage = items.value.find((i) => i.kind === 'stage');
  const startY = stage ? Number(stage.y) + Number(stage.h) + 2.2 : 3;
  const cols = Math.max(2, Math.floor((L - 4) / 5));
  const zones = ['A', 'B', 'C'];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    items.value.push({
      kind: 'table',
      label: `T${i + 1}`,
      x: Math.round((3 + col * ((L - 6) / Math.max(1, cols - 1))) * 10) / 10,
      y: Math.round((startY + row * 3.4) * 10) / 10,
      w: 0, h: 0, seats: 10, zone: zones[i % 3], meta: {},
    });
  }
  dirty.value = true;
  toast(`已按 ${n} 桌自动摆台，可拖拽微调`);
}

const countOf = (kind: string) => items.value.filter((i) => i.kind === kind).length;
const zoneSummary = computed(() => {
  const map: Record<string, number> = {};
  for (const i of items.value) {
    if (['table', 'main_table', 'kids', 'elderly'].includes(i.kind) && i.zone) {
      map[i.zone] = (map[i.zone] || 0) + 1;
    }
  }
  return Object.entries(map).map(([zone, n]) => ({ zone, n }));
});

async function save() {
  saving.value = true;
  const res = await submit(`/projects/${props.d.project.id}/layout`, { items: items.value }, 'PUT');
  saving.value = false;
  if (res) {
    toast('布置图已保存');
    dirty.value = false;
    emit('changed');
  }
}
</script>
