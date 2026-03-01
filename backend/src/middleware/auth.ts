import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  id: number;
  name: string;
  role: 'admin' | 'manager';
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Parse JWT_EXPIRES_IN to seconds
 * Supports: '8h', '1d', '30m', '3600' (seconds)
 */
function parseExpiresIn(value: string): number {
  const match = value.match(/^(\d+)([hdms]?)$/);
  if (!match) return 28800; // Default 8 hours

  const num = parseInt(match[1], 10);
  const unit = match[2] || 's';

  switch (unit) {
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    case 'm': return num * 60;
    case 's':
    default: return num;
  }
}

/**
 * Generate a JWT token for authenticated users
 */
export function generateToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: parseExpiresIn(env.JWT_EXPIRES_IN),
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Middleware to require authentication
 * Checks for Bearer token in Authorization header
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticacao nao fornecido' });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer '
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Token invalido ou expirado' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acesso negado. Requer permissao de administrador' });
    return;
  }

  next();
}

/**
 * Middleware to require manager or admin role
 */
export function requireManager(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }

  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    res.status(403).json({ error: 'Acesso negado. Requer permissao de gestor' });
    return;
  }

  next();
}

/**
 * Combined middleware: requireAuth + requireAdmin
 */
export const authAdmin = [requireAuth, requireAdmin];

/**
 * Combined middleware: requireAuth + requireManager
 */
export const authManager = [requireAuth, requireManager];
