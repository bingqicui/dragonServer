import jwt from 'jsonwebtoken';
import { BusinessError } from '../utils/errors';

// Google Play 登录适配器：服务端验签前端传来的 idToken，取出平台唯一标识 sub。
// 关键点：GOOGLE_CLIENT_ID 只在服务端（.env）；idToken 必须由服务端验签，
// 不能信任前端声称的「我是某人」。算法为 RS256，证书从 Google 官方端点拉取并短时缓存。
export interface GoogleClient {
  verifyIdToken(idToken: string): Promise<{ sub: string; email?: string }>;
}

// 不同 issuer 对应的 x509 证书端点
const CERT_URLS: Record<string, string> = {
  'https://accounts.google.com':
    'https://www.googleapis.com/robot/v1/metadata/x509/accounts.google.com',
  'accounts.google.com':
    'https://www.googleapis.com/robot/v1/metadata/x509/accounts.google.com',
  'https://securetoken.google.com':
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
};

let certCache: { certs: Record<string, string>; expireAt: number } | null = null;

async function getCerts(iss: string): Promise<Record<string, string>> {
  const url = CERT_URLS[iss];
  if (!url) throw new BusinessError('不支持的 Google issuer: ' + iss, 400);
  const now = Date.now();
  if (certCache && certCache.expireAt > now) return certCache.certs;
  const resp = await fetch(url);
  const certs = (await resp.json()) as Record<string, string>;
  certCache = { certs, expireAt: now + 60 * 60 * 1000 }; // 简单缓存 1 小时
  return certs;
}

function b64urlDecode(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf8');
}

const client: GoogleClient = {
  async verifyIdToken(idToken: string) {
    // 仅测试用桩：不联网，返回确定性结果（由 e2e 通过 AUTH_STUB=1 开启）
    if (process.env.AUTH_STUB === '1') {
      return { sub: 'stub_gg_' + idToken, email: 'stub@example.com' };
    }

    const parts = idToken.split('.');
    if (parts.length !== 3) throw new BusinessError('Google idToken 格式错误', 400);

    let header: any;
    let payload: any;
    try {
      header = JSON.parse(b64urlDecode(parts[0]));
      payload = JSON.parse(b64urlDecode(parts[1]));
    } catch {
      throw new BusinessError('Google idToken 解析失败', 400);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new BusinessError('Google 登录未配置 GOOGLE_CLIENT_ID', 500);

    // 基础声明校验
    if (payload.aud !== clientId) throw new BusinessError('Google idToken aud 不匹配', 400);
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new BusinessError('Google idToken iss 不匹配', 400);
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new BusinessError('Google idToken 已过期', 400);
    }

    // 签名验签：用对应 kid 的证书，RS256
    const certs = await getCerts(payload.iss);
    const cert = certs[header.kid];
    if (!cert) throw new BusinessError('未找到匹配的 Google 证书', 400);
    try {
      jwt.verify(idToken, cert, { algorithms: ['RS256'] });
    } catch {
      throw new BusinessError('Google idToken 验签失败', 400);
    }

    return { sub: payload.sub, email: payload.email };
  },
};

export const googleClient = client;
