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
