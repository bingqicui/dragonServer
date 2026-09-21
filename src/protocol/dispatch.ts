import express, { Request, Response } from 'express';
import { decodeRequest } from '../utils/crypto';
import { BusinessError } from '../utils/errors';
import { authService } from '../services/auth.service';
import { handlers } from './handlers';
import { Ctx } from './handlers/types';

// 签名密钥：与前端 getRequestSecret() 返回值一致（确认值 "9572"）。
// 生产建议显式写入 .env 的 REQUEST_SECRET，未配置时回退默认值。
const REQUEST_SECRET = process.env.REQUEST_SECRET || '9572';

const router = express.Router();

// 前端以 application/x-www-form-urlencoded 发送裸 JSON / 加密串，
// 需按文本读取再手动解析（express.json 不会解析该 content-type）。
router.post(
  '/',
  express.text({ type: 'application/x-www-form-urlencoded' }),
  async (req: Request, res: Response) => {
    const t = Math.floor(Date.now() / 1000);
    try {
      const raw = typeof req.body === 'string' ? req.body : '';
      const decoded = decodeRequest(raw, REQUEST_SECRET);

      const handler = handlers[decoded.cmd];
      if (!handler) throw new BusinessError('未知协议号 cmd: ' + decoded.cmd, 4004);

      // 鉴权：若带 token 则验签取身份（登录类 cmd 无 token，交给 requireAuth 判定）
      const ctx: Ctx = {};
      if (decoded.token) {
        try {
          const p = authService.verifyToken(decoded.token);
          ctx.kind = p.kind;
          ctx.accountId = p.accountId || undefined;
          ctx.username = p.username;
          if (p.kind === 'game') {
            ctx.userId = p.userId;
            ctx.zoneId = p.zoneId;
          }
        } catch {
          // token 无效：置空，由 requireAuth 在需要登录的 cmd 抛 401
        }
      }

      const payloadData = await handler(decoded.payload, ctx);
      res.json({ ErrorCode: 0, Payload: payloadData ?? {}, t });
    } catch (e: any) {
      const code = e instanceof BusinessError ? e.code : 500;
      const msg = e instanceof BusinessError ? e.message : '服务器内部错误';
      // 关键：永远 HTTP 200，错误只进 ErrorCode，否则前端会把逻辑错误当网络故障反复重试
      res.status(200).json({ ErrorCode: code, Payload: null, Msg: msg, t });
    }
  }
);

export default router;
