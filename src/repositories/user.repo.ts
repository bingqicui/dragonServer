import { UserModel } from '../models/user.model';
import {
  CreatePlayerInput,
  DEFAULT_ZONE_ID,
  emptyPlayerInfo,
  PlayerRecord,
  STARTER_COINS,
  toClientInfo,
  toPlayerRecord,
} from '../types/player';
import { markPlayerInfoChanged } from '../utils/requestContext';

export const userRepo = {
  async findById(id: string): Promise<PlayerRecord | null> {
    const doc = await UserModel.findById(id).lean().exec();
    return toPlayerRecord(doc);
  },

  async findByAccountAndZone(accountId: string, zoneId: number): Promise<PlayerRecord | null> {
    const doc = await UserModel.findOne({ accountId, zoneId }).lean().exec();
    return toPlayerRecord(doc);
  },

  async listByAccountId(accountId: string): Promise<PlayerRecord[]> {
    const docs = await UserModel.find({ accountId }).lean().exec();
    return docs.map((d) => toPlayerRecord(d)).filter((r): r is PlayerRecord => r !== null);
  },

  async create(data: CreatePlayerInput): Promise<PlayerRecord> {
    const playerInfo = emptyPlayerInfo(data.username);
    const created = await UserModel.create({
      accountId: data.accountId,
      username: playerInfo.userName,
      coins: data.coins ?? STARTER_COINS,
      playerInfo,
      items: [],
      weapons: data.weapons ?? {},
      bagExtra: {},
      userData: data.userData ?? { level: 1, exp: 0 },
      zoneId: data.zoneId ?? DEFAULT_ZONE_ID,
    });
    const record = toPlayerRecord(created.toObject());
    if (!record) throw new Error('create 后无法映射角色档案');
    markPlayerInfoChanged(record.id);
    return record;
  },

  async createInZone(accountId: string, username: string, zoneId: number): Promise<PlayerRecord> {
    try {
      return await this.create({
        accountId,
        username,
        zoneId,
        coins: STARTER_COINS,
        userData: { level: 1, exp: 0 },
        weapons: {},
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        const existing = await this.findByAccountAndZone(accountId, zoneId);
        if (existing) return existing;
      }
      throw e;
    }
  },

  async updateAtomic(id: string, update: object, condition: object = {}): Promise<PlayerRecord | null> {
    const doc = await UserModel.findOneAndUpdate({ _id: id, ...condition }, update, { new: true })
      .lean()
      .exec();
    return toPlayerRecord(doc);
  },

  async updateById(id: string, update: object): Promise<PlayerRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(id, update, { new: true }).lean().exec();
    return toPlayerRecord(doc);
  },

  /** 把角色整份写回。username 与档案里的名字保持一致，方便旧索引 */
  async saveRole(role: PlayerRecord): Promise<PlayerRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(
      role.id,
      {
        $set: {
          username: role.playerInfo.userName,
          coins: role.coins,
          playerInfo: role.playerInfo,
          items: role.items,
          weapons: role.weapons,
          bagExtra: role.bagExtra,
          userData: role.userData,
          info: toClientInfo(role),
        },
      },
      { new: true }
    )
      .lean()
      .exec();
    return toPlayerRecord(doc);
  },
};
