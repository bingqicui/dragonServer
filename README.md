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

前端 `MKHttp` 是「单 URL + 数字 `cmd`(action) + 压缩信封」协议，服务器**不提供 REST 接口**。请求体为 `application/json`。

- **请求信封**：`{ action: <cmd 数字>, data: <压缩串>, sign: <md5(data+KEY)>, retry?: boolean }`
  - `data = LZString.compressToBase64(JSON.stringify({ uid, token, server_id, ...业务参数 }))`
  - 签名 `sign = md5(data + GATEWAY_SIGN_KEY)`；密钥 `GATEWAY_SIGN_KEY` 默认 `51E3D400670CC4D9C82A49EE5C1969D1`（与前端 `GATEWAY_SIGN_KEY`/`getRequestSecret()` 一致）
  - 服务器解压 `data` 后把 `uid/token/server_id` 剥离为信封字段，其余作为业务 `payload` 交给 handler
- **响应信封**：**永远 HTTP 200**，对象 `{ code, action, data, error, sign }`
  - `data = LZString.compressToBase64(JSON.stringify(payload))`，`sign = md5(data + KEY)`
  - 成功：`code=0, error=0`；业务失败：`code<0, error=0`；系统错误：`code=0, error=<数字码>, data="", sign=KEY 本身`
  - 前端 `code<0` 判失败、`code===0` 判成功，并按 `action` 数字路由回对应请求

| cmd | 含义 | 需 token | 备注 |
|---|---|---|---|
| 10000 | 心跳 | 否 | |
| 10001 | 登录/取 token（`loginType` 0 账号密码 /1 微信 /2 Google） | 否 | |
| 10003 | 登录后角色信息（含 serverTime，回带 userData） | 是 | 10002 为服务端下发号，非请求 |
| 10010 | 背包/武器状态全量 | 是 | |
| 8 | 武器解锁 | 是 | |
| 9 | 武器升级 | 是 | 前端本地计算，结果经 cmd 15 存档 |
| 16 | 武器穿戴 | 是 | 前端本地计算，结果经 cmd 15 存档 |
| 17 | 武器卸下 | 是 | 前端本地计算，结果经 cmd 15 存档 |
| 15 | 原样保存 userData（含 items/weapons） | 是 | 升级/穿戴/卸下的落库点 |
| 13 | 区列表 | 是(account) | |
| 14 | 选区进入（拿 game token） | 是(account) | |
| 1001 | 引导进度存档 | 是 | |

cmd 数字在 `src/protocol/cmd.ts` 的 `CMD` 常量（前端 `MSD_ID` 对齐），**禁止硬编码数字**。新增业务在 `src/protocol/handlers/*.ts` 加一行映射。

> 调试说明：请求/响应都走 LZString 压缩 + 签名，裸 `curl` 需先压缩。最简方式是用 `node e2e_test.js`（联调）或前端联调；也可用下面一段 Node 直接构造登录请求：

```bash
node -e '
const crypto=require("crypto"); const {compressToBase64}=require("lz-string");
const KEY="51E3D400670CC4D9C82A49EE5C1969D1";
const plain={uid:"",token:"",server_id:"",loginType:0,username:"test",password:"123456"};
const data=compressToBase64(JSON.stringify(plain));
const sign=crypto.createHash("md5").update(data+KEY).digest("hex");
const body=JSON.stringify({action:10001,data,sign,retry:false});
require("http").request({host:"localhost",port:3000,path:"/gateway",method:"POST",headers:{"Content-Type":"application/json"}},r=>{let s="";r.on("data",d=>s+=d);r.on("end",()=>console.log(s));}).end(body);
'
```

`npm run typecheck` 类型检查，`node e2e_test.js` 跑端到端测试（需先启动服务器）。

## Cocos 对接要点

- `MKHttp` 的 `_url` 指向 `http://<host>:<port>/gateway`；签名密钥与服务器 `.env` 的 `GATEWAY_SIGN_KEY` 一致
- 登录（cmd=10001）拿到 token 后放入后续请求信封的 `token` 字段
- **静态配置表由前端自带 / CDN 分发**，不走服务器；服务器仅在内部用同一份配置做权威校验

## 生产部署（Linux 云服务器，简述）

上传 `serverCode` → `npm install --production` → `npm run build` →
`pm2 start dist/index.js -i max` → Nginx 反代 + HTTPS，详见《服务器部署计划书》。
生产 MongoDB 需加认证并 `--bind_ip_all`。

## 版本控制（SVN）

执行 `svn propset svn:ignore -F .svnignore .` 忽略 `node_modules/`、`dist/`、`.env`。
