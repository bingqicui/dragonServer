# 游戏服务器（Cocos Creator 后端）

技术栈：Node.js + Express + TypeScript + MongoDB

## 快速开始（开发）

```bash
cd serverCode
npm install
npm run dev          # 或直接双击 start-dev.bat（等价）
```

`npm run dev` = `node scripts/dev.mjs`，**一个窗口**同时托管：

- 本地真实 MongoDB（数据在 `..\serverApps\mongodb\data`，持久化）
- 游戏服务器（`tsx watch src/index.ts`，改文件自动重启）

按 `Ctrl+C` 会把两者一起关掉。若 27017 / 3000 上还残留着上次的进程，启动器会**先关掉它们再启动**
（不会去动非 mongod / 非本项目的进程）。

| 环境变量 | 作用 |
|---|---|
| `MONGO_TAKEOVER=0` | 关闭 27017 接管（退回"复用已有 MongoDB"） |
| `SERVER_TAKEOVER=0` | 关闭服务器端口接管 |
| `DEV_DRY_RUN=1` | 只检测、不启动任何进程（排查用） |

`.env` 里 `ENABLE_MEMORY_DB=true` 可改用内存 MongoDB：连 Mongo 都不用起，重启即清空，仅联调用。

## 目录结构

```
serverCode/
├── .env                 # 环境变量（端口/JWT密钥/Mongo地址）不提交 SVN
├── .svnignore
├── package.json
├── tsconfig.json
├── start-dev.bat        # 开发一键启动（MongoDB + 服务器），唯一推荐入口
├── start-mongo.bat      # 只单独启动 MongoDB（一般用不到，start-dev.bat 会代管）
├── e2e_test.js          # 端到端测试（全部走 /gateway）
└── src/
    ├── index.ts         # 入口：Express + 连库 + 挂载 /gateway
    ├── protocol/        # 网关：dispatch.ts（纯注册中心）、cmd.ts、handlers/*（按业务拆分）
    ├── config/          # 静态配置表 JSON（纯数据资产，由客户端/CDN 分发）
    ├── models/          # Mongoose Schema
    ├── repositories/    # 数据访问层（封装 Mongo，预留 Redis）
    ├── services/        # 全部业务逻辑（含 config.service 载入配置表）
    ├── middleware/      # token 校验
    └── utils/           # db 连接、crypto（信封解密验签）、统一错误类
```

## 接口：只有 `POST /gateway`

前端 `MKHttp` 是「单 URL + 数字 `cmd` + 加密信封」协议，服务器**不提供 REST 接口**。

- 请求体：`{ cmd, payload, token, resVer, isDevVersion }`（加密时外层为 `{ o, s }`，`o=base64(JSON)`、`s=MD5(JSON+secret)`）
- 响应体：`{ ErrorCode, Payload, t }`，**永远 HTTP 200**（错误只走 `ErrorCode`）

| cmd | 含义 | 需 token |
|---|---|---|
| 2 | 登录/取 token（`loginType` 分流：0 账号密码、1 微信、2 Google） | 否 |
| 3 | 登录后信息 | 是 |
| 4 | 角色信息 | 是 |
| 5 | 心跳 | 否 |
| 6 | 红点 | 是 |
| 7 | 背包（武器状态） | 是 |
| 8 | 武器解锁 | 是 |
| 9 | 武器升级 | 是 |
| 1001 | 引导进度存档 | 是 |

cmd 数字由服务器定义，前端 `MSD_ID` 对齐即可；新增业务在 `src/protocol/handlers/*.ts` 加一行映射。
协议细节、加密算法、改动清单见《前端协议兼容计划.md》。

明文调试（`isEncrp=false`，不经加密信封）：

```bash
curl -X POST http://localhost:3000/gateway -H "Content-Type: application/x-www-form-urlencoded" \
     -d "{\"cmd\":2,\"payload\":{\"loginType\":0,\"username\":\"testuser\",\"password\":\"123456\"}}"
```

`npm run typecheck` 类型检查，`node e2e_test.js` 跑端到端测试（需先启动服务器）。

## Cocos 对接要点

- `MKHttp` 的 `_url` 指向 `http://<host>:<port>/gateway`，secret 与服务器 `.env` 的 `REQUEST_SECRET` 一致
- 登录（cmd=2）拿到 token 后本地保存，后续请求放信封顶层 `token` 字段
- **静态配置表由前端自带 / CDN 分发**，不走服务器；服务器仅在内部用同一份配置做权威校验

## 生产部署（Linux 云服务器，简述）

上传 `serverCode` → `npm install --production` → `npm run build` →
`pm2 start dist/index.js -i max` → Nginx 反代 + HTTPS，详见《服务器部署计划书》。
生产 MongoDB 需加认证并 `--bind_ip_all`。

## 版本控制（SVN）

执行 `svn propset svn:ignore -F .svnignore .` 忽略 `node_modules/`、`dist/`、`.env`。
