const tails = new Map<string, Promise<void>>();

/** 同一角色的读改写串行。前一笔结束后才开始下一笔 */
export function withRoleLock<T>(roleId: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(roleId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  tails.set(roleId, tail);
  void tail.then(() => {
    if (tails.get(roleId) === tail) tails.delete(roleId);
  });
  return run;
}
