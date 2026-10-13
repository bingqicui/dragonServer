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
