<template>
  <svg
    ref="svgRef"
    class="floor-svg"
    :viewBox="`0 0 ${hall.length_m} ${hall.width_m}`"
    :style="{ aspectRatio: `${hall.length_m} / ${hall.width_m}` }"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointerleave="onUp"
  >
    <defs>
      <pattern id="fgrid" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#f0e6df" stroke-width="0.04" />
      </pattern>
    </defs>
    <rect :width="hall.length_m" :height="hall.width_m" fill="url(#fgrid)" stroke="#d7ccc8" stroke-width="0.1" rx="0.2" />

    <g
      v-for="(it, i) in items"
      :key="i"
      class="item"
      :class="{ selected: selected === i, readonly: !editable }"
      @pointerdown.stop="onDown(i, $event)"
      @click.stop="$emit('select', i)"
    >
      <!-- 矩形类：舞台 / 迎宾区 / 入口 / 消防通道 -->
      <template v-if="isRect(it.kind)">
        <rect
          :x="it.x" :y="it.y" :width="it.w || 2" :height="it.h || 1.2" rx="0.15"
          :fill="fillOf(it)" :stroke="selected === i ? '#b76e79' : strokeOf(it)" :stroke-width="selected === i ? 0.14 : 0.06"
          :stroke-dasharray="it.kind === 'fire_exit' ? '0.25 0.18' : ''"
        />
        <text :x="it.x + (it.w || 2) / 2" :y="it.y + (it.h || 1.2) / 2" text-anchor="middle" dominant-baseline="middle"
              :font-size="it.kind === 'stage' ? 0.7 : 0.5" :fill="textOf(it)" font-weight="600">
          {{ it.label || kindLabel(it.kind) }}
        </text>
      </template>
      <!-- 圆形类：桌台 / 席位 -->
      <template v-else-if="it.kind !== 'camera'">
        <circle
          :cx="it.x" :cy="it.y" :r="radiusOf(it)"
          :fill="fillOf(it)" :stroke="selected === i ? '#b76e79' : '#ffffff'" :stroke-width="selected === i ? 0.14 : 0.07"
        />
        <text :x="it.x" :y="it.y - 0.12" text-anchor="middle" dominant-baseline="middle" font-size="0.5" :fill="textOf(it)" font-weight="700">
          {{ it.label || kindLabel(it.kind) }}
        </text>
        <text v-if="it.zone" :x="it.x" :y="it.y + 0.45" text-anchor="middle" font-size="0.38" :fill="textOf(it)">
          {{ it.zone }}区{{ it.seats ? '·' + it.seats + '席' : '' }}
        </text>
      </template>
      <!-- 摄影机位 -->
      <template v-else>
        <rect :x="it.x - 0.45" :y="it.y - 0.35" width="0.9" height="0.7" rx="0.12"
              :fill="fillOf(it)" :stroke="selected === i ? '#b76e79' : '#7b5e8a'" :stroke-width="selected === i ? 0.14 : 0.06" />
        <text :x="it.x" :y="it.y + 0.02" text-anchor="middle" dominant-baseline="middle" font-size="0.4" fill="#fff" font-weight="700">摄</text>
      </template>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Hall, LayoutItem } from '../types';

const props = defineProps<{ hall: Hall; items: LayoutItem[]; editable: boolean; selected: number }>();
const emit = defineEmits(['select', 'changed']);

const svgRef = ref<SVGSVGElement | null>(null);
const dragIdx = ref(-1);
const dragOff = { x: 0, y: 0 };

const RECT_KINDS = ['stage', 'welcome', 'entrance', 'fire_exit'];
const isRect = (kind: string) => RECT_KINDS.includes(kind);

const ZONE_COLORS: Record<string, string> = {
  A: '#f4b8c1', B: '#a8d3ea', C: '#b5dcb6', D: '#f5dfa0', '': '#e0d5ce',
};

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    stage: '舞台', main_table: '主桌', table: '圆桌', welcome: '迎宾区',
    kids: '儿童桌', elderly: '老人席', camera: '机位', entrance: '入口', fire_exit: '消防通道',
  };
  return map[kind] || kind;
}

function fillOf(it: LayoutItem) {
  switch (it.kind) {
    case 'stage': return '#8d6e63';
    case 'main_table': return '#c9a227';
    case 'table': return ZONE_COLORS[it.zone || ''] || ZONE_COLORS[''];
    case 'welcome': return '#f6c6d3';
    case 'kids': return '#a5d6a7';
    case 'elderly': return '#90caf9';
    case 'camera': return '#8e6f9e';
    case 'entrance': return '#bcaaa4';
    case 'fire_exit': return '#ffebee';
    default: return '#e0e0e0';
  }
}
function strokeOf(it: LayoutItem) {
  return it.kind === 'fire_exit' ? '#e57373' : 'rgba(0,0,0,0.15)';
}
function textOf(it: LayoutItem) {
  return ['stage', 'camera', 'main_table'].includes(it.kind) ? '#fff' : '#4a3c40';
}
function radiusOf(it: LayoutItem) {
  if (it.kind === 'main_table') return 1.35;
  if (it.kind === 'kids' || it.kind === 'elderly') return 1.05;
  return 0.95;
}

function pointerPos(e: PointerEvent) {
  const rect = svgRef.value!.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * Number(props.hall.length_m),
    y: ((e.clientY - rect.top) / rect.height) * Number(props.hall.width_m),
  };
}

function onDown(i: number, e: PointerEvent) {
  emit('select', i);
  if (!props.editable) return;
  const it = props.items[i];
  const p = pointerPos(e);
  dragIdx.value = i;
  if (isRect(it.kind)) {
    dragOff.x = p.x - it.x;
    dragOff.y = p.y - it.y;
  } else {
    dragOff.x = p.x - it.x;
    dragOff.y = p.y - it.y;
  }
  (e.target as Element).setPointerCapture?.(e.pointerId);
}

function onMove(e: PointerEvent) {
  if (dragIdx.value < 0 || !props.editable) return;
  const it = props.items[dragIdx.value];
  const p = pointerPos(e);
  const L = Number(props.hall.length_m);
  const W = Number(props.hall.width_m);
  if (isRect(it.kind)) {
    it.x = clamp(p.x - dragOff.x, 0, L - (it.w || 2));
    it.y = clamp(p.y - dragOff.y, 0, W - (it.h || 1.2));
  } else {
    it.x = clamp(p.x - dragOff.x, 0.6, L - 0.6);
    it.y = clamp(p.y - dragOff.y, 0.6, W - 0.6);
  }
}

function onUp() {
  if (dragIdx.value >= 0) {
    dragIdx.value = -1;
    emit('changed');
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10));
</script>
