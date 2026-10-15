# AI Agent 维护指南

> **本文档专为 AI Agent 编写**，提供维护本仓库时的核心规则与最佳实践。

## 🚨 开始前必读

### 文档优先级

遇到冲突时的优先级（从高到低）：

1. **当前 `src/` 源码** - 唯一可信源
2. `.cursor/rules/*.mdc` - 架构约束规则
3. `ARCHITECTURE.md` + `PROTOCOL.md` + `DEVELOPMENT.md` - 核心文档
4. `README.md` - 快速开始
5. `AIDoc/*.md` / `AI_RULES.md` - **部分过时**，仅参考

**冲突处理**：以源码为准，并更新文档使其对齐。

### 必读文件（改代码前）

1. `.cursor/rules/server-architecture.mdc` - 分层架构约束
2. `ARCHITECTURE.md` - 系统架构全貌
3. `PROTOCOL.md` - 协议定义（改协议时）
4. `DEVELOPMENT.md` - 开发流程（新增功能时）

---

## 📐 架构约束（铁律）

### 分层调用链

```
dispatch.ts → handlers/*.ts → services/*.ts → repositories/*.ts → models/*.ts
```

**禁止**：

- ❌ handler 写业务逻辑（只做薄转发）
- ❌ service 直接调 Model（走 repository）
- ❌ model 写业务方法
- ❌ 跨层调用（如 handler 直接调 repository）

### 协议规则

- **所有 cmd 定义在 `src/protocol/cmd.ts`**，禁止硬编码数字
- 新增 cmd：① `cmd.ts` 加常量 → ② `handlers/*.ts` 加条目 → ③ `dispatch.ts` 无需改动
- 前端 `MSD_ID` 必须同步（见 `FRONTEND_STRUCTURE.md`）

### 服务器权威

- 金币 `coins` 只能服务端修改（存档接口强制 `delete data.coins`）
- 扣费必须用原子条件更新：`{ $inc: { coins: -cost }, $gte: { coins: cost } }`
- 武器升级只能逐级（`targetLevel = 当前 + 1`）

---

## 🔧 常见任务流程

### 新增协议

**完整步骤**（见 `DEVELOPMENT.md` 第 5 节）：

1. `src/protocol/cmd.ts` 加 `CMD.XXX`
2. 若需配置表：加 `src/config/*.json` + `config.service.ts`
3. 若需新集合：加 `models/*.ts` + `repositories/*.ts`
4. `services/*.ts` 写业务逻辑
5. `handlers/*.ts` 加条目（守卫 + 调 service）
6. `handlers/index.ts` 汇总（如新增文件）
7. 更新 `PROTOCOL.md`
8. 测试
9. 同步前端 `MSD_ID`

**示例 commit message**：

```
feat: 新增关卡系统协议

- 新增 CMD.LEVEL_START (2001) / LEVEL_FINISH (2002)
- 实现 levelService.startLevel / finishLevel
- 发放关卡奖励（金币+经验）

协议变更：需前端同步 MSD_ID.LEVEL_START / LEVEL_FINISH
```

### 修改现有协议

1. 找到对应 handler（`handlers/*.ts`）
2. 定位到 service 方法
3. 修改业务逻辑
4. 若改请求/响应结构，更新 `PROTOCOL.md`
5. 测试旧客户端兼容性

### 修改配置表

1. 改 `src/config/*.json`
2. 若新增字段，同步 `config.service.ts` 的 `interface`
3. **重启服务器**（配置表启动时载入内存）
4. 测试

---

## 🧪 测试与验证

### 启动开发服务器

```bash
npm run dev
```

（一键启动 MongoDB + 热重载服务器）

### 类型检查（必须通过）

```bash
npm run typecheck
```

**不通过时不要提交代码**。

### 协议测试

**方法 1**：用 Node 脚本（见 `DEVELOPMENT.md` 第 3 节）

**方法 2**：前端联调（推荐）

**方法 3**：更新 `e2e_test.js`（当前已过时）

---

## 📝 文档维护规则

### 必须同步更新的文档

| 改动类型 | 必须更新的文档 |
|---|---|
| 新增/修改协议 | `PROTOCOL.md` |
| 修改分层架构/鉴权/配置机制 | `ARCHITECTURE.md` |
| 新增工具/部署流程 | `DEVELOPMENT.md` |
| 新增架构约束 | `.cursor/rules/server-architecture.mdc` |
| 改前端对接方式 | `FRONTEND_STRUCTURE.md` |

### 更新模板

**协议变更**（`PROTOCOL.md`）：

```markdown
### 4.X 新协议名称（CMD.XXX = 数字）

**守卫**：`requireAuth` / `requireAccount` / 无

**请求**：
... JSON 示例 ...

**响应**：
... JSON 示例 ...

**规则**：
- 业务规则 1
- 业务规则 2

**失败情况**：
| 错误码 | 说明 |
|---|---|
| `-4001` | 错误原因 |
```

**架构变更**（`ARCHITECTURE.md`）：

在对应章节追加/修改，并更新"最后更新"日期。

---

## ⚠️ 开放问题（需与作者确认）

以下问题当前无法从代码确定，**禁止臆测**，列为开放问题。

**已解决问题**：

- ~~10002 角色档案推送~~：已确认在使用中。客户端不发送 10002，但服务器推送时会写入角色档案。类型是 `PlayerArchive`（下划线命名，用于网络传输）和 `PlayerInfo`（驼峰命名，用于数据库存储），两者通过 `toPlayerArchive()` 转换。详见 `PROTOCOL.md` 第 4.13 节。
- ~~e2e_test.js 协议不匹配~~：已确认为遗留测试，不维护。保留仅作历史参考，无需更新或兼容。
- ~~武器升级/穿戴/卸下权威逻辑~~：当前客户端本地计算，通过 cmd 15 存档。服务端已实现权威逻辑（预留）。未来将切换到服务端权威，由作者宣布切换时机。详见 `PROTOCOL.md` 第 4.6、4.7 节和第 5.4 节「计划中的架构演进」。
- ~~配置表下发策略~~：当前客户端和服务端各自使用自己的配置副本。cmd 10010 下发武器配置（唯一）。是否统一推送策略将来讨论，当前保持现状。详见 `PROTOCOL.md` 第 4.4 节和第 5.5 节「延后决定的设计」。

**待确认问题**：

### 1. 未使用的文件

以下文件在仓库但未被完全使用：

- `protocol/response.ts` - 已接线，用于 10002 推送
- `protocol/roleArchive.ts` - 已接线，用于生成 10002 推送数据
- `utils/requestContext.ts` - `markRoleDirty`（无调用方）
- `middleware/auth.ts` - Bearer JWT（未挂载 Express）
- `services/role/role.ts` - 已合并到 `user.service.ts`？

**待确认**：

- `requestContext.ts` / `auth.ts` / `role.ts` 是否需要删除？
- 还是保留供未来使用？

---

## 🔒 安全检查清单

### 提交前检查

- [ ] `.env` 未提交（已在 `.gitignore`）
- [ ] 生产密钥未硬编码（`JWT_SECRET` / `GATEWAY_SIGN_KEY` 用环境变量）
- [ ] 第三方密钥未硬编码（`WECHAT_SECRET` / `GOOGLE_CLIENT_ID`）
- [ ] 配置文件无敏感信息（`src/config/*.json`）
- [ ] 测试代码未提交真实 token / 密码

### 公开仓库注意事项

**本仓库已公开**：

- ✅ 默认密钥已标注"生产必改"（`README.md` / `DEVELOPMENT.md`）
- ✅ `.env` 已在 `.gitignore`
- ✅ 无 `.env` 提交历史（已检查）

**提醒用户**：

若在 PR/文档中发现任何密钥、token、数据库连接串（包含密码），立即在 PR 描述注明：

```
⚠️ 安全提示：发现以下敏感信息可能被提交，请检查：
- 文件 X 第 Y 行包含疑似密钥
- 建议回滚该 commit 并修改密钥
```

---

## 🎯 优先级建议

### 高优先级（影响功能）

（当前无高优先级问题）

### 中优先级（技术债）

1. 确认并清理未使用的文件（`requestContext.ts` / `auth.ts` / `role.ts`）
2. 类型定义去重（`types/protocol.ts` vs `handlers/types.ts`）

### 低优先级（改善体验）

1. 增加单元测试（Jest / Vitest）
2. 增加接口文档生成（Swagger / TypeDoc）
3. 增加性能监控（OpenTelemetry）

---

## 🤖 Agent 行为规范

### DO（应该做）

- ✅ 改动前先读对应文档和源码
- ✅ 遵守分层架构约束
- ✅ 修改后同步更新文档
- ✅ `npm run typecheck` 通过后再提交
- ✅ commit message 清晰描述改动和影响
- ✅ 列出无法确定的问题（开放问题）

### DON'T（不应该做）

- ❌ 根据过时文档（`AI_RULES.md` / `AIDoc/*.md`）修改代码
- ❌ 臆测用户需求（如配置下发策略）
- ❌ 破坏分层架构（如 handler 写业务逻辑）
- ❌ 硬编码 cmd 数字
- ❌ 提交前不跑类型检查
- ❌ 修改代码但不更新文档

### 遇到冲突时

1. 以当前源码为准（不是文档）
2. 更新文档使其对齐
3. 在 commit message 注明"文档同步"

### 遇到不确定问题时

1. 列为开放问题（本文档或 PR 描述）
2. 提供建议方案（至少 2 个）
3. 说明各方案的利弊
4. **不要猜测用户意图并直接实现**

---

## 📚 推荐阅读顺序

### 首次接触本项目

1. `README.md` - 快速了解项目定位
2. `ARCHITECTURE.md` - 理解分层架构
3. `.cursor/rules/server-architecture.mdc` - 掌握约束规则
4. `PROTOCOL.md` - 熟悉协议格式
5. 阅读 `src/protocol/dispatch.ts` - 理解网关流程
6. 阅读 `src/protocol/handlers/weapon.ts` - 理解 handler 写法
7. 阅读 `src/services/weapon.service.ts` - 理解业务逻辑

### 新增功能时

1. `DEVELOPMENT.md` 第 5 节 - 新增业务功能流程
2. 对应的现有实现（如 `weapon` 系列文件）
3. `PROTOCOL.md` - 协议格式规范

### 修改架构时

1. `.cursor/rules/server-architecture.mdc` - 确认不违反约束
2. `ARCHITECTURE.md` - 理解现有设计决策
3. 相关源码
4. 修改后更新文档

---

## 🔄 文档维护历史

| 日期 | 改动 | 作者 |
|---|---|---|
| 2026-10-15 | 初始版本，整理架构文档和协议定义 | AI Agent |

---

**最后提醒**：

本文档与代码同步维护。改动架构/协议/流程后，**必须更新相关章节**。过时的 Agent 指南比没有更危险。
