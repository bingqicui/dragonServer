import { userRepo } from '../repositories/user.repo';
import { Role } from './role/role';
import { DEFAULT_ZONE_ID, PlayerRecord } from '../types/player';
import { Ctx } from '../protocol/handlers/types';
import { BusinessError } from '../utils/errors';

function zoneIdOf(serverId: number | string | undefined): number {
  const raw = Number(serverId);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ZONE_ID;
}

export const userService = {
  /**
   * 账号 token 或游戏 token 都能定位角色。
   * 请求带了 uid 就按这个角色 id 查，并核对属于当前账号。
   * 没带 uid 时用账号加 server_id，没有角色则创建。
   */
  async resolveRole(ctx: Ctx): Promise<PlayerRecord> {
    if (!ctx.accountId) throw new BusinessError('未登录', 401);
    if (ctx.userId) {
      const role = await userRepo.findById(ctx.userId);
      if (!role || role.accountId !== ctx.accountId) throw new BusinessError('角色不存在', 400);
      return role;
    }
    const zoneId = zoneIdOf(ctx.serverId);
    const existing = await userRepo.findByAccountAndZone(ctx.accountId, zoneId);
    if (existing) return existing;
    return userRepo.createInZone(ctx.accountId, ctx.username || ctx.accountId, zoneId);
  },

  /** 10012：道具和武器写入角色，不改 playerInfo，所以不推 10002 */
  async saveClientInfo(role: Role, incoming: unknown) {
    if (incoming == null || typeof incoming !== 'object' || Array.isArray(incoming)) {
      throw new BusinessError('缺少 info', 400);
    }
    let info: Record<string, any>;
    try {
      info = JSON.parse(JSON.stringify(incoming));
    } catch {
      throw new BusinessError('info 无法保存', 400);
    }
    role.replaceBag(info);
    await role.save();
    return {};
  },

  // 保存玩家存档 —— 服务器权威原则：
  // 1) 货币（coins）由服务端逻辑控制，禁止客户端直接写入；
  // 2) 已知数值字段做非负校验，防止伪造异常数据。
  // 兼容两种客户端传参：直接传 userData 内容 {...}，或包一层 { userData: {...} }。
  async saveUserData(userId: string, incoming: Record<string, any>) {
    const record = await userRepo.findById(userId);
    if (!record) throw new BusinessError('用户不存在');
    const role = Role.load(record);

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

    role.replaceUserData(data);
    const updated = await role.save();
    return { userData: updated.userData, coins: updated.coins };
  },
};
