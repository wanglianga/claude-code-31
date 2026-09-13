import { NextFunction, Request, Response, Router } from 'express';
import { addAllergyEvent, confirmAllergy, kitchenPrepDetail, kitchenPrepTitle, lookupZone, syncAllergyTasks } from './allergy';
import { AuthedRequest, authRequired, requireRole, signToken, verifyPassword } from './auth';
import { logAudit, q } from './db';
import { buildImpact } from './impacts';
import { projectSnapshot } from './seed';
import { computeSettlement } from './settle';
import { CHANGE_TYPES, PREP_KINDS, PROJECT_STATUS, ROLE_LABELS, SOURCE_LABELS } from './types';

export const router = Router();

// Express 4 不会自动捕获 async 处理器的异常，统一包装转发到错误中间件，避免进程崩溃
const ah =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// 路径参数 ID 校验：非法（NaN/非正整数）返回 null
const numId = (v: string): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ---------- 健康检查 ----------
router.get('/health', ah(async (_req, res) => {
  try {
    await q('SELECT 1');
    res.json({ ok: true, service: 'wedding-banquet', time: new Date().toISOString() });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: e.message });
  }
}));

// ---------- 登录 / 当前用户 ----------
router.post('/auth/login', ah(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const { rows } = await q('SELECT * FROM users WHERE username=$1', [username]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const payload = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.json({ token: signToken(payload), user: payload });
}));

router.get('/me', authRequired, (req: AuthedRequest, res) => res.json({ user: req.user }));

// ---------- 元数据（厅 / 菜单 / 用户 / 字典）----------
router.get('/meta', authRequired, ah(async (_req, res) => {
  const [halls, menus, users] = await Promise.all([
    q('SELECT * FROM halls ORDER BY id'),
    q('SELECT * FROM menus ORDER BY price_per_table'),
    q('SELECT id, name, role, username FROM users ORDER BY id'),
  ]);
  res.json({
    halls: halls.rows,
    menus: menus.rows,
    users: users.rows,
    changeTypes: CHANGE_TYPES,
    prepKinds: PREP_KINDS,
    roleLabels: ROLE_LABELS,
    statusLabels: PROJECT_STATUS,
    sourceLabels: SOURCE_LABELS,
  });
}));

// ---------- 仪表盘 ----------
router.get('/dashboard', authRequired, ah(async (req: AuthedRequest, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const [todayW, openC, myT, revenue, todayList, recentChanges, myTasks] = await Promise.all([
    q('SELECT COUNT(*)::int n FROM projects WHERE wedding_date=$1', [today]),
    q("SELECT COUNT(*)::int n FROM changes WHERE status='open'"),
    q("SELECT COUNT(*)::int n FROM tasks WHERE role=$1 AND status IN ('pending','doing')", [req.user!.role]),
    q("SELECT COALESCE(SUM(amount),0)::float s FROM payments WHERE status='paid' AND paid_at >= $1", [monthStart]),
    q(
      `SELECT p.id, p.code, p.couple_names, p.meal_session, p.status, p.planned_tables, h.name hall_name
       FROM projects p LEFT JOIN halls h ON h.id=p.hall_id WHERE p.wedding_date=$1 ORDER BY p.meal_session DESC`,
      [today],
    ),
    q(
      `SELECT c.id, c.title, c.type, c.source, c.status, c.created_at, p.id project_id, p.couple_names
       FROM changes c JOIN projects p ON p.id=c.project_id ORDER BY c.id DESC LIMIT 8`,
    ),
    q(
      `SELECT t.id, t.title, t.detail, t.status, t.role, p.id project_id, p.couple_names, p.wedding_date
       FROM tasks t JOIN projects p ON p.id=t.project_id
       WHERE t.role=$1 AND t.status IN ('pending','doing') ORDER BY t.id DESC LIMIT 20`,
      [req.user!.role],
    ),
  ]);
  res.json({
    stats: {
      todayWeddings: todayW.rows[0].n,
      openChanges: openC.rows[0].n,
      myPendingTasks: myT.rows[0].n,
      monthRevenue: revenue.rows[0].s,
    },
    todayProjects: todayList.rows,
    recentChanges: recentChanges.rows,
    myTasks: myTasks.rows,
  });
}));

// ---------- 档期 ----------
router.get('/schedule', authRequired, ah(async (req, res) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 8) + '01');
  const to = String(req.query.to || new Date(new Date(from).setMonth(new Date(from).getMonth() + 1)).toISOString().slice(0, 10));
  const { rows } = await q(
    `SELECT p.id, p.code, p.couple_names, p.wedding_date::text, p.meal_session, p.status, p.planned_tables,
            p.hall_id, h.name hall_name, m.name menu_name
     FROM projects p LEFT JOIN halls h ON h.id=p.hall_id LEFT JOIN menus m ON m.id=p.menu_id
     WHERE p.wedding_date >= $1 AND p.wedding_date < $2 ORDER BY p.wedding_date, p.hall_id`,
    [from, to],
  );
  res.json({ items: rows });
}));

// ---------- 项目列表 ----------
router.get('/projects', authRequired, ah(async (req, res) => {
  const cond: string[] = [];
  const params: any[] = [];
  if (req.query.status) {
    params.push(req.query.status);
    cond.push(`p.status=$${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    cond.push(`(p.couple_names ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await q(
    `SELECT p.*, h.name hall_name, m.name menu_name, m.price_per_table,
            u.name sales_name,
            (SELECT COUNT(*)::int FROM changes c WHERE c.project_id=p.id AND c.status='open') open_changes,
            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id=p.id AND t.status IN ('pending','doing')) open_tasks
     FROM projects p
     LEFT JOIN halls h ON h.id=p.hall_id LEFT JOIN menus m ON m.id=p.menu_id
     LEFT JOIN users u ON u.id=p.sales_id
     ${where} ORDER BY p.wedding_date DESC, p.id DESC LIMIT 200`,
    params,
  );
  res.json({ items: rows });
}));

// ---------- 新建项目（销售） ----------
router.post('/projects', authRequired, requireRole('sales'), ah(async (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.couple_names || !b.wedding_date || !b.hall_id || !b.menu_id) {
    return res.status(400).json({ error: '新人姓名、婚期、厅别、菜单为必填项' });
  }
  if (Number.isNaN(Date.parse(String(b.wedding_date)))) {
    return res.status(400).json({ error: '婚期格式不正确' });
  }
  const hall = (await q('SELECT * FROM halls WHERE id=$1', [b.hall_id])).rows[0];
  if (!hall) return res.status(400).json({ error: '宴会厅不存在' });
  const tables = parseInt(b.planned_tables, 10) || 10;
  if (tables > hall.max_tables) {
    return res.status(400).json({ error: `${hall.name} 最大容纳 ${hall.max_tables} 桌` });
  }
  // 档期冲突：同厅同日同场次
  const clash = await q(
    'SELECT id, code FROM projects WHERE hall_id=$1 AND wedding_date=$2 AND meal_session=$3',
    [b.hall_id, b.wedding_date, b.meal_session || '晚宴'],
  );
  if (clash.rows.length) {
    return res.status(409).json({ error: `档期冲突：该厅当日${b.meal_session || '晚宴'}已被项目 ${clash.rows[0].code} 占用` });
  }
  const dateStr = String(b.wedding_date).replaceAll('-', '');
  const seq = await q('SELECT COUNT(*)::int n FROM projects WHERE code LIKE $1', [`WD-${dateStr}-%`]);
  const code = `WD-${dateStr}-${String(seq.rows[0].n + 1).padStart(2, '0')}`;

  const r = await q(
    `INSERT INTO projects(code, couple_names, contact_phone, wedding_date, meal_session, hall_id, menu_id,
       planned_tables, reserve_tables, ceremony_req, lighting_audio, floral_req, guest_flow, status, sales_id, planner_id, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'confirmed',$14,$15,$16) RETURNING id`,
    [
      code, b.couple_names, b.contact_phone || '', b.wedding_date, b.meal_session || '晚宴',
      b.hall_id, b.menu_id, tables, parseInt(b.reserve_tables, 10) || 1,
      b.ceremony_req || '', b.lighting_audio || '', b.floral_req || '', b.guest_flow || '',
      req.user!.id, b.planner_id || null, b.notes || '',
    ],
  );
  const pid = r.rows[0].id;

  // 婚前筹备事项
  for (const k of PREP_KINDS) {
    await q('INSERT INTO prep_items(project_id, kind, title, detail, status, owner_role) VALUES($1,$2,$3,$4,$5,$6)', [
      pid, k.kind, k.label,
      k.kind === 'table_change' ? `计划 ${tables} 桌 + 备桌 ${parseInt(b.reserve_tables, 10) || 1} 桌` : '',
      'pending', k.owner,
    ]);
  }
  // 付款节点
  const payments = Array.isArray(b.payments) && b.payments.length
    ? b.payments
    : [
        { kind: '定金', label: '签约定金', amount: 0, due_date: b.wedding_date },
        { kind: '尾款', label: '婚礼尾款', amount: 0, due_date: b.wedding_date },
      ];
  for (const p of payments) {
    if (!p.label && !p.kind) continue;
    await q('INSERT INTO payments(project_id, kind, label, amount, due_date) VALUES($1,$2,$3,$4,$5)', [
      pid, p.kind || '节点款', p.label || p.kind, Number(p.amount) || 0, p.due_date || b.wedding_date,
    ]);
  }
  // 初始版本（原计划）
  const snap = await projectSnapshot(pid);
  await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,1,$2,$3,$4,$5,$6,$7)',
    [pid, 'plan', '签约确认方案（原计划）', JSON.stringify(snap), b.confirmed_by || b.couple_names, '销售录入后生成的初始方案。', req.user!.id],
  );
  await logAudit(pid, req.user!, '创建宴会项目', `${b.couple_names} ${b.wedding_date} ${code}`);
  res.status(201).json({ id: pid, code });
}));

// ---------- 项目详情 ----------
router.get('/projects/:id', authRequired, ah(async (req, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const p = (await q('SELECT * FROM projects WHERE id=$1', [pid])).rows[0];
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const [hall, menu, layout, prep, payments, changes, tasks, versions, postEvent, audits, sales, planner, allergies] = await Promise.all([
    p.hall_id ? q('SELECT * FROM halls WHERE id=$1', [p.hall_id]) : { rows: [null] },
    p.menu_id ? q('SELECT * FROM menus WHERE id=$1', [p.menu_id]) : { rows: [null] },
    q('SELECT * FROM layout_items WHERE project_id=$1 ORDER BY id', [pid]),
    q('SELECT * FROM prep_items WHERE project_id=$1 ORDER BY id', [pid]),
    q('SELECT * FROM payments WHERE project_id=$1 ORDER BY id', [pid]),
    q('SELECT c.*, u.name created_by_name FROM changes c LEFT JOIN users u ON u.id=c.created_by WHERE c.project_id=$1 ORDER BY c.id DESC', [pid]),
    q('SELECT * FROM tasks WHERE project_id=$1 ORDER BY id', [pid]),
    q('SELECT id, version_no, source, label, confirmed_by, note, created_at FROM versions WHERE project_id=$1 ORDER BY version_no DESC', [pid]),
    q('SELECT * FROM post_events WHERE project_id=$1', [pid]),
    q('SELECT * FROM audit_logs WHERE project_id=$1 ORDER BY id DESC LIMIT 50', [pid]),
    p.sales_id ? q('SELECT id,name FROM users WHERE id=$1', [p.sales_id]) : { rows: [null] },
    p.planner_id ? q('SELECT id,name FROM users WHERE id=$1', [p.planner_id]) : { rows: [null] },
    q('SELECT * FROM allergy_guests WHERE project_id=$1 ORDER BY id', [pid]),
  ]);
  const settlement = computeSettlement(p, menu.rows[0], changes.rows, payments.rows, postEvent.rows[0] || null);
  res.json({
    project: p,
    hall: hall.rows[0],
    menu: menu.rows[0],
    layout: layout.rows,
    prep: prep.rows,
    payments: payments.rows,
    changes: changes.rows,
    tasks: tasks.rows,
    versions: versions.rows,
    postEvent: postEvent.rows[0] || null,
    audits: audits.rows,
    sales: sales.rows[0],
    planner: planner.rows[0],
    allergies: allergies.rows,
    settlement,
  });
}));

// ---------- 更新项目（录入信息 / 状态推进） ----------
const EDITABLE = [
  'couple_names', 'contact_phone', 'wedding_date', 'meal_session', 'hall_id', 'menu_id',
  'planned_tables', 'reserve_tables', 'ceremony_req', 'lighting_audio', 'floral_req',
  'guest_flow', 'notes', 'planner_id',
];
router.patch('/projects/:id', authRequired, ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const p = (await q('SELECT * FROM projects WHERE id=$1', [pid])).rows[0];
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const b = req.body || {};

  // 状态推进：经理/销售/管理员
  if (b.status && b.status !== p.status) {
    if (!['manager', 'sales', 'admin'].includes(req.user!.role)) {
      return res.status(403).json({ error: '仅销售/宴会经理可推进项目状态' });
    }
    if (!PROJECT_STATUS[b.status]) return res.status(400).json({ error: '非法状态' });
    await q('UPDATE projects SET status=$1, updated_at=now() WHERE id=$2', [b.status, pid]);
    await logAudit(pid, req.user!, '状态变更', `${PROJECT_STATUS[p.status]} → ${PROJECT_STATUS[b.status]}`);
  }

  const sets: string[] = [];
  const params: any[] = [];
  for (const key of EDITABLE) {
    if (b[key] !== undefined) {
      // 录入信息仅销售/经理/管理员可改
      if (!['sales', 'admin', 'manager'].includes(req.user!.role)) {
        return res.status(403).json({ error: '仅销售/宴会经理可修改项目信息' });
      }
      params.push(b[key]);
      sets.push(`${key}=$${params.length}`);
    }
  }
  if (sets.length) {
    params.push(pid);
    await q(`UPDATE projects SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
    await logAudit(pid, req.user!, '更新项目信息', sets.map((s) => s.split('=')[0]).join('、'));
  }
  res.json({ ok: true });
}));

// ---------- 布置图保存（策划/经理） ----------
router.put('/projects/:id/layout', authRequired, requireRole('planner', 'manager'), ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await q('DELETE FROM layout_items WHERE project_id=$1', [pid]);
  for (const it of items) {
    await q(
      'INSERT INTO layout_items(project_id, kind, label, x, y, w, h, seats, zone, meta) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [pid, it.kind, it.label || '', Number(it.x) || 0, Number(it.y) || 0, Number(it.w) || 0, Number(it.h) || 0,
       Number(it.seats) || 0, it.zone || '', JSON.stringify(it.meta || {})],
    );
  }
  await logAudit(pid, req.user!, '更新厅内布置图', `共 ${items.length} 个布置元素`);
  res.json({ ok: true });
}));

// ---------- 婚前筹备事项 ----------
router.patch('/prep/:id', authRequired, ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法事项 ID' });
  const item = (await q('SELECT * FROM prep_items WHERE id=$1', [id])).rows[0];
  if (!item) return res.status(404).json({ error: '事项不存在' });
  const { status, detail } = req.body || {};
  await q('UPDATE prep_items SET status=COALESCE($1,status), detail=COALESCE($2,detail), updated_by=$3, updated_at=now() WHERE id=$4', [
    status ?? null, detail ?? null, req.user!.id, id,
  ]);
  await logAudit(item.project_id, req.user!, '更新筹备事项', `${item.title}${status === 'done' ? '（完成）' : ''}`);
  res.json({ ok: true });
}));

// ---------- 发起临场变更 ----------
router.post('/projects/:id/changes', authRequired, ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const p = (await q('SELECT p.*, h.name hall_name, m.name menu_name, m.price_per_table, m.dishes FROM projects p LEFT JOIN halls h ON h.id=p.hall_id LEFT JOIN menus m ON m.id=p.menu_id WHERE p.id=$1', [pid])).rows[0];
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const { type, source, title, detail, payload } = req.body || {};
  const def = CHANGE_TYPES.find((t) => t.type === type);
  if (!def) return res.status(400).json({ error: '未知变更类型' });
  const src = SOURCE_LABELS[source] ? source : 'live';
  const changeTitle = title?.trim() || def.label;

  const impact = buildImpact(type, payload || {}, detail || '', {
    planned_tables: p.planned_tables,
    hall_name: p.hall_name || '宴会厅',
    menu_name: p.menu_name || '宴席',
    menu_price: Number(p.price_per_table || 0),
    menu_dishes: Array.isArray(p.dishes) ? p.dishes.length : 0,
  });

  const r = await q(
    `INSERT INTO changes(project_id, type, source, title, detail, payload, impacts, amount_delta, status, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'open',$9) RETURNING id`,
    [pid, type, src, changeTitle, detail || '', JSON.stringify(payload || {}), JSON.stringify(impact.summary), impact.amountDelta, req.user!.id],
  );
  const changeId = r.rows[0].id;
  for (const t of impact.tasks) {
    await q('INSERT INTO tasks(project_id, change_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
      pid, changeId, t.role, t.title, t.detail,
    ]);
  }
  // 桌数变更同步项目桌数与筹备事项
  if (impact.tableDelta !== 0) {
    await q('UPDATE projects SET planned_tables = planned_tables + $1, updated_at=now() WHERE id=$2', [impact.tableDelta, pid]);
    await q(
      `UPDATE prep_items SET detail=$1, updated_at=now() WHERE project_id=$2 AND kind='table_change'`,
      [`临场变更加桌 ${impact.tableDelta} 桌，当前 ${p.planned_tables + impact.tableDelta} 桌`, pid],
    );
  }
  await logAudit(pid, req.user!, '发起临场变更', `${changeTitle}（影响 ${impact.tasks.length} 个岗位，金额 ${impact.amountDelta >= 0 ? '+' : ''}¥${impact.amountDelta}）`);
  const created = (await q('SELECT * FROM changes WHERE id=$1', [changeId])).rows[0];
  const tasks = (await q('SELECT * FROM tasks WHERE change_id=$1 ORDER BY id', [changeId])).rows;
  res.status(201).json({ change: created, tasks, impact });
}));

// ---------- 变更状态 ----------
router.patch('/changes/:id', authRequired, ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法变更 ID' });
  const c = (await q('SELECT * FROM changes WHERE id=$1', [id])).rows[0];
  if (!c) return res.status(404).json({ error: '变更不存在' });
  const { status } = req.body || {};
  if (!['open', 'resolved', 'void'].includes(status)) return res.status(400).json({ error: '非法状态' });
  await q("UPDATE changes SET status=$1, resolved_at = CASE WHEN $1='resolved' THEN now() ELSE resolved_at END WHERE id=$2", [status, id]);
  await logAudit(c.project_id, req.user!, '变更状态更新', `${c.title} → ${status === 'resolved' ? '已解决' : status === 'void' ? '作废' : '处理中'}`);
  res.json({ ok: true });
}));

// ---------- 任务 ----------
router.get('/tasks', authRequired, ah(async (req, res) => {
  const cond: string[] = [];
  const params: any[] = [];
  if (req.query.role) {
    params.push(req.query.role);
    cond.push(`t.role=$${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    cond.push(`t.status=$${params.length}`);
  }
  if (req.query.projectId) {
    params.push(Number(req.query.projectId));
    cond.push(`t.project_id=$${params.length}`);
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await q(
    `SELECT t.*, p.couple_names, p.code project_code, p.wedding_date, c.title change_title, c.type change_type, c.source change_source
     FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN changes c ON c.id=t.change_id
     ${where} ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, t.id DESC LIMIT 300`,
    params,
  );
  res.json({ items: rows });
}));

router.patch('/tasks/:id', authRequired, ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法任务 ID' });
  const t = (await q('SELECT * FROM tasks WHERE id=$1', [id])).rows[0];
  if (!t) return res.status(404).json({ error: '任务不存在' });
  const role = req.user!.role;
  if (t.role !== role && !['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: '该任务属于其他岗位，仅本岗位或宴会经理可处理' });
  }
  const { status } = req.body || {};
  if (!['pending', 'doing', 'done'].includes(status)) return res.status(400).json({ error: '非法状态' });
  await q(
    `UPDATE tasks SET status=$1,
       assignee_id = CASE WHEN $1='pending' THEN assignee_id ELSE $2 END,
       assignee_name = CASE WHEN $1='pending' THEN assignee_name ELSE $3 END,
       done_at = CASE WHEN $1='done' THEN now() ELSE NULL END
     WHERE id=$4`,
    [status, req.user!.id, req.user!.name, id],
  );
  await logAudit(t.project_id, req.user!, '任务状态更新', `${t.title} → ${status === 'done' ? '已完成' : status === 'doing' ? '处理中' : '待处理'}`);
  // 全部任务完成 → 自动结案变更
  if (status === 'done' && t.change_id) {
    const rest = await q("SELECT COUNT(*)::int n FROM tasks WHERE change_id=$1 AND status<>'done'", [t.change_id]);
    if (rest.rows[0].n === 0) {
      await q("UPDATE changes SET status='resolved', resolved_at=now() WHERE id=$1 AND status='open'", [t.change_id]);
      await logAudit(t.project_id, req.user!, '变更自动结案', '全部岗位任务已完成');
    }
  }
  // 厨房完成过敏餐备餐任务 → 自动确认过敏餐并生成服务员桌边提醒
  if (status === 'done' && t.allergy_id && t.role === 'kitchen') {
    await confirmAllergy(t.allergy_id, req.user!);
  }
  res.json({ ok: true });
}));

// ---------- 客户确认版本 ----------
router.post('/projects/:id/versions', authRequired, requireRole('sales', 'planner', 'manager'), ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const { source, label, confirmed_by, note } = req.body || {};
  if (!SOURCE_LABELS[source]) return res.status(400).json({ error: '请选择版本来源：原计划/彩排调整/现场临时' });
  const maxV = await q('SELECT COALESCE(MAX(version_no),0)::int v FROM versions WHERE project_id=$1', [pid]);
  const snap = await projectSnapshot(pid);
  const r = await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, version_no',
    [pid, maxV.rows[0].v + 1, source, label || `${SOURCE_LABELS[source]}确认`, JSON.stringify(snap), confirmed_by || '', note || '', req.user!.id],
  );
  await logAudit(pid, req.user!, '生成客户确认版本', `V${r.rows[0].version_no}（${SOURCE_LABELS[source]}）${confirmed_by ? ' 确认人：' + confirmed_by : ''}`);
  res.status(201).json(r.rows[0]);
}));

router.get('/versions/:id', authRequired, ah(async (req, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法版本 ID' });
  const v = (await q('SELECT * FROM versions WHERE id=$1', [id])).rows[0];
  if (!v) return res.status(404).json({ error: '版本不存在' });
  res.json(v);
}));

// ---------- 付款节点 ----------
router.post('/projects/:id/payments', authRequired, requireRole('sales', 'cashier'), ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const { kind, label, amount, due_date } = req.body || {};
  if (!label || !(Number(amount) > 0)) return res.status(400).json({ error: '请填写节点名称与金额' });
  const r = await q('INSERT INTO payments(project_id, kind, label, amount, due_date) VALUES($1,$2,$3,$4,$5) RETURNING id', [
    pid, kind || '节点款', label, Number(amount), due_date || null,
  ]);
  await logAudit(pid, req.user!, '新增付款节点', `${label} ¥${Number(amount).toLocaleString('zh-CN')}`);
  res.status(201).json({ id: r.rows[0].id });
}));

router.post('/payments/:id/collect', authRequired, requireRole('cashier'), ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法付款节点 ID' });
  const p = (await q('SELECT * FROM payments WHERE id=$1', [id])).rows[0];
  if (!p) return res.status(404).json({ error: '付款节点不存在' });
  if (p.status === 'paid') return res.status(400).json({ error: '该节点已收款' });
  const method = req.body?.method || '银行转账';
  await q("UPDATE payments SET status='paid', paid_at=now(), collected_by=$1, method=$2 WHERE id=$3", [req.user!.id, method, id]);
  await logAudit(p.project_id, req.user!, '收款确认', `${p.label} ¥${Number(p.amount).toLocaleString('zh-CN')}（${method}）`);
  // 尾款到账 → 筹备事项联动
  if (p.kind === '尾款') {
    await q("UPDATE prep_items SET status='done', detail=$1, updated_at=now() WHERE project_id=$2 AND kind='final_payment'", [
      `尾款 ¥${Number(p.amount).toLocaleString('zh-CN')} 已于 ${new Date().toISOString().slice(0, 10)} 收取（${method}）`, p.project_id,
    ]);
  }
  res.json({ ok: true });
}));

// ---------- 婚后归档 ----------
router.post('/projects/:id/archive', authRequired, requireRole('manager'), ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const p = (await q('SELECT * FROM projects WHERE id=$1', [pid])).rows[0];
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const b = req.body || {};
  const additions = Array.isArray(b.onsite_additions) ? b.onsite_additions.filter((a: any) => a && (a.label || a.amount)) : [];
  const complaints = Array.isArray(b.complaints) ? b.complaints.filter((c: any) => c && c.title) : [];
  await q(
    `INSERT INTO post_events(project_id, actual_tables, alcohol_consumption, onsite_additions, complaints, discount, review_notes, archived_by, archived_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (project_id) DO UPDATE SET
       actual_tables=EXCLUDED.actual_tables, alcohol_consumption=EXCLUDED.alcohol_consumption,
       onsite_additions=EXCLUDED.onsite_additions, complaints=EXCLUDED.complaints,
       discount=EXCLUDED.discount, review_notes=EXCLUDED.review_notes, archived_by=EXCLUDED.archived_by, archived_at=now()`,
    [
      pid,
      b.actual_tables != null && b.actual_tables !== '' ? Number(b.actual_tables) : p.planned_tables,
      b.alcohol_consumption || '',
      JSON.stringify(additions),
      JSON.stringify(complaints),
      Number(b.discount) || 0,
      b.review_notes || '',
      req.user!.id,
    ],
  );
  await q("UPDATE projects SET status='archived', updated_at=now() WHERE id=$1", [pid]);
  await logAudit(pid, req.user!, '项目归档', `实际 ${b.actual_tables ?? p.planned_tables} 桌，优惠 ¥${Number(b.discount) || 0}，投诉 ${complaints.length} 条`);
  res.json({ ok: true });
}));

// ---------- 宾客过敏餐跟踪 ----------
// 名单与事件查询
router.get('/projects/:id/allergies', authRequired, ah(async (req, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const [guests, events] = await Promise.all([
    q('SELECT * FROM allergy_guests WHERE project_id=$1 ORDER BY id', [pid]),
    q('SELECT * FROM allergy_events WHERE project_id=$1 ORDER BY id DESC LIMIT 100', [pid]),
  ]);
  res.json({ guests: guests.rows, events: events.rows });
}));

// 新人提交过敏宾客名单（销售/策划/经理录入）→ 同步厨房备餐任务
router.post('/projects/:id/allergies', authRequired, requireRole('sales', 'planner', 'manager'), ah(async (req: AuthedRequest, res) => {
  const pid = numId(req.params.id);
  if (!pid) return res.status(400).json({ error: '非法项目 ID' });
  const { guest_name, table_no, allergens, substitute_dish } = req.body || {};
  if (!guest_name?.trim() || !table_no?.trim() || !allergens?.trim()) {
    return res.status(400).json({ error: '宾客姓名、桌号、禁忌食材为必填项' });
  }
  const zone = await lookupZone(pid, table_no.trim());
  const r = await q(
    `INSERT INTO allergy_guests(project_id, guest_name, table_no, allergens, substitute_dish, zone, status, created_by, created_by_name)
     VALUES($1,$2,$3,$4,$5,$6,'submitted',$7,$8) RETURNING id`,
    [pid, guest_name.trim(), table_no.trim(), allergens.trim(), (substitute_dish || '').trim(), zone, req.user!.id, req.user!.name],
  );
  const gid = r.rows[0].id;
  // 同步厨房：备餐确认任务（姓名/桌号/禁忌/替代菜品）
  const guestRow = { guest_name: guest_name.trim(), table_no: table_no.trim(), allergens: allergens.trim(), substitute_dish: (substitute_dish || '').trim(), zone };
  await q('INSERT INTO tasks(project_id, allergy_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
    pid, gid, 'kitchen', kitchenPrepTitle(guestRow), kitchenPrepDetail(guestRow),
  ]);
  await addAllergyEvent(pid, gid, 'created',
    `新人提交过敏宾客：${guest_name.trim()}（${table_no.trim()}桌），禁忌「${allergens.trim()}」，替代菜品「${(substitute_dish || '').trim() || '待定'}」，已同步厨房与服务员线`, { by: req.user! });
  await logAudit(pid, req.user!, '新增过敏宾客', `${guest_name.trim()}（${table_no.trim()}桌）禁忌 ${allergens.trim()}`);
  res.status(201).json({ id: gid, zone });
}));

// 厨房确认 → 生成服务员桌边提醒
router.post('/allergies/:id/confirm', authRequired, requireRole('kitchen'), ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法 ID' });
  const g = await confirmAllergy(id, req.user!);
  if (!g) return res.status(400).json({ error: '记录不存在或已确认' });
  await logAudit(g.project_id, req.user!, '厨房确认过敏餐', `${g.guest_name}（${g.table_no}桌），已生成服务员桌边提醒`);
  res.json({ ok: true });
}));

// 编辑 / 临场换桌：过敏餐提示随宾客移动，同步桌卡、厨房出餐、服务员分区
router.patch('/allergies/:id', authRequired, requireRole('sales', 'planner', 'manager'), ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法 ID' });
  const g = (await q('SELECT * FROM allergy_guests WHERE id=$1', [id])).rows[0];
  if (!g) return res.status(404).json({ error: '过敏宾客记录不存在' });
  const b = req.body || {};
  const newTable = (b.table_no ?? g.table_no).trim();
  const moving = newTable !== g.table_no;
  const newZone = moving ? await lookupZone(g.project_id, newTable) : g.zone;

  await q(
    `UPDATE allergy_guests SET guest_name=$1, table_no=$2, allergens=$3, substitute_dish=$4, zone=$5, updated_at=now() WHERE id=$6`,
    [
      (b.guest_name ?? g.guest_name).trim(), newTable,
      (b.allergens ?? g.allergens).trim(), (b.substitute_dish ?? g.substitute_dish).trim(),
      newZone, id,
    ],
  );

  if (moving) {
    // 1) 常驻提醒整体重写为当前桌号+当前分区；既往换桌/桌卡/出餐待办由本次新任务取代
    await syncAllergyTasks({ ...g, table_no: newTable, zone: newZone });
    // 2) 同步桌卡（经理）与厨房出餐（含旧桌号作废指引）
    await q('INSERT INTO tasks(project_id, allergy_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
      g.project_id, id, 'manager',
      `桌卡更新：${g.guest_name} ${g.table_no}→${newTable}`,
      `宾客 ${g.guest_name} 由 ${g.table_no} 桌换至 ${newTable} 桌：更新桌卡与席位引导，同步服务员${newZone ? ' ' + newZone + ' 区' : ''}分区提醒，过敏餐提示随宾客移动。`,
    ]);
    await q('INSERT INTO tasks(project_id, allergy_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
      g.project_id, id, 'kitchen',
      `出餐桌号变更：${g.guest_name} ${g.table_no}→${newTable}`,
      `过敏宾客 ${g.guest_name} 换桌至 ${newTable}：无${g.allergens}餐（替代「${g.substitute_dish}」）出餐口按新桌号出餐，旧桌号作废。`,
    ]);
    // 3) 服务员收到换桌提醒（只含当前桌号与当前分区，移动轨迹见事件记录）
    await q('INSERT INTO tasks(project_id, allergy_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
      g.project_id, id, 'waiter',
      `换桌提醒：${g.guest_name} 已换至 ${newTable} 桌${newZone ? '（' + newZone + '区）' : ''}`,
      `过敏宾客 ${g.guest_name} 现位于 ${newTable} 桌${newZone ? '（' + newZone + '区）' : ''}：禁忌「${g.allergens}」，替代菜品「${g.substitute_dish}」。请按当前桌号与分区桌边核对，过敏餐提示随宾客移动。`,
    ]);
    await addAllergyEvent(g.project_id, id, 'moved',
      `临场换桌：${g.guest_name} 由 ${g.table_no} 桌移至 ${newTable} 桌，过敏餐提示随宾客移动，已同步桌卡、厨房出餐与服务员分区`,
      { from: g.table_no, to: newTable, by: req.user! });
    await logAudit(g.project_id, req.user!, '过敏宾客换桌', `${g.guest_name} ${g.table_no}→${newTable}`);
  } else {
    await addAllergyEvent(g.project_id, id, 'created', `过敏餐信息更新：禁忌「${(b.allergens ?? g.allergens).trim()}」，替代菜品「${(b.substitute_dish ?? g.substitute_dish).trim()}」`, { by: req.user! });
    await logAudit(g.project_id, req.user!, '更新过敏餐信息', `${g.guest_name}（${newTable}桌）`);
  }
  res.json({ ok: true, zone: newZone, moved: moving });
}));

// 上错菜事故：进入宴会经理处理与客户沟通记录
router.post('/allergies/:id/wrong-dish', authRequired, ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法 ID' });
  const g = (await q('SELECT * FROM allergy_guests WHERE id=$1', [id])).rows[0];
  if (!g) return res.status(404).json({ error: '过敏宾客记录不存在' });
  const detail = (req.body?.detail || '').trim() || `疑似向 ${g.guest_name}（${g.table_no}桌）上了含「${g.allergens}」的菜品`;
  await q("UPDATE allergy_guests SET status='issue', updated_at=now() WHERE id=$1", [id]);
  await q('INSERT INTO tasks(project_id, allergy_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
    g.project_id, id, 'manager',
    `过敏餐事故处理：${g.table_no}桌 ${g.guest_name}`,
    `${detail}。请宴会经理立即核实、安排替换菜品，并与新人/宾客沟通登记处理结果。`,
  ]);
  await addAllergyEvent(g.project_id, id, 'wrong_dish', detail, { by: req.user! });
  await logAudit(g.project_id, req.user!, '过敏餐事故上报', `${g.guest_name}（${g.table_no}桌）：${detail}`);
  res.status(201).json({ ok: true });
}));

// 宴会经理登记客户沟通处理结果
router.post('/allergies/:id/resolve', authRequired, requireRole('manager'), ah(async (req: AuthedRequest, res) => {
  const id = numId(req.params.id);
  if (!id) return res.status(400).json({ error: '非法 ID' });
  const g = (await q('SELECT * FROM allergy_guests WHERE id=$1', [id])).rows[0];
  if (!g) return res.status(404).json({ error: '过敏宾客记录不存在' });
  const note = (req.body?.client_note || '').trim();
  if (!note) return res.status(400).json({ error: '请填写客户沟通记录' });
  // 沟通记录写入最近一条事故事件
  await q(
    `UPDATE allergy_events SET client_note=$1 WHERE id = (
       SELECT id FROM allergy_events WHERE allergy_id=$2 AND kind='wrong_dish' ORDER BY id DESC LIMIT 1
     )`,
    [note, id],
  );
  await addAllergyEvent(g.project_id, id, 'resolved', `客户沟通处理完成：${note}`, { clientNote: note, by: req.user! });
  await q("UPDATE allergy_guests SET status='confirmed', updated_at=now() WHERE id=$1", [id]);
  await q("UPDATE tasks SET status='done', done_at=now() WHERE allergy_id=$1 AND role='manager' AND status<>'done' AND title LIKE '%事故%'", [id]);
  await logAudit(g.project_id, req.user!, '过敏餐事故处理完成', `${g.guest_name}：${note}`);
  res.json({ ok: true });
}));
