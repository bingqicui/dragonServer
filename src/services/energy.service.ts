import { ITEM_ID } from '../constants/item';
import { CMD } from '../protocol/cmd';
import { EnergySupplyInfo, toEnergySupplyInfo } from '../types/player';
import { PushItem } from '../types/gateway';
import { BusinessError } from '../utils/errors';
import { markArchivePush } from '../utils/requestContext';
import { GameRegion, DEFAULT_GAME_REGION, gameDate } from './gameDay';
import { Role } from './role/role';
import { SYSTEM_ID, systemService } from './system.service';

/** 结算已经改过角色，调用方即使随后拒绝请求也要保存 */
export class PersistError extends BusinessError {
  constructor(message: string, code = 1, pushes: PushItem[] = []) {
    super(message, code, pushes);
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

/** 跨日把广告、钻石次数清零。体力、钻石和恢复周期不动。日期变了才记脏，并让回包附 10002 */
export function rollSupplyDay(role: Role, nowSec: number, region: GameRegion = DEFAULT_GAME_REGION): boolean {
  const date = gameDate(nowSec, region);
  const cur = role.energySupply;
  if (cur && cur.date === date) return false;
  role.setEnergySupply({ date, videoCount: 0, buyCount: 0 });
  markArchivePush(role.id);
  return true;
}

/** 登录、查背包：点数真的增加了才推送。建周期或跨日会落库，但不因此推体力 */
export function settleQuiet(
  role: Role,
  nowSec: number,
  region: GameRegion = DEFAULT_GAME_REGION
): { pushes: PushItem[]; dirty: boolean } {
  const hit = takeNatural(role, nowSec);
  const dayChanged = rollSupplyDay(role, nowSec, region);
  const pushes: PushItem[] = [];
  gainedFlow(pushes, role, nowSec, hit);
  return { pushes, dirty: hit.dirty || dayChanged };
}

/** 心跳：每次都带最终体力快照。点数变了才带 10011 */
export function settleHeart(
  role: Role,
  nowSec: number,
  region: GameRegion = DEFAULT_GAME_REGION
): { pushes: PushItem[]; dirty: boolean } {
  const hit = takeNatural(role, nowSec);
  const dayChanged = rollSupplyDay(role, nowSec, region);
  const pushes: PushItem[] = [];
  if (hit.granted > 0) pushes.push(naturalFlow(role, nowSec, hit.granted));
  pushes.push(energyPush(role));
  return { pushes, dirty: hit.dirty || dayChanged };
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

const SUPPLY_ERR = {
  AD_LIMIT: 4116,
  BUY_LIMIT: 4117,
  DIAMOND: 4118,
} as const;

/** 发奖后低于上限则保留原周期；原来没有周期时，结算阶段已经从现在起了一个完整间隔 */
function grantEnergy(role: Role, amount: number, nowSec: number): void {
  const { itemId, cap } = energyRule();
  const before = role.itemNum(itemId);
  const next = before + amount;
  role.setItemNum(itemId, next);
  if (next >= cap) role.setEnergyAt(null);
  else if (before >= cap) role.setEnergyAt(nowSec);
}

function supplyData(role: Role): EnergySupplyInfo {
  return toEnergySupplyInfo(role.energySupply!);
}

function refuseSupply(
  role: Role,
  nowSec: number,
  hit: SettleHit,
  dayChanged: boolean,
  message: string,
  code: number
): never {
  const pushes: PushItem[] = [];
  if (hit.granted > 0) pushes.push(naturalFlow(role, nowSec, hit.granted));
  if (hit.dirty) pushes.push(energyPush(role));
  if (hit.dirty || dayChanged) throw new PersistError(message, code, pushes);
  throw new BusinessError(message, code);
}

/** 玩家主动获得的道具。show_type 为 1 时前端才拿 reward.items 弹获得框；0 和 2 只改背包 */
function rewardFlow(role: Role, nowSec: number, items: { id: number; num: number }[]): PushItem {
  return {
    action: CMD.RES_FLOW_PUSH,
    data: {
      reward: { items },
      cost: [],
      remain: items.map((row) => ({ id: row.id, num: role.itemNum(row.id) })),
      time: nowSec,
      show_type: 1,
    },
  };
}

function finishSupply(
  role: Role,
  nowSec: number,
  hit: SettleHit,
  energyGranted: number,
  diamondRemain: { id: number; num: number } | null
): { data: EnergySupplyInfo; pushes: PushItem[] } {
  const pushes: PushItem[] = [];
  if (hit.granted > 0) pushes.push(naturalFlow(role, nowSec, hit.granted));
  if (energyGranted > 0) {
    pushes.push(rewardFlow(role, nowSec, [{ id: ITEM_ID.ENERGY, num: energyGranted }]));
  }
  if (diamondRemain) {
    pushes.push({
      action: CMD.RES_FLOW_PUSH,
      data: { remain: [diamondRemain], show_type: 0 },
    });
  }
  pushes.push(energyPush(role));
  return { data: supplyData(role), pushes };
}

/** 10016。次数已满不加体力。成功体是结算后的三个次数字段 */
export function supplyByAd(role: Role, nowSec: number, region: GameRegion = DEFAULT_GAME_REGION) {
  const hit = takeNatural(role, nowSec);
  const dayChanged = rollSupplyDay(role, nowSec, region);
  const supply = role.energySupply!;
  const max = systemService.getNumber(SYSTEM_ID.AD_DAILY_COUNT);
  if (supply.videoCount >= max) {
    refuseSupply(role, nowSec, hit, dayChanged, '今日广告次数已用完', SUPPLY_ERR.AD_LIMIT);
  }
  const granted = systemService.getNumber(SYSTEM_ID.AD_ENERGY);
  grantEnergy(role, granted, nowSec);
  role.setEnergySupply({ ...supply, videoCount: supply.videoCount + 1 });
  return finishSupply(role, nowSec, hit, granted, null);
}

/** 10017。价格按下标等于加 1 之前的 buy_count 读取。成功体同样是三个次数字段 */
export function supplyByDiamond(role: Role, nowSec: number, region: GameRegion = DEFAULT_GAME_REGION) {
  const hit = takeNatural(role, nowSec);
  const dayChanged = rollSupplyDay(role, nowSec, region);
  const supply = role.energySupply!;
  const costs = systemService.getNumberList(SYSTEM_ID.DIAMOND_COST);
  const max = systemService.getNumber(SYSTEM_ID.DIAMOND_COUNT);
  const price = supply.buyCount >= max || supply.buyCount >= costs.length ? 0 : costs[supply.buyCount];
  if (price <= 0) {
    refuseSupply(role, nowSec, hit, dayChanged, '今日购买次数已用完', SUPPLY_ERR.BUY_LIMIT);
  }
  const have = role.itemNum(ITEM_ID.DIAMOND);
  if (have < price) {
    refuseSupply(role, nowSec, hit, dayChanged, '钻石不足', SUPPLY_ERR.DIAMOND);
  }
  const left = have - price;
  role.setItemNum(ITEM_ID.DIAMOND, left);
  const granted = systemService.getNumber(SYSTEM_ID.DIAMOND_ENERGY);
  grantEnergy(role, granted, nowSec);
  role.setEnergySupply({ ...supply, buyCount: supply.buyCount + 1 });
  return finishSupply(role, nowSec, hit, granted, { id: ITEM_ID.DIAMOND, num: left });
}
