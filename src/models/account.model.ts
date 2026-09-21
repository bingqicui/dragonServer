import mongoose, { Schema, Document } from 'mongoose';

export interface IThirdParty {
  provider: string;
  openid: string;
}

export interface IAccount extends Document {
  username: string;
  passwordHash?: string;
  thirdParties: IThirdParty[];
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
  createdAt: { type: Date, default: Date.now },
});

AccountSchema.index({ username: 1 }, { unique: true, name: 'account_username_unique' });
AccountSchema.index(
  { 'thirdParties.provider': 1, 'thirdParties.openid': 1 },
  { unique: true, sparse: true, name: 'account_thirdParty_unique' }
);

export const AccountModel = mongoose.model<IAccount>('Account', AccountSchema);

export async function syncAccountIndexes(): Promise<void> {
  await AccountModel.syncIndexes();
}
