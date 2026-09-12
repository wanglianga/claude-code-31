// 演示种子数据：岗位账号、宴会厅、菜单套餐、三个处于不同阶段的婚礼项目
import { hashPassword } from './auth';
import { q, logAudit } from './db';
import { buildImpact } from './impacts';
import { PREP_KINDS } from './types';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export async function seedIfEmpty(): Promise<void> {
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  console.log('[seed] 初始化演示数据...');

  // ---- 岗位账号（密码均为 123456）----
  const pwd = hashPassword('123456');
  const users: [string, string, string][] = [
    ['admin', '系统管理员', 'admin'],
    ['sales01', '王敏', 'sales'],
    ['sales02', '刘洋', 'sales'],
    ['planner01', '李婉', 'planner'],
    ['manager01', '张强', 'manager'],
    ['kitchen01', '陈国栋', 'kitchen'],
    ['cashier01', '赵燕', 'cashier'],
  ];
  const uid: Record<string, number> = {};
  for (const [username, name, role] of users) {
    const r = await q(
      'INSERT INTO users(username, password_hash, name, role) VALUES($1,$2,$3,$4) RETURNING id',
      [username, pwd, name, role],
    );
    uid[username] = r.rows[0].id;
  }

  // ---- 宴会厅 ----
  const halls = [
    ['牡丹厅', 28, 18, 36, '9.6m×4.8m 固定舞台，LED 主屏', '东侧、南侧各一条疏散通道', '层高 6m，无柱，独立迎宾序厅'],
    ['百合厅', 20, 14, 22, '7.2m×3.6m 拼装舞台', '北侧一条疏散通道', '层高 4.5m，适合中小型婚宴'],
    ['皇冠厅', 32, 22, 48, '12m×6m 固定舞台，双层 LED', '东、西、南三条疏散通道', '层高 8m，可吊装灯光架'],
  ];
  const hid: number[] = [];
  for (const h of halls) {
    const r = await q(
      'INSERT INTO halls(name, length_m, width_m, max_tables, stage_desc, fire_exits, features) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      h,
    );
    hid.push(r.rows[0].id);
  }

  // ---- 菜单套餐 ----
  const menus = [
    [
      '百年好合宴',
      3299,
      ['冷盘六小碟', '白灼基围虾', '清蒸石斑鱼', '鸿运烧鹅', '鲍汁扣辽参', '蒜蓉粉丝蒸扇贝', '黑椒牛仔骨', '上汤时蔬', '美点双辉', '时令水果盘'],
    ],
    [
      '花好月圆宴',
      4299,
      ['迎宾八小碟', '芝士焗龙虾', '清蒸东星斑', '脆皮乳猪拼盘', '鲍鱼扣鹅掌', '葱烧海参', 'XO 酱爆花枝', '瑶柱扒时蔬', '燕窝炖雪梨', '美点双辉', '时令水果盘'],
    ],
    [
      '龙凤呈祥宴',
      5999,
      ['至尊十小碟', '蒜蓉蒸澳洲龙虾', '清蒸老鼠斑', '烤乳猪全体', '佛跳墙', '蚝皇扣鲍鱼', '花胶炖鸡汤', '黑松露炒和牛', '蟹肉扒时蔬', '官燕莲子羹', '美点双辉', '时令水果盘'],
    ],
  ];
  const mid: number[] = [];
  for (const [name, price, dishes] of menus) {
    const r = await q('INSERT INTO menus(name, price_per_table, dishes) VALUES($1,$2,$3) RETURNING id', [
      name as string,
      price as number,
      JSON.stringify(dishes),
    ]);
    mid.push(r.rows[0].id);
  }

  // ================= 项目一：今天举行，婚礼进行中 =================
  const p1 = await q(
    `INSERT INTO projects(code, couple_names, contact_phone, wedding_date, meal_session, hall_id, menu_id,
       planned_tables, reserve_tables, ceremony_req, lighting_audio, floral_req, guest_flow, status, sales_id, planner_id, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [
      'WD-' + day(0).replaceAll('-', '') + '-01',
      '张先生 & 李女士',
      '13800001111',
      day(0),
      '晚宴',
      hid[0],
      mid[1],
      22,
      2,
      '户外证婚亭移至厅内舞台中央，交换戒指环节需要干冰效果，敬茶改在迎宾区进行。',
      '面光 8 组、追光 2 组、染色灯 12 台；无线麦克风 4 支，仪式音乐由策划提供歌单。',
      '主桌桌花 1 组、迎宾区花艺拱门 1 座、通道花柱 8 个，白粉色系，外部花艺团队进场布置。',
      '宾客由南门序厅签到 → 合影区 → 厅内入席；老人与儿童优先引导至靠近通道席位。',
      'live',
      uid['sales01'],
      uid['planner01'],
      '新人对海鲜过敏宾客 2 位（T8 桌），需单独备餐。',
    ],
  );
  const p1id = p1.rows[0].id;

  // 布置图（牡丹厅 28×18）
  const layout1: any[] = [
    { kind: 'stage', label: '主舞台', x: 9.2, y: 0.5, w: 9.6, h: 4.8 },
    { kind: 'main_table', label: '主桌', x: 13.1, y: 6.6, seats: 12, zone: 'A' },
    { kind: 'welcome', label: '迎宾区', x: 11.5, y: 14.8, w: 5, h: 2.4 },
    { kind: 'kids', label: '儿童桌', x: 24.4, y: 12.8, seats: 8, zone: 'C' },
    { kind: 'elderly', label: '老人席', x: 2.2, y: 12.6, seats: 10, zone: 'B' },
    { kind: 'camera', label: '机位1', x: 1.2, y: 6.0 },
    { kind: 'camera', label: '机位2', x: 26.2, y: 6.0 },
    { kind: 'entrance', label: '宾客入口', x: 12.6, y: 17.2, w: 3, h: 0.6 },
    { kind: 'fire_exit', label: '消防通道', x: 27.2, y: 8.0, w: 0.6, h: 3 },
  ];
  // 圆桌两列排布
  const zones = ['A', 'B', 'C'];
  for (let i = 0; i < 12; i++) {
    layout1.push({
      kind: 'table',
      label: `T${i + 1}`,
      x: 4.5 + (i % 4) * 6.2,
      y: 7.2 + Math.floor(i / 4) * 3.4,
      seats: 10,
      zone: zones[i % 3],
    });
  }
  for (const it of layout1) {
    await q(
      'INSERT INTO layout_items(project_id, kind, label, x, y, w, h, seats, zone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p1id, it.kind, it.label || '', it.x, it.y, it.w || 0, it.h || 0, it.seats || 0, it.zone || ''],
    );
  }

  // 婚前筹备事项
  const prepDone: Record<string, string> = {
    tasting: '试吃 8 人份：乳猪拼盘偏咸已调整，龙虾改蒜蓉蒸；新人确认通过。',
    table_change: '由 20 桌调整为 22 桌（男方亲戚增加 2 桌），已确认。',
    alcohol: '新人自带白酒 12 瓶、红酒 24 瓶已寄存库房，编号 JZ-2201。',
    rehearsal: day(-1) + ' 18:00 彩排，新人及伴郎伴娘到场，灯光音响联排。',
    vendor: '外部花艺团队 ' + day(0) + ' 13:00 从后场通道进场，对接人：李婉。',
    fire_lane: '东侧、南侧疏散通道已清空，检查人：张强。',
  };
  for (const k of PREP_KINDS) {
    const done = k.kind !== 'final_payment';
    await q(
      'INSERT INTO prep_items(project_id, kind, title, detail, status, owner_role) VALUES($1,$2,$3,$4,$5,$6)',
      [p1id, k.kind, k.label, done ? prepDone[k.kind] || '已完成' : '婚礼结束后收取尾款', done ? 'done' : 'pending', k.owner],
    );
  }

  // 付款节点
  const pay1 = [
    ['定金', '签约定金', 20000, day(-30), 'paid'],
    ['中期款', '婚前中期款', 50000, day(-7), 'paid'],
    ['尾款', '婚礼尾款', 30000, day(0), 'unpaid'],
  ];
  for (const [kind, label, amount, due, status] of pay1) {
    await q(
      'INSERT INTO payments(project_id, kind, label, amount, due_date, status, paid_at, collected_by, method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p1id, kind, label, amount, due, status, status === 'paid' ? new Date() : null, status === 'paid' ? uid['cashier01'] : null, status === 'paid' ? '银行转账' : ''],
    );
  }

  // 版本快照 v1 原计划 / v2 彩排调整
  const snap1 = await projectSnapshot(p1id);
  await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,1,$2,$3,$4,$5,$6,$7)',
    [p1id, 'plan', '签约确认方案（原计划）', JSON.stringify({ ...snap1, planned_tables: 20 }), '张先生', '签约时确认：20 桌，菜单花好月圆宴。', uid['sales01']],
  );
  await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,2,$2,$3,$4,$5,$6,$7)',
    [p1id, 'rehearsal', '彩排后调整方案', JSON.stringify(snap1), '李女士', '彩排后确认：桌数调整为 22 桌，敬茶环节移至迎宾区。', uid['planner01']],
  );

  // 临场变更示例：仪式延迟（已生成跨岗位任务）
  const menu1 = { planned_tables: 22, hall_name: '牡丹厅', menu_name: '花好月圆宴', menu_price: 4299, menu_dishes: 11 };
  const ch1 = buildImpact('ceremony_delay', { minutes: 20 }, '接亲路上堵车，仪式预计延迟 20 分钟。', menu1);
  const c1 = await q(
    `INSERT INTO changes(project_id, type, source, title, detail, payload, impacts, amount_delta, status, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [p1id, 'ceremony_delay', 'live', '仪式延迟 20 分钟', '接亲路上堵车，仪式预计延迟 20 分钟。', JSON.stringify({ minutes: 20 }), JSON.stringify(ch1.summary), 0, 'open', uid['manager01']],
  );
  for (const t of ch1.tasks) {
    await q('INSERT INTO tasks(project_id, change_id, role, title, detail) VALUES($1,$2,$3,$4,$5)', [
      p1id, c1.rows[0].id, t.role, t.title, t.detail,
    ]);
  }
  await logAudit(p1id, { id: uid['manager01'], name: '张强' }, '发起临场变更', '仪式延迟 20 分钟');

  // ================= 项目二：8 天后，筹备中 =================
  const p2 = await q(
    `INSERT INTO projects(code, couple_names, contact_phone, wedding_date, meal_session, hall_id, menu_id,
       planned_tables, reserve_tables, ceremony_req, lighting_audio, floral_req, guest_flow, status, sales_id, planner_id, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [
      'WD-' + day(8).replaceAll('-', '') + '-01',
      '王先生 & 赵小姐',
      '13900002222',
      day(8),
      '午宴',
      hid[2],
      mid[2],
      36,
      3,
      '中式出阁礼，需要跨火盆道具与龙凤背景板。',
      '吊装灯光架，面光 12 组，LED 双层屏播放成长视频。',
      '红金色系，主桌桌花 2 组，T 台两侧花带。',
      '宾客由东门序厅签到入席，婚车停靠东广场。',
      'preparing',
      uid['sales02'],
      uid['planner01'],
      '',
    ],
  );
  const p2id = p2.rows[0].id;
  for (const k of PREP_KINDS) {
    const done = ['tasting', 'table_change'].includes(k.kind);
    await q('INSERT INTO prep_items(project_id, kind, title, detail, status, owner_role) VALUES($1,$2,$3,$4,$5,$6)', [
      p2id, k.kind, k.label,
      done ? (k.kind === 'tasting' ? '试吃完成，佛跳墙份量加大。' : '36 桌 + 3 备桌已确认。') : '',
      done ? 'done' : 'pending', k.owner,
    ]);
  }
  const pay2 = [
    ['定金', '签约定金', 30000, day(-20), 'paid'],
    ['中期款', '婚前中期款', 80000, day(-2), 'paid'],
    ['尾款', '婚礼尾款', 100000, day(8), 'unpaid'],
  ];
  for (const [kind, label, amount, due, status] of pay2) {
    await q(
      'INSERT INTO payments(project_id, kind, label, amount, due_date, status, paid_at, collected_by, method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p2id, kind, label, amount, due, status, status === 'paid' ? new Date() : null, status === 'paid' ? uid['cashier01'] : null, status === 'paid' ? 'POS 刷卡' : ''],
    );
  }
  const snap2 = await projectSnapshot(p2id);
  await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,1,$2,$3,$4,$5,$6,$7)',
    [p2id, 'plan', '签约确认方案（原计划）', JSON.stringify(snap2), '王先生', '签约确认 36 桌龙凤呈祥宴。', uid['sales02']],
  );

  // ================= 项目三：13 天前已归档（含投诉与优惠） =================
  const p3 = await q(
    `INSERT INTO projects(code, couple_names, contact_phone, wedding_date, meal_session, hall_id, menu_id,
       planned_tables, reserve_tables, ceremony_req, lighting_audio, floral_req, guest_flow, status, sales_id, planner_id, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [
      'WD-' + day(-13).replaceAll('-', '') + '-01',
      '陈先生 & 林小姐',
      '13700003333',
      day(-13),
      '晚宴',
      hid[1],
      mid[0],
      18,
      2,
      '西式证婚，需要花瓣雨。',
      '面光 6 组，追光 1 组。',
      '香槟色系，迎宾区小型花艺。',
      '宾客由北门签到入席。',
      'archived',
      uid['sales01'],
      uid['planner01'],
      '',
    ],
  );
  const p3id = p3.rows[0].id;
  const pay3 = [
    ['定金', '签约定金', 15000, day(-45), 'paid'],
    ['中期款', '婚前中期款', 25000, day(-20), 'paid'],
    ['尾款', '婚礼尾款', 26172, day(-13), 'paid'],
  ];
  for (const [kind, label, amount, due, status] of pay3) {
    await q(
      'INSERT INTO payments(project_id, kind, label, amount, due_date, status, paid_at, collected_by, method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p3id, kind, label, amount, due, status, new Date(), uid['cashier01'], '银行转账'],
    );
  }
  // 临场加桌变更（已解决）
  const menu3 = { planned_tables: 18, hall_name: '百合厅', menu_name: '百年好合宴', menu_price: 3299, menu_dishes: 10 };
  const ch3 = buildImpact('add_tables', { tables: 2 }, '男方临时来 2 桌同事，现场加桌。', menu3);
  const c3 = await q(
    `INSERT INTO changes(project_id, type, source, title, detail, payload, impacts, amount_delta, status, created_by, resolved_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING id`,
    [p3id, 'add_tables', 'live', '临场加桌 2 桌', '男方临时来 2 桌同事，现场加桌。', JSON.stringify({ tables: 2 }), JSON.stringify(ch3.summary), ch3.amountDelta, 'resolved', uid['manager01']],
  );
  for (const t of ch3.tasks) {
    await q('INSERT INTO tasks(project_id, change_id, role, title, detail, status, done_at) VALUES($1,$2,$3,$4,$5,$6, now())', [
      p3id, c3.rows[0].id, t.role, t.title, t.detail, 'done',
    ]);
  }
  const snap3 = await projectSnapshot(p3id);
  await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,1,$2,$3,$4,$5,$6,$7)',
    [p3id, 'plan', '签约确认方案（原计划）', JSON.stringify({ ...snap3, planned_tables: 18 }), '陈先生', '签约确认 18 桌。', uid['sales01']],
  );
  await q(
    'INSERT INTO versions(project_id, version_no, source, label, snapshot, confirmed_by, note, created_by) VALUES($1,2,$2,$3,$4,$5,$6,$7)',
    [p3id, 'live', '现场临时加桌确认', JSON.stringify({ ...snap3, planned_tables: 20 }), '陈先生', '现场临时加 2 桌，新人现场确认。', uid['manager01']],
  );
  await q(
    `INSERT INTO post_events(project_id, actual_tables, alcohol_consumption, onsite_additions, complaints, discount, review_notes, archived_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      p3id,
      20,
      '自带白酒消耗 9 瓶、红酒 18 瓶；店内加开红酒 4 瓶（¥1,192）。',
      JSON.stringify([{ label: '店内红酒 4 瓶', amount: 1192 }]),
      JSON.stringify([
        {
          title: '上菜速度慢',
          detail: '临场加桌导致热菜上桌延迟约 15 分钟，宾客投诉。',
          related_source: 'live',
          resolution: '核实为现场临时加桌所致（见版本 V2 现场临时），非原计划疏漏；赠送果盘并优惠 ¥1,000 达成和解。',
          status: '已解决',
        },
      ]),
      1000,
      '复盘：临场加桌时应同步通知厨房加备 10% 机动食材；建议后续加桌变更默认携带厨房备料任务。',
      uid['manager01'],
    ],
  );
  await q('UPDATE projects SET planned_tables = 20 WHERE id = $1', [p3id]);
  await logAudit(p3id, { id: uid['manager01'], name: '张强' }, '项目归档', '婚礼完成，尾款已收，档案归集。');

  console.log('[seed] 完成：7 个账号 / 3 个厅 / 3 套菜单 / 3 个演示项目');
}

// 生成项目当前状态快照（供版本保存）
export async function projectSnapshot(projectId: number) {
  const p = (await q('SELECT * FROM projects WHERE id=$1', [projectId])).rows[0];
  const hall = p?.hall_id ? (await q('SELECT * FROM halls WHERE id=$1', [p.hall_id])).rows[0] : null;
  const menu = p?.menu_id ? (await q('SELECT * FROM menus WHERE id=$1', [p.menu_id])).rows[0] : null;
  const layout = (await q('SELECT kind,label,x,y,w,h,seats,zone FROM layout_items WHERE project_id=$1 ORDER BY id', [projectId])).rows;
  const prep = (await q('SELECT kind,title,detail,status FROM prep_items WHERE project_id=$1 ORDER BY id', [projectId])).rows;
  const payments = (await q('SELECT kind,label,amount,due_date,status FROM payments WHERE project_id=$1 ORDER BY id', [projectId])).rows;
  const changes = (await q('SELECT type,source,title,status,amount_delta FROM changes WHERE project_id=$1 ORDER BY id', [projectId])).rows;
  return {
    project: {
      code: p.code,
      couple_names: p.couple_names,
      wedding_date: p.wedding_date,
      meal_session: p.meal_session,
      hall: hall?.name,
      menu: menu?.name,
      price_per_table: Number(menu?.price_per_table || 0),
      planned_tables: p.planned_tables,
      reserve_tables: p.reserve_tables,
      ceremony_req: p.ceremony_req,
      lighting_audio: p.lighting_audio,
      floral_req: p.floral_req,
      guest_flow: p.guest_flow,
      status: p.status,
    },
    layout,
    prep,
    payments,
    changes,
  };
}
