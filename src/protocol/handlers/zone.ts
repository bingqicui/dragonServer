import { authService } from '../../services/auth.service';
import { zoneService } from '../../services/zone.service';
import { BusinessError } from '../../utils/errors';
import { CMD } from '../cmd';
import { Handler, requireAccount } from './types';

export const zoneHandlers: Record<number, Handler> = {
  [CMD.ZONE_LIST]: async (_payload, ctx) => {
    requireAccount(ctx);
    return { zones: await zoneService.listForAccount(ctx.accountId!) };
  },

  [CMD.ZONE_ENTER]: async (payload, ctx) => {
    requireAccount(ctx);
    const zoneId = Number(payload.zoneId);
    if (!Number.isFinite(zoneId)) throw new BusinessError('缺少 zoneId', 400);
    const role = await zoneService.enter(ctx.accountId!, zoneId);
    return authService.signGameToken(role);
  },
};
