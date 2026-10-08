import crypto from 'crypto';
import { BusinessError } from './errors';
import { decompressFromBase64 } from 'lz-string';

export interface DecodedRequest {
  cmd: number;
  payload: Record<string, any>;
  token?: string;
  uid?: string;
  serverId?: number | string;
}

/**
 * 解析前端 MKHttp 网关请求（application/json）：
 *   { action: number, data: string(compressToBase64), sign: md5(data+KEY), retry?: boolean }
 *
 * - plain = JSON.parse(decompressFromBase64(data)) = { uid, token, server_id, ...业务参数 }
 * - 验签：md5(data + secret) === sign
 *   （请求侧不允许 sign === key 的绕过，只有响应系统错才用该约定）
 * - uid / token / server_id 为信封字段，剥离后其余作为业务 payload 交给 handler
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

  const { uid, token, server_id, ...payload } = plain;
  return {
    cmd: action,
    payload,
    token: typeof token === 'string' && token ? token : undefined,
    uid: typeof uid === 'string' && uid ? uid : undefined,
    serverId: server_id !== undefined ? server_id : undefined,
  };
}
