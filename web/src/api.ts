// 轻量 fetch 封装：自动带 token，统一错误提示
import { toast } from './toast';

const TOKEN_KEY = 'wb_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(t: string) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* 空响应 */ }
  if (!res.ok) {
    const msg = data?.error || `请求失败（${res.status}）`;
    if (res.status === 401 && !path.startsWith('/auth/')) {
      setToken('');
      if (location.pathname !== '/login') location.href = '/login';
    }
    throw new Error(msg);
  }
  return data as T;
}

// 提交包装：自动 toast 错误
export async function submit<T = any>(path: string, body: any, method = 'POST'): Promise<T | null> {
  try {
    return await api<T>(path, { method, body });
  } catch (e: any) {
    toast(e.message || '操作失败', 'err');
    return null;
  }
}
