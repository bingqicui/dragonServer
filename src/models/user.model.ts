import mongoose, { Schema, Document } from 'mongoose';

export interface IWeaponState {
  level: number;
  unlocked: boolean;
}

/** 区角色（原 User 集合）。登录凭证已拆到 Account。 */
export interface IUser extends Document {
  accountId: string;
  username: string;
  coins: number;
  userData: Record<string, any>;
  weapons: Record<string, IWeaponState>;
  zoneId: number;
  // 仅迁移期读取；新角色不再写入
  passwordHash?: string;
  thirdParties?: { provider: string; openid: string }[];
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  accountId: { type: String, required: false },
  username: { type: String, required: true },
  coins: { type: Number, default: 0 },
  userData: { type: Schema.Types.Mixed, default: () => ({ level: 1, exp: 0 }) },
  weapons: { type: Schema.Types.Mixed, default: () => ({}) },
  zoneId: { type: Number, default: 1 },
  passwordHash: { type: String, required: false },
  thirdParties: { type: Schema.Types.Mixed, required: false },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.index({ username: 1, zoneId: 1 }, { unique: true, name: 'username_zoneId_unique' });
UserSchema.index({ accountId: 1, zoneId: 1 }, { unique: true, sparse: true, name: 'accountId_zoneId_unique' });

export const UserModel = mongoose.model<IUser>('User', UserSchema);

export async function syncUserIndexes(): Promise<void> {
  await UserModel.updateMany({ zoneId: { $exists: false } }, { $set: { zoneId: 1 } });
  await UserModel.syncIndexes();
}
