import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  /** 收尾要附 10002 时记下角色 id。玩家档案或今日体力次数变了才记 */
  playerInfoRoleId?: string;
}

const als = new AsyncLocalStorage<RequestStore>();

/** 以本次请求的 store 为上下文执行 handler */
export function runWithStore<T>(store: RequestStore, fn: () => T): T {
  return als.run(store, fn);
}

/** 收尾附一条 10002。玩家档案或今日体力次数变了才调用 */
export function markArchivePush(roleId?: string): void {
  const s = als.getStore();
  if (!s || !roleId) return;
  s.playerInfoRoleId = roleId;
}

/** 只有角色档案变了才调用。读档、改道具武器不要调用 */
export function markPlayerInfoChanged(roleId?: string): void {
  markArchivePush(roleId);
}
