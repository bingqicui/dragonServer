import { Role } from '../../services/role/role';
import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

// cmd 10003/10012/10013/100001/1001
export const userHandlers: Record<number, Handler> = {
  // 10003 角色档案。读 playerInfo，不因此再推一条 10002
  [CMD.ROLE_INFO_REQ]: async (_payload, ctx) => {
    const role = Role.load(await userService.resolveRole(ctx));
    return role.archive(ctx.clientIp);
  },

  // 10012 保存临时档。只改 items / weapons
  [CMD.SAVE_INFO]: async (payload, ctx) => {
    const role = Role.load(await userService.resolveRole(ctx));
    return userService.saveClientInfo(role, payload?.info);
  },

  // 10013 读取临时档
  [CMD.GET_SAVE_INFO]: async (_payload, ctx) => {
    const role = Role.load(await userService.resolveRole(ctx));
    return { info: role.clientInfo() };
  },

  // 100001 红点全量
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
