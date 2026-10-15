# 打龙游戏服务器 - 开发指南

> **维护状态**：本文档与代码同步维护。最后更新：2026-10-15  
> **相关文档**：[架构文档](./ARCHITECTURE.md) | [协议定义](./PROTOCOL.md)

## 目录

- [1. 快速开始](#1-快速开始)
- [2. 本地开发](#2-本地开发)
- [3. 调试技巧](#3-调试技巧)
- [4. 测试](#4-测试)
- [5. 新增业务功能](#5-新增业务功能)
- [6. 常见问题](#6-常见问题)
- [7. 部署](#7-部署)

---

## 1. 快速开始

### 环境要求

- Node.js ≥ 18
- MongoDB（本地或云服务）
- npm（包管理器）

### 首次安装

```bash
cd serverCode
npm install
```

### 启动开发服务器

```bash
npm run dev
```

或双击 `start-dev.bat`（Windows）。

**一条命令同时启动**：

- 本地 MongoDB（数据在 `../serverApps/mongodb/data`）
- 游戏服务器（`tsx watch src/index.ts`，文件改动自动重启）

**启动日志**：

```
[dev] 检测到残留的 MongoDB（PID 12345），先关闭它，再拉起启动器托管的实例
[dev] 旧 MongoDB 已关闭，27017 已释放 ✓
[dev] 正在拉起本地 MongoDB（数据目录：D:\work\serverApps\mongodb\data）...
[dev] MongoDB 已就绪 ✓
[dev] 启动游戏服务器（tsx watch，文件改动自动重启）...
🚀 游戏服务器已启动: http://localhost:3000
```

**停止服务器**：

- `Ctrl+C` - 一并关闭 MongoDB + 服务器
- 关闭终端窗口 - 自动清理子进程

### 环境变量

创建 `.env` 文件（首次需要）：

```bash
cp .env.example .env
```

**关键配置**：

```bash
# 服务器端口（默认 3000）
PORT=3000

# MongoDB 连接串（默认本地）
MONGO_URI=mongodb://localhost:27017/gameServer

# 用内存数据库（重启清空，仅开发用）
ENABLE_MEMORY_DB=false

# JWT 签名密钥（生产必改）
JWT_SECRET=change_this_secret
JWT_EXPIRES_IN=7d

# 网关签名密钥（与前端对齐，生产必改）
GATEWAY_SIGN_KEY=51E3D400670CC4D9C82A49EE5C1969D1

# autoLogin 返回的网关地址
GATEWAY_PUBLIC_URL=http://192.168.1.100:3000/gateway

# 第三方登录（可选）
WECHAT_APPID=wx1234567890abcdef
WECHAT_SECRET=1234567890abcdef1234567890abcdef
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com

# 第三方登录测试桩（开发用，不联网）
AUTH_STUB=1
```

---

## 2. 本地开发

### 开发脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 一键启动（MongoDB + 服务器热重载） |
| `npm run dev:raw` | 仅启动服务器（需自行启动 MongoDB） |
| `npm run typecheck` | 类型检查（不编译） |
| `npm run build` | 编译到 `dist/`（生产用） |
| `npm start` | 运行编译后的代码（`node dist/index.js`） |

### 启动器环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `MONGO_TAKEOVER` | 27017 已被占用时，先关掉旧 mongod 再拉起 | `1`（启用） |
| `SERVER_TAKEOVER` | 服务器端口已被占用时，先关掉旧服务器再启动 | `1`（启用） |
| `DEV_DRY_RUN` | 只检测、不启动任何进程（排查用） | `0` |
| `MONGO_BIN` | mongod 可执行文件路径 | `../serverApps/mongodb/bin/mongod.exe` |
| `MONGO_DB_PATH` | MongoDB 数据目录 | `../serverApps/mongodb/data` |

**禁用接管**（复用已有服务）：

```bash
MONGO_TAKEOVER=0 npm run dev
```

**排查启动问题**：

```bash
DEV_DRY_RUN=1 npm run dev
```

### 文件监听

`tsx watch` 会监听 `src/` 下所有 `.ts` 文件，改动后自动重启服务器。

**不会触发重启**：

- `.json` 配置文件（需手动重启）
- `node_modules/`、`dist/`

**手动重启**：

在终端输入 `rs` + 回车（`tsx watch` 快捷键）。

### 内存数据库

开发时可使用内存数据库（无需 MongoDB 进程）：

```bash
# .env
ENABLE_MEMORY_DB=true
```

**注意**：

- 重启服务器清空所有数据
- 适合快速联调，不适合持久化测试

---

## 3. 调试技巧

### 健康检查

```bash
curl http://localhost:3000/health
# {"code":0,"msg":"ok"}
```

### 查看日志

服务器会打印所有请求和错误：

```
[info] 收到请求 cmd=10001 (LOGIN)
[info] 登录成功 accountId=... username=test
```

### 调试网关请求

由于网关请求是压缩+签名的，无法直接用 `curl` 测试。

#### 方法 1：用 Node 脚本

```bash
node -e '
const crypto = require("crypto");
const { compressToBase64 } = require("lz-string");
const KEY = "51E3D400670CC4D9C82A49EE5C1969D1";
const plain = {
  uid: "",
  token: "",
  server_id: "",
  loginType: 0,
  username: "test",
  password: "123456"
};
const data = compressToBase64(JSON.stringify(plain));
const sign = crypto.createHash("md5").update(data + KEY).digest("hex");
const body = JSON.stringify({ action: 10001, data, sign, retry: false });
require("http").request(
  {
    host: "localhost",
    port: 3000,
    path: "/gateway",
    method: "POST",
    headers: { "Content-Type": "application/json" }
  },
  r => {
    let s = "";
    r.on("data", d => (s += d));
    r.on("end", () => console.log(s));
  }
).end(body);
'
```

#### 方法 2：用端到端测试

```bash
node e2e_test.js
```

（注意：`e2e_test.js` 当前按旧协议格式，需更新）

#### 方法 3：前端联调

启动前端 Cocos 工程，配置网关地址指向本地：

```typescript
// 前端 GlobalDefine.ts
const APP_MAIN_HOST = 'http://192.168.1.100:3000/gateway';
```

### VS Code 调试

`.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "调试服务器",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev:raw"],
      "console": "integratedTerminal",
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

**步骤**：

1. 先手动启动 MongoDB（或用内存数据库）
2. 按 `F5` 启动调试
3. 在代码里打断点

---

## 4. 测试

### 类型检查

```bash
npm run typecheck
```

**不通过时不要提交代码**。

### 端到端测试

```bash
npm run build
node e2e_test.js
```

**注意**：

- `e2e_test.js` 是**遗留测试文件**，按旧协议格式（`application/x-www-form-urlencoded`），与当前网关不兼容
- 保留仅作历史参考，**不维护，不需要更新**
- 推荐使用前端联调或 Node 脚本测试（见第 3 节"调试网关请求"）

**如需编写新测试**，参考协议格式：

```javascript
const { compressToBase64, decompressFromBase64 } = require('lz-string');
const crypto = require('crypto');

function buildRequest(cmd, payload) {
  const plain = { uid: '', token: '', server_id: '', ...payload };
  const data = compressToBase64(JSON.stringify(plain));
  const sign = crypto.createHash('md5').update(data + KEY).digest('hex');
  return { action: cmd, data, sign, retry: false };
}

function parseResponse(body) {
  const { code, action, data, error, sign } = body;
  if (error !== 0) return { error, message: 'system error' };
  const payload = JSON.parse(decompressFromBase64(data));
  return { code, action, payload };
}
```

### 单元测试（未实现）

当前项目没有单元测试框架。

**建议**：

- 用 Jest / Vitest
- 测试 service 层逻辑（不依赖数据库的纯函数）
- 测试 repository 层（用内存数据库）

---

## 5. 新增业务功能

### 完整流程

以"新增关卡系统"为例。

#### 步骤 1：定义协议号

`src/protocol/cmd.ts`：

```typescript
export const CMD = {
  // ...现有协议
  LEVEL_START: 2001,    // 开始关卡
  LEVEL_FINISH: 2002,   // 完成关卡
} as const;
```

**同步前端**（`assets/scripts/myFramework/netWork/HttpDefine.ts`）：

```typescript
export const MSD_ID = {
  // ...
  LEVEL_START: 2001,
  LEVEL_FINISH: 2002,
};
```

#### 步骤 2：配置表（如需要）

`src/config/levels.json`（已存在）：

```json
{
  "level_1": {
    "id": "level_1",
    "name": "新手村",
    "monsterCount": 5,
    "reward": { "coins": 100, "exp": 50 }
  }
}
```

`src/services/config.service.ts`（已实现）：

```typescript
export const configService = {
  getLevel(id: string): LevelConfig | undefined {
    return cache.levels[id];
  },
};
```

#### 步骤 3：数据模型（如需要）

`src/models/level-progress.model.ts`（新建）：

```typescript
import { Schema, model } from 'mongoose';

const levelProgressSchema = new Schema({
  userId: { type: String, required: true },
  levelId: { type: String, required: true },
  status: { type: String, enum: ['started', 'completed'], required: true },
  startedAt: { type: Date, required: true },
  completedAt: Date,
});

levelProgressSchema.index({ userId: 1, levelId: 1 }, { unique: true });

export const LevelProgress = model('LevelProgress', levelProgressSchema);
```

#### 步骤 4：Repository

`src/repositories/level.repo.ts`（新建）：

```typescript
import { LevelProgress } from '../models/level-progress.model';

export const levelRepo = {
  async startLevel(userId: string, levelId: string) {
    const doc = await LevelProgress.findOneAndUpdate(
      { userId, levelId },
      { status: 'started', startedAt: new Date() },
      { upsert: true, new: true }
    );
    return doc;
  },

  async completeLevel(userId: string, levelId: string) {
    const doc = await LevelProgress.findOneAndUpdate(
      { userId, levelId, status: 'started' },
      { status: 'completed', completedAt: new Date() },
      { new: true }
    );
    return doc;
  },
};
```

#### 步骤 5：Service（核心业务逻辑）

`src/services/level.service.ts`（新建）：

```typescript
import { BusinessError } from '../utils/errors';
import { configService } from './config.service';
import { levelRepo } from '../repositories/level.repo';
import { userRepo } from '../repositories/user.repo';

export const levelService = {
  async startLevel(userId: string, levelId: string) {
    const cfg = configService.getLevel(levelId);
    if (!cfg) throw new BusinessError('关卡不存在', 4000);

    await levelRepo.startLevel(userId, levelId);
    return { success: true, levelName: cfg.name };
  },

  async finishLevel(userId: string, levelId: string) {
    const cfg = configService.getLevel(levelId);
    if (!cfg) throw new BusinessError('关卡不存在', 4000);

    const progress = await levelRepo.completeLevel(userId, levelId);
    if (!progress) throw new BusinessError('关卡未开始或已完成', 4001);

    // 发奖励
    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('角色不存在', 404);

    const newCoins = user.coins + cfg.reward.coins;
    const newExp = user.playerInfo.exp + cfg.reward.exp;

    await userRepo.updateById(userId, {
      coins: newCoins,
      'playerInfo.exp': newExp,
    });

    return {
      success: true,
      reward: cfg.reward,
      coins: newCoins,
      exp: newExp,
    };
  },
};
```

#### 步骤 6：Handler

`src/protocol/handlers/level.ts`（新建）：

```typescript
import { CMD } from '../cmd';
import { requireAuth } from './types';
import { levelService } from '../../services/level.service';

export const levelHandlers = {
  [CMD.LEVEL_START]: async (payload, ctx) => {
    requireAuth(ctx);
    const { levelId } = payload;
    return levelService.startLevel(ctx.userId!, levelId);
  },

  [CMD.LEVEL_FINISH]: async (payload, ctx) => {
    requireAuth(ctx);
    const { levelId } = payload;
    return levelService.finishLevel(ctx.userId!, levelId);
  },
};
```

#### 步骤 7：汇总 Handler

`src/protocol/handlers/index.ts`：

```typescript
import { levelHandlers } from './level';

export const handlers: Record<number, Handler> = {
  ...systemHandlers,
  ...authHandlers,
  ...userHandlers,
  ...weaponHandlers,
  ...zoneHandlers,
  ...levelHandlers, // 新增
};
```

#### 步骤 8：测试

1. 重启服务器（配置表改动需要）
2. 前端调用或用脚本测试：

```javascript
// 开始关卡
const req1 = buildRequest(2001, { token: '<game token>', levelId: 'level_1' });
// 完成关卡
const req2 = buildRequest(2002, { token: '<game token>', levelId: 'level_1' });
```

#### 步骤 9：更新文档

- `PROTOCOL.md` - 新增协议说明
- `ARCHITECTURE.md` - 若涉及架构变动

### 仅修改现有功能

**示例**：修改武器解锁费用。

1. 改 `src/config/weapons.json`
2. 重启服务器
3. 测试

**不需要改代码**（配置驱动）。

---

## 6. 常见问题

### 端口被占用

**错误**：

```
[错误] 端口 3000 已被占用：可能已有一个服务器实例在运行。
```

**解决方案**：

1. 关闭旧服务器进程（任务管理器搜 `node.exe`）
2. 或修改 `.env` 的 `PORT`
3. 或让启动器自动接管（`SERVER_TAKEOVER=1`，默认启用）

### MongoDB 无法启动

**错误**：

```
MongoDB 启动超时，最后输出：
...
```

**排查**：

1. 检查 MongoDB 二进制是否存在：

```bash
ls ../serverApps/mongodb/bin/mongod.exe
```

2. 手动启动 MongoDB：

```bash
../serverApps/mongodb/bin/mongod.exe --dbpath ../serverApps/mongodb/data --port 27017
```

3. 用内存数据库绕过：

```bash
# .env
ENABLE_MEMORY_DB=true
```

### 类型错误

**错误**：

```
src/services/xxx.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.
```

**解决**：

1. 先跑 `npm run typecheck` 确认错误
2. 修改代码满足类型约束
3. 不要用 `// @ts-ignore` 绕过（除非确有必要）

### 签名校验失败

**错误**：

```
{
  "code": 0,
  "action": 10001,
  "data": "",
  "error": -1000004,
  "sign": "51E3D400670CC4D9C82A49EE5C1969D1"
}
```

**原因**：

- 前端签名密钥与后端不一致
- 请求体未压缩或压缩方式错误

**排查**：

1. 检查后端 `.env` 的 `GATEWAY_SIGN_KEY`
2. 检查前端 `GlobalDefine.ts` 的 `GATEWAY_SIGN_KEY`
3. 确认前端用 `LZString.compressToBase64` 压缩

### token 无效

**错误**：

```
{
  "code": 0,
  "action": 10003,
  "data": "",
  "error": -10015,
  "sign": "..."
}
```

**原因**：

- token 过期（默认 7 天）
- token 签名密钥不一致（`JWT_SECRET`）

**解决**：

- 重新登录（cmd 10001）
- 检查 `.env` 的 `JWT_SECRET`

---

## 7. 部署

### 生产环境准备

#### 1. 安装依赖

```bash
npm install --production
```

#### 2. 配置环境变量

创建 `.env.production`：

```bash
PORT=3000
MONGO_URI=mongodb://user:pass@mongo.example.com:27017/gameServer?authSource=admin
JWT_SECRET=<生产密钥，至少 32 位>
JWT_EXPIRES_IN=7d
GATEWAY_SIGN_KEY=<生产密钥，至少 32 位>
GATEWAY_PUBLIC_URL=https://game.example.com/gateway

WECHAT_APPID=wx...
WECHAT_SECRET=...
GOOGLE_CLIENT_ID=...
AUTH_STUB=0
```

**安全检查**：

- ❌ 不要用默认 `JWT_SECRET` / `GATEWAY_SIGN_KEY`
- ❌ 不要把 `.env` 提交 Git
- ✅ 用环境变量注入密钥（Docker、K8s secrets）

#### 3. 编译

```bash
npm run build
```

产物在 `dist/`。

#### 4. 启动

```bash
npm start
# 或
node dist/index.js
```

### 用 PM2（推荐）

#### 安装

```bash
npm install -g pm2
```

#### 启动

```bash
pm2 start dist/index.js --name game-server -i max
```

**参数说明**：

- `--name` - 进程名称
- `-i max` - 集群模式（利用多核）

#### 查看状态

```bash
pm2 status
pm2 logs game-server
```

#### 停止/重启

```bash
pm2 stop game-server
pm2 restart game-server
```

#### 开机自启

```bash
pm2 startup
pm2 save
```

### 用 Docker

`Dockerfile`（示例，需自行创建）：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY dist ./dist
COPY src/config ./src/config

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

**构建**：

```bash
docker build -t game-server .
```

**运行**：

```bash
docker run -d \
  --name game-server \
  -p 3000:3000 \
  -e MONGO_URI=mongodb://mongo:27017/gameServer \
  -e JWT_SECRET=<密钥> \
  game-server
```

### Nginx 反向代理

`/etc/nginx/sites-available/game`：

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**启用 HTTPS**：

```bash
sudo certbot --nginx -d game.example.com
```

### 生产 MongoDB

#### 远程 MongoDB（推荐）

用 MongoDB Atlas / 阿里云 / 腾讯云等托管服务。

**连接串**：

```bash
MONGO_URI=mongodb://user:pass@host1:27017,host2:27017/gameServer?replicaSet=rs0&authSource=admin
```

#### 自建 MongoDB

**启动**：

```bash
mongod --dbpath /data/db --bind_ip_all --auth
```

**创建用户**：

```javascript
use admin
db.createUser({
  user: 'gameAdmin',
  pwd: '<密码>',
  roles: [{ role: 'readWrite', db: 'gameServer' }]
})
```

**连接串**：

```bash
MONGO_URI=mongodb://gameAdmin:<密码>@localhost:27017/gameServer?authSource=admin
```

---

## 相关文档

- [架构文档](./ARCHITECTURE.md) - 分层架构、技术栈、设计决策
- [协议定义](./PROTOCOL.md) - 所有 cmd 定义、请求响应格式
- [前端对接](./FRONTEND_STRUCTURE.md) - Cocos 工程结构、`MSD_ID` 对齐

---

**维护约定**：

- 新增工具/流程后，必须同步更新本文档
- 部署相关改动（Docker、Nginx）需更新对应章节
