import { weaponService } from '../../services/weapon.service';
import { CMD } from '../cmd';
import { Handler, requireAuth } from './types';

// cmd 10010/8/9/16/17：背包、武器解锁、升级、穿戴、卸下
export const weaponHandlers: Record<number, Handler> = {
  // 10010 背包 / 武器状态全量拉取
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

  // 16 武器穿戴
  [CMD.WEAPON_EQUIP]: async (payload, ctx) => {
    requireAuth(ctx);
    return weaponService.equip(ctx.userId!, payload.id);
  },

  // 17 武器卸下
  [CMD.WEAPON_UNEQUIP]: async (payload, ctx) => {
    requireAuth(ctx);
    return weaponService.unequip(ctx.userId!, payload.id);
  },
};
