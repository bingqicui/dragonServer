# 打龙游戏服务器 - 架构文档

> **维护状态**：本文档与代码同步维护。最后更新：2026-10-15  
> **相关文档**：[协议定义](./PROTOCOL.md) | [开发指南](./DEVELOPMENT.md) | [前端对接](./FRONTEND_STRUCTURE.md)

## 目录

- [1. 系统定位](#1-系统定位)
- [2. 技术栈](#2-技术栈)
- [3. 分层架构](#3-分层架构)
- [4. 目录结构](#4-目录结构)
- [5. 数据模型](#5-数据模型)
- [6. 认证与授权](#6-认证与授权)
- [7. 配置管理](#7-配置管理)
- [8. 关键设计决策](#8-关键设计决策)

---

## 1. 系统定位

本项目是 Cocos Creator 游戏《打龙》的 Node.js 后端服务器。

### 核心特点

- **单网关架构**：所有业务请求走 `POST /gateway`，不提供 REST API
- **压缩信封协议**：LZString 压缩 + MD5 签名，与前端 MKHttp 对齐
- **数字路由**：按 `cmd` 数字分发到对应 handler（前端 `MSD_ID` 同步）
- **服务器权威**：核心数值（金币、武器升级）服务端计算并校验

### 非 REST 的原因

前端使用自研框架 MKFramework，历史上采用单 URL + 数字 action 的协议方案：

1. 客户端只需配置一个网关地址，无需管理多个 endpoint
2. 所有请求统一压缩、签名、加密，减少重复代码
3. 前端按数字 action 路由回调，无需解析 URL path

---

## 2. 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥18 | 运行时 |
| TypeScript | ^5.5 | 开发语言，strict 模式 |
| Express | ^4.19 | HTTP 框架 |
| MongoDB | - | 数据库（本地 27017 / 云服务） |
| Mongoose | ^8.5 | ODM |
| JWT | jsonwebtoken ^9.0 | 认证 token |
| bcryptjs | ^2.4 | 密码加密 |
| LZ-String | ^1.5 | 信封压缩（与前端对齐） |
| tsx | ^4.16 | 开发热重载 |

---

## 3. 分层架构

### 调用链

```
HTTP Request
  ↓
index.ts (Express 入口)
  ↓
protocol/dispatch.ts (解密、验 token、查表分发)
  ↓
protocol/handlers/*.ts (薄转发层：取参、守卫、调 service)
  ↓
services/*.ts (业务核心：规则、校验、数值计算)
  ↓
repositories/*.ts (数据访问：CRUD、Document→Record 转换)
  ↓
models/*.ts (Mongoose Schema + 索引)
  ↓
MongoDB
```

### 各层职责

#### 1. `index.ts` - 入口层

- Express 初始化、CORS、JSON 解析
- 连接数据库（`connectDB()`）
- 挂载路由：
  - `GET /health` - 健康检查
  - `GET /sdk/sdkDev.php` - 兼容前端 LoginScene 的 PHP 自动登录（明文，非网关信封）
  - `POST /gateway` - **所有业务请求**
- 统一错误处理中间件

#### 2. `protocol/dispatch.ts` - 网关分发层

**输入**：Express Request，body = `{ action, data, sign, retry? }`

**处理流程**：

1. `decodeRequest()` - 解密信封：
   - 验签：`md5(data + GATEWAY_SIGN_KEY) === sign`
   - 解压：`LZString.decompressFromBase64(data)` → JSON
   - 提取信封字段：`puid, token, server_id` → 剥离到 `ctx`
   - 其余字段 → `payload` 交给 handler

2. 查 `handlers[cmd]`，不存在抛 4004

3. 鉴权（如有 token）：
   - `authService.verifyToken(token)` → 填充 `ctx.accountId / userId / kind`
   - 无效 token 清空 ctx，由守卫决定是否 401

4. `runWithStore(() => handler(payload, ctx))` - AsyncLocalStorage 包裹

5. `finalizeResponse()` - 构造响应信封：
   - 成功：`data = LZString.compressToBase64(JSON.stringify(result))`
   - 签名：`sign = md5(data + KEY)`
   - 附加推送（如 10002 角色档案）

6. 错误处理：
   - `BusinessError` → 分类为业务错（`code<0`）或系统错（`error` 数字码）
   - **永远 HTTP 200**（避免前端把逻辑错误当网络故障重试）

**输出**：`{ code, action, data, error, sign }` 或 `[主回包, ...推送]`

**关键点**：

- 新增 cmd **不用修改 `dispatch.ts`**（自动从 `handlers` 对象查表）
- 鉴权在这里完成，handler 层只需调守卫

#### 3. `protocol/handlers/*.ts` - Handler 层

**极薄转发层**，一个 handler 通常只有 5-10 行：

```typescript
import { CMD } from '../cmd';
import { requireAuth } from './types';
import { weaponService } from '../../services/weapon.service';

export const weaponHandlers = {
  [CMD.WEAPON_UNLOCK]: async (payload, ctx) => {
    requireAuth(ctx); // 守卫：必须已选区
    const { weaponId } = payload;
    return weaponService.unlockWeapon(ctx.userId!, weaponId);
  },
};
```

**职责**：

- 从 `payload` 提取参数（解构赋值）
- 调用守卫函数：`requireAuth(ctx)` / `requireAccount(ctx)`
- 转发给 service 层
- **禁止写业务逻辑**

**守卫函数**（`handlers/types.ts`）：

- `requireAuth(ctx)` - 必须 `kind==='game'` 且有 `userId`（游戏内业务）
- `requireAccount(ctx)` - 只要有 `accountId`（选区、区列表等）

**汇总**（`handlers/index.ts`）：

```typescript
export const handlers: Record<number, Handler> = {
  ...systemHandlers,  // 心跳
  ...authHandlers,    // 登录
  ...userHandlers,    // 角色信息、存档
  ...weaponHandlers,  // 武器解锁/升级/穿戴/卸下
  ...zoneHandlers,    // 区服列表、选区
};
```

新增业务：在对应文件加一个 `[CMD.XXX]: async (payload, ctx) => ...` 即可。

#### 4. `services/*.ts` - 业务逻辑层

**核心层**，所有规则、校验、数值计算都在这里。

**示例**（武器升级）：

```typescript
export const weaponService = {
  async upgradeWeapon(userId: string, weaponId: string, targetLevel: number) {
    const user = await userRepo.findById(userId);
    if (!user) throw new BusinessError('角色不存在', 404);

    const weapon = user.weapons?.[weaponId];
    if (!weapon?.unlocked) throw new BusinessError('武器未解锁', 4001);

    const cfg = configService.getWeapon(weaponId);
    if (!cfg) throw new BusinessError('武器配置不存在', 4000);

    // 规则：只能逐级升
    if (targetLevel !== weapon.level + 1) {
      throw new BusinessError('只能逐级升级', 4002);
    }
    if (targetLevel > cfg.maxLevel) {
      throw new BusinessError('已达最大等级', 4003);
    }

    const cost = cfg.upgradeCost[String(targetLevel)]?.coins || 0;

    // 原子扣费
    const updated = await userRepo.updateAtomic(
      userId,
      { [`weapons.${weaponId}.level`]: targetLevel },
      { coins: { $gte: cost } }
    );
    if (!updated) throw new BusinessError('金币不足或并发冲突', 4001);

    return { success: true, newLevel: targetLevel };
  },
};
```

**规则**：

- 不直接 `import` Model，只调 repository
- 抛 `BusinessError(message, code)` 表示业务错误
- 扣费必须用 `updateAtomic` 条件更新（防并发）

#### 5. `repositories/*.ts` - 数据访问层

**职责**：

- 封装 Mongoose CRUD
- Document → Record 转换（`toXxxRecord`）
- 处理并发创建的幂等（11000 错误）

**示例**：

```typescript
export const userRepo = {
  async findById(id: string): Promise<PlayerRecord | null> {
    const doc = await User.findById(id);
    return doc ? toPlayerRecord(doc) : null;
  },

  async updateAtomic(
    userId: string,
    update: any,
    condition: any = {}
  ): Promise<PlayerRecord | null> {
    const doc = await User.findOneAndUpdate(
      { _id: userId, ...condition },
      { $set: update, $inc: { coins: -cost } },
      { new: true }
    );
    return doc ? toPlayerRecord(doc) : null;
  },
};
```

**关键**：

- 业务层和 handler 层**只碰 Record 对象**（纯 JSON），不操作 Mongoose Document
- `_id` 统一转成字符串 `id`

#### 6. `models/*.ts` - 数据模型层

**职责**：

- 定义 Mongoose Schema
- 定义索引
- 启动时迁移逻辑（`migrate.ts`）

**禁止**：

- 不写业务方法（如 `userSchema.methods.upgrade = ...`）
- 不写实例方法（业务逻辑归 service）

---

## 4. 目录结构

```
serverCode/
├── src/
│   ├── index.ts                  # 入口
│   ├── config/                   # 静态配置表 JSON（启动时载入内存，运行期只读）
│   │   ├── weapons.json          # 武器配置
│   │   ├── items.json            # 道具配置
│   │   ├── levels.json           # 关卡配置
│   │   └── zones.json            # 区服配置
│   ├── constants/                # 枚举、常量
│   │   └── loginType.ts
│   ├── integrations/             # 第三方 SDK 封装（微信、Google）
│   │   ├── wechat.ts
│   │   └── google.ts
│   ├── middleware/               # Express 中间件
│   │   └── auth.ts               # Bearer JWT（当前未挂载，网关鉴权在 dispatch 内）
│   ├── models/                   # Mongoose Schema
│   │   ├── account.model.ts      # 账号（跨区）
│   │   ├── user.model.ts         # 角色（区内）
│   │   └── migrate.ts            # 启动迁移
│   ├── protocol/                 # 协议层
│   │   ├── cmd.ts                # 协议号常量（CMD）
│   │   ├── dispatch.ts           # 网关入口
│   │   ├── handlers/             # Handler 集合
│   │   │   ├── types.ts          # Handler 类型、守卫函数
│   │   │   ├── index.ts          # 汇总所有 handler
│   │   │   ├── system.ts         # 心跳
│   │   │   ├── auth.ts           # 登录
│   │   │   ├── user.ts           # 角色信息、存档
│   │   │   ├── weapon.ts         # 武器系统
│   │   │   └── zone.ts           # 选区
│   │   ├── response.ts           # 推送收尾（10002 角色档案）
│   │   └── roleArchive.ts        # 角色档案生成
│   ├── repositories/             # 数据访问层
│   │   ├── account.repo.ts
│   │   └── user.repo.ts
│   ├── services/                 # 业务逻辑层（核心）
│   │   ├── auth.service.ts       # 登录、token 签发
│   │   ├── config.service.ts     # 配置表缓存
│   │   ├── user.service.ts       # 角色档案、存档
│   │   ├── weapon.service.ts     # 武器解锁/升级
│   │   ├── zone.service.ts       # 区服列表、选区
│   │   └── role/                 # 旧角色相关（已合并到 user.service）
│   ├── types/                    # TS 类型定义 + toXxxRecord 转换
│   │   ├── player.ts
│   │   ├── account.ts
│   │   ├── auth.ts
│   │   ├── weapon.ts
│   │   ├── zone.ts
│   │   ├── gateway.ts
│   │   ├── protocol.ts
│   │   └── index.ts
│   └── utils/                    # 工具
│       ├── db.ts                 # 连库 + 迁移
│       ├── crypto.ts             # 信封解密、验签
│       ├── gateway.ts            # 信封构造
│       ├── errors.ts             # BusinessError、SYS_ERROR
│       └── requestContext.ts     # AsyncLocalStorage（10002 推送用）
├── scripts/
│   └── dev.mjs                   # 开发一键启动器（MongoDB + tsx watch）
├── package.json
├── tsconfig.json
├── .env.example                  # 环境变量示例（.env 不提交）
├── .gitignore
├── e2e_test.js                   # 端到端测试
├── start-dev.bat                 # Windows 快捷启动
├── start-mongo.bat               # 单独启动 MongoDB
├── README.md                     # 快速开始（面向开发者）
├── ARCHITECTURE.md               # 本文档
├── PROTOCOL.md                   # 协议定义
├── DEVELOPMENT.md                # 开发指南
├── FRONTEND_STRUCTURE.md         # 前端工程说明
└── AIDoc/                        # AI 辅助文档（部分过时，以当前 src/ 为准）
    ├── 项目框架.md
    └── 执行文档.md
```

---

## 5. 数据模型

### 双层账号体系

```
Account (账号，跨区)
  ├── username (唯一)
  ├── passwordHash (bcrypt)
  ├── thirdParties[] (微信/Google openid，联合唯一)
  └── platformPuid (数字 ID，自增)

User (角色，区内)
  ├── accountId (关联 Account)
  ├── zoneId (区服 ID)
  ├── username (= Account.username，冗余便于查询)
  ├── coins (金币，服务器权威)
  ├── userData (Mixed，客户端自定义数据)
  ├── weapons (Mixed，武器状态)
  ├── playerInfo (内嵌文档)
  │   ├── userName
  │   ├── level
  │   └── exp
  └── (accountId + zoneId) 联合唯一
```

**设计要点**：

1. **跨区共享账号**：一个 Account 可以在多个区各创建一个独立角色
2. **数据隔离**：各区 User 完全独立，金币、武器等不互通
3. **冗余字段**：User.username 冗余，避免每次查 Account（可考虑优化为联表查询）
4. **迁移兼容**：旧版 User 包含 passwordHash / thirdParties，`migrate.ts` 启动时自动拆分到 Account

### 配置表（静态数据）

```
WeaponConfig (武器)
  ├── id (字符串)
  ├── name
  ├── maxLevel
  ├── unlockCost { coins }
  ├── upgradeCost { [level]: { coins } }
  └── attributes { [level]: { attack } }

ItemConfig (道具)
  ├── id
  ├── name
  ├── type
  ├── effect?
  └── sellPrice?

LevelConfig (关卡)
  ├── id
  ├── name
  ├── monsterCount
  └── reward { coins, exp }

ZoneConfig (区服)
  ├── id (数字)
  ├── name
  └── status (open | maintenance | closed)
```

**加载机制**：

- `config.service.ts` 启动时从 `src/config/*.json` 读入内存缓存
- 运行期**只读**，改配置要重启服务器
- **不下发给前端**（前端自带 / CDN 分发），服务器仅内部权威校验

---

## 6. 认证与授权

### 双 Token 体系

| Token 类型 | 载荷 | 用途 | 示例场景 |
|---|---|---|---|
| **account** | `accountId`, `username` | 登录后、未选区 | 区列表(cmd 13)、选区(cmd 14) |
| **game** | `accountId`, `userId`, `username`, `zoneId` | 选区后、游戏内 | 角色信息、背包、武器、存档 |

**密钥**：环境变量 `JWT_SECRET`（默认 `change_this_secret`，生产必改）  
**过期时间**：`JWT_EXPIRES_IN`（默认 `7d`）

### 登录流程

```
┌─────────┐
│ 前端启动 │
└────┬────┘
     │
     ├─ cmd 10001 登录 (loginType 0 账号密码 / 1 微信 / 2 Google)
     │    ↓
     │  返回 account token + 区列表 + 默认区的 gameToken
     │
     ├─ cmd 13 获取区列表 (account token)
     │    ↓
     │  返回 [{ id, name, hasRole, status }]
     │
     ├─ cmd 14 选区进入 (account token + zoneId)
     │    ↓
     │  返回 game token + 角色基础信息
     │    ↓
     ├─ cmd 10003 拉取完整角色信息 (game token)
     │    ↓
     │  返回 { playerInfo, userData, serverTime }
     │
     └─ 后续所有游戏业务用 game token
```

**兼容旧协议**：

- cmd 10001 现在会**同时返回** `gameToken`（默认 1 区），前端可以不再调 cmd 14
- 旧 token（有 `userId`、无 `kind`）按 `game` 处理

### 鉴权实现

**位置**：`protocol/dispatch.ts`

```typescript
if (decoded.token) {
  try {
    const p = authService.verifyToken(decoded.token);
    ctx.kind = p.kind;
    ctx.accountId = p.accountId;
    ctx.username = p.username;
    if (p.kind === 'game') ctx.userId = p.userId;
  } catch {
    // token 无效：置空，由守卫抛 401
  }
}
```

**守卫函数**（`handlers/types.ts`）：

```typescript
export function requireAuth(ctx: Ctx) {
  if (ctx.kind !== 'game' || !ctx.userId) {
    throw new BusinessError('未登录或未选区', 401);
  }
}

export function requireAccount(ctx: Ctx) {
  if (!ctx.accountId) {
    throw new BusinessError('未登录', 401);
  }
}
```

### 第三方登录

| 平台 | loginType | 流程 | 环境变量 |
|---|---|---|---|
| 微信 | 1 | code → openid（服务端换）| `WECHAT_APPID`, `WECHAT_SECRET` |
| Google | 2 | idToken → sub（服务端验签 RS256）| `GOOGLE_CLIENT_ID` |

**测试桩**：环境变量 `AUTH_STUB=1` 时不联网，返回确定性测试数据。

---

## 7. 配置管理

### 配置文件

| 文件 | 内容 | 示例 |
|---|---|---|
| `src/config/weapons.json` | 武器配置（解锁费用、升级费用、属性） | `{ "sword_01": { "maxLevel": 5, ... } }` |
| `src/config/items.json` | 道具配置（效果、售价） | `{ "key_bronze": { "type": "key", ... } }` |
| `src/config/levels.json` | 关卡配置（怪物数、奖励） | `{ "level_1": { "reward": { "coins": 100 } } }` |
| `src/config/zones.json` | 区服配置（状态） | `{ "1": { "name": "初入幻想", "status": "open" } }` |

### 环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `PORT` | 服务器端口 | `3000` |
| `MONGO_URI` | MongoDB 连接串 | `mongodb://localhost:27017/gameServer` |
| `ENABLE_MEMORY_DB` | 用内存数据库（重启清空） | `false` |
| `JWT_SECRET` | JWT 签名密钥 | `change_this_secret` |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `GATEWAY_SIGN_KEY` | 网关信封签名密钥 | `51E3D400670CC4D9C82A49EE5C1969D1` |
| `GATEWAY_PUBLIC_URL` | autoLogin 返回的网关地址 | `http://localhost:3000/gateway` |
| `WECHAT_APPID` / `WECHAT_SECRET` | 微信登录 | - |
| `GOOGLE_CLIENT_ID` | Google 登录 | - |
| `AUTH_STUB` | 第三方登录测试桩 | `0` |

**注意**：

- `.env` 文件不提交 Git（已加入 `.gitignore`）
- 生产环境必须修改 `JWT_SECRET` 和 `GATEWAY_SIGN_KEY`

---

## 8. 关键设计决策

### 为什么是单网关而非 REST API？

**原因**：

1. **前端遗留架构**：Cocos 项目使用自研 MKFramework，历史上采用单 URL + 数字 action 的协议方案
2. **统一加密签名**：所有请求走同一条管道，便于统一压缩、签名、加密
3. **前端路由简单**：前端按 `action` 数字路由回调，无需解析 URL path
4. **减少配置**：客户端只需配置一个网关地址

**权衡**：

- **优点**：前端代码简单，所有请求统一处理
- **缺点**：不符合 RESTful 规范，调试时需解压信封，无法直接用浏览器/curl 测试

### 为什么响应永远 HTTP 200？

**原因**：

前端 MKHttp 的重试逻辑：

- HTTP 非 200 → 认为网络故障 → 自动重试（用户无感知）
- HTTP 200 + `code<0` → 认为业务失败 → 弹窗提示

如果服务器返回 HTTP 401/403，前端会把登录失败当成网络故障反复重试，导致：

- 无意义的流量（每次都 401）
- 用户体验差（一直转圈，不提示密码错误）

**解决方案**：

- 所有错误都返回 HTTP 200
- 业务错误：`{ code: <负数>, error: 0, data: { message: "密码错误" } }`
- 系统错误：`{ code: 0, error: <数字码>, data: "" }` （如 `-10015` 触发前端强制退出）

### 为什么配置不下发给前端？

**原因**：

1. **安全考虑**：服务端配置可能包含掉率、经济系数等敏感数据
2. **版本控制**：前端资源包含配置，热更由客户端 CDN 分发，无需服务器参与
3. **减少流量**：配置表可能较大（数百 KB），每次登录下发浪费带宽
4. **服务器权威**：服务端仅用配置做校验（如解锁费用），不信任客户端传来的数值

**例外**：

- cmd 10010（背包）会下发武器配置（`configService.getAllWeapons()`），历史遗留，待优化

### 为什么金币只能服务端修改？

**原因**：

- **防作弊**：客户端可被破解，金币不能信任客户端传来的值
- **经济平衡**：所有金币来源（关卡奖励、任务）和消耗（解锁、升级）需服务端控制

**实现**：

- 存档接口（cmd 15 / 1001）强制 `delete data.coins`
- 扣费用原子条件更新：`{ $inc: { coins: -cost }, $gte: { coins: cost } }`（并发安全）

### 为什么要 AsyncLocalStorage？

**用途**：

- `requestContext.ts` 用 `AsyncLocalStorage` 记录本次请求是否修改了 playerInfo
- `response.ts` 收尾时检查，若有修改则附加一条 10002 推送（角色档案）

**原因**：

- handler / service 层不需要显式传递"是否推送"的标志
- 多个 service 调用（如武器解锁 + 任务完成）可能都改 playerInfo，统一在收尾时判断

**当前状态**：

- 代码已实现但未完全接线（`roleArchive.ts` 的 `PlayerArchive` 类型缺失）
- 生产环境暂不推送 10002，待前端对齐后启用

---

## 相关文档

- [协议定义](./PROTOCOL.md) - 所有 cmd 定义、请求响应格式、错误码
- [开发指南](./DEVELOPMENT.md) - 如何启动、调试、测试、新增业务
- [前端对接](./FRONTEND_STRUCTURE.md) - Cocos 工程结构、`MSD_ID` 对齐

---

**维护约定**：

每次修改架构相关代码（分层、路由、鉴权、配置等），必须同步更新本文档。

- 新增 cmd → 更新 `PROTOCOL.md`
- 修改分层规则 → 更新本文档
- 新增工具/流程 → 更新 `DEVELOPMENT.md`
