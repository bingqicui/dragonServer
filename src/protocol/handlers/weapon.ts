import { weaponService } from '../../services/weapon.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

// cmd 7/8/9：背包、武器解锁、武器升级
export const weaponHandlers: Record<number, Handler> = {
  // 7 背包全量（武器系统）
  [CMD.BAG]: async (_payload, ctx) => {
    requireAuth(ctx);
    return weaponService.getWeapons(ctx.userId!);
  },

  // 8 武器解锁
  [CMD.WEAPON_UNLOCK]: async (payload, ctx) => {
    requireAuth(ctx);
    return weaponService.unlock(ctx.userId!, payload.weaponId);
  },

  // 9 武器升级（逐级）
  [CMD.WEAPON_UPGRADE]: async (payload, ctx) => {
    requireAuth(ctx);
    return weaponService.upgrade(ctx.userId!, payload.weaponId, Number(payload.targetLevel));
  },
};
