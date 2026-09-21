import { userRepo } from '../repositories/user.repo';
import { BusinessError } from '../utils/errors';

export const userService = {
  // 读取玩家档案（货币 + 游戏进度 + 武器状态）
  async getProfile(userId: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('用户不存在');
    return {
      username: user.username,
      coins: user.coins,
      userData: user.userData,
      weapons: user.weapons,
      zoneId: user.zoneId,
      accountId: user.accountId,
    };
  },

  // 保存玩家存档 —— 服务器权威原则：
  // 1) 货币（coins）由服务端逻辑控制，禁止客户端直接写入；
  // 2) 已知数值字段做非负校验，防止伪造异常数据。
  // 兼容两种客户端传参：直接传 userData 内容 {...}，或包一层 { userData: {...} }。
  async saveUserData(userId: string, incoming: Record<string, any>) {
    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('用户不存在');

    let data: Record<string, any>;
    if (
      incoming && typeof incoming === 'object' &&
      typeof incoming.userData === 'object' && incoming.userData !== null &&
      Object.keys(incoming).length === 1
    ) {
      data = { ...incoming.userData };
    } else {
      data = { ...incoming };
    }

    delete data.coins; // 货币不从客户端存档写入

    for (const key of ['level', 'exp']) {
      if (data[key] !== undefined) {
        const v = Number(data[key]);
        if (!Number.isFinite(v) || v < 0) throw new BusinessError('字段 ' + key + ' 非法');
        data[key] = v;
      }
    }

    const updated = await userRepo.saveUserData(userId, data);
    if (!updated) throw new BusinessError('用户不存在');
    return { userData: updated.userData, coins: updated.coins };
  },
};
