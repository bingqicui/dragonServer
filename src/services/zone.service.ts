import { accountRepo } from '../repositories/account.repo';
import { userRepo } from '../repositories/user.repo';
import { PlayerRecord } from '../types/player';
import { configService } from './config.service';
import { BusinessError } from '../utils/errors';

export interface ZoneListItem {
  zoneId: number;
  name: string;
  status: string;
  hasRole: boolean;
}

export const zoneService = {
  async listForAccount(accountId: string): Promise<ZoneListItem[]> {
    const roles = await userRepo.listByAccountId(accountId);
    const owned = new Set(roles.map((r) => r.zoneId));
    return configService.getAllZones().map((z) => ({
      zoneId: z.id,
      name: z.name,
      status: z.status,
      hasRole: owned.has(z.id),
    }));
  },

  async enter(accountId: string, zoneId: number): Promise<PlayerRecord> {
    const zone = configService.getZone(zoneId);
    if (!zone) throw new BusinessError('区不存在', 400);
    if (zone.status !== 'open') throw new BusinessError('该区未开放', 400);

    const account = await accountRepo.findById(accountId);
    if (!account) throw new BusinessError('账号不存在', 401);

    let role = await userRepo.findByAccountAndZone(accountId, zoneId);
    if (!role) {
      role = await userRepo.createInZone(accountId, account.username, zoneId);
    }
    return role;
  },
};
