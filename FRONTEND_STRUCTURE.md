# 打龙游戏前端工程 - 框架结构说明

> 前端工程路径：`D:\work\client\dragon`
> 后续提到「前端」即指此工程。

---

## 一、技术栈

| 项 | 选择 |
|---|---|
| 游戏引擎 | Cocos Creator |
| 开发语言 | TypeScript |
| 基础框架 | MKFramework（扩展在 `extensions/MKFramework`） |
| 网络协议 | 单网关 `/gateway` + 数字 cmd + 加密信封（与后端 dragonServer 对齐） |
| 资源管理 | Cocos Resources + 远程热更 |

---

## 二、目录结构

```
dragon/
├── assets/                  # 游戏资源与代码（核心）
│   ├── scripts/            # 所有 TypeScript 脚本
│   │   ├── myFramework/    # 自研基础框架（与业务解耦）
│   │   │   ├── const/      # 全局常量、事件定义、枚举
│   │   │   ├── manager/     # 全局管理器（音频、资源、引导、红点、设置等）
│   │   │   ├── netWork/    # 网络层（HTTP 请求封装、协议号定义）
│   │   │   ├── sdk/         # 平台 SDK 封装（微信、Google 等）
│   │   │   ├── ui/          # UI 框架（弹窗、界面基类）
│   │   │   ├── update/      # 热更逻辑
│   │   │   ├── updateScene/ # 热更界面
│   │   │   └── utils/       # 工具函数
│   │   └── game/            # 游戏业务逻辑
│   │       ├── config/      # 游戏配置（前端自带，从配置表导出）
│   │       ├── manager/     # 业务管理器（关卡、战斗等）
│   │       ├── scene/       # 场景脚本
│   │       └── ui/          # 业务 UI 界面脚本
│   ├── resources/           # 动态加载资源（Resources 目录）
│   │   ├── Scene/           # 场景文件（LoginScene、MainScene）
│   │   ├── ui/              # UI 预制体与图片资源（按业务模块分文件夹）
│   │   ├── image/           # 通用图片、背景
│   │   ├── animation/       # 动画资源
│   │   ├── audio/           # 音频（BGM、音效）
│   │   ├── font/            # 字体、BMFont 数字字体
│   │   ├── shader/          # 自定义 Shader
│   │   └── myFrameworkRes/   # 框架自带资源
│   ├── startGame/           # 启动入口相关
│   ├── libs/                # 第三方库
│   └── struct/              # 数据结构定义
├── extensions/              # Cocos Creator 扩展插件
│   ├── MKFramework/         # 自研框架编辑器扩展
│   ├── pack-tool/           # 打包工具
│   └── quick-plugin/        # 快速插件
├── 配置表/                  # 策划配置 Excel（武器、关卡、全局多语言等）
├── tool/                    # 开发工具脚本（写表、生成配置等）
├── server/                  # 本地联调用的 mock 服务器
└── AIDoc/                   # AI 辅助开发文档
```

---

## 三、网络层（前后端对接核心）

### 3.1 协议号对应关系

| 前端 `MSD_ID`（HttpDefine.ts） | 后端 `CMD`（cmd.ts） | 含义 |
|---|---|---|
| TOKEN_REQ: 2 | TOKEN_REQ: 2 | 登录/取 token |
| ~~LOGIN_INFO_REQ: 3~~ | ~~已删除~~ | 已合并到 cmd=4 |
| ROLE_INFO_REQ: 4 | ROLE_INFO_REQ: 4 | 角色信息（含 serverTime） |
| HEART_REQ: 5 | HEART_REQ: 5 | 心跳 |
| RED_INFO_ON_LOGIN: 6 | RED_INFO_ON_LOGIN: 6 | 红点 |
| BAG: 7 | BAG: 7 | 背包/武器 |
| WEAPON_UNLOCK: 8 | WEAPON_UNLOCK: 8 | 武器解锁 |
| WEAPON_UPGRADE: 9 | WEAPON_UPGRADE: 9 | 武器升级 |
| ZONE_LIST: 13 | ZONE_LIST: 13 | 区服列表 |
| ZONE_ENTER: 14 | ZONE_ENTER: 14 | 选区进入 |
| ROLE_GUIDE_RECORD: 1001 | ROLE_GUIDE_RECORD: 1001 | 引导进度存档 |

**改动规则**：新增/删除协议号必须前后端同步改，后端改了 `CMD`，前端必须同步改 `MSD_ID`。

### 3.2 请求方式

```typescript
// 推荐调用方式
CommonCMD.doCommond(
    MSD_ID.WEAPON_UNLOCK,           // 协议号
    { weaponId: 'sword_01' },        // 请求参数
    (data) => { /* 成功回调 */ },     // 成功回调
    this.node,                       // 绑定节点（销毁后自动取消回调）
    (errCode) => { /* 错误回调 */ }    // 错误回调
);
```

### 3.3 核心配置（GlobalDefine）

- `APP_MAIN_HOST`：网关地址
- `TOKEN`：登录凭证
- `APP_SECRET`：签名密钥
- `GAME_VER_STR`：资源版本号

---

## 四、Manager 体系

### 4.1 框架层 Manager（myFramework/manager/）

| Manager | 职责 |
|---|---|
| GameInitManager | 游戏初始化、登录流程、心跳 |
| ResManager | 资源加载与管理 |
| AudioManager | 音频播放（BGM、音效） |
| ItemsManager | 背包道具管理 |
| RedDataManager | 红点管理 |
| GuideManager | 新手引导 |
| UserSettingManager | 用户设置 |
| PlatFormManager | 平台信息 |
| PopLayerConfigManager | 弹窗配置 |

### 4.2 业务层 Manager（game/manager/）

| Manager | 职责 |
|---|---|
| FgtDragonLevelManager | 打龙关卡逻辑 |

---

## 五、资源组织约定

### 5.1 UI 资源路径

```
assets/resources/ui/
├── login/          # 登录界面
├── main/           # 主界面
├── dragon/         # 打龙相关（身体部件、龙等）
├── fight/          # 战斗相关
├── equip/         # 装备
├── shop/           # 商店
├── role/           # 角色
├── setting/        # 设置
├── guide/          # 引导
├── common/         # 通用 UI
└── ...
```

### 5.2 打龙身体部件资源

路径：`assets/resources/ui/dragon/gragonImg/`
命名规则：`body_XXXX.png`（如 body_1001.png）

---

## 六、前后端联调约定

1. **配置表**：前端自带（`assets/scripts/game/config/`），后端仅做内部校验，不下发
2. **登录流程**：cmd=2 拿 account token → cmd=13 看区列表 → cmd=14 选区拿 game token → cmd=4 拉全量角色信息
3. **错误处理**：HTTP 永远 200，业务错误走 `ErrorCode` 字段
4. **加密**：生产环境启用 MD5 签名验签，开发可用明文模式

---

## 七、常见改动场景

### 新增一个 UI 界面
1. 在 `assets/resources/ui/xxx/` 放预制体
2. 在 `assets/scripts/game/ui/` 写界面脚本
3. 在弹窗配置里注册
4. 用 UI 框架的接口打开

### 新增一个后端协议
1. 后端：`cmd.ts` 加协议号 → `handlers/xxx.ts` 加 handler → service 写逻辑
2. 前端：`HttpDefine.ts` 的 `MSD_ID` 加对应协议号 → 业务代码里用 `CommonCMD.doCommond` 调用

### 加新武器/新关卡
1. 策划在 `配置表/` Excel 里改
2. 用 `tool/dragon-table-write/` 导出到前端 `game/config/`
3. 后端 `src/config/` 同步一份 JSON
