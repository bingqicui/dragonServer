import crypto from 'crypto';
import { BusinessError } from './errors';
import { decompressFromBase64 } from 'lz-string';
import { DecodedRequest } from '../types/gateway';

export type { DecodedRequest };

/**
 * 解析前端 MKHttp 网关请求（application/json）：
 *   { action: number, data: string(compressToBase64), sign: md5(data+KEY), retry?: boolean }
 *
 * - plain = JSON.parse(decompressFromBase64(data)) = { puid, uid?, token, server_id, g_id?, ...业务参数 }
 * - 验签：md5(data + secret) === sign
 *   （请求侧不允许 sign === key 的绕过，只有响应系统错才用该约定）
 * - puid 是平台账号，uid 是角色 user_id，两者分开，不把 uid 当成 puid
 * - token / server_id / g_id（引导ID，未消费）同为信封字段，剥离后其余交给 handler
 */
export function decodeRequest(body: any, secret: string): DecodedRequest {
  if (body == null || typeof body !== 'object') {
    throw new BusinessError('请求体为空', 4000);
  }

  const { action, data, sign } = body as { action?: unknown; data?: unknown; sign?: unknown };
  if (typeof action !== 'number' || typeof data !== 'string' || typeof sign !== 'string') {
    throw new BusinessError('缺少或非法 action/data/sign', 4004);
  }

  const calc = crypto.createHash('md5').update(data + secret).digest('hex');
  if (calc !== sign) {
    throw new BusinessError('请求签名校验失败', 4001);
  }

  const plainStr = decompressFromBase64(data);
  if (plainStr == null) {
    throw new BusinessError('data 解压失败', 4000);
  }
  let plain: any;
  try {
    plain = JSON.parse(plainStr);
  } catch {
    throw new BusinessError('data 内层 JSON 非法', 4000);
  }
  if (plain == null || typeof plain !== 'object') {
    throw new BusinessError('data 内层结构非法', 4000);
  }

  // g_id 为引导ID，后端暂不消费。0 / "" / null 视为未提供
  const { puid, uid, token, server_id, g_id, ...payload } = plain;
  return {
    cmd: action,
    payload,
    token: typeof token === 'string' && token ? token : undefined,
    puid: presentId(puid),
    userId: presentId(uid),
    serverId: server_id !== undefined ? server_id : undefined,
  };
}

function presentId(value: unknown): string | undefined {
  if (value == null || value === '' || value === 0) return undefined;
  const text = String(value);
  return text && text !== '0' ? text : undefined;
}
