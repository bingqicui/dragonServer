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
    const created = await AccountModel.create(data);
    const record = toAccountRecord(created.toObject());
    if (!record) throw new Error('create account 后无法映射');
    return record;
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
