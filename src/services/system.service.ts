// STATIC_SYSTEM 参数表。启动时读入内存，全进程一个实例，运行期只读。
// 数值和逗号列表都留在 system 字符串里，取值时再转。
import systemJson from '../config/STATIC_SYSTEM.json';

/** STATIC_SYSTEM.id，与前端 SystemManager 的 SYSTEM_ID 对齐 */
export const SYSTEM_ID = {
  /** 玩家初始体力 */
  INIT_ENERGY: 110,
  /** 自然回复上限 */
  RECOVER_CAP: 120,
  /** 回复间隔，秒 */
  RECOVER_INTERVAL: 130,
  /** 每次恢复体力 */
  RECOVER_AMOUNT: 140,
  /** 每次挑战消耗 */
  CHALLENGE_COST: 150,
  /** 广告获得体力 */
  AD_ENERGY: 160,
  /** 每日广告获取体力次数 */
  AD_DAILY_COUNT: 170,
  /** 钻石补充体力 */
  DIAMOND_ENERGY: 180,
  /** 每次钻石补充体力消耗，逗号列表 */
  DIAMOND_COST: 190,
  /** 钻石补充体力次数 */
  DIAMOND_COUNT: 200,
} as const;

export interface SystemParam {
  id: number;
  systemName: string;
  /** 表字段「所属系统」 */
  systemBelong: string;
  system: string;
  systemDes: string;
}

interface RawSystemParam {
  id: number;
  systemName: string;
  所属系统?: string;
  system: string;
  systemDes?: string;
}

function toInt(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : 0;
}

class SystemService {
  private readonly byId = new Map<number, SystemParam>();

  private constructor() {
    const table = systemJson as Record<string, RawSystemParam>;
    for (const raw of Object.values(table)) {
      const row: SystemParam = {
        id: raw.id,
        systemName: raw.systemName,
        systemBelong: raw.所属系统 ?? '',
        system: String(raw.system ?? ''),
        systemDes: raw.systemDes ?? '',
      };
      this.byId.set(row.id, row);
    }
    for (const id of Object.values(SYSTEM_ID)) {
      if (!this.byId.has(id)) throw new Error(`STATIC_SYSTEM 缺少 id ${id}`);
    }
  }

  private static instance: SystemService | null = null;

  static getInstance(): SystemService {
    if (!SystemService.instance) SystemService.instance = new SystemService();
    return SystemService.instance;
  }

  /** 一行配置。没有这一行时为 undefined */
  get(id: number): SystemParam | undefined {
    return this.byId.get(id);
  }

  /** system 原文。没有这一行时为空串 */
  getValue(id: number): string {
    return this.get(id)?.system ?? '';
  }

  /** system 转整数。空值、非数字、逗号列表都是 0 */
  getNumber(id: number): number {
    return toInt(this.getValue(id));
  }

  /** system 按逗号拆成整数。空串是空数组 */
  getNumberList(id: number): number[] {
    const raw = this.getValue(id);
    if (!raw) return [];
    const out: number[] = [];
    for (const part of raw.split(',')) {
      const text = part.trim();
      if (text === '') continue;
      out.push(toInt(text));
    }
    return out;
  }
}

export const systemService = SystemService.getInstance();
