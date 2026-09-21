import { BusinessError } from '../utils/errors';

// 微信小程序登录适配器：把前端拿到的临时登录 code 换成平台唯一 openid。
// 关键点：WECHAT_APPID / WECHAT_SECRET 只在服务端（.env），绝不下发前端；
// session_key 仅留服务端，用于后续解密手机号等敏感操作，绝不返回前端。
export interface WechatClient {
  getOpenidByCode(code: string): Promise<{ openid: string; session_key: string }>;
}

const client: WechatClient = {
  async getOpenidByCode(code: string) {
    // 仅测试用桩：不联网，返回确定性结果（由 e2e 通过 AUTH_STUB=1 开启）
    if (process.env.AUTH_STUB === '1') {
      return { openid: 'stub_wx_' + code, session_key: 'stub_session_' + code };
    }

    const appid = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;
    if (!appid || !secret) {
      throw new BusinessError('微信登录未配置 WECHAT_APPID / WECHAT_SECRET', 500);
    }

    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${appid}&secret=${secret}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.errcode) {
      throw new BusinessError('微信 code2session 失败: ' + (data.errmsg || data.errcode), 500);
    }
    if (!data.openid) {
      throw new BusinessError('微信返回缺少 openid', 500);
    }
    // session_key 仅服务端留存
    return { openid: data.openid, session_key: data.session_key };
  },
};

export const wechatClient = client;
