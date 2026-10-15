# 打龙游戏服务器 - 协议定义

> **维护状态**：本文档与代码同步维护。最后更新：2026-10-15  
> **相关文档**：[架构文档](./ARCHITECTURE.md) | [开发指南](./DEVELOPMENT.md)

## 目录

- [1. 网关协议格式](#1-网关协议格式)
- [2. 协议号定义](#2-协议号定义)
- [3. 错误码](#3-错误码)
- [4. 协议详细说明](#4-协议详细说明)
- [5. 前后端对齐规则](#5-前后端对齐规则)

---

## 1. 网关协议格式

### 唯一入口

```
POST /gateway
Content-Type: application/json
```

### 请求信封

```json
{
  "action": 10001,
  "data": "<LZString.compressToBase64(JSON.stringify(明文))>",
  "sign": "<md5(data + GATEWAY_SIGN_KEY)>",
  "retry": false
}
```

**明文结构**（解压 `data` 后）：

```json
{
  "puid": "",
  "token": "",
  "server_id": 1,
  "g_id": 0,
  "...业务参数": "..."
}
```

**信封字段说明**：

| 字段 | 类型 | 说明 | 提取位置 |
|---|---|---|---|
| `action` | number | 协议号（cmd） | 外层信封 |
| `data` | string | 压缩的明文 JSON | 外层信封 |
| `sign` | string | md5(data + KEY) | 外层信封 |
| `retry` | boolean? | 是否重试（前端用） | 外层信封（后端暂不消费） |
| `puid` | string? | 平台账号 ID | 明文信封字段，剥离到 `ctx` |
| `token` | string? | JWT 认证 token | 明文信封字段，剥离到 `ctx` |
| `server_id` | number? | 区服 ID | 明文信封字段，剥离到 `ctx.serverId` |
| `g_id` | number? | 引导 ID（后端暂不消费） | 明文信封字段 |
| 其余字段 | any | 业务参数 | 进入 handler 的 `payload` |

**签名验证**：

```javascript
const GATEWAY_SIGN_KEY = process.env.GATEWAY_SIGN_KEY || '51E3D400670CC4D9C82A49EE5C1969D1';
const calculated = md5(data + GATEWAY_SIGN_KEY);
if (calculated !== sign) throw Error('签名校验失败');
```

**注意**：

- 请求侧**不允许** `sign === GATEWAY_SIGN_KEY` 绕过验证（只有响应系统错时才用该约定）
- `puid`、`uid`（旧名）、`token`、`server_id`、`g_id` 是信封字段，剥离后不进 `payload`

### 响应信封

**永远 HTTP 200**，返回 JSON 对象或数组（有推送时）。

#### 成功响应

```json
{
  "code": 0,
  "action": 10001,
  "data": "<LZString.compressToBase64(JSON.stringify(业务数据))>",
  "error": 0,
  "sign": "<md5(data + GATEWAY_SIGN_KEY)>"
}
```

**解压 `data` 后**：

```json
{
  "token": "eyJhbGc...",
  "accountId": "6501a2b3c4d5e6f7g8h9i0j1",
  "username": "test",
  "zones": [...]
}
```

#### 业务失败响应

```json
{
  "code": -4001,
  "action": 10001,
  "data": "<压缩后的 { message: '密码错误' }>",
  "error": 0,
  "sign": "<md5(data + KEY)>"
}
```

前端判断：`code < 0` 为业务失败，弹窗提示 `message`。

#### 系统错误响应

```json
{
  "code": 0,
  "action": 10001,
  "data": "",
  "error": -10015,
  "sign": "51E3D400670CC4D9C82A49EE5C1969D1"
}
```

**特殊约定**：

- `error !== 0` 时，`data` 为空串，`sign` 直接用**密钥原文**（前端 `verifyGatewaySign` 允许 `sign === key`）
- 前端判断：`error === -10015` 触发强制退出（token 失效）

#### 带推送的响应（数组）

```json
[
  {
    "code": 0,
    "action": 10003,
    "data": "<主回包>",
    "error": 0,
    "sign": "..."
  },
  {
    "code": 0,
    "action": 10002,
    "data": "<角色档案推送>",
    "error": 0,
    "sign": "..."
  }
]
```

**推送场景**：

- 10002 - 角色档案（修改 playerInfo 时自动附加）
- 未来：红点变化、道具获得等

---

## 2. 协议号定义

### 协议号表

| CMD 常量 | 数字 | 说明 | 需要 token | 守卫 | Handler 文件 |
|---|---|---|---|---|---|
| `HEART_REQ` | 10000 | 心跳请求 | 否 | 无 | `system.ts` |
| `LOGIN` | 10001 | 登录/取 token | 否 | 无 | `auth.ts` |
| `ROLE_ARCHIVE_PUSH` | 10002 | 角色档案推送（仅服务端下发，不是请求） | - | - | - |
| `ROLE_INFO_REQ` | 10003 | 拉取角色信息 | 是 | `requireAuth` | `user.ts` |
| `BAG` | 10010 | 背包/武器状态全量 | 是 | `requireAuth` | `weapon.ts` |
| `SAVE_INFO` | 10012 | 保存临时档 | 是 | `requireAuth` | `user.ts` |
| `GET_SAVE_INFO` | 10013 | 读取临时档 | 是 | `requireAuth` | `user.ts` |
| `WEAPON_UNLOCK` | 8 | 武器解锁 | 是 | `requireAuth` | `weapon.ts` |
| `WEAPON_UPGRADE` | 9 | 武器升级 | 是 | `requireAuth` | `weapon.ts` |
| `WEAPON_EQUIP` | 16 | 武器穿戴 | 是 | `requireAuth` | `weapon.ts` |
| `WEAPON_UNEQUIP` | 17 | 武器卸下 | 是 | `requireAuth` | `weapon.ts` |
| `USER_DATA_SET` | 15 | 保存 userData（武器升级/穿戴/卸下的落库点） | 是 | `requireAuth` | `user.ts` |
| `ZONE_LIST` | 13 | 区服列表 | 是 | `requireAccount` | `zone.ts` |
| `ZONE_ENTER` | 14 | 选区进入 | 是 | `requireAccount` | `zone.ts` |
| `ROLE_GUIDE_RECORD` | 1001 | 新手引导进度上报 | 是 | `requireAuth` | `user.ts` |
| `RED_INFO_ON_LOGIN` | 100001 | 红点全量拉取（登录时） | 是 | `requireAuth` | `user.ts` |

### 代码位置

`src/protocol/cmd.ts`：

```typescript
export const CMD = {
  LOGIN: 10001,
  ROLE_ARCHIVE_PUSH: 10002,
  ROLE_INFO_REQ: 10003,
  HEART_REQ: 10000,
  // ...
} as const;
```

### 前端对齐

前端 `assets/scripts/myFramework/netWork/HttpDefine.ts`：

```typescript
export const MSD_ID = {
  TOKEN_REQ: 10001,        // 对应后端 LOGIN
  ROLE_INFO_REQ: 10003,
  HEART_REQ: 10000,
  // ...
};
```

**规则**：

- 新增/修改协议号时，前后端 **必须同步修改**
- 前端 `MSD_ID` 的命名可能不同（如 `TOKEN_REQ` 对应 `LOGIN`），但数字必须一致

---

## 3. 错误码

### 业务错误码（code < 0）

| 错误码 | 说明 | 示例场景 |
|---|---|---|
| `0` | 成功 | 正常响应 |
| `-1` / `-4001` | 金币不足 / 资源不足 | 武器解锁、升级时金币不够 |
| `-4002` | 武器升级规则错误 | 跳级升级（只能逐级） |
| `-4003` | 已达最大等级 | 武器已满级 |
| `-404` | 资源不存在 | 角色/武器配置不存在 |
| 其他负数 | 其他业务错误 | `BusinessError(message, code)` 的 `code` 取负 |

### 系统错误码（error ≠ 0）

| 内部码 | 响应 error | 说明 | 前端行为 |
|---|---|---|---|
| `401` | `-10015` | 未登录 / token 无效 | 强制退出，回登录界面 |
| `4004` | `-10004` | 未知协议号 / 缺 action/data/sign | 提示"协议错误" |
| `4001` | `-1000004` | 签名校验失败 | 提示"请求被篡改" |
| `4000` / `400` | `-1000001` | 请求体或参数非法 | 提示"参数错误" |
| `500` | `1` | 服务器内部错误 | 提示"服务器异常，请稍后重试" |

**映射代码**（`dispatch.ts`）：

```typescript
import { SYS_ERROR } from '../utils/errors';

function classifyError(e: unknown): OutEnvelope {
  const raw = e instanceof BusinessError ? e.code : 500;
  switch (raw) {
    case 401:  return { code: 0, error: SYS_ERROR.UNAUTH, msg };   // -10015
    case 4004: return { code: 0, error: SYS_ERROR.PROTOCOL, msg }; // -10004
    case 4001: return { code: 0, error: SYS_ERROR.TAMPER, msg };   // -1000004
    case 4000:
    case 400:  return { code: 0, error: SYS_ERROR.PARAM, msg };    // -1000001
    case 500:  return { code: 0, error: SYS_ERROR.INTERNAL, msg }; // 1
    default:   return { code: -Math.abs(raw), error: 0, msg };      // 业务错
  }
}
```

---

## 4. 协议详细说明

### 4.1 心跳（CMD.HEART_REQ = 10000）

**请求**：

```json
{
  "action": 10000,
  "data": "<压缩的 {}>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 10000,
  "data": "<压缩的 {}>",
  "error": 0,
  "sign": "..."
}
```

**用途**：保持连接活跃，防止被网关超时断开（如有）。

---

### 4.2 登录（CMD.LOGIN = 10001）

**请求**：

```json
{
  "action": 10001,
  "data": "<压缩的明文>",
  "sign": "..."
}
```

**明文示例**（账号密码登录）：

```json
{
  "puid": "",
  "token": "",
  "server_id": 1,
  "loginType": 0,
  "username": "test",
  "password": "123456"
}
```

**loginType 枚举**（`constants/loginType.ts`）：

| loginType | 平台 | 必需字段 | 服务端验证方式 |
|---|---|---|---|
| `0` | 账号密码 | `username`, `password` | bcrypt 比对（无账号则自动注册） |
| `1` | 微信 | `code` | 用 `code` 换 `openid`（需 `WECHAT_APPID` / `WECHAT_SECRET`） |
| `2` | Google | `idToken` | 验 `idToken` 签名（RS256，需 `GOOGLE_CLIENT_ID`） |

**响应**：

```json
{
  "code": 0,
  "action": 10001,
  "data": "<压缩的结果>",
  "error": 0,
  "sign": "..."
}
```

**解压后**：

```json
{
  "token": "eyJhbGc...",
  "accountId": "...",
  "username": "test",
  "platformPuid": 123456,
  "zones": [
    { "id": 1, "name": "初入幻想", "hasRole": true, "status": "open" }
  ],
  "gameToken": "eyJhbGc...",
  "role": {
    "userId": "...",
    "playerInfo": { "userName": "test", "level": 1, "exp": 0 },
    "coins": 1000,
    "zoneId": 1
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `token` | string | **account token**（用于 cmd 13/14） |
| `accountId` | string | 账号 ID（MongoDB `_id`） |
| `username` | string | 用户名 |
| `platformPuid` | number | 平台数字 ID（自增，用于前端显示） |
| `zones` | array | 区服列表（同 cmd 13） |
| `gameToken` | string | **game token**（默认 1 区，可直接用于游戏内协议） |
| `role` | object | 默认区的角色信息（无角色时自动创建） |

**登录即注册**：

- `loginType=0` 时，用户名不存在则自动创建账号（密码至少 6 位）
- 密码错误则拒绝（`code=-1, message='密码错误'`）

**第三方登录测试桩**：

环境变量 `AUTH_STUB=1` 时不联网：

- 微信：`openid = 'stub_wx_' + code`
- Google：`sub = 'stub_gg_' + idToken`

**兼容旧协议**：

- 信封带 `puid` 但无 `loginType` → 自动走 `autoLogin(puid)`
- 信封带有效 `token` → 复用账号，重签 account token

---

### 4.3 拉取角色信息（CMD.ROLE_INFO_REQ = 10003）

**守卫**：`requireAuth`（必须已选区）

**请求**：

```json
{
  "action": 10003,
  "data": "<压缩的 { token: '<game token>' }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 10003,
  "data": "<压缩的结果>",
  "error": 0,
  "sign": "..."
}
```

**解压后**：

```json
{
  "playerInfo": {
    "userName": "test",
    "level": 1,
    "exp": 0
  },
  "userData": {
    "level": 1,
    "exp": 0,
    "customField": "..."
  },
  "coins": 1000,
  "serverTime": 1728960000
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `playerInfo` | object | 玩家基础信息（userName, level, exp） |
| `userData` | object | 客户端自定义数据（Mixed 类型） |
| `coins` | number | 金币（服务器权威） |
| `serverTime` | number | 服务器时间戳（秒） |

---

### 4.4 背包/武器状态（CMD.BAG = 10010）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 10010,
  "data": "<压缩的 { token }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 10010,
  "data": "<压缩的结果>",
  "error": 0,
  "sign": "..."
}
```

**解压后**：

```json
{
  "weapons": {
    "sword_01": { "level": 3, "unlocked": true, "isFitOut": true },
    "bow_02": { "level": 1, "unlocked": true, "isFitOut": false }
  },
  "weaponConfigs": {
    "sword_01": {
      "id": "sword_01",
      "name": "初心之剑",
      "maxLevel": 5,
      "unlockCost": { "coins": 100 },
      "upgradeCost": { "2": { "coins": 50 }, "3": { "coins": 100 } },
      "attributes": { "1": { "attack": 10 }, "2": { "attack": 15 } }
    }
  }
}
```

**注意**：

- `weaponConfigs` 是整张武器配置表（`configService.getAllWeapons()`）
- 这是**唯一下发配置的协议**（历史遗留，待优化）

---

### 4.5 武器解锁（CMD.WEAPON_UNLOCK = 8）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 8,
  "data": "<压缩的 { token, weaponId: 'sword_01' }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 8,
  "data": "<压缩的 { success: true, coins: 900 }>",
  "error": 0,
  "sign": "..."
}
```

**规则**：

- 查配置表 `unlockCost.coins`
- 扣金币（原子条件更新）
- 写入 `weapons[weaponId] = { level: 1, unlocked: true }`

**失败情况**：

| 错误码 | 说明 |
|---|---|
| `-4000` | 武器配置不存在 |
| `-4001` | 已解锁或金币不足 |

---

### 4.6 武器升级（CMD.WEAPON_UPGRADE = 9）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 9,
  "data": "<压缩的 { token, weaponId: 'sword_01', targetLevel: 3 }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 9,
  "data": "<压缩的 { success: true, newLevel: 3, coins: 850 }>",
  "error": 0,
  "sign": "..."
}
```

**规则**：

- **只能逐级升**：`targetLevel` 必须 = 当前 level + 1
- 不超过 `maxLevel`
- 查配置表 `upgradeCost[targetLevel].coins`
- 扣金币（原子条件更新）

**失败情况**：

| 错误码 | 说明 |
|---|---|
| `-4001` | 武器未解锁 |
| `-4002` | 只能逐级升级（跳级） |
| `-4003` | 已达最大等级 |
| `-4001` | 金币不足 |

---

### 4.7 武器穿戴/卸下（CMD.WEAPON_EQUIP = 16 / UNEQUIP = 17）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 16,
  "data": "<压缩的 { token, id: 'sword_01' }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 16,
  "data": "<压缩的 { success: true }>",
  "error": 0,
  "sign": "..."
}
```

**规则**：

- 只改 `weapons[id].isFitOut` 为 `true` / `false`
- 不扣费

**注意**：

- 前端当前走"本地计算 + cmd 15 存档"流程，cmd 16/17 是预留
- 服务端已实现权威逻辑，待前端对齐后切换

---

### 4.8 保存 userData（CMD.USER_DATA_SET = 15）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 15,
  "data": "<压缩的 { token, userData: { level: 2, exp: 150, customField: '...' } }>",
  "sign": "..."
}
```

或嵌套一层（兼容）：

```json
{
  "action": 15,
  "data": "<压缩的 { token, userData: { userData: { ... } } }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 15,
  "data": "<压缩的 { success: true }>",
  "error": 0,
  "sign": "..."
}
```

**规则**：

- 整包覆盖 `User.userData` 字段
- **强制删除 `coins` 字段**（`delete data.coins`）
- 已知数值字段（`level`, `exp`）做非负校验

**用途**：

- 前端本地计算武器升级/穿戴/卸下，结果经此接口落库
- 保存客户端自定义数据（关卡进度、成就等）

---

### 4.9 区服列表（CMD.ZONE_LIST = 13）

**守卫**：`requireAccount`（account token 或 game token 均可）

**请求**：

```json
{
  "action": 13,
  "data": "<压缩的 { token: '<account token>' }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 13,
  "data": "<压缩的结果>",
  "error": 0,
  "sign": "..."
}
```

**解压后**：

```json
{
  "zones": [
    { "id": 1, "name": "初入幻想", "hasRole": true, "status": "open" },
    { "id": 2, "name": "勇者之路", "hasRole": false, "status": "open" }
  ]
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 区服 ID |
| `name` | string | 区服名称 |
| `hasRole` | boolean | 该账号在此区是否已有角色 |
| `status` | string | 区服状态（`open` / `maintenance` / `closed`） |

---

### 4.10 选区进入（CMD.ZONE_ENTER = 14）

**守卫**：`requireAccount`

**请求**：

```json
{
  "action": 14,
  "data": "<压缩的 { token: '<account token>', zoneId: 2 }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 14,
  "data": "<压缩的结果>",
  "error": 0,
  "sign": "..."
}
```

**解压后**：

```json
{
  "gameToken": "eyJhbGc...",
  "userId": "...",
  "zoneId": 2,
  "playerInfo": {
    "userName": "test",
    "level": 1,
    "exp": 0
  },
  "coins": 1000
}
```

**规则**：

- 区服必须 `status === 'open'`（维护/关闭拒绝进入）
- 无角色则自动创建（初始金币 `STARTER_COINS = 1000`）
- 签发 **game token**（包含 `userId`, `zoneId`）

---

### 4.11 新手引导进度（CMD.ROLE_GUIDE_RECORD = 1001）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 1001,
  "data": "<压缩的 { token, info: { guideStep: 5, ... } }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 1001,
  "data": "<压缩的 { success: true }>",
  "error": 0,
  "sign": "..."
}
```

**规则**：

- 与 cmd 15 共用 `userService.saveUserData`
- 存入 `User.userData`
- **删除 `coins` 字段**

---

### 4.12 红点全量拉取（CMD.RED_INFO_ON_LOGIN = 100001）

**守卫**：`requireAuth`

**请求**：

```json
{
  "action": 100001,
  "data": "<压缩的 { token }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 100001,
  "data": "<压缩的 { redPoints: [] }>",
  "error": 0,
  "sign": "..."
}
```

**当前实现**：

- 固定返回 `{ redPoints: [] }`（尚未接入真实红点数据）

---

### 4.13 角色档案推送（CMD.ROLE_ARCHIVE_PUSH = 10002）

**推送方向**：服务器 → 客户端（客户端不发送此协议号）

**触发时机**：

- 修改 `playerInfo` 时（如登录时间、战力变化）
- 自动附在主回包后面（数组响应）

**推送格式**：

```json
{
  "code": 0,
  "action": 10002,
  "data": "<压缩的角色档案>",
  "error": 0,
  "sign": "..."
}
```

**解压后**（`PlayerArchive` 格式，下划线命名）：

```json
{
  "user_id": "...",
  "user_name": "test",
  "user_photo": 0,
  "user_status": 0,
  "pid": "178",
  "platform": 0,
  "combat": 1200,
  "create_time": 1728960000,
  "login_time": 1728970000,
  "login_count": 5,
  "heart_time": 1728980000,
  "localIp": "192.168.1.100",
  "idfa": null,
  "oaid": null
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `user_id` | string | 角色 ID（MongoDB `_id`） |
| `user_name` | string | 角色名称 |
| `user_photo` | number | 头像 ID |
| `user_status` | number | 角色状态 |
| `pid` | string | 平台 ID |
| `platform` | number | 平台数字 |
| `combat` | number | 战力 |
| `create_time` | number | 创角时间（秒） |
| `login_time` | number | 最近登录时间（秒） |
| `login_count` | number | 登录次数 |
| `heart_time` | number | 当前服务器时间（秒） |
| `localIp` | string | 客户端 IP |
| `idfa` | string? | iOS 广告标识符 |
| `oaid` | string? | Android 广告标识符 |

**注意**：

- `heart_time` 和 `localIp` 不落库，每次推送时生成
- 不包含金币、道具、武器（这些数据走其他协议）
- 数据库存储格式是 `PlayerInfo`（驼峰命名），推送前转换为 `PlayerArchive`（下划线命名）

---

### 4.14 临时档（CMD.SAVE_INFO = 10012 / GET_SAVE_INFO = 10013）

**守卫**：`requireAuth`

**保存请求**：

```json
{
  "action": 10012,
  "data": "<压缩的 { token, info: { ... } }>",
  "sign": "..."
}
```

**读取请求**：

```json
{
  "action": 10013,
  "data": "<压缩的 { token }>",
  "sign": "..."
}
```

**响应**：

```json
{
  "code": 0,
  "action": 10013,
  "data": "<压缩的 { info: { ... } }>",
  "error": 0,
  "sign": "..."
}
```

**用途**：

- 前端保存临时数据（如关卡挑战中的进度）
- 存入 `User.saveInfo` 字段（Mixed 类型）

---

## 5. 前后端对齐规则

### 5.1 协议号同步

| 后端位置 | 前端位置 |
|---|---|
| `src/protocol/cmd.ts` → `CMD` 常量 | `assets/scripts/myFramework/netWork/HttpDefine.ts` → `MSD_ID` |

**规则**：

- 新增/修改协议号时，**前后端必须同时修改**
- 前端命名可能不同（如 `TOKEN_REQ` vs `LOGIN`），但数字必须一致
- 前端提交代码时需备注"协议同步：新增 cmd XXX"

### 5.2 签名密钥同步

| 位置 | 配置 |
|---|---|
| 后端 `.env` | `GATEWAY_SIGN_KEY=51E3D400670CC4D9C82A49EE5C1969D1` |
| 前端 `GlobalDefine.ts` | `GATEWAY_SIGN_KEY` 或 `getRequestSecret()` |

**生产环境必须修改**，不能用默认值。

### 5.3 网关地址

前端 `GlobalDefine.ts`：

```typescript
const APP_MAIN_HOST = 'http://192.168.1.100:3000/gateway'; // 开发
// const APP_MAIN_HOST = 'https://game.example.com/gateway'; // 生产
```

后端 `.env`：

```bash
GATEWAY_PUBLIC_URL=http://192.168.1.100:3000/gateway  # autoLogin 回给前端的地址
```

### 5.4 开放问题（待与前端对齐）

| 问题 | 当前状态 | 建议 |
|---|---|---|
| cmd 9/16/17 权威逻辑 | 服务端已实现，前端走"本地计算 + cmd 15" | 前端切换到服务端权威 |
| 配置表下发 | 只有 cmd 10010 下发武器配置，其他不下发 | 统一不下发，或全部下发 |
| e2e_test.js | 仍按旧信封格式（`application/x-www-form-urlencoded`） | 更新为 LZString + JSON |

---

**维护约定**：

- 新增/修改协议时，必须同步更新本文档
- 前端协议号必须与后端对齐，数字不能冲突
- 每次改动后在 commit message 标注"协议变更"

---

**相关文档**：

- [架构文档](./ARCHITECTURE.md) - 分层架构、技术栈、设计决策
- [开发指南](./DEVELOPMENT.md) - 如何调试协议、端到端测试
