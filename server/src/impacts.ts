// 临场变更 → 跨岗位任务 / 结算影响 引擎
// 变更不是孤立备注：每种变更类型都会展开为影响厨房、宴会经理、策划、收银的具体任务，
// 并计算对结算金额与桌数的影响。

export interface ImpactTask {
  role: string;
  title: string;
  detail: string;
}

export interface ImpactResult {
  tasks: ImpactTask[];
  amountDelta: number; // 对结算金额的影响（元）
  tableDelta: number; // 对桌数的影响
  summary: string[]; // 人类可读的影响摘要
}

interface ProjectCtx {
  planned_tables: number;
  hall_name: string;
  menu_name: string;
  menu_price: number;
  menu_dishes: number;
}

const fmt = (n: number) => `¥${Number(n).toLocaleString('zh-CN')}`;

export function buildImpact(
  type: string,
  payload: Record<string, any>,
  detail: string,
  ctx: ProjectCtx,
): ImpactResult {
  const tasks: ImpactTask[] = [];
  const summary: string[] = [];
  let amountDelta = 0;
  let tableDelta = 0;

  switch (type) {
    case 'add_tables': {
      const n = Math.max(1, parseInt(payload.tables, 10) || 1);
      amountDelta = n * ctx.menu_price;
      tableDelta = n;
      tasks.push(
        {
          role: 'kitchen',
          title: `备料追加 ${n} 桌`,
          detail: `按「${ctx.menu_name}」追加 ${n} 桌食材备料（${ctx.menu_dishes} 道/桌），并同步出菜口数量。`,
        },
        {
          role: 'manager',
          title: `摆台 ${n} 桌并重排分区`,
          detail: `新增 ${n} 桌摆台，重新划分服务员分区，补打桌卡并更新宾客引导。`,
        },
        {
          role: 'planner',
          title: '更新厅内布置图',
          detail: `在${ctx.hall_name}布置图中加入 ${n} 桌摆位，核对宾客动线与消防通道不被占用。`,
        },
        {
          role: 'cashier',
          title: `结算追加 ${fmt(amountDelta)}`,
          detail: `${n} 桌 × ${fmt(ctx.menu_price)}/桌 = ${fmt(amountDelta)}，计入项目结算与尾款。`,
        },
      );
      summary.push(`桌数 +${n}（${ctx.planned_tables} → ${ctx.planned_tables + n}）`, `结算金额 +${fmt(amountDelta)}`);
      break;
    }
    case 'elder_swap': {
      const seat = payload.seat || detail || '老人席换位';
      tasks.push(
        {
          role: 'manager',
          title: '老人席换位执行',
          detail: `${seat}。更新桌卡与席位引导，安排服务员就近照看老人宾客。`,
        },
        {
          role: 'planner',
          title: '布置图同步老人席',
          detail: `更新布置图中老人席位置（${seat}），同步核对摄影机位与通道。`,
        },
      );
      summary.push('桌卡与席位引导需更新', '不影响结算金额');
      break;
    }
    case 'audio_fault': {
      const device = payload.device || detail || '音响设备';
      tasks.push(
        {
          role: 'manager',
          title: '音响抢修',
          detail: `${device}故障：立即启用备用音响，联系维保到场，10 分钟内恢复仪式音频。`,
        },
        {
          role: 'planner',
          title: '仪式流程应急调整',
          detail: `音响故障期间调整仪式音乐与灯光流程，必要时切换无配乐应急方案。`,
        },
      );
      summary.push('启用备用音响', '灯光/音乐流程需应急调整');
      break;
    }
    case 'floral_late': {
      const m = Math.max(5, parseInt(payload.minutes, 10) || 30);
      tasks.push(
        {
          role: 'planner',
          title: `花艺迟到 ${m} 分钟应对`,
          detail: `外部花艺预计迟到 ${m} 分钟：调整迎宾区布置时序，启用备用花材/简化方案兜底。`,
        },
        {
          role: 'manager',
          title: '外部花艺进场协调',
          detail: `协调迟到花艺团队从后场通道进场，避让宾客入场动线，安排专人对接验收。`,
        },
      );
      summary.push(`迎宾区布置顺延约 ${m} 分钟`, '宾客动线需临时避让');
      break;
    }
    case 'allergy_miss': {
      const allergen = payload.allergen || '过敏原';
      const covers = Math.max(1, parseInt(payload.covers, 10) || 1);
      tasks.push(
        {
          role: 'kitchen',
          title: `紧急补做无${allergen}餐 ${covers} 份`,
          detail: `宾客过敏餐遗漏：紧急补做 ${covers} 份无${allergen}餐，单独制作、单独出餐，避免交叉污染。`,
        },
        {
          role: 'manager',
          title: '过敏宾客核对送达',
          detail: `核对过敏宾客所在桌位（共 ${covers} 人），专人送达补做餐品并回访确认。`,
        },
      );
      summary.push(`厨房紧急补做 ${covers} 份特殊餐`, '需回访宾客满意度，防范投诉');
      break;
    }
    case 'ceremony_delay': {
      const m = Math.max(5, parseInt(payload.minutes, 10) || 15);
      tasks.push(
        {
          role: 'kitchen',
          title: `出菜顺延 ${m} 分钟`,
          detail: `仪式延迟 ${m} 分钟：热菜出菜整体顺延，已备菜品保温，汤羹类延后起菜。`,
        },
        {
          role: 'planner',
          title: '灯光音乐流程顺延',
          detail: `仪式流程整体顺延 ${m} 分钟，灯光秀与音乐节点同步调整。`,
        },
        {
          role: 'manager',
          title: '现场节奏调整',
          detail: `通知各分区服务员调整上菜节奏，向宾客做好解释与安抚。`,
        },
      );
      summary.push(`全部流程顺延约 ${m} 分钟`, '厨房出菜节奏需重排');
      break;
    }
    default: {
      tasks.push({
        role: 'manager',
        title: '变更核实与协调',
        detail: detail || '现场临时变更：宴会经理核实内容并协调相关岗位处理。',
      });
      summary.push('由宴会经理牵头协调处理');
    }
  }

  return { tasks, amountDelta, tableDelta, summary };
}
