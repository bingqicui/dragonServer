import { ITEM_ID } from '../constants/item';
import { CMD } from '../protocol/cmd';
import { PushItem } from '../types/gateway';
import { BusinessError } from '../utils/errors';
import { Role } from './role/role';
import { SYSTEM_ID, systemService } from './system.service';

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

/** 体力道具 id 在道具表，恢复上限、间隔、每次恢复量在参数表 */
function energyRule() {
  return {
    itemId: ITEM_ID.ENERGY,
    cap: systemService.getNumber(SYSTEM_ID.RECOVER_CAP),
    intervalSec: systemService.getNumber(SYSTEM_ID.RECOVER_INTERVAL),
    recoverAmount: systemService.getNumber(SYSTEM_ID.RECOVER_AMOUNT),
  };
}

/** 按当前时间补自然恢复。数量没变但第一次建周期时 dirty 为 true */
function takeNatural(role: Role, nowSec: number): SettleHit {
  const { itemId, cap, intervalSec, recoverAmount } = energyRule();
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
  const { itemId, cap, intervalSec, recoverAmount } = energyRule();
  const num = role.itemNum(itemId);
  const anchor = num < cap ? role.energyAt : null;
  if (anchor == null) {
    return {
      energy_num: num,
      energy_next_at: 0,
      energy_full_at: 0,
      energy: null,
      energy_cap: cap,
      energy_recover_amount: recoverAmount,
    };
  }
  const ticks = Math.ceil((cap - num) / recoverAmount);
  return {
    energy_num: num,
    energy_next_at: anchor + intervalSec,
    energy_full_at: anchor + ticks * intervalSec,
    energy: anchor,
    energy_cap: cap,
    energy_recover_amount: recoverAmount,
  };
}

function energyPush(role: Role): PushItem {
  return { action: CMD.ENERGY_PUSH, data: energySnapshot(role) };
}

function naturalFlow(role: Role, nowSec: number, granted: number): PushItem {
  const { itemId } = energyRule();
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

/** 合并同 id。空数组、非正整数、加总溢出都当参数非法 */
function mergeItems(raw: unknown): { id: number; num: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BusinessError('参数非法', 400);
  const order: number[] = [];
  const sums = new Map<number, number>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') throw new BusinessError('参数非法', 400);
    const id = positiveInt((row as { id?: unknown }).id);
    const num = positiveInt((row as { num?: unknown }).num);
    if (id == null || num == null) throw new BusinessError('参数非法', 400);
    const prev = sums.get(id) ?? 0;
    const next = prev + num;
    if (!Number.isSafeInteger(next)) throw new BusinessError('参数非法', 400);
    if (!sums.has(id)) order.push(id);
    sums.set(id, next);
  }
  return order.map((id) => ({ id, num: sums.get(id)! }));
}

/**
 * 先校验整包，再结算一次自然恢复，然后统一加或扣。
 * 体力仍低于上限时保留当前周期；跨过上限则停止；从上限以上扣回上限以下则重开周期。
 * 扣减按合并后的数量检查，不够则整单失败。此时若自然恢复已写入，抛 PersistError。
 */
export function applyItemDeltas(role: Role, rawItems: unknown, sign: 1 | -1, nowSec: number): PushItem[] {
  const rows = mergeItems(rawItems);

  const hit = takeNatural(role, nowSec);
  const pushes: PushItem[] = [];
  gainedFlow(pushes, role, nowSec, hit);

  if (sign < 0) {
    for (const row of rows) {
      if (role.itemNum(row.id) < row.num) {
        if (hit.dirty) throw new PersistError('道具不足');
        throw new BusinessError('道具不足');
      }
    }
  }

  let energyTouched = false;
  const remain: { id: number; num: number }[] = [];
  const { itemId, cap } = energyRule();
  for (const row of rows) {
    const before = role.itemNum(row.id);
    const next = before + sign * row.num;
    role.setItemNum(row.id, next);
    if (row.id === itemId) {
      energyTouched = true;
      if (next >= cap) role.setEnergyAt(null);
      else if (before >= cap) role.setEnergyAt(nowSec);
    }
    remain.push({ id: row.id, num: next });
  }

  pushes.push({
    action: CMD.RES_FLOW_PUSH,
    data: {
      reward: { items: sign > 0 ? rows : [] },
      cost: sign < 0 ? rows : [],
      remain,
      time: nowSec,
      show_type: sign > 0 ? 1 : 0,
    },
  });
  if (energyTouched) pushes.push(energyPush(role));
  return pushes;
}
