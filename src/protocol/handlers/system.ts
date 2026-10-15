import { CMD } from '../cmd';
import { Handler } from './types';

// 系统级 cmd。登录态在 dispatch 里统一校验，这里只回服务器时间
export const systemHandlers: Record<number, Handler> = {
  // 10000 心跳。time 为 Unix 秒，前端用来校正本地时钟
  [CMD.HEART_REQ]: async () => ({ time: Math.floor(Date.now() / 1000) }),
};
