import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  /** playerInfo 本次有改动时记下角色 id，收尾才附 10002 */
  playerInfoRoleId?: string;
}

const als = new AsyncLocalStorage<RequestStore>();

/** 以本次请求的 store 为上下文执行 handler */
export function runWithStore<T>(store: RequestStore, fn: () => T): T {
  return als.run(store, fn);
}

/** 只有角色档案变了才调用。读档、改道具武器不要调用 */
export function markPlayerInfoChanged(roleId?: string): void {
  const s = als.getStore();
  if (!s || !roleId) return;
  s.playerInfoRoleId = roleId;
}
