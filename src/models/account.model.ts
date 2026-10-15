import mongoose, { Schema, Document } from 'mongoose';

export interface IThirdParty {
  provider: string;
  openid: string;
}

export interface IAccount extends Document {
  username: string;
  passwordHash?: string;
  thirdParties: IThirdParty[];
  /** 平台账号，给前端当 puid。数字，和角色 uid 不是同一个值 */
  platformPuid?: number;
  /** 当前有效登录。新登录加一，旧 token 对不上即失效 */
  sessionId?: number;
  createdAt: Date;
}

const AccountSchema = new Schema<IAccount>({
  username: { type: String, required: true },
  passwordHash: { type: String, required: false },
  thirdParties: {
    type: [
      {
        provider: { type: String, required: true },
        openid: { type: String, required: true },
      },
    ],
    default: [],
  },
  platformPuid: { type: Number, required: false },
  sessionId: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

AccountSchema.index({ username: 1 }, { unique: true, name: 'account_username_unique' });
AccountSchema.index(
  { 'thirdParties.provider': 1, 'thirdParties.openid': 1 },
  { unique: true, sparse: true, name: 'account_thirdParty_unique' }
);
AccountSchema.index({ platformPuid: 1 }, { unique: true, sparse: true, name: 'account_platformPuid_unique' });

export const AccountModel = mongoose.model<IAccount>('Account', AccountSchema);

export async function syncAccountIndexes(): Promise<void> {
  await AccountModel.syncIndexes();
}
