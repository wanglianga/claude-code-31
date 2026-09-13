// 过敏餐跟踪领域逻辑：桌号→分区查找、事件记录、厨房确认→服务员桌边提醒、换桌任务同步
import { q } from './db';

export const ALLERGY_STATUS: Record<string, string> = {
  submitted: '待厨房确认',
  confirmed: '厨房已确认',
  issue: '事故处理中',
};

export const ALLERGY_EVENT_KINDS: Record<string, string> = {
  created: '名单提交',
  kitchen_confirmed: '厨房确认',
  reminder: '桌边提醒生成',
  moved: '临场换桌',
  wrong_dish: '上错菜事故',
  resolved: '沟通处理完成',
};

// 根据布置图桌号推导服务分区
export async function lookupZone(projectId: number, tableNo: string): Promise<string> {
  const r = await q(
    `SELECT zone FROM layout_items
     WHERE project_id=$1 AND label=$2 AND kind IN ('table','main_table','kids','elderly') LIMIT 1`,
    [projectId, tableNo],
  );
  return r.rows[0]?.zone || '';
}

// ---- 任务文案模板（唯一来源，保证任何时刻生成的提醒都使用当前桌号与当前分区）----
const zoneSeg = (g: { zone?: string }) => (g.zone ? ` · ${g.zone}区` : '');
const zoneTitle = (g: { zone?: string }) => (g.zone ? `（${g.zone}区）` : '');

// 标题同时包含当前桌号与当前分区：仪表盘/任务中心仅展示标题时服务员也能识别分区
export const reminderTitle = (g: any) => `桌边提醒：${g.table_no}桌${zoneTitle(g)} ${g.guest_name} 过敏餐`;
export const reminderDetail = (g: any) =>
  `上桌时核对：${g.guest_name}（${g.table_no}桌${zoneSeg(g)}）禁忌「${g.allergens}」，替代菜品「${g.substitute_dish}」，单独出餐、桌边确认后再离开。`;

export const kitchenPrepTitle = (g: any) => `过敏餐备餐确认：${g.table_no}桌 ${g.guest_name}`;
export const kitchenPrepDetail = (g: any) =>
  `宾客 ${g.guest_name}（${g.table_no}桌${zoneSeg(g)}）禁忌「${g.allergens}」，替代菜品「${g.substitute_dish}」。请确认可单独备制并回执。`;

export async function addAllergyEvent(
  projectId: number,
  allergyId: number,
  kind: string,
  detail: string,
  opts: { from?: string; to?: string; clientNote?: string; by?: { id: number; name: string } } = {},
) {
  await q(
    `INSERT INTO allergy_events(project_id, allergy_id, kind, detail, from_table, to_table, client_note, created_by, created_by_name)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      projectId, allergyId, kind, detail,
      opts.from || '', opts.to || '', opts.clientNote || '',
      opts.by?.id ?? null, opts.by?.name ?? '系统',
    ],
  );
}

// 厨房确认 → 完成厨房任务 → 生成服务员桌边提醒（服务员角色任务）
export async function confirmAllergy(guestId: number, user: { id: number; name: string }) {
  const g = (await q('SELECT * FROM allergy_guests WHERE id=$1', [guestId])).rows[0];
  if (!g || g.status !== 'submitted') return null;
  await q("UPDATE allergy_guests SET status='confirmed', updated_at=now() WHERE id=$1", [guestId]);
  // 厨房备餐任务联动完成
  await q("UPDATE tasks SET status='done', done_at=now() WHERE allergy_id=$1 AND role='kitchen' AND status<>'done'", [guestId]);
  await addAllergyEvent(g.project_id, guestId, 'kitchen_confirmed',
    `厨房已确认 ${g.guest_name}（${g.table_no}桌）的无${g.allergens}餐，替代菜品「${g.substitute_dish}」开始备制`, { by: user });
  // 生成服务员桌边提醒（服务员角色任务，服务员登录可见）
  await q('INSERT INTO tasks(project_id, allergy_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
    g.project_id, guestId, 'waiter', reminderTitle(g), reminderDetail(g),
  ]);
  await addAllergyEvent(g.project_id, guestId, 'reminder',
    `已生成服务员桌边提醒（${g.table_no}桌${g.zone ? ' · ' + g.zone + '区' : ''}）`, { by: user });
  return g;
}

// 临场换桌后同步该宾客的全部待办：
// 1) 常驻提醒（服务员桌边提醒、厨房备餐确认）按当前桌号+当前分区整体重写
// 2) 既往换桌/桌卡/出餐类待办由本次新任务取代（置为完成），杜绝旧桌号/旧分区残留
export async function syncAllergyTasks(g: any) {
  await q(
    `UPDATE tasks SET title=$1, detail=$2 WHERE allergy_id=$3 AND role='waiter' AND status<>'done' AND title LIKE '桌边提醒%'`,
    [reminderTitle(g), reminderDetail(g), g.id],
  );
  await q(
    `UPDATE tasks SET title=$1, detail=$2 WHERE allergy_id=$3 AND role='kitchen' AND status<>'done' AND title LIKE '过敏餐备餐确认%'`,
    [kitchenPrepTitle(g), kitchenPrepDetail(g), g.id],
  );
  await q(
    `UPDATE tasks SET status='done', done_at=now()
     WHERE allergy_id=$1 AND status<>'done'
       AND (title LIKE '换桌提醒%' OR title LIKE '桌卡更新%' OR title LIKE '出餐桌号变更%')`,
    [g.id],
  );
}
