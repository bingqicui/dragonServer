/** 解压、验签后的网关请求 */
export interface DecodedRequest {
  cmd: number;
  payload: Record<string, any>;
  token?: string;
  /** 平台账号。0、空串视为未提供 */
  puid?: string;
  /** 请求明文里的 uid，即角色 id。登录和还没有角色时不传 */
  userId?: string;
  /** 目标区服 */
  serverId?: number | string;
}

/** 网关回包信封（与前端 MKGatewayCodec 对齐） */
export interface GatewayResponse {
  code: number;
  action: number;
  data: string;
  error: number;
  sign: string;
}

/** 服务端主动下发的一条推送项 */
export interface PushItem {
  action: number;
  data?: any;
}
