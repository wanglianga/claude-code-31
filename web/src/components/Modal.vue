<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-mask" @click.self="close">
      <div class="modal" :class="{ wide }">
        <div class="modal-head">
          <h3>{{ title }}</h3>
          <button class="modal-close" @click="close">×</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.foot" class="modal-foot">
          <slot name="foot" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; title: string; wide?: boolean }>();
const emit = defineEmits(['update:modelValue']);
function close() { emit('update:modelValue', false); }
</script>
