import { ZoneListItem } from './zone';

export type TokenKind = 'account' | 'game';

/** 登录 token 载荷（JWT） */
export interface TokenPayload {
  kind: TokenKind;
  accountId: string;
  username: string;
  userId?: string;
  zoneId?: number;
  /** 签发时的登录会话，必须等于账号上的 sessionId */
  sessionId: number;
}

/** 账号级登录结果（10001 回包主体，含区列表） */
export interface AccountAuthResult {
  token: string;
  accountId: string;
  username: string;
  /** 平台账号。前端用 Number(puid) 保存，不能是角色 id */
  platformPuid: number;
  zones: ZoneListItem[];
}

/** 选区后的游戏 token 结果（ZONE_ENTER） */
export interface GameAuthResult {
  token: string;
  accountId: string;
  userId: string;
  username: string;
  zoneId: number;
}
