import { AccountModel } from '../models/account.model';
import { AccountRecord, CreateAccountInput, toAccountRecord } from '../types/account';

export const accountRepo = {
  async findById(id: string): Promise<AccountRecord | null> {
    const doc = await AccountModel.findById(id).lean().exec();
    return toAccountRecord(doc);
  },

  async findByUsername(username: string): Promise<AccountRecord | null> {
    const doc = await AccountModel.findOne({ username }).lean().exec();
    return toAccountRecord(doc);
  },

  async findByPlatformPuid(platformPuid: number): Promise<AccountRecord | null> {
    const doc = await AccountModel.findOne({ platformPuid }).lean().exec();
    return toAccountRecord(doc);
  },

  async findByThirdParty(provider: string, openid: string): Promise<AccountRecord | null> {
    const doc = await AccountModel.findOne({
      'thirdParties.provider': provider,
      'thirdParties.openid': openid,
    })
      .lean()
      .exec();
    return toAccountRecord(doc);
  },

  async create(data: CreateAccountInput): Promise<AccountRecord> {
    try {
      const created = await AccountModel.create(data);
      const record = toAccountRecord(created.toObject());
      if (!record) throw new Error('create account 后无法映射');
      return record;
    } catch (e: any) {
      // 平台 puid 被占用时去掉再试；用户名冲突仍抛给上层做幂等
      if (e?.code === 11000 && e?.keyPattern?.platformPuid && data.platformPuid != null) {
        const { platformPuid: _drop, ...rest } = data;
        return this.create(rest);
      }
      throw e;
    }
  },

  /** 给还没有平台 puid 的账号分配一个。优先用 openId 本身的正整数 */
  async ensurePlatformPuid(account: AccountRecord, preferred?: number): Promise<AccountRecord> {
    if (account.platformPuid) return account;
    const candidates: number[] = [];
    if (preferred && preferred > 0) candidates.push(preferred);
    for (const n of candidates) {
      const saved = await this.claimPlatformPuid(account.id, n);
      if (saved) return saved;
    }
    for (let i = 0; i < 5; i++) {
      const saved = await this.claimPlatformPuid(account.id, await this.nextPlatformPuid());
      if (saved) return saved;
    }
    throw new Error('分配平台 puid 失败');
  },

  async claimPlatformPuid(id: string, platformPuid: number): Promise<AccountRecord | null> {
    const taken = await this.findByPlatformPuid(platformPuid);
    if (taken && taken.id !== id) return null;
    try {
      const doc = await AccountModel.findOneAndUpdate(
        { _id: id, platformPuid: { $exists: false } },
        { $set: { platformPuid } },
        { new: true }
      )
        .lean()
        .exec();
      if (doc) return toAccountRecord(doc);
    } catch (e: any) {
      if (e?.code === 11000) return null;
      throw e;
    }
    return this.findById(id);
  },

  /** 新的一次登录。旧 token 里的 sessionId 对不上就会失效 */
  async rotateSession(id: string): Promise<AccountRecord | null> {
    const doc = await AccountModel.findByIdAndUpdate(id, { $inc: { sessionId: 1 } }, { new: true }).lean().exec();
    return toAccountRecord(doc);
  },

  async nextPlatformPuid(): Promise<number> {
    const top = await AccountModel.findOne({ platformPuid: { $gt: 0 } })
      .sort({ platformPuid: -1 })
      .select('platformPuid')
      .lean()
      .exec();
    const max = typeof top?.platformPuid === 'number' ? top.platformPuid : 100000;
    return max + 1;
  },

  async createFromThirdParty(provider: string, openid: string): Promise<AccountRecord> {
    const safe = String(openid).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const username = `${provider}_${safe}`;
    try {
      return await this.create({
        username,
        thirdParties: [{ provider, openid }],
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        const existing = await this.findByThirdParty(provider, openid);
        if (existing) return existing;
        const byName = await this.findByUsername(username);
        if (byName) return byName;
      }
      throw e;
    }
  },
};
