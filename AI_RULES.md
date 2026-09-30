# 打龙游戏服务器 - AI 开发规则文档

> 本文档为 AI 辅助开发时必须遵守的规则与约定，基于现有代码框架整理。



***

## 一、技术栈与项目定位



| 项      | 选择                                           |
| ------ | -------------------------------------------- |
| 运行时    | Node.js + TypeScript                         |
| Web 框架 | Express 4                                    |
| 数据库    | MongoDB + Mongoose                           |
| 认证     | JWT（双 token：account /game）                   |
| 密码加密   | bcryptjs                                     |
| 开发启动   | tsx watch + scripts/dev.mjs（一键起 Mongo + 服务器） |
| 包管理    | npm                                          |
| 版本控制   | SVN（非 Git）                                   |

**项目定位**：Cocos Creator 游戏的后端服务器，采用「单网关 + 数字 cmd」协议，**不提供 REST 接口**。



***

## 二、目录结构与分层约定



```
src/

├── index.ts              # 入口：Express 初始化 + 连库 + 挂载 /gateway

├── config/               # 静态配置表 JSON（纯数据资产，启动时全量载入内存，运行期只读）

├── constants/            # 枚举、常量（如 loginType）

├── integrations/         # 第三方平台 SDK 封装（微信、Google 等）

├── middleware/           # Express 中间件（auth.ts）

├── models/               # Mongoose Schema 定义（仅数据结构，不含业务逻辑）

├── protocol/             # 协议层

│   ├── cmd.ts            # 所有协议号常量定义（集中管理，避免魔法数字）

│   ├── dispatch.ts       # 网关入口：解密 → 鉴权 → 分发 → 统一响应

│   └── handlers/         # 按业务域拆分的请求处理器

│       ├── types.ts      # Handler 类型 + requireAuth / requireAccount 守卫

│       ├── index.ts      # 汇总所有 handler 为 Record\<number, Handler>

│       ├── system.ts     # 系统级（心跳等）

│       ├── auth.ts       # 登录相关

│       ├── user.ts       # 玩家档案

│       ├── weapon.ts     # 武器系统

│       └── zone.ts       # 选区

├── repositories/         # 数据访问层（封装 Mongoose 查询，业务层不直接碰 Model）

├── services/              # 业务逻辑层（所有规则、校验、计算都在这里）

├── types/                 # 纯 TS 类型定义 + DTO 转换函数（toXxxRecord）

└── utils/                 # 工具函数（db 连接、crypto 加解密、错误类）
```

### 分层调用规则



```
dispatch → handler → service → repository → model
```



* **handler 层**：极薄，只做参数提取、调用守卫（requireAuth/requireAccount）、转发到 service。**不写业务逻辑**。

* **service 层**：所有业务规则、校验、数值计算都在这里。是核心。

* **repository 层**：只做数据库 CRUD 封装，不写业务规则。业务层通过 repo 访问数据，**不直接调用 Model**。

* **model 层**：只定义 Schema 和索引，不含业务方法。



***

## 三、协议规则（/gateway 单网关）

### 3.1 唯一入口

所有业务请求统一走 `POST /gateway`，**不暴露任何 REST 路由**。

### 3.2 请求格式

明文模式（开发调试用）：



```
{ "cmd": 2, "payload": { ... }, "token": "xxx" }
```

加密模式（生产）：



```
{ "o": "base64(内层JSON)", "s": "MD5(内层JSON + REQUEST\_SECRET)" }
```

### 3.3 响应格式

**永远 HTTP 200**，错误只走 `ErrorCode` 字段，避免前端把逻辑错误当网络故障重试。

成功：



```
{ "ErrorCode": 0, "Payload": { ... }, "t": 1700000000 }
```

失败：



```
{ "ErrorCode": 4001, "Payload": null, "Msg": "错误信息", "t": 1700000000 }
```

### 3.4 新增业务 cmd 的步骤



1. 在 `src/protocol/cmd.ts` 的 `CMD` 常量里加一个新协议号

2. 在对应业务域的 `handlers/xxx.ts` 里加一个 handler 条目

3. handler 内部调用 service 层方法

4. **dispatch.ts 无需任何改动**（自动汇总）

### 3.5 鉴权守卫



| 守卫函数                  | 作用                  | 适用场景            |
| --------------------- | ------------------- | --------------- |
| `requireAuth(ctx)`    | 必须是 game token（已选区） | 游戏内业务：背包、武器、存档等 |
| `requireAccount(ctx)` | 只要有 accountId 即可    | 选区相关：区列表、进入区    |

登录类 cmd（如 cmd=2 登录）**不需要守卫**，由 service 内部处理。



***

## 四、账号与角色体系

### 4.1 双层结构



* **Account（账号）**：跨区共享，存登录凭证（用户名密码 / 第三方 openid）

* **User/Player（区角色）**：每个区独立一份，存游戏数据（金币、武器、userData）

一个 Account 可以在多个区各创建一个独立角色，各区数据完全隔离。

### 4.2 Token 体系



| Token 类型      | 包含字段                                           | 用途                  |
| ------------- | ---------------------------------------------- | ------------------- |
| account token | kind=account, accountId, username              | 登录后、未选区时用，只能查区列表、进区 |
| game token    | kind=game, accountId, userId, username, zoneId | 选区后用，可以操作用户游戏数据     |

### 4.3 登录流程



```
cmd=2 登录（账号密码/微信/Google）→ 拿到 account token + 区列表

cmd=13 获取区列表（account token）

cmd=14 进入指定区 → 拿到 game token

后续所有游戏业务用 game token
```



***

## 五、业务规则（服务器权威）

### 5.1 核心原则

**服务器权威**：所有数值校验、扣费、升级逻辑都在服务端完成，客户端只负责发请求和展示结果。

### 5.2 货币（coins）规则



* 金币**只能由服务端增减**，禁止客户端直接写入

* 存档接口（cmd=1001）里会**强制删除 coins 字段**

* 扣费操作必须用**原子条件更新**（`findOneAndUpdate` + 条件 `{ coins: { $gte: cost } }`），防止并发扣成负数

### 5.3 武器系统规则



* 解锁：扣金币 → 写入 `weapons[id] = { level: 1, unlocked: true }`

* 升级：**只能逐级升**（targetLevel = 当前 level + 1），不能跳级

* 等级上限：由配置表 `maxLevel` 决定

* 费用校验：查配置表，金币不足则拒绝

### 5.4 存档（userData）规则



* userData 是 `Mixed` 类型，客户端可以存任意自定义数据

* 但 `coins` 是受保护字段，客户端传了也会被删掉

* 已知数值字段（如 level、exp）要做非负校验，防止伪造异常数据



***

## 六、配置表规则

### 6.1 配置文件位置



```
src/config/

├── weapons.json    # 武器配置

├── items.json      # 道具配置

├── levels.json     # 关卡配置

└── zones.json      # 区服配置
```

### 6.2 使用约定



* 启动时由 `config.service.ts` 全量读入内存缓存

* 运行期**只读不写**，改配置要重启服务器

* **配置不下发给前端**：前端自带 / CDN 分发，服务器仅用于内部权威校验

* 新增配置表：在 `config/` 加 JSON → 在 `config.service.ts` 加 interface + cache + getter



***

## 七、错误处理规则

### 7.1 统一错误类

所有业务错误用 `BusinessError(message, code)` 抛出：



```
throw new BusinessError('金币不足', 4001);
```



* `code` 是业务错误码，不是 HTTP 状态码

* HTTP 永远返回 200，错误信息走响应体的 `ErrorCode` 和 `Msg`

* handler 层不需要 try-catch，统一由 dispatch 捕获

### 7.2 错误码约定



| 码段   | 含义            |
| ---- | ------------- |
| 0    | 成功            |
| 401  | 未登录 /token 无效 |
| 400  | 参数错误          |
| 4000 | 请求体格式错误       |
| 4001 | 签名校验失败        |
| 4004 | 未知 cmd        |
| 500  | 服务器内部错误       |



***

## 八、代码风格与规范

### 8.1 命名



* 文件：小写 + 点分层，如 `auth.service.ts`、`account.repo.ts`、`user.model.ts`

* 类型 / 接口：大驼峰，如 `PlayerRecord`、`WeaponConfig`

* 常量：大写下划线，如 `STARTER_COINS`、`DEFAULT_ZONE_ID`

* service/repo 导出用对象形式：`export const authService = { ... }`

### 8.2 数据转换



* Mongoose Document → 业务对象：在 `types/xxx.ts` 里写 `toXxxRecord(doc)` 纯函数

* 业务层和 handler 层**只碰 Record 对象**，不直接操作 Mongoose Document

* `_id` 统一转成字符串 `id`

### 8.3 索引与唯一约束



* 所有唯一索引都在 model 层定义

* 建号 / 建角色时要 catch 11000 错误（并发创建重复），做幂等兜底



***

## 九、开发与调试

### 9.1 启动



```
npm run dev          # 一键启动 MongoDB + 服务器（唯一推荐）
```

### 9.2 类型检查



```
npm run typecheck    # tsc --noEmit
```

### 9.3 端到端测试



```
npm run build

node e2e\_test.js     # 自动起内存 MongoDB，跑全流程测试
```

### 9.4 明文调试



```
curl -X POST http://localhost:3000/gateway \\

&#x20; -H "Content-Type: application/x-www-form-urlencoded" \\

&#x20; -d '{"cmd":2,"payload":{"loginType":0,"username":"test","password":"123456"}}'
```



***

## 十、新增业务模块 Checklist

新增一个业务（比如「副本」）时，按这个顺序做：



1. **cmd.ts**：加协议号常量

2. **config/**：如果有配置表，加 JSON 文件

3. **config.service.ts**：加配置 interface + 缓存 + getter

4. **types/**：加业务相关的 DTO 类型

5. **models/**：如果需要新集合，加 Schema

6. **repositories/**：加数据访问层

7. **services/**：加业务逻辑层（核心）

8. **handlers/**：加 handler 条目，写参数提取 + 守卫调用 + 转发 service

9. **e2e\_test.js**：加对应的测试用例

**注意**：dispatch.ts 和 handlers/index.ts 通常不需要改（自动汇总）。



***

## 十一、禁止事项



1. ❌ 不要在 handler 层写业务逻辑（薄转发）

2. ❌ 不要在 service 层直接调 Mongoose Model（走 repository）

3. ❌ 不要在 model 层写业务方法

4. ❌ 不要把 coins 等核心货币暴露给客户端写入

5. ❌ 不要新增 REST 路由，所有业务走 /gateway

6. ❌ 不要在响应里返回非 200 的 HTTP 状态码（业务错误走 ErrorCode）

7. ❌ 不要硬编码 cmd 数字，统一用 CMD 常量

8. ❌ 不要在配置表里存动态数据，配置是只读的