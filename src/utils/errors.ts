// 统一业务错误：service 层抛出，由 index.ts 的错误处理中间件捕获并转为统一响应。
// 这样路由层只关心调用 service，无需重复写判断；日后迁移 NestJS 也可直接转为异常过滤器。
export class BusinessError extends Error {
  code: number;
  constructor(message: string, code = 1) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
  }
}

// 系统错误语义码：用于响应 error 字段（与前端约定）。业务错不在此列，统一 code 取负、error=0。
// 具体数值以与前端最终对齐的码表为准；此处为阶段性实现。
export const SYS_ERROR = {
  UNAUTH: -10015, // 未登录 / 无效 token（原 401）
  PROTOCOL: -10004, // 协议不存在（原 4004）
  TAMPER: -1000004, // 签名校验失败 / 篡改（原 4001）
  PARAM: -1000001, // 请求 / 参数非法（原 4000 / 400）
  INTERNAL: 1, // 服务器内部错误（原 500）
} as const;
