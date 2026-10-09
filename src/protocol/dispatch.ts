import express, { Request, Response } from 'express';
import { decodeRequest } from '../utils/crypto';
import { BusinessError, SYS_ERROR } from '../utils/errors';
import { buildResponse, GATEWAY_SIGN_KEY } from '../utils/gateway';
import { authService } from '../services/auth.service';
import { handlers } from './handlers';
import { Ctx } from './handlers/types';

// 统一错误分类：业务错→负数 code、error=0；系统错→code=0、error 取语义码（见 errors.ts SYS_ERROR）。
type OutEnvelope = { code: number; error: number; msg: string };
function classifyError(e: unknown): OutEnvelope {
  const msg = e instanceof BusinessError ? e.message : '服务器内部错误';
  const raw = e instanceof BusinessError ? e.code : 500;
  switch (raw) {
    case 401:  return { code: 0, error: SYS_ERROR.UNAUTH,   msg }; // 未登录/无效 token
    case 4004: return { code: 0, error: SYS_ERROR.PROTOCOL, msg }; // 协议不存在
    case 4001: return { code: 0, error: SYS_ERROR.TAMPER,   msg }; // 签名校验失败/篡改
    case 4000:
    case 400:  return { code: 0, error: SYS_ERROR.PARAM,    msg }; // 请求/参数非法
    case 500:  return { code: 0, error: SYS_ERROR.INTERNAL, msg }; // 服务器内部错误
    default:   return { code: -Math.abs(raw), error: 0, msg };      // 业务错取负
  }
}

const router = express.Router();

// 前端以 application/json 发送网关请求 { action, data, sign, retry }
router.post(
  '/',
  express.json(),
  async (req: Request, res: Response) => {
    // 即使签名失败也要回显 action，便于前端匹配错误回调（_finishGateway 按 action===_msgId 路由）
    const reqAction = typeof (req.body as any)?.action === 'number' ? (req.body as any).action : 0;
    try {
      const decoded = decodeRequest(req.body, GATEWAY_SIGN_KEY);

      const handler = handlers[decoded.cmd];
      if (!handler) throw new BusinessError('未知协议号 cmd: ' + decoded.cmd, 4004);

      // 鉴权：若带 token 则验签取身份（登录类 cmd 无 token，交给 requireAuth 判定）
      const ctx: Ctx = {};
      // 信封层字段透传给 handler：puid / server_id 随每请求必带，登录创角要用
      ctx.puid = decoded.uid;
      ctx.serverId = decoded.serverId;
      if (decoded.token) {
        try {
          const p = authService.verifyToken(decoded.token);
          ctx.kind = p.kind;
          ctx.accountId = p.accountId || undefined;
          ctx.username = p.username;
          if (p.kind === 'game') {
            ctx.userId = p.userId;
          }
        } catch {
          // token 无效：置空，由 requireAuth 在需要登录的 cmd 抛 401
        }
      }

      const payloadData = await handler(decoded.payload, ctx);
      res.json(
        buildResponse({ code: 0, action: decoded.cmd, data: payloadData ?? {}, error: 0 })
      );
    } catch (e: any) {
      const env = classifyError(e);
      // 关键：永远 HTTP 200，错误只进 code/error，否则前端会把逻辑错误当网络故障反复重试
      res.status(200).json(
        buildResponse({
          code: env.code,
          action: reqAction,
          data: env.msg ? { message: env.msg } : null,
          error: env.error,
        })
      );
    }
  }
);

export default router;
