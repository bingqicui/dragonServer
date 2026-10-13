/** 武器状态（前端武器系统字段） */
export interface WeaponState {
  level: number;
  unlocked: boolean;
  /** 是否穿戴 */
  isFitOut?: boolean;
}
