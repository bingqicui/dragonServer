// 前端 MSD_ID 协议号（与客户端保持一致；cmd 数字由服务器定义，前端对齐即可）
// 独立成文件，避免 dispatch <-> handlers 循环依赖。
export const CMD = {
  TOKEN_REQ: 2,
  LOGIN_INFO_REQ: 3,
  ROLE_INFO_REQ: 4,
  HEART_REQ: 5,
  RED_INFO_ON_LOGIN: 6,
  BAG: 7,
  WEAPON_UNLOCK: 8,
  WEAPON_UPGRADE: 9,
  ZONE_LIST: 13,
  ZONE_ENTER: 14,
  // 10/11/12 原为配置下发（CONFIG_WEAPONS/ITEMS/LEVELS）；已定配置由前端自带 / CDN 分发，
  // 服务器不再下发配置，故停用。号段留空备用。
  ROLE_GUIDE_RECORD: 1001,
} as const;
