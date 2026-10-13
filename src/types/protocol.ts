import { TokenKind } from './auth';
import { PushItem } from './gateway';

/** handler 执行上下文（信封 + 身份 + 客户端信息） */
export interface Ctx {
  kind?: TokenKind;
  accountId?: string;
  username?: string;
  /** 角色 id。来自请求 uid 或游戏 token，不是平台 puid */
  userId?: string;
  /** 平台账号 */
  puid?: string;
  serverId?: number | string;
  /** 客户端 IP：收尾附 10002 时写入 localIp */
  clientIp?: string;
}

export type Handler = (payload: any, ctx: Ctx) => Promise<any> | any;

/** handler 可选返回形态：显式附带的推送（不带时返回值本身即业务数据） */
export interface HandlerEnvelope {
  data?: any;
  pushes?: PushItem[];
}
