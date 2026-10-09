import { authService, AccountAuthResult } from '../../services/auth.service';
import { userRepo } from '../../repositories/user.repo';
import { zoneService } from '../../services/zone.service';
import { DEFAULT_ZONE_ID } from '../../types/player';
import { BusinessError } from '../../utils/errors';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

export const authHandlers: Record<number, Handler> = {
  // 10001：登录（建/取账号）+ 无角色自动创角（按信封 server_id 落区）
  // 返回账号 token + 区列表 + 已建/已存在的角色 + gameToken，前端可据此跳过 cmd=14
  [CMD.LOGIN]: async (payload, ctx) => {
    const loginType = Number(payload.loginType);

    const hasCreds =
      typeof payload.username === 'string' && !!payload.username &&
      typeof payload.password === 'string' && !!payload.password;

    let accountRes: AccountAuthResult;
    if (ctx.accountId) {
      // 已带合法账号/游戏 token：直接复用该账号，跳过再次登录（常见：登录后再次进游戏拿角色/gameToken）
      const username = ctx.username ?? '';
      accountRes = {
        token: authService.signAccountToken(ctx.accountId, username),
        accountId: ctx.accountId,
        username,
        zones: await zoneService.listForAccount(ctx.accountId),
      };
    } else if (loginType === 0 && hasCreds) {
      // 账号密码登录
      accountRes = await authService.login(payload.username, payload.password);
    } else if (ctx.puid) {
      // SDK / 平台自动登录：信封 puid(openId) 找/建账号，无需账号密码（puid 为 0/空时跳过）
      accountRes = await authService.autoLogin(ctx.puid);
    } else if (loginType !== 0) {
      accountRes = await authService.loginByThirdParty(loginType, payload);
    } else {
      throw new BusinessError('缺少登录凭据（账号 token、用户名密码或 puid）', 4000);
    }

    // server_id 随信封每请求必带（ctx.serverId）；缺省回落到默认区，保证必创角
    const raw = Number(ctx.serverId ?? payload.server_id ?? payload.zoneId);
    const zoneId = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ZONE_ID;

    const role = await userRepo.createInZone(accountRes.accountId, accountRes.username, zoneId);
    const gameToken = authService.signGameToken(role).token;

    return { ...accountRes, role, gameToken };
  },
  // 原 LOGIN_INFO_REQ 已合并到 cmd=10003 ROLE_INFO_REQ，不再单独存在
};
