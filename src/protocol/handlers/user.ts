import { settleQuiet } from '../../services/energy.service';
import { regionFromPayload } from '../../services/gameDay';
import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// cmd 10003/10012/10013/100001/1001
export const userHandlers: Record<number, Handler> = {
  // 10003 角色档案。先结算自然恢复和游戏日，回包里带 energy_supply
  [CMD.ROLE_INFO_REQ]: async (payload, ctx) => {
    return userService.withRole(ctx, async (role) => {
      const { pushes, dirty } = settleQuiet(role, nowSec(), regionFromPayload(payload));
      if (dirty) await role.save();
      const data = role.archive(ctx.clientIp);
      return pushes.length ? { data, pushes } : data;
    });
  },

  // 10012 保存临时档。只改 items / weapons
  [CMD.SAVE_INFO]: async (payload, ctx) => {
    return userService.withRole(ctx, (role) => userService.saveClientInfo(role, payload?.info));
  },

  // 10013 读取临时档
  [CMD.GET_SAVE_INFO]: async (_payload, ctx) => {
    return userService.withRole(ctx, async (role) => ({ info: role.clientInfo() }));
  },

  // 100001 红点全量
  [CMD.RED_INFO_ON_LOGIN]: async (_payload, ctx) => {
    requireAuth(ctx);
    return { redPoints: [] };
  },

  // 1001 新手引导进度上报（存 userData）
  [CMD.ROLE_GUIDE_RECORD]: async (payload, ctx) => {
    requireAuth(ctx);
    return userService.withRole(ctx, () => userService.saveUserData(ctx.userId!, payload));
  },
};
