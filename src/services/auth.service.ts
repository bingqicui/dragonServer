import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { accountRepo } from '../repositories/account.repo';
import { PlayerRecord } from '../types/player';
import { BusinessError } from '../utils/errors';
import { LoginType, LOGIN_TYPE_PROVIDER } from '../constants/loginType';
import { wechatClient } from '../integrations/wechat';
import { googleClient } from '../integrations/google';
import { zoneService, ZoneListItem } from './zone.service';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export type TokenKind = 'account' | 'game';

export interface TokenPayload {
  kind: TokenKind;
  accountId: string;
  username: string;
  userId?: string;
  zoneId?: number;
}

export interface AccountAuthResult {
  token: string;
  accountId: string;
  username: string;
  zones: ZoneListItem[];
}

export interface GameAuthResult {
  token: string;
  accountId: string;
  userId: string;
  username: string;
  zoneId: number;
}

export const _clients = {
  wechat: wechatClient,
  google: googleClient,
};

async function withZones(accountId: string, username: string, token: string): Promise<AccountAuthResult> {
  const zones = await zoneService.listForAccount(accountId);
  return { token, accountId, username, zones };
}

export const authService = {
  async register(username: string, password: string): Promise<AccountAuthResult> {
    if (!username || !password) throw new BusinessError('用户名和密码不能为空');
    if (password.length < 6) throw new BusinessError('密码至少 6 位');

    const exist = await accountRepo.findByUsername(username);
    if (exist) throw new BusinessError('用户名已存在');

    const passwordHash = await bcrypt.hash(password, 10);
    const account = await accountRepo.create({ username, passwordHash });
    return withZones(account.id, account.username, this.signAccountToken(account.id, account.username));
  },

  async login(username: string, password: string): Promise<AccountAuthResult> {
    if (!username || !password) throw new BusinessError('用户名和密码不能为空');
    if (password.length < 6) throw new BusinessError('密码至少 6 位');

    let account = await accountRepo.findByUsername(username);
    if (!account) {
      const passwordHash = await bcrypt.hash(password, 10);
      account = await accountRepo.create({ username, passwordHash });
    } else {
      const ok = await bcrypt.compare(password, account.passwordHash || '');
      if (!ok) throw new BusinessError('密码错误');
    }
    return withZones(account.id, account.username, this.signAccountToken(account.id, account.username));
  },

  async loginByThirdParty(loginType: number, payload: any): Promise<AccountAuthResult> {
    let provider: string;
    let providerId: string;

    switch (loginType) {
      case LoginType.WECHAT: {
        provider = LOGIN_TYPE_PROVIDER[LoginType.WECHAT];
        const code = payload?.code;
        if (!code) throw new BusinessError('缺少微信登录 code', 400);
        const r = await _clients.wechat.getOpenidByCode(code);
        providerId = r.openid;
        break;
      }
      case LoginType.GOOGLE: {
        provider = LOGIN_TYPE_PROVIDER[LoginType.GOOGLE];
        const idToken = payload?.idToken;
        if (!idToken) throw new BusinessError('缺少 Google idToken', 400);
        const r = await _clients.google.verifyIdToken(idToken);
        providerId = r.sub;
        break;
      }
      default:
        throw new BusinessError('不支持的登录方式', 400);
    }

    let account = await accountRepo.findByThirdParty(provider, providerId);
    if (!account) account = await accountRepo.createFromThirdParty(provider, providerId);
    return withZones(account.id, account.username, this.signAccountToken(account.id, account.username));
  },

  signAccountToken(accountId: string, username: string): string {
    return jwt.sign({ kind: 'account', accountId, username }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  },

  signGameToken(role: PlayerRecord): GameAuthResult {
    const token = jwt.sign(
      {
        kind: 'game',
        accountId: role.accountId,
        userId: role.id,
        username: role.username,
        zoneId: role.zoneId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
    return {
      token,
      accountId: role.accountId,
      userId: role.id,
      username: role.username,
      zoneId: role.zoneId,
    };
  },

  verifyToken(token: string): TokenPayload {
    try {
      const p = jwt.verify(token, JWT_SECRET) as {
        kind?: TokenKind;
        accountId?: string;
        userId?: string;
        username: string;
        zoneId?: number;
      };
      // 旧游戏 token：有 userId、无 kind
      if (p.kind === 'game' || (!p.kind && p.userId)) {
        if (!p.userId) throw new BusinessError('无效或过期的 token', 401);
        return {
          kind: 'game',
          accountId: p.accountId || '',
          userId: p.userId,
          username: p.username,
          zoneId: typeof p.zoneId === 'number' ? p.zoneId : undefined,
        };
      }
      if (p.kind === 'account' || p.accountId) {
        if (!p.accountId) throw new BusinessError('无效或过期的 token', 401);
        return { kind: 'account', accountId: p.accountId, username: p.username };
      }
      throw new BusinessError('无效或过期的 token', 401);
    } catch (e) {
      if (e instanceof BusinessError) throw e;
      throw new BusinessError('无效或过期的 token', 401);
    }
  },
};
