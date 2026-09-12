import { reactive } from 'vue';

export const toasts = reactive<{ id: number; type: string; text: string }[]>([]);
let seq = 1;

export function toast(text: string, type: 'ok' | 'err' = 'ok') {
  const id = seq++;
  toasts.push({ id, type, text });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 3600);
}
