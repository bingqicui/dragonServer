/**
 * 游戏日。现在只实现中国：东八区，无夏令时，每天 0 点切日。
 * 前端以后会在请求里带地区类型。读请求和加地区都只改这个文件。
 */
export const GameRegion = {
  /** 中国 */
  CN: 'cn',
} as const;

export type GameRegion = (typeof GameRegion)[keyof typeof GameRegion];

/** 请求里还没有地区时用中国 */
export const DEFAULT_GAME_REGION: GameRegion = GameRegion.CN;

/**
 * 从本次请求取出地区。
 * 前端还没传地区类型，入参先不用。字段定了以后只改这里。
 */
export function regionFromPayload(_payload: unknown): GameRegion {
  return DEFAULT_GAME_REGION;
}

/** 该地区、该时刻所属游戏日，YYYYMMDD */
export function gameDate(nowSec: number, region: GameRegion = DEFAULT_GAME_REGION): string {
  switch (region) {
    case GameRegion.CN:
      return formatYmd(nowSec + 8 * 3600);
    default: {
      const unknown: never = region;
      throw new Error(`未支持的地区 ${unknown}`);
    }
  }
}

function formatYmd(utcSec: number): string {
  const date = new Date(utcSec * 1000);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${date.getUTCFullYear()}${pad(month)}${pad(day)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
