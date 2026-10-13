// 前端 MSD_ID 协议号（与前端 HttpDefine / MKHttp 对齐）
// 独立成文件，避免 dispatch <-> handlers 循环依赖。
export const CMD = {
  LOGIN:10001,
  /** 角色档案。只由服务器附在回包里下发，不注册请求 handler */
  ROLE_ARCHIVE_PUSH: 10002,
  /** 登录后拉取角色信息 */
  ROLE_INFO_REQ: 10003,
  /** 心跳请求 */
  HEART_REQ: 10000,
  /** 红点全量拉取（登录时） */
  RED_INFO_ON_LOGIN: 100001,
  /** 背包 / 武器状态全量拉取 */
  BAG: 10010,
  /** 保存临时档。请求 `{ info }`，整份原样落库 */
  SAVE_INFO: 10012,
  /** 读取临时档。成功体 `{ info }` */
  GET_SAVE_INFO: 10013,
  /** 武器解锁 */
  WEAPON_UNLOCK: 8,
  /** 武器升级 */
  WEAPON_UPGRADE: 9,
  /** 武器穿戴。请求 `{ id }` */
  WEAPON_EQUIP: 16,
  /** 武器卸下。请求 `{ id }` */
  WEAPON_UNEQUIP: 17,
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
