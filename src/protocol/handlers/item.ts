import { applyItemDeltas, PersistError, settleQuiet, supplyByAd, supplyByDiamond } from '../../services/energy.service';
import { regionFromPayload } from '../../services/gameDay';
import { Role } from '../../services/role/role';
import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Ctx, Handler } from './types';

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function changeItem(payload: any, ctx: Ctx, sign: 1 | -1) {
  return userService.withRole(ctx, async (role) => {
    try {
      const pushes = applyItemDeltas(role, payload?.items, sign, nowSec());
      await role.save();
      return { data: {}, pushes };
    } catch (e) {
      if (e instanceof PersistError) await role.save();
      throw e;
    }
  });
}

async function supply(ctx: Ctx, run: (role: Role, now: number) => { data: object; pushes: object[] }) {
  return userService.withRole(ctx, async (role) => {
    try {
      const result = run(role, nowSec());
      await role.save();
      return result;
    } catch (e) {
      if (e instanceof PersistError) await role.save();
      throw e;
    }
  });
}

// 10010 服务端道具。10014 / 10015 测试增减。10016 广告补充，10017 钻石补充
export const itemHandlers: Record<number, Handler> = {
  [CMD.BAG]: async (payload, ctx) => {
    return userService.withRole(ctx, async (role) => {
      const { pushes, dirty } = settleQuiet(role, nowSec(), regionFromPayload(payload));
      if (dirty) await role.save();
      const data = { items: role.visibleItems() };
      return pushes.length ? { data, pushes } : data;
    });
  },

  [CMD.TEST_REWARD_ADD]: async (payload, ctx) => changeItem(payload, ctx, 1),

  [CMD.TEST_REWARD_DEC]: async (payload, ctx) => changeItem(payload, ctx, -1),

  [CMD.ENERGY_AD]: async (payload, ctx) => {
    const region = regionFromPayload(payload);
    return supply(ctx, (role, now) => supplyByAd(role, now, region));
  },

  [CMD.ENERGY_BUY]: async (payload, ctx) => {
    const region = regionFromPayload(payload);
    return supply(ctx, (role, now) => supplyByDiamond(role, now, region));
  },
};
