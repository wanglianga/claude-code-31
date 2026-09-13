// 过敏餐跟踪领域逻辑：桌号→分区查找、事件记录、厨房确认→服务员桌边提醒
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
    g.project_id, guestId, 'waiter',
    `桌边提醒：${g.table_no}桌 ${g.guest_name} 过敏餐`,
    `上桌时核对：${g.guest_name}（${g.table_no}桌${g.zone ? ' · ' + g.zone + '区' : ''}）禁忌「${g.allergens}」，替代菜品「${g.substitute_dish}」，单独出餐、桌边确认后再离开。`,
  ]);
  await addAllergyEvent(g.project_id, guestId, 'reminder',
    `已生成服务员桌边提醒（${g.table_no}桌${g.zone ? ' · ' + g.zone + '区' : ''}）`, { by: user });
  return g;
}
