import { WeaponState } from './weapon';

export const DEFAULT_ZONE_ID = 1;
export const STARTER_COINS = 1000;
const DEFAULT_PID = '178';

/** 角色档案。10002 用的就是这块，不含道具和武器 */
export interface PlayerInfo {
  userName: string;
  userPhoto: number;
  userStatus: number;
  pid: string;
  platform: number;
  combat: number;
  /** 创角时间，秒 */
  createTime: number;
  /** 最近登录，秒 */
  loginTime: number;
  loginCount: number;
  idfa: string | null;
  oaid: string | null;
}

/** 下发给前端的 10002。heart_time、localIp 不落库 */
export interface PlayerArchive {
  user_id: string;
  user_name: string;
  user_photo: number;
  user_status: number;
  pid: string;
  platform: number;
  combat: number;
  create_time: number;
  heart_time: number;
  login_time: number;
  login_count: number;
  localIp: string;
  idfa: string | null;
  oaid: string | null;
}

/**
 * 一个区角色的全部数据。
 * playerInfo / items / weapons 由各自子系统改，数据库按这一份存。
 */
export interface PlayerRecord {
  id: string;
  accountId: string;
  zoneId: number;
  /** 服务端金币。不进 10002，也不从客户端存档写入 */
  coins: number;
  playerInfo: PlayerInfo;
  items: Record<string, any>[];
  weapons: Record<string, WeaponState>;
  /** 10012 里除 items、weapons 以外的字段，原样留着 */
  bagExtra: Record<string, any>;
  /** 引导等旧档，协议 1001 */
  userData: Record<string, any>;
}

export interface CreatePlayerInput {
  accountId: string;
  username: string;
  coins?: number;
  userData?: Record<string, any>;
  weapons?: Record<string, WeaponState>;
  zoneId?: number;
}

export function emptyPlayerInfo(userName: string, createTime = unixNow()): PlayerInfo {
  const pid = process.env.PLATFORM_ID || DEFAULT_PID;
  return {
    userName,
    userPhoto: 0,
    userStatus: 0,
    pid,
    platform: Number(pid) || 0,
    combat: 0,
    createTime,
    loginTime: 0,
    loginCount: 0,
    idfa: null,
    oaid: null,
  };
}

export function toPlayerArchive(role: PlayerRecord, clientIp?: string): PlayerArchive {
  const info = role.playerInfo;
  return {
    user_id: role.id,
    user_name: info.userName,
    user_photo: info.userPhoto,
    user_status: info.userStatus,
    pid: info.pid,
    platform: info.platform,
    combat: info.combat,
    create_time: info.createTime,
    login_time: info.loginTime,
    login_count: info.loginCount,
    idfa: info.idfa,
    oaid: info.oaid,
    localIp: clientIp || '',
    heart_time: unixNow(),
  };
}

/** 10013 回给前端的临时档 */
export function toClientInfo(role: PlayerRecord): Record<string, any> {
  return {
    ...role.bagExtra,
    items: role.items,
    weapons: role.weapons,
  };
}

export function toPlayerRecord(doc: any | null | undefined): PlayerRecord | null {
  if (!doc) return null;
  const id = doc._id != null ? String(doc._id) : doc.id != null ? String(doc.id) : '';
  if (!id) return null;

  const createdAt = toUnixSeconds(doc.createdAt);
  const legacyInfo = plainObject(doc.info);
  const storedInfo = plainObject(doc.playerInfo);
  const userName = storedInfo?.userName ?? doc.username ?? '';

  const playerInfo: PlayerInfo = storedInfo
    ? {
        ...emptyPlayerInfo(String(userName), createdAt),
        ...storedInfo,
        userName: String(storedInfo.userName ?? userName),
        createTime: Number(storedInfo.createTime) || createdAt,
      }
    : emptyPlayerInfo(String(userName), createdAt);

  const items = Array.isArray(doc.items)
    ? doc.items
    : Array.isArray(legacyInfo?.items)
      ? legacyInfo.items
      : [];
  const weapons = objectBag(doc.weapons);
  const legacyWeapons = objectBag(legacyInfo?.weapons);
  const { items: _items, weapons: _weapons, ...legacyExtra } = legacyInfo ?? {};

  return {
    id,
    accountId: doc.accountId != null ? String(doc.accountId) : '',
    zoneId: typeof doc.zoneId === 'number' ? doc.zoneId : DEFAULT_ZONE_ID,
    coins: doc.coins ?? 0,
    playerInfo,
    items,
    weapons: Object.keys(weapons).length ? weapons : legacyWeapons,
    bagExtra: plainObject(doc.bagExtra) ?? legacyExtra,
    userData: plainObject(doc.userData) ?? { level: 1, exp: 0 },
  };
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function plainObject(value: unknown): Record<string, any> | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, any>;
}

function objectBag(value: unknown): Record<string, any> {
  return plainObject(value) ?? {};
}

function toUnixSeconds(value: unknown): number {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string' && value) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return 0;
}
