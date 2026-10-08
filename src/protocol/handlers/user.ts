import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

// cmd 10003/100001/1001：角色信息、红点、引导进度存档
export const userHandlers: Record<number, Handler> = {
  // 10003 角色信息（登录后一次拉全，含 serverTime）
  [CMD.ROLE_INFO_REQ]: async (_payload, ctx) => {
    requireAuth(ctx);
    const profile = await userService.getProfile(ctx.userId!);
    return { ...profile, serverTime: Math.floor(Date.now() / 1000) };
  },

  // 100001 红点全量
  [CMD.RED_INFO_ON_LOGIN]: async (_payload, ctx) => {
    requireAuth(ctx);
    return { redPoints: [] };
  },

  // 15 原样保存 userData（含 items/weapons），服务器不校验升级公式
  [CMD.USER_DATA_SET]: async (payload, ctx) => {
    requireAuth(ctx);
    return userService.saveUserData(ctx.userId!, payload);
  },

  // 1001 新手引导进度上报（存 userData）
  [CMD.ROLE_GUIDE_RECORD]: async (payload, ctx) => {
    requireAuth(ctx);
    return userService.saveUserData(ctx.userId!, payload);
  },
};
