// 登录方式枚举：由服务器自定义，前端按数值传参。
// 设计原则：数字枚举，与前端旧 LoginType 风格一致，但数值由我们自己掌控；
// 10+ 段预留给聚合 SDK（木风/电魂/叶子戏等），将来加渠道只加一个枚举值，不改动已有分支。
export enum LoginType {
  ACCOUNT = 0, // 账号密码登录（走网关 cmd=2，loginType:0）
  WECHAT = 1, // 微信小程序
  GOOGLE = 2, // Google Play
  // —— 预留聚合 SDK（各家协议不同，未来直接加 case，不影响已有逻辑）——
  MU_FENG = 10, // 木风 / 叶子戏
  DIAN_HUN = 11, // 电魂
}

// loginType -> 平台 provider（用于 user.thirdParties 存储与查/建，DB 内用字符串标识）
export const LOGIN_TYPE_PROVIDER: Record<number, string> = {
  [LoginType.ACCOUNT]: 'account',
  [LoginType.WECHAT]: 'wechat',
  [LoginType.GOOGLE]: 'google',
  [LoginType.MU_FENG]: 'muFeng',
  [LoginType.DIAN_HUN]: 'dianHun',
};

// 支持「第三方登录」的 loginType（账号密码走网关 cmd=2 分流，不在此列）
export const THIRD_PARTY_LOGIN_TYPES = [
  LoginType.WECHAT,
  LoginType.GOOGLE,
  LoginType.MU_FENG,
  LoginType.DIAN_HUN,
];
