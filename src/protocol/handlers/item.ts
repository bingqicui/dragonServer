import { applyItemDeltas, PersistError, settleQuiet } from '../../services/energy.service';
import { Role } from '../../services/role/role';
import { userService } from '../../services/user.service';
import { CMD } from '../cmd';
import { Ctx, Handler } from './types';

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function loadRole(ctx: Ctx): Promise<Role> {
  return Role.load(await userService.resolveRole(ctx));
}

async function changeItem(payload: any, ctx: Parameters<Handler>[1], sign: 1 | -1) {
  const role = await loadRole(ctx);
  try {
    const pushes = applyItemDeltas(role, payload?.items, sign, nowSec());
    await role.save();
    return { data: {}, pushes };
  } catch (e) {
    if (e instanceof PersistError) await role.save();
    throw e;
  }
}

// 10010 服务端道具。10014 / 10015 测试增减
export const itemHandlers: Record<number, Handler> = {
  [CMD.BAG]: async (_payload, ctx) => {
    const role = await loadRole(ctx);
    const { pushes, dirty } = settleQuiet(role, nowSec());
    if (dirty) await role.save();
    const data = { items: role.visibleItems() };
    return pushes.length ? { data, pushes } : data;
  },

  [CMD.TEST_REWARD_ADD]: async (payload, ctx) => changeItem(payload, ctx, 1),

  [CMD.TEST_REWARD_DEC]: async (payload, ctx) => changeItem(payload, ctx, -1),
};
