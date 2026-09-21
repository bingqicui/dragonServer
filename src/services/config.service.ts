// 静态配置服务：启动时把 src/config/*.json 读入进程内存（单例缓存），运行期只读。
// 请求时直接从内存读取，不读文件、不查库。配置表只读、全服共用，无需 Redis（此前已讨论）。
// 分层约定：数据资产（JSON 表）放 src/config/，读取逻辑归属 service 层（本文件）。
//
// 注意：配置**不由服务器下发给前端**（已定：前端自带 / CDN 分发，热更由客户端自理）。
// 本服务仅供服务器**内部**做权威校验（如武器解锁/升级的费用、等级上限）。
import weaponsJson from '../config/weapons.json';
import itemsJson from '../config/items.json';
import levelsJson from '../config/levels.json';
import zonesJson from '../config/zones.json';

export interface WeaponConfig {
  id: string;
  name: string;
  maxLevel: number;
  unlockCost: { coins: number };
  upgradeCost: Record<string, { coins: number }>;
  attributes: Record<string, { attack: number }>;
}
export interface ItemConfig {
  id: string;
  name: string;
  type: string;
  effect?: Record<string, number>;
  sellPrice?: number;
}
export interface LevelConfig {
  id: string;
  name: string;
  monsterCount: number;
  reward: { coins: number; exp: number };
}
export type ZoneStatus = 'open' | 'maintenance' | 'closed';
export interface ZoneConfig {
  id: number;
  name: string;
  status: ZoneStatus;
}

// 进程内存缓存（启动时加载，运行期只读）
const cache = {
  weapons: weaponsJson as Record<string, WeaponConfig>,
  items: itemsJson as Record<string, ItemConfig>,
  levels: levelsJson as Record<string, LevelConfig>,
  zones: zonesJson as Record<string, ZoneConfig>,
};

export const configService = {
  getWeapon(id: string): WeaponConfig | undefined {
    return cache.weapons[id];
  },
  getAllWeapons(): Record<string, WeaponConfig> {
    return cache.weapons;
  },
  getItem(id: string): ItemConfig | undefined {
    return cache.items[id];
  },
  getAllItems(): Record<string, ItemConfig> {
    return cache.items;
  },
  getLevel(id: string): LevelConfig | undefined {
    return cache.levels[id];
  },
  getAllLevels(): Record<string, LevelConfig> {
    return cache.levels;
  },
  getZone(id: number): ZoneConfig | undefined {
    return cache.zones[String(id)];
  },
  getAllZones(): ZoneConfig[] {
    return Object.values(cache.zones).sort((a, b) => a.id - b.id);
  },
};
