import crypto from 'crypto';
import { compressToBase64 } from 'lz-string';

// 网关签名密钥：与前端 GATEWAY_SIGN_KEY / getRequestSecret() 一致（GlobalDefine.ts:26）。
// 与请求侧信封密钥(REQUEST_SECRET)相互独立，勿混用。
const GATEWAY_SIGN_KEY = process.env.GATEWAY_SIGN_KEY || '51E3D400670CC4D9C82A49EE5C1969D1';

export { GATEWAY_SIGN_KEY };

// 与前端 MKGatewayCodec / _finishGateway 完全对齐：
// - 成功：data = LZString.compressToBase64(JSON.stringify(payload))，sign = md5(data + KEY)
// - 系统错：data = ""，sign = 密钥本身（前端 verifyGatewaySign 允许 sign === key）
export interface GatewayResponse {
  code: number;
  action: number;
  data: string;
  error: number;
  sign: string;
}

function signData(data: string): string {
  return crypto.createHash('md5').update(data + GATEWAY_SIGN_KEY).digest('hex');
}

export function buildResponse(input: {
  code: number;
  action: number;
  data: unknown;
  error: number;
}): GatewayResponse {
  if (input.error !== 0) {
    // 系统错误：data 为空，sign 直接用密钥本身（前端 verifyGatewaySign 放行）
    return { code: 0, action: input.action, data: '', error: input.error, sign: GATEWAY_SIGN_KEY };
  }
  const compressed = compressToBase64(JSON.stringify(input.data ?? {}));
  return { code: input.code, action: input.action, data: compressed, error: 0, sign: signData(compressed) };
}
