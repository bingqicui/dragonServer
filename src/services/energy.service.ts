import { CMD } from '../protocol/cmd';
import { PushItem } from '../types/gateway';
import { DEFINE } from '../constants/define';
import { Role } from './role/role';
import { BusinessError } from '../utils/errors';

/** 结算已经改过角色，调用方即使随后拒绝请求也要保存 */
export class PersistError extends BusinessError {
  constructor(message: string) {
    super(message);
  }
}

interface SettleHit {
  granted: number;
  dirty: boolean;
}

/** 按当前时间补自然恢复。数量没变但第一次建周期时 dirty 为 true */
function takeNatural(role: Role, nowSec: number): SettleHit {
  const itemId = DEFINE.ENERGY_ITEM_ID;
  const cap = DEFINE.ENERGY_CAP;
  const intervalSec = DEFINE.ENERGY_INTERVAL_SEC;
  const recoverAmount = DEFINE.ENERGY_RECOVER_AMOUNT;
  const prevNum = role.itemNum(itemId);
  const prevAt = role.energyAt;
  if (cap <= 0 || intervalSec <= 0 || recoverAmount <= 0) {
    return { granted: 0, dirty: false };
  }

  if (prevNum >= cap) {
    if (prevAt != null) role.setEnergyAt(null);
    return { granted: 0, dirty: prevAt != null };
  }

  if (prevAt == null) {
    role.setEnergyAt(nowSec);
    return { granted: 0, dirty: true };
  }

  const elapsed = nowSec - prevAt;
  if (elapsed < intervalSec) return { granted: 0, dirty: false };

  const ticks = Math.floor(elapsed / intervalSec);
  const granted = Math.min(ticks * recoverAmount, cap - prevNum);
  const nextNum = prevNum + granted;
  role.setItemNum(itemId, nextNum);
  if (nextNum >= cap) {
    role.setEnergyAt(null);
  } else {
    role.setEnergyAt(nowSec - (elapsed % intervalSec));
  }
  return { granted, dirty: true };
}

function energySnapshot(role: Role): Record<string, number | null> {
  const num = role.itemNum(DEFINE.ENERGY_ITEM_ID);
  const anchor = num < DEFINE.ENERGY_CAP ? role.energyAt : null;
  if (anchor == null) {
    return {
      energy_num: num,
      energy_next_at: 0,
      energy_full_at: 0,
      energy: null,
      energy_cap: DEFINE.ENERGY_CAP,
      energy_recover_amount: DEFINE.ENERGY_RECOVER_AMOUNT,
    };
  }
  const ticks = Math.ceil((DEFINE.ENERGY_CAP - num) / DEFINE.ENERGY_RECOVER_AMOUNT);
  return {
    energy_num: num,
    energy_next_at: anchor + DEFINE.ENERGY_INTERVAL_SEC,
    energy_full_at: anchor + ticks * DEFINE.ENERGY_INTERVAL_SEC,
    energy: anchor,
    energy_cap: DEFINE.ENERGY_CAP,
    energy_recover_amount: DEFINE.ENERGY_RECOVER_AMOUNT,
  };
}

function energyPush(role: Role): PushItem {
  return { action: CMD.ENERGY_PUSH, data: energySnapshot(role) };
}

function naturalFlow(role: Role, nowSec: number, granted: number): PushItem {
  const itemId = DEFINE.ENERGY_ITEM_ID;
  return {
    action: CMD.RES_FLOW_PUSH,
    data: {
      reward: { items: [{ id: itemId, num: granted }] },
      cost: [],
      remain: [{ id: itemId, num: role.itemNum(itemId) }],
      source: 'natural_recovery',
      time: nowSec,
      show_type: 2,
    },
  };
}

function gainedFlow(pushes: PushItem[], role: Role, nowSec: number, hit: SettleHit): void {
  if (hit.granted <= 0) return;
  pushes.push(naturalFlow(role, nowSec, hit.granted));
  pushes.push(energyPush(role));
}

/** 登录、查背包：点数真的增加了才推送。建周期会落库，但不推送 */
export function settleQuiet(role: Role, nowSec: number): { pushes: PushItem[]; dirty: boolean } {
  const hit = takeNatural(role, nowSec);
  const pushes: PushItem[] = [];
  gainedFlow(pushes, role, nowSec, hit);
  return { pushes, dirty: hit.dirty };
}

/** 心跳：每次都带最终体力快照。点数变了才带 10011 */
export function settleHeart(role: Role, nowSec: number): { pushes: PushItem[]; dirty: boolean } {
  const hit = takeNatural(role, nowSec);
  const pushes: PushItem[] = [];
  if (hit.granted > 0) pushes.push(naturalFlow(role, nowSec, hit.granted));
  pushes.push(energyPush(role));
  return { pushes, dirty: hit.dirty };
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * 先结算自然恢复，再加或扣一种道具。
 * 体力仍低于上限时保留当前周期；跨过上限则停止；从上限以上扣回上限以下则重开周期。
 * 数量不够时抛 PersistError，此时自然恢复已经写在角色上。
 */
export function applyItemDelta(role: Role, rawId: unknown, rawNum: unknown, sign: 1 | -1, nowSec: number): PushItem[] {
  const id = positiveInt(rawId);
  const amount = positiveInt(rawNum);
  if (id == null || amount == null) throw new BusinessError('参数非法', 400);

  const hit = takeNatural(role, nowSec);
  const pushes: PushItem[] = [];
  gainedFlow(pushes, role, nowSec, hit);

  const before = role.itemNum(id);
  const next = before + sign * amount;
  if (next < 0) {
    if (hit.dirty) throw new PersistError('道具不足');
    throw new BusinessError('道具不足');
  }

  role.setItemNum(id, next);
  if (id === DEFINE.ENERGY_ITEM_ID) {
    if (next >= DEFINE.ENERGY_CAP) role.setEnergyAt(null);
    else if (before >= DEFINE.ENERGY_CAP) role.setEnergyAt(nowSec);
  }

  const row = { id, num: amount };
  pushes.push({
    action: CMD.RES_FLOW_PUSH,
    data: {
      reward: { items: sign > 0 ? [row] : [] },
      cost: sign < 0 ? [row] : [],
      remain: [{ id, num: next }],
      time: nowSec,
      show_type: sign > 0 ? 1 : 0,
    },
  });
  if (id === DEFINE.ENERGY_ITEM_ID) pushes.push(energyPush(role));
  return pushes;
}
