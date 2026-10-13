import { userRepo } from '../repositories/user.repo';
import { toPlayerArchive } from '../types/player';
import { CMD } from './cmd';

/** 按角色 id 取最新档案，生成一条 10002 推送项 */
export async function pushArchiveFor(roleId: string, clientIp?: string) {
  const role = await userRepo.findById(roleId);
  if (!role) return null;
  return { action: CMD.ROLE_ARCHIVE_PUSH, data: toPlayerArchive(role, clientIp) };
}
