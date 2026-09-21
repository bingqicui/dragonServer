import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { BusinessError } from '../utils/errors';

// 扩展 Request，附带解析出的用户身份
export interface AuthRequest extends Request {
  kind?: 'account' | 'game';
  accountId?: string;
  userId?: string;
  username?: string;
  zoneId?: number;
}

// JWT 校验中间件：从 Authorization: Bearer <token> 解析身份，失败则抛业务错误。
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new BusinessError('未登录', 401);
    const payload = authService.verifyToken(token);
    req.kind = payload.kind;
    req.accountId = payload.accountId;
    req.userId = payload.userId;
    req.username = payload.username;
    req.zoneId = payload.zoneId;
    next();
  } catch (e) {
    next(e);
  }
}
