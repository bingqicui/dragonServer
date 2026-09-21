import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

// cmd 4/6/1001：角色信息、红点、引导进度存档
export const userHandlers: Record<number, Handler> = {
  // 4 角色信息
  [CMD.ROLE_INFO_REQ]: async (_payload, ctx) => {
    requireAuth(ctx);
    return userService.getProfile(ctx.userId!);
  },

  // 6 红点全量
  [CMD.RED_INFO_ON_LOGIN]: async (_payload, ctx) => {
    requireAuth(ctx);
    return { redPoints: [] };
  },

  // 1001 新手引导进度上报（存 userData）
  [CMD.ROLE_GUIDE_RECORD]: async (payload, ctx) => {
    requireAuth(ctx);
    return userService.saveUserData(ctx.userId!, payload);
  },
};
