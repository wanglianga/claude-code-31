import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://wedding:wedding123@localhost:5432/wedding';

export const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

export async function q(text: string, params: any[] = []) {
  return pool.query(text, params);
}

// 等待数据库就绪（compose 中 db 健康检查后仍有短暂窗口）
export async function waitForDb(retries = 30): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('数据库连接失败：超过重试次数');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS halls (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  length_m NUMERIC NOT NULL,
  width_m NUMERIC NOT NULL,
  max_tables INT NOT NULL,
  stage_desc TEXT DEFAULT '',
  fire_exits TEXT DEFAULT '',
  features TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price_per_table NUMERIC NOT NULL,
  dishes JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  couple_names TEXT NOT NULL,
  contact_phone TEXT DEFAULT '',
  wedding_date DATE NOT NULL,
  meal_session TEXT NOT NULL DEFAULT '晚宴',
  hall_id INT REFERENCES halls(id),
  menu_id INT REFERENCES menus(id),
  planned_tables INT NOT NULL DEFAULT 10,
  reserve_tables INT NOT NULL DEFAULT 1,
  ceremony_req TEXT DEFAULT '',
  lighting_audio TEXT DEFAULT '',
  floral_req TEXT DEFAULT '',
  guest_flow TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed',
  sales_id INT REFERENCES users(id),
  planner_id INT REFERENCES users(id),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS layout_items (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT DEFAULT '',
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  w NUMERIC DEFAULT 0,
  h NUMERIC DEFAULT 0,
  seats INT DEFAULT 0,
  zone TEXT DEFAULT '',
  meta JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS prep_items (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  owner_role TEXT DEFAULT '',
  updated_by INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid',
  paid_at TIMESTAMPTZ,
  collected_by INT,
  method TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS changes (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'live',
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  payload JSONB DEFAULT '{}',
  impacts JSONB DEFAULT '[]',
  amount_delta NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  change_id INT REFERENCES changes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  assignee_id INT,
  assignee_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  done_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS versions (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  source TEXT NOT NULL DEFAULT 'plan',
  label TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  confirmed_by TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_by INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_events (
  project_id INT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  actual_tables INT,
  alcohol_consumption TEXT DEFAULT '',
  onsite_additions JSONB DEFAULT '[]',
  complaints JSONB DEFAULT '[]',
  discount NUMERIC DEFAULT 0,
  review_notes TEXT DEFAULT '',
  archived_by INT,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allergy_guests (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  table_no TEXT NOT NULL,
  allergens TEXT NOT NULL DEFAULT '',
  substitute_dish TEXT NOT NULL DEFAULT '',
  zone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted',
  created_by INT,
  created_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allergy_events (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  allergy_id INT REFERENCES allergy_guests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail TEXT DEFAULT '',
  from_table TEXT DEFAULT '',
  to_table TEXT DEFAULT '',
  client_note TEXT DEFAULT '',
  created_by INT,
  created_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  project_id INT,
  user_id INT,
  user_name TEXT DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_date ON projects(wedding_date);
CREATE INDEX IF NOT EXISTS idx_tasks_role ON tasks(role, status);
CREATE INDEX IF NOT EXISTS idx_changes_project ON changes(project_id);
CREATE INDEX IF NOT EXISTS idx_allergy_project ON allergy_guests(project_id);

-- 兼容已有数据卷的增量迁移（幂等）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS allergy_id INT;
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}

export async function logAudit(
  projectId: number | null,
  user: { id: number; name: string } | null,
  action: string,
  detail = '',
) {
  await q(
    'INSERT INTO audit_logs(project_id, user_id, user_name, action, detail) VALUES($1,$2,$3,$4,$5)',
    [projectId, user?.id ?? null, user?.name ?? '系统', action, detail],
  );
}
