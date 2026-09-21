import { CMD } from '../cmd';
import { Handler } from './types';

// 系统级、无需登录的 cmd
export const systemHandlers: Record<number, Handler> = {
  // 5 心跳
  [CMD.HEART_REQ]: async () => ({}),
};
