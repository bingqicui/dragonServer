import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { accountRepo } from '../repositories/account.repo';
import { AccountRecord } from '../types/account';
import { PlayerRecord } from '../types/player';
import { BusinessError } from '../utils/errors';
import { LoginType, LOGIN_TYPE_PROVIDER } from '../constants/loginType';
import { wechatClient } from '../integrations/wechat';
import { googleClient } from '../integrations/google';
import { zoneService } from './zone.service';
import { AccountAuthResult, GameAuthResult, TokenKind, TokenPayload } from '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const _clients = {
  wechat: wechatClient,
  google: googleClient,
};

/** openId 本身是正整数时，直接当作平台 puid，避免和角色 id 拼在一起 */
export function openIdAsPuid(openId: string): number | undefined {
  if (!/^[1-9]\d*$/.test(openId)) return undefined;
  const n = Number(openId);
  if (!Number.isSafeInteger(n) || n <= 0) return undefined;
  return n;
}

async function packAccount(account: AccountRecord): Promise<AccountAuthResult> {
  const ready = await accountRepo.ensurePlatformPuid(account, openIdAsPuid(account.username));
  if (!ready.platformPuid) throw new BusinessError('分配平台 puid 失败', 500);
  const zones = await zoneService.listForAccount(ready.id);
  const token = jwt.sign({ kind: 'account', accountId: ready.id, username: ready.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
  return {
    token,
    accountId: ready.id,
    username: ready.username,
    platformPuid: ready.platformPuid,
    zones,
  };
}

export const authService = {
  async register(username: string, password: string): Promise<AccountAuthResult> {
    if (!username || !password) throw new BusinessError('用户名和密码不能为空');
    if (password.length < 6) throw new BusinessError('密码至少 6 位');

    const exist = await accountRepo.findByUsername(username);
    if (exist) throw new BusinessError('用户名已存在');

    const passwordHash = await bcrypt.hash(password, 10);
    const account = await accountRepo.create({ username, passwordHash });
    return packAccount(account);
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
    return packAccount(account);
  },

  /** 已有账号 token 时复用，并带上平台 puid */
  async resume(accountId: string): Promise<AccountAuthResult> {
    const account = await accountRepo.findById(accountId);
    if (!account) throw new BusinessError('账号不存在', 401);
    return packAccount(account);
  },

  /**
   * 平台 / SDK 自动登录（兼容前端 LoginScene 的 PHP autoLogin）。
   * 无密码：按 openId 找/建账号，签发 account token（供后续 ZONE_ENTER 的 requireAccount 使用）。
   */
  async autoLogin(openId: string): Promise<AccountAuthResult> {
    if (!openId) throw new BusinessError('缺少 openId', 400);
    let account = await accountRepo.findByUsername(openId);
    if (!account) {
      const passwordHash = await bcrypt.hash(openId + '_auto', 10);
      account = await accountRepo.create({
        username: openId,
        passwordHash,
        platformPuid: openIdAsPuid(openId),
      });
    }
    return packAccount(account);
  },

  /** 网关里的 puid 只查平台账号，不拿角色 uid 来建号 */
  async loginByPlatformPuid(puid: string): Promise<AccountAuthResult> {
    const n = openIdAsPuid(puid);
    if (!n) throw new BusinessError('缺少登录凭据（账号 token、用户名密码或 puid）', 4000);
    const byPuid = await accountRepo.findByPlatformPuid(n);
    if (byPuid) return packAccount(byPuid);
    const byName = await accountRepo.findByUsername(String(n));
    if (byName) return packAccount(byName);
    return this.autoLogin(String(n));
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
    return packAccount(account);
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
        username: role.playerInfo.userName,
        zoneId: role.zoneId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
    return {
      token,
      accountId: role.accountId,
      userId: role.id,
      username: role.playerInfo.userName,
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
