import { IWeaponState } from '../models/user.model';

export const DEFAULT_ZONE_ID = 1;
export const STARTER_COINS = 1000;

/**
 * 区角色档案（纯对象）。账号凭证不在这里。
 */
export interface PlayerRecord {
  id: string;
  accountId: string;
  username: string;
  coins: number;
  userData: Record<string, any>;
  weapons: Record<string, IWeaponState>;
  zoneId: number;
}

export interface CreatePlayerInput {
  accountId: string;
  username: string;
  coins?: number;
  userData?: Record<string, any>;
  weapons?: Record<string, IWeaponState>;
  zoneId?: number;
}

export function toPlayerRecord(doc: any | null | undefined): PlayerRecord | null {
  if (!doc) return null;
  const id = doc._id != null ? String(doc._id) : doc.id != null ? String(doc.id) : '';
  if (!id) return null;
  return {
    id,
    accountId: doc.accountId != null ? String(doc.accountId) : '',
    username: doc.username,
    coins: doc.coins ?? 0,
    userData: doc.userData && typeof doc.userData === 'object' ? doc.userData : { level: 1, exp: 0 },
    weapons: doc.weapons && typeof doc.weapons === 'object' ? doc.weapons : {},
    zoneId: typeof doc.zoneId === 'number' ? doc.zoneId : DEFAULT_ZONE_ID,
  };
}
