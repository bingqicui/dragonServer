# Skill: 代码改动后更新文档

## 触发条件

每次修改服务器代码后，在提交前使用此技能确保文档同步。

## 检查清单

### 1. 协议改动（新增/修改 cmd）

**检查**：是否修改了 `src/protocol/cmd.ts` 或 `handlers/*.ts`？

**需要更新**：

- [ ] `PROTOCOL.md` - 在第 4 节添加/更新协议说明
  - 请求格式（JSON 示例）
  - 响应格式（JSON 示例）
  - 守卫类型（`requireAuth` / `requireAccount` / 无）
  - 业务规则
  - 错误码说明

**模板**：

```markdown
### 4.X 协议名称（CMD.XXX = 数字）

**守卫**：`requireAuth`

**请求**：
（JSON 示例）

**响应**：
（JSON 示例）

**规则**：
- ...

**失败情况**：
| 错误码 | 说明 |
|---|---|
| `-4001` | ... |
```

**前端同步**：

- [ ] 提醒在 commit message 注明"协议变更：需前端同步 MSD_ID.XXX"

### 2. 架构改动

**检查**：是否修改了分层规则、鉴权机制、配置加载方式？

**需要更新**：

- [ ] `ARCHITECTURE.md` - 在对应章节更新
- [ ] `.cursor/rules/server-architecture.mdc` - 若新增约束规则

**示例**：

- 新增守卫函数 → 更新 `ARCHITECTURE.md` 第 3 节
- 修改配置加载机制 → 更新第 7 节
- 改 token 体系 → 更新第 6 节

### 3. 开发流程改动

**检查**：是否新增了脚本、工具、部署方式？

**需要更新**：

- [ ] `DEVELOPMENT.md` - 在对应章节添加

**示例**：

- 新增 npm script → 更新第 2 节"开发脚本"表格
- 新增环境变量 → 更新第 1 节 + `.env.example`
- 新增部署方式 → 更新第 7 节

### 4. 配置表改动

**检查**：是否新增了 `src/config/*.json` 或修改了 `config.service.ts`？

**需要更新**：

- [ ] `ARCHITECTURE.md` 第 7 节 - 配置表列表
- [ ] `DEVELOPMENT.md` 第 5 节 - 若影响业务开发流程

### 5. 依赖/技术栈改动

**检查**：是否修改了 `package.json` 的依赖？

**需要更新**：

- [ ] `ARCHITECTURE.md` 第 2 节 - 技术栈表格
- [ ] `README.md` - 若影响启动步骤

### 6. 数据模型改动

**检查**：是否修改了 `models/*.ts` 的 Schema？

**需要更新**：

- [ ] `ARCHITECTURE.md` 第 5 节 - 数据模型说明

### 7. 环境变量改动

**检查**：是否新增/修改了环境变量？

**需要更新**：

- [ ] `.env.example` - 添加新变量及注释
- [ ] `DEVELOPMENT.md` 第 1 节 - 环境变量表格
- [ ] `ARCHITECTURE.md` 第 7 节 - 若影响配置管理

## 最终检查

- [ ] 文档中更新"最后更新"日期（`ARCHITECTURE.md` / `PROTOCOL.md` / `DEVELOPMENT.md`）
- [ ] commit message 清晰描述改动和文档同步
- [ ] 若有开放问题（无法确定的设计），在 `AGENTS.md` 第 3 节添加

## Commit Message 模板

```
feat: 功能描述

- 具体改动 1
- 具体改动 2

文档同步：
- 更新 PROTOCOL.md（新增 cmd XXX）
- 更新 ARCHITECTURE.md（修改鉴权机制）

[协议变更] 需前端同步 MSD_ID.XXX
```

或

```
docs: 更新文档与代码对齐

- 修正 PROTOCOL.md 中 cmd 10001 的响应格式说明
- 更新 ARCHITECTURE.md 的配置表列表
- 标记 AI_RULES.md 为部分过时
```
