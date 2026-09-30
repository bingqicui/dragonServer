import { authService } from '../../services/auth.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

export const authHandlers: Record<number, Handler> = {
  // 2 只认账号，返回账号 token + 区列表；进游戏还需 cmd=14 选区
  [CMD.TOKEN_REQ]: async (payload) => {
    const loginType = Number(payload.loginType);
    if (loginType === 0) {
      return authService.login(payload.username, payload.password);
    }
    return authService.loginByThirdParty(loginType, payload);
  },
  // 3 原 LOGIN_INFO_REQ 已合并到 cmd=4 ROLE_INFO_REQ，不再单独存在
};
