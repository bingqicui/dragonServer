import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectDB } from './utils/db';
import { BusinessError } from './utils/errors';
import gatewayRouter from './protocol/dispatch';

const app = express();
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => res.json({ code: 0, msg: 'ok' }));

// 前端 MKHttp 网关：单 URL + cmd 分发 + 加密信封（详见 plan/前端协议兼容计划.md）
// 所有业务入口统一走 /gateway，不再暴露任何 REST 路由。
app.use('/gateway', gatewayRouter);

// 统一错误处理：业务错误转友好响应；未知错误转 500
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof BusinessError) {
    const status = err.code === 401 ? 401 : 200;
    return res.status(status).json({ code: err.code, msg: err.message });
  }
  console.error('[error]', err);
  return res.status(500).json({ code: 500, msg: '服务器内部错误' });
});

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`🚀 游戏服务器已启动: http://localhost:${PORT}`);
  });
  // 优雅处理端口占用等监听错误：给出人话提示，而不是抛裸栈
  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[错误] 端口 ${PORT} 已被占用：可能已有一个服务器实例在运行。`);
      console.error('       请先关闭它，或在 .env 修改 PORT 后重试。');
    } else {
      console.error('服务器监听失败:', err);
    }
    process.exit(1);
  });
}

start().catch((e) => {
  console.error('启动失败:', e);
  process.exit(1);
});
