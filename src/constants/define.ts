// 全局宏。各功能的常量加在这里，不另开配置表。
// 改完随代码一起编译，不发给前端。
export const DEFINE = {
  /** 会自然恢复的体力道具 id */
  ENERGY_ITEM_ID: 2,
  /** 体力自然恢复上限 */
  ENERGY_CAP: 52,
  /** 体力每个恢复周期的秒数 */
  ENERGY_INTERVAL_SEC: 1200,
  /** 体力每个完整周期恢复的点数 */
  ENERGY_RECOVER_AMOUNT: 1,
} as const;
