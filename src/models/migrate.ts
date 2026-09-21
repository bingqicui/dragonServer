import { AccountModel } from './account.model';
import { UserModel } from './user.model';

/**
 * 把「账号+角色混在 User 里」的旧文档拆成 Account + 区角色。
 * 已有 accountId 的跳过。
 */
export async function migrateUsersToAccounts(): Promise<void> {
  const stale = await UserModel.find({
    $or: [{ accountId: { $exists: false } }, { accountId: null }, { accountId: '' }],
  }).lean();

  for (const u of stale) {
    const username = String(u.username || '');
    if (!username) continue;

    let accountId: string | null = null;
    const existing = await AccountModel.findOne({ username }).lean();
    if (existing) {
      accountId = String(existing._id);
    } else {
      const created = await AccountModel.create({
        username,
        passwordHash: u.passwordHash,
        thirdParties: Array.isArray(u.thirdParties) ? u.thirdParties : [],
      });
      accountId = String(created._id);
    }

    await UserModel.updateOne(
      { _id: u._id },
      {
        $set: {
          accountId,
          zoneId: typeof u.zoneId === 'number' ? u.zoneId : 1,
        },
        $unset: { passwordHash: 1, thirdParties: 1 },
      }
    );
  }
}
