// 展示格式化工具
export const fmtMoney = (n: number | string | null | undefined) =>
  '¥' + Number(n || 0).toLocaleString('zh-CN');

export const fmtDate = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : '—');

export const fmtTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const STATUS_FLOW = ['confirmed', 'preparing', 'live', 'done', 'archived'];

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  add_tables: '增加桌数',
  elder_swap: '老人席换位',
  audio_fault: '音响故障',
  floral_late: '外部花艺迟到',
  allergy_miss: '宾客过敏餐遗漏',
  ceremony_delay: '仪式延迟',
  other: '其他变更',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  doing: '处理中',
  done: '已完成',
};
