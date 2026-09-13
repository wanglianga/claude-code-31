// 共享类型与常量（后端）

export type Role = 'admin' | 'sales' | 'planner' | 'manager' | 'kitchen' | 'cashier' | 'waiter';

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  sales: '销售',
  planner: '策划师',
  manager: '宴会经理',
  kitchen: '厨房',
  cashier: '收银',
  waiter: '服务员',
};

export const PROJECT_STATUS: Record<string, string> = {
  confirmed: '已确认',
  preparing: '筹备中',
  live: '婚礼进行中',
  done: '已完结',
  archived: '已归档',
};

// 版本 / 变更来源：原计划、彩排调整、现场临时
export const SOURCE_LABELS: Record<string, string> = {
  plan: '原计划',
  rehearsal: '彩排调整',
  live: '现场临时',
};

export interface ChangeTypeDef {
  type: string;
  label: string;
  roles: string[]; // 受影响岗位
  fields: { key: string; label: string; kind: 'number' | 'text'; placeholder?: string }[];
}

// 临场变更类型定义（前端表单也据此渲染）
export const CHANGE_TYPES: ChangeTypeDef[] = [
  {
    type: 'add_tables',
    label: '增加桌数',
    roles: ['kitchen', 'manager', 'planner', 'cashier'],
    fields: [{ key: 'tables', label: '增加桌数', kind: 'number', placeholder: '如 2' }],
  },
  {
    type: 'elder_swap',
    label: '老人席换位',
    roles: ['manager', 'planner'],
    fields: [{ key: 'seat', label: '换位说明', kind: 'text', placeholder: '如 老人席由 T5 换至 T12（靠近通道）' }],
  },
  {
    type: 'audio_fault',
    label: '音响故障',
    roles: ['manager', 'planner'],
    fields: [{ key: 'device', label: '故障设备', kind: 'text', placeholder: '如 主扩音箱左声道' }],
  },
  {
    type: 'floral_late',
    label: '外部花艺迟到',
    roles: ['planner', 'manager'],
    fields: [{ key: 'minutes', label: '预计迟到(分钟)', kind: 'number', placeholder: '如 40' }],
  },
  {
    type: 'allergy_miss',
    label: '宾客过敏餐遗漏',
    roles: ['kitchen', 'manager'],
    fields: [
      { key: 'allergen', label: '过敏原', kind: 'text', placeholder: '如 海鲜 / 花生' },
      { key: 'covers', label: '涉及人数', kind: 'number', placeholder: '如 2' },
    ],
  },
  {
    type: 'ceremony_delay',
    label: '仪式延迟',
    roles: ['kitchen', 'planner', 'manager'],
    fields: [{ key: 'minutes', label: '延迟(分钟)', kind: 'number', placeholder: '如 30' }],
  },
  {
    type: 'other',
    label: '其他变更',
    roles: ['manager'],
    fields: [],
  },
];

export const PREP_KINDS: { kind: string; label: string; owner: string }[] = [
  { kind: 'tasting', label: '菜单试吃意见', owner: 'sales' },
  { kind: 'table_change', label: '桌数增减确认', owner: 'sales' },
  { kind: 'alcohol', label: '酒水寄存', owner: 'manager' },
  { kind: 'rehearsal', label: '彩排时间', owner: 'planner' },
  { kind: 'vendor', label: '外部婚庆进场', owner: 'manager' },
  { kind: 'fire_lane', label: '消防通道检查', owner: 'manager' },
  { kind: 'final_payment', label: '尾款支付', owner: 'cashier' },
];

export const LAYOUT_KINDS: Record<string, string> = {
  stage: '舞台',
  main_table: '主桌',
  table: '圆桌',
  welcome: '迎宾区',
  kids: '儿童桌',
  elderly: '老人席',
  camera: '摄影机位',
  entrance: '入口',
  fire_exit: '消防通道',
};
