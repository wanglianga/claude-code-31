import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const SECRET = process.env.TOKEN_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 小时

// ---- 密码哈希（scrypt，无外部依赖）----
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const calc = scryptSync(password, salt, 32);
  const expect = Buffer.from(hash, 'hex');
  return calc.length === expect.length && timingSafeEqual(calc, expect);
}

// ---- 轻量签名令牌（HMAC-SHA256）----
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload: object): string {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): any | null {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  const expect = createHmac('sha256', SECRET).update(body).digest('base64url');
  if (expect !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- Express 中间件 ----
export interface AuthedRequest extends Request {
  user?: { id: number; username: string; name: string; role: string };
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: '未登录或登录已过期' });
  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: '当前岗位无权执行此操作' });
    }
    next();
  };
}
