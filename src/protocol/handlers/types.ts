import { BusinessError } from '../../utils/errors';
import { Ctx, Handler } from '../../types/protocol';

export type { Ctx, Handler };

/** 游戏内 cmd：必须已选区（游戏 token） */
export function requireAuth(ctx: Ctx) {
  if (ctx.kind !== 'game' || !ctx.userId) throw new BusinessError('未登录或未选区', 401);
}

/** 选区 cmd：账号 token 或已选区的游戏 token 均可（靠 accountId） */
export function requireAccount(ctx: Ctx) {
  if (!ctx.accountId) throw new BusinessError('未登录', 401);
}
