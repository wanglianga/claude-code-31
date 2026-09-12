// 结算计算：实际/计划桌数 × 菜单价 + 临场变更金额 + 临场加项 - 优惠，对比已收款项得出尾款
export interface Settlement {
  billableTables: number;
  pricePerTable: number;
  baseAmount: number;
  changeDelta: number;
  additionsAmount: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  lines: { label: string; amount: number }[];
}

export function computeSettlement(
  project: any,
  menu: any,
  changes: any[],
  payments: any[],
  postEvent: any | null,
): Settlement {
  const price = Number(menu?.price_per_table || 0);
  const billableTables = Number(postEvent?.actual_tables ?? project.planned_tables ?? 0);
  const baseAmount = billableTables * price;
  // 注意：add_tables（增加桌数）类变更的财务影响已体现在桌数联动后的宴席费中，
  // 其 amount_delta 仅作展示，不计入 changeDelta，避免重复计费。
  const changeDelta = (changes || [])
    .filter((c) => c.status !== 'void' && c.type !== 'add_tables')
    .reduce((s, c) => s + Number(c.amount_delta || 0), 0);
  const additions = (postEvent?.onsite_additions || []) as any[];
  const additionsAmount = additions.reduce((s, a) => s + Number(a.amount || 0), 0);
  const discount = Number(postEvent?.discount || 0);
  const total = baseAmount + changeDelta + additionsAmount - discount;
  const paid = (payments || [])
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const lines: { label: string; amount: number }[] = [
    { label: `宴席费用（${billableTables} 桌 × ¥${price.toLocaleString('zh-CN')}）`, amount: baseAmount },
  ];
  for (const c of changes || []) {
    if (Number(c.amount_delta) !== 0 && c.status !== 'void' && c.type !== 'add_tables') {
      lines.push({ label: `临场变更：${c.title}`, amount: Number(c.amount_delta) });
    }
  }
  for (const a of additions) {
    lines.push({ label: `临场加项：${a.label || a.title || '加项'}`, amount: Number(a.amount || 0) });
  }
  if (discount > 0) lines.push({ label: '优惠减免', amount: -discount });

  return {
    billableTables,
    pricePerTable: price,
    baseAmount,
    changeDelta,
    additionsAmount,
    discount,
    total,
    paid,
    balance: total - paid,
    lines,
  };
}
