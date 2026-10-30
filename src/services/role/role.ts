import { userRepo } from '../../repositories/user.repo';
import {
  PlayerArchive,
  PlayerInfo,
  PlayerRecord,
  toClientInfo,
  toPlayerArchive,
} from '../../types/player';
import { markPlayerInfoChanged } from '../../utils/requestContext';
import { BusinessError } from '../../utils/errors';

/**
 * 一个区角色。
 * 全部数据在这一份里：playerInfo、items、weapons，以及金币和引导档。
 * 子系统只改自己那一块，再经 save 写回数据库。
 */
export class Role {
  private playerInfoChanged = false;

  private constructor(private data: PlayerRecord) {}

  static load(record: PlayerRecord): Role {
    return new Role(record);
  }

  get id(): string {
    return this.data.id;
  }

  get accountId(): string {
    return this.data.accountId;
  }

  get zoneId(): number {
    return this.data.zoneId;
  }

  get coins(): number {
    return this.data.coins;
  }

  get playerInfo(): PlayerInfo {
    return this.data.playerInfo;
  }

  get items(): Record<string, any>[] {
    return this.data.items;
  }

  get weapons(): PlayerRecord['weapons'] {
    return this.data.weapons;
  }

  get userData(): Record<string, any> {
    return this.data.userData;
  }

  /** 服务端道具。10012 的 replaceBag 不碰这里 */
  get serverItems(): Record<string, { num: number }> {
    return this.data.serverItems;
  }

  /** 体力周期起点。null 表示自然恢复已停止 */
  get energyAt(): number | null {
    return this.data.energyAt;
  }

  itemNum(id: number): number {
    const row = this.data.serverItems[String(id)];
    return row && row.num > 0 ? row.num : 0;
  }

  setItemNum(id: number, num: number): void {
    const key = String(id);
    if (num <= 0) {
      delete this.data.serverItems[key];
      return;
    }
    this.data.serverItems[key] = { num };
  }

  setEnergyAt(value: number | null): void {
    this.data.energyAt = value;
  }

  /** 10010。只带数量大于 0 的道具 */
  visibleItems(): Record<string, { num: number }> {
    const out: Record<string, { num: number }> = {};
    for (const [key, row] of Object.entries(this.data.serverItems)) {
      if (row && row.num > 0) out[key] = { num: row.num };
    }
    return out;
  }

  get username(): string {
    return this.data.playerInfo.userName;
  }

  /** 登录：只动档案里的登录时间和次数 */
  touchLogin(): void {
    this.data.playerInfo.loginTime = Math.floor(Date.now() / 1000);
    this.data.playerInfo.loginCount += 1;
    this.playerInfoChanged = true;
  }

  /** 10012。items、weapons 交给对应子系统，其余字段留在 bagExtra */
  replaceBag(info: Record<string, any>): void {
    const { items, weapons, ...extra } = info;
    this.data.items = Array.isArray(items) ? items : [];
    this.data.weapons = weapons && typeof weapons === 'object' && !Array.isArray(weapons) ? weapons : {};
    this.data.bagExtra = extra;
  }

  /** 1001 引导档。不改档案 */
  replaceUserData(userData: Record<string, any>): void {
    this.data.userData = userData;
  }

  archive(clientIp?: string): PlayerArchive {
    return toPlayerArchive(this.data, clientIp);
  }

  clientInfo(): Record<string, any> {
    return toClientInfo(this.data);
  }

  async save(): Promise<PlayerRecord> {
    const updated = await userRepo.saveRole(this.data);
    if (!updated) throw new BusinessError('用户不存在');
    this.data = updated;
    if (this.playerInfoChanged) {
      markPlayerInfoChanged(this.data.id);
      this.playerInfoChanged = false;
    }
    return this.data;
  }
}
