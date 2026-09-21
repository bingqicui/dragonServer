import { Handler } from './types';
import { systemHandlers } from './system';
import { authHandlers } from './auth';
import { userHandlers } from './user';
import { weaponHandlers } from './weapon';
import { zoneHandlers } from './zone';

// 汇总所有业务 handler，按 cmd 数字建索引。
// 新增业务：在对应 handlers/*.ts 加一个条目即可，dispatch.ts 无需改动。
// 注：静态配置改为前端自带 / CDN 分发，服务器不再下发配置，故无 config handlers。
export const handlers: Record<number, Handler> = {
  ...systemHandlers,
  ...authHandlers,
  ...userHandlers,
  ...weaponHandlers,
  ...zoneHandlers,
};
