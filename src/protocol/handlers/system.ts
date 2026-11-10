import { settleHeart } from '../../services/energy.service';
import { regionFromPayload } from '../../services/gameDay';
import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Handler } from './types';

// 系统级 cmd。登录态在 dispatch 里统一校验
export const systemHandlers: Record<number, Handler> = {
  // 10000 心跳。time 为毫秒。同包始终附带 20001，体力数量变了才附带 10011
  // 登录后前端仍可能拿账号 token 发心跳，按账号和区服定位角色，与 10013 相同
  // 跨日清零补充次数时，收尾再附 10002，前端才会把本地次数清掉
  [CMD.HEART_REQ]: async (payload, ctx) => {
    return userService.withRole(ctx, async (role) => {
      const nowMs = Date.now();
      const { pushes, dirty } = settleHeart(role, Math.floor(nowMs / 1000), regionFromPayload(payload));
      if (dirty) await role.save();
      return { data: { time: nowMs }, pushes };
    });
  },
};
