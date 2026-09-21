import { userRepo } from '../repositories/user.repo';
import { configService } from './config.service';
import { BusinessError } from '../utils/errors';

export const weaponService = {
  // 解锁武器：扣解锁费，写入 weapons[id] = { level:1, unlocked:true }
  async unlock(userId: string, weaponId: string) {
    const cfg = configService.getWeapon(weaponId);
    if (!cfg) throw new BusinessError('武器不存在');

    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('用户不存在');

    const weapons = user.weapons;
    if (weapons[weaponId]?.unlocked) throw new BusinessError('武器已解锁');

    const cost = cfg.unlockCost.coins;
    if (user.coins < cost) throw new BusinessError('金币不足，无法解锁');

    // 原子操作：条件 coins >= cost 保证并发下不会扣成负数
    const updated = await userRepo.updateAtomic(
      userId,
      {
        $inc: { coins: -cost },
        $set: { [`weapons.${weaponId}`]: { level: 1, unlocked: true } },
      },
      { coins: { $gte: cost } }
    );
    if (!updated) throw new BusinessError('操作失败（资源不足或并发冲突）');

    return { weaponId, unlocked: true, level: 1, coins: updated.coins };
  },

  // 升级武器：逐级校验、上限校验、资源校验，原子扣费
  async upgrade(userId: string, weaponId: string, targetLevel: number) {
    const cfg = configService.getWeapon(weaponId);
    if (!cfg) throw new BusinessError('武器不存在');

    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('用户不存在');

    const weapons = user.weapons;
    const owned = weapons[weaponId];
    if (!owned || !owned.unlocked) throw new BusinessError('武器未解锁');
    if (targetLevel !== owned.level + 1) throw new BusinessError('只能逐级升级');
    if (targetLevel > cfg.maxLevel) throw new BusinessError('已达最高等级');

    const cost = cfg.upgradeCost[String(targetLevel)]?.coins;
    if (cost === undefined) throw new BusinessError('升级配置缺失');
    if (user.coins < cost) throw new BusinessError('金币不足');

    const updated = await userRepo.updateAtomic(
      userId,
      {
        $inc: { coins: -cost },
        $set: { [`weapons.${weaponId}.level`]: targetLevel },
      },
      { coins: { $gte: cost } }
    );
    if (!updated) throw new BusinessError('操作失败（资源不足或并发冲突）');

    return { weaponId, level: targetLevel, coins: updated.coins };
  },

  // 返回玩家武器状态 + 完整配置（前端用于展示/校验）
  async getWeapons(userId: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('用户不存在');
    return { weapons: user.weapons, config: configService.getAllWeapons() };
  },
};
