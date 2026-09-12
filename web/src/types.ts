// 前端共享类型
export interface User { id: number; username: string; name: string; role: string }
export interface Hall {
  id: number; name: string; length_m: number; width_m: number; max_tables: number;
  stage_desc: string; fire_exits: string; features: string;
}
export interface Menu { id: number; name: string; price_per_table: number; dishes: string[] }
export interface Project {
  id: number; code: string; couple_names: string; contact_phone: string;
  wedding_date: string; meal_session: string; hall_id: number; menu_id: number;
  planned_tables: number; reserve_tables: number;
  ceremony_req: string; lighting_audio: string; floral_req: string; guest_flow: string;
  status: string; sales_id: number; planner_id: number; notes: string;
  hall_name?: string; menu_name?: string; price_per_table?: number;
  sales_name?: string; open_changes?: number; open_tasks?: number;
}
export interface LayoutItem {
  id?: number; kind: string; label: string; x: number; y: number;
  w: number; h: number; seats: number; zone: string; meta?: any;
}
export interface PrepItem {
  id: number; kind: string; title: string; detail: string; status: string;
  owner_role: string; updated_at?: string;
}
export interface Payment {
  id: number; kind: string; label: string; amount: number; due_date: string;
  status: string; paid_at?: string; method?: string;
}
export interface Change {
  id: number; type: string; source: string; title: string; detail: string;
  payload: any; impacts: string[]; amount_delta: number; status: string;
  created_by_name?: string; created_at: string;
}
export interface Task {
  id: number; change_id?: number; role: string; title: string; detail: string;
  status: string; assignee_name?: string; created_at: string;
  couple_names?: string; project_code?: string; wedding_date?: string;
  change_title?: string; change_type?: string; change_source?: string; project_id?: number;
}
export interface VersionMeta {
  id: number; version_no: number; source: string; label: string;
  confirmed_by: string; note: string; created_at: string;
}
export interface SettlementLine { label: string; amount: number }
export interface Settlement {
  billableTables: number; pricePerTable: number; baseAmount: number;
  changeDelta: number; additionsAmount: number; discount: number;
  total: number; paid: number; balance: number; lines: SettlementLine[];
}
export interface AllergyGuest {
  id: number; project_id: number; guest_name: string; table_no: string;
  allergens: string; substitute_dish: string; zone: string; status: string;
  created_by_name?: string; created_at: string; updated_at?: string;
}
export interface AllergyEvent {
  id: number; allergy_id: number; kind: string; detail: string;
  from_table: string; to_table: string; client_note: string;
  created_by_name: string; created_at: string;
}
export interface ProjectDetail {
  project: Project; hall: Hall; menu: Menu; layout: LayoutItem[];
  prep: PrepItem[]; payments: Payment[]; changes: Change[]; tasks: Task[];
  versions: VersionMeta[]; postEvent: any; audits: any[];
  sales: { id: number; name: string } | null; planner: { id: number; name: string } | null;
  allergies: AllergyGuest[];
  settlement: Settlement;
}
export interface ChangeTypeDef {
  type: string; label: string; roles: string[];
  fields: { key: string; label: string; kind: 'number' | 'text'; placeholder?: string }[];
}
export interface Meta {
  halls: Hall[]; menus: Menu[]; users: User[];
  changeTypes: ChangeTypeDef[];
  prepKinds: { kind: string; label: string; owner: string }[];
  roleLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  sourceLabels: Record<string, string>;
}
