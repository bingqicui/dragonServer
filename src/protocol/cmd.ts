// 前端 MSD_ID 协议号（与前端 HttpDefine / MKHttp 对齐）
// 独立成文件，避免 dispatch <-> handlers 循环依赖。
export const CMD = {
  LOGIN:10001,
  /** 登录后拉取角色信息。10002 是服务端下发，不作为请求号 */
  ROLE_INFO_REQ: 10003,
  /** 心跳请求 */
  HEART_REQ: 10000,
  /** 红点全量拉取（登录时） */
  RED_INFO_ON_LOGIN: 100001,
  /** 背包 / 武器状态全量拉取 */
  BAG: 10010,
  /** 武器解锁 */
  WEAPON_UNLOCK: 8,
  /** 武器升级 */
  WEAPON_UPGRADE: 9,
  /** 武器穿戴。请求 `{ id }`。未完成时由本地改 isFitOut 后再存 userData */
  WEAPON_EQUIP: 16,
  /** 武器卸下。请求 `{ id }`。未完成时由本地改 isFitOut 后再存 userData */
  WEAPON_UNEQUIP: 17,
  /**
   * 原样保存 userData。
   * 请求和成功 Payload 都是 `{ userData }`，其中含 items、weapons。服务器不校验升级公式。
   * 不进 LocalServer 表。dragonServer 需手写此协议，并在 10003 的 userData 里带回，否则客户端会收到 4004 或下次登录丢失。
   */
  USER_DATA_SET: 15,
  /** 区服列表 */
  ZONE_LIST: 13,
  /** 选区进入 */
  ZONE_ENTER: 14,
  /** 新手引导进度上报 */
  ROLE_GUIDE_RECORD: 1001,
} as const;

// cmd 数字 → action 语义名（用于日志/排查）；未知 cmd 回退为数字字符串。
const CMD_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(CMD).map(([key, value]) => [value as number, key])
) as Record<number, string>;

export function actionOf(cmd: number): string {
  return CMD_REVERSE[cmd] ?? String(cmd);
}
