import crypto from 'crypto';
import { BusinessError } from './errors';

export interface DecodedRequest {
  cmd: number;
  payload: any;
  token?: string;
  resVer?: string;
}

/**
 * 解析前端 MKHttp 请求体，兼容两种形态：
 * 1) 明文：body 直接是 { cmd, payload, token, resVer, isDevVersion }
 * 2) 加密：body 是 { o: base64(UTF8(JSON(信封))), s: MD5(JSON(信封) + secret) }
 *
 * 加密算法对齐前端 MKCodeEncry：
 * - Base64 用标准字母表，与 Node Buffer 等价；
 * - MD5 为标准 RFC1321，与 crypto 等价。
 * 因此这里用 Buffer + crypto 对称实现，无需移植前端代码。
 */
export function decodeRequest(raw: string, secret: string): DecodedRequest {
  if (!raw || typeof raw !== 'string') {
    throw new BusinessError('请求体为空', 4000);
  }

  let env: any;
  try {
    env = JSON.parse(raw);
  } catch {
    throw new BusinessError('请求体不是合法 JSON', 4000);
  }

  let inner: any;
  if (env && typeof env.o === 'string' && typeof env.s === 'string') {
    // 加密分支：o 解 base64 得到内层 JSON 串，s 为签名
    const jsonStr = Buffer.from(env.o, 'base64').toString('utf8');
    const expect = crypto.createHash('md5').update(jsonStr + secret).digest('hex');
    if (expect !== env.s) {
      throw new BusinessError('请求签名校验失败', 4001);
    }
    try {
      inner = JSON.parse(jsonStr);
    } catch {
      throw new BusinessError('内层数据解析失败', 4000);
    }
  } else {
    // 明文分支（前端 isEncrp=false）
    inner = env;
  }

  if (typeof inner?.cmd !== 'number') {
    throw new BusinessError('缺少或非法 cmd', 4000);
  }

  const token =
    typeof inner.token === 'string' && inner.token ? inner.token : undefined;

  return {
    cmd: inner.cmd,
    payload: inner.payload && typeof inner.payload === 'object' ? inner.payload : {},
    token,
    resVer: typeof inner.resVer === 'string' ? inner.resVer : undefined,
  };
}
