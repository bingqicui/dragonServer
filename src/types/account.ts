import { IThirdParty } from '../models/account.model';

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash?: string;
  thirdParties: IThirdParty[];
}

export interface CreateAccountInput {
  username: string;
  passwordHash?: string;
  thirdParties?: IThirdParty[];
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
  };
}
