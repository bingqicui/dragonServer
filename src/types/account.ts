import { IThirdParty } from '../models/account.model';

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash?: string;
  thirdParties: IThirdParty[];
  /** 平台 puid。没有分配过则为空 */
  platformPuid?: number;
  /** 当前有效登录会话。0 表示还没有 */
  sessionId?: number;
}

export interface CreateAccountInput {
  username: string;
  passwordHash?: string;
  thirdParties?: IThirdParty[];
  platformPuid?: number;
}

export function toAccountRecord(doc: any | null | undefined): AccountRecord | null {
  if (!doc) return null;
  const id = doc._id != null ? String(doc._id) : doc.id != null ? String(doc.id) : '';
  if (!id) return null;
  return {
    id,
    username: doc.username,
    passwordHash: doc.passwordHash,
    thirdParties: Array.isArray(doc.thirdParties) ? doc.thirdParties : [],
    platformPuid: typeof doc.platformPuid === 'number' && doc.platformPuid > 0 ? doc.platformPuid : undefined,
    sessionId: typeof doc.sessionId === 'number' && doc.sessionId > 0 ? doc.sessionId : undefined,
  };
}
