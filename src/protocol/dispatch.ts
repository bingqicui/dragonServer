import express, { Request, Response } from 'express';
import { decodeRequest } from '../utils/crypto';
import { BusinessError, SYS_ERROR } from '../utils/errors';
import { buildResponse, GATEWAY_SIGN_KEY } from '../utils/gateway';
import { RequestStore, runWithStore } from '../utils/requestContext';
import { authService } from '../services/auth.service';
import { handlers } from './handlers';
import { Ctx } from './handlers/types';
import { CMD } from './cmd';
import { finalizeResponse, withArchivePush } from './response';

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
    const store: RequestStore = {};
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    try {
      const decoded = decodeRequest(req.body, GATEWAY_SIGN_KEY);

      const handler = handlers[decoded.cmd];
      if (!handler) throw new BusinessError('未知协议号 cmd: ' + decoded.cmd, 4004);

      // 除登录外都必须是当前会话。失效 token 回 401，前端按 -10015 踢下线
      const isLogin = decoded.cmd === CMD.LOGIN;
      if (!isLogin && !decoded.token) throw new BusinessError('未登录', 401);

      const ctx: Ctx = { clientIp };
      ctx.puid = decoded.puid;
      ctx.userId = decoded.userId;
      ctx.serverId = decoded.serverId;
      if (decoded.token) {
        try {
          const p = await authService.verifyToken(decoded.token);
          ctx.kind = p.kind;
          ctx.accountId = p.accountId || undefined;
          ctx.username = p.username;
          if (p.kind === 'game' && !ctx.userId) {
            ctx.userId = p.userId;
          }
        } catch (e) {
          if (!isLogin) throw e;
        }
      }

      const payloadData = await runWithStore(store, () => handler(decoded.payload, ctx));
      res.json(await finalizeResponse({ cmd: decoded.cmd, result: payloadData, ctx, store }));
    } catch (e: any) {
      const env = classifyError(e);
      // 关键：永远 HTTP 200，错误只进 code/error，否则前端会把逻辑错误当网络故障反复重试
      const errEnv = buildResponse({
        code: env.code,
        action: reqAction,
        data: env.msg ? { message: env.msg } : null,
        error: env.error,
      });
      // 系统错误整包中断，前端不会写入推送
      if (env.error !== 0) {
        res.status(200).json(errEnv);
        return;
      }
      res.status(200).json(await withArchivePush(errEnv, store.playerInfoRoleId, clientIp));
    }
  }
);

export default router;
