// 静态配置服务：启动时把 src/config/*.json 读入进程内存（单例缓存），运行期只读。
// 请求时直接从内存读取，不读文件、不查库。配置表只读、全服共用，无需 Redis（此前已讨论）。
// 分层约定：数据资产（JSON 表）放 src/config/，读取逻辑归属 service 层（本文件）。
//
// 注意：配置**不由服务器下发给前端**（已定：前端自带 / CDN 分发，热更由客户端自理）。
// 本服务仅供服务器**内部**做权威校验（如武器解锁/升级的费用、等级上限）。
import weaponsJson from '../config/weapons.json';
import zonesJson from '../config/zones.json';
import itemInfoJson from '../config/STATIC_ITEM_INFO.json';
import dragonLevelJson from '../config/STATIC_DRAGON_LEVEL.json';

export interface WeaponConfig {
  id: string;
  name: string;
  maxLevel: number;
  unlockCost: { coins: number };
  upgradeCost: Record<string, { coins: number }>;
  attributes: Record<string, { attack: number }>;
}
export type ZoneStatus = 'open' | 'maintenance' | 'closed';
export interface ZoneConfig {
  id: number;
  name: string;
  status: ZoneStatus;
}
export interface ItemInfoConfig {
  id: number;
  name: string;
  type: number;
  page: number;
  quality: number;
  is_show: number;
  desc: string;
}
export interface DragonLevelConfig {
  lvid: number;
  type: number;
  diffType: number;
  wave: string;
  drop1: number;
  box1: number;
  box2: number;
  box3: number;
  testSkill?: number;
  skillPool?: number;
}

// 进程内存缓存（启动时加载，运行期只读）
const cache = {
  weapons: weaponsJson as Record<string, WeaponConfig>,
  zones: zonesJson as Record<string, ZoneConfig>,
  itemInfo: itemInfoJson as Record<string, ItemInfoConfig>,
  dragonLevel: dragonLevelJson as Record<string, DragonLevelConfig>,
};

export const configService = {
  getWeapon(id: string): WeaponConfig | undefined {
    return cache.weapons[id];
  },
  getAllWeapons(): Record<string, WeaponConfig> {
    return cache.weapons;
  },
  getZone(id: number): ZoneConfig | undefined {
    return cache.zones[String(id)];
  },
  getAllZones(): ZoneConfig[] {
    return Object.values(cache.zones).sort((a, b) => a.id - b.id);
  },
  getItemInfo(id: number): ItemInfoConfig | undefined {
    return cache.itemInfo[String(id)];
  },
  getAllItemInfo(): ItemInfoConfig[] {
    return Object.values(cache.itemInfo).sort((a, b) => a.id - b.id);
  },
  getDragonLevel(lvid: number): DragonLevelConfig | undefined {
    return cache.dragonLevel[String(lvid)];
  },
  getAllDragonLevels(): DragonLevelConfig[] {
    return Object.values(cache.dragonLevel).sort((a, b) => a.lvid - b.lvid);
  },
};
