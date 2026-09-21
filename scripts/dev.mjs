// 开发一键启动器
// 一条 `npm run dev`（或双击 start-dev.bat）即可：拉起本地 MongoDB + 启动 tsx watch 游戏服务器。
// Ctrl+C / 关窗口会一并关闭两者（含整个进程树），不需要再开第二个终端。
//
// MongoDB 生命周期策略（2026-09-13 调整）：
//   · 27017 空闲      → 直接拉起 mongod（dbpath = serverApps/mongodb/data）
//   · 27017 已有 mongod → 【先关掉它】再用同一份数据目录拉起，保证实例归启动器托管
//     原因：复用旧实例时 Ctrl+C 关不掉它，下次启动又只是"复用"，旧 mongod 会永久残留，
//           数据目录还会被上一个进程长期占着，导致"每次启动都提示复用"却谁也管不了它。
//   · 27017 被非 mongod 进程占用（如 Docker 代理、系统服务）→ 不动它，退化为"复用"并提示
//   关掉抢占行为：环境变量 MONGO_TAKEOVER=0（回到旧的"纯复用"逻辑）
//   只看不执行：DEV_DRY_RUN=1（排查用，不关任何进程）
//
// 服务器端口（默认 3000）策略：同样是"先接管"。若被上一次没关掉的旧服务器（node.exe，命令行
// 含 tsx/index 且指向本项目）占用，先关掉它再启动；若不是本项目的 node 进程则不动、直接报错退出。
//   关掉：环境变量 SERVER_TAKEOVER=0
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_CODE = path.resolve(__dirname, '..');

// MongoDB 二进制与数据目录（可用环境变量覆盖，便于换机器/路径）
const MONGOD_BIN = process.env.MONGO_BIN || path.resolve(SERVER_CODE, '../serverApps/mongodb/bin/mongod.exe');
const MONGO_DB_PATH = process.env.MONGO_DB_PATH || path.resolve(SERVER_CODE, '../serverApps/mongodb/data');
const MONGO_PORT = Number(process.env.MONGO_PORT || 27017);
const MONGO_READY_TIMEOUT = 15000;
const MONGO_TAKEOVER = process.env.MONGO_TAKEOVER !== '0';
const SERVER_TAKEOVER = process.env.SERVER_TAKEOVER !== '0';
const DRY_RUN = process.env.DEV_DRY_RUN === '1';

// 本地 tsx CLI：直接以「当前 node」运行它来启动服务器。
// 不走 `npm run`、不用 shell，规避 Windows 下 shell+cmd 的引号/路径解析问题。
const TSX_CLI = path.resolve(SERVER_CODE, 'node_modules/tsx/dist/cli.mjs');

const isWin = process.platform === 'win32';
const cyan = (s) => `\x1b[36m[dev]\x1b[0m ${s}`;
const yellow = (s) => `\x1b[33m[dev]\x1b[0m ${s}`;
const red = (s) => `\x1b[31m[dev]\x1b[0m ${s}`;

// ensureMongo 的三种结局
const REUSE = Symbol('reuse');     // 复用别人起的服务，启动器不托管
const TAKEOVER = Symbol('takeover'); // 已关掉旧 mongod，继续拉起自己的
const ABORT = Symbol('abort');     // 无法接管，放弃启动

// 探测端口是否可连（判断端口上是否已有服务）
function probePort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(800);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

// 轮询等待端口就绪（用于等我们刚拉起的 Mongo）
function waitForPort(port, timeoutMs) {
  const start = Date.now();
  const tick = async () => {
    if (await probePort(port)) return true;
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 300));
    return tick();
  };
  return tick();
}

// 轮询等待端口释放（用于等旧进程真正退出）
async function waitForPortFree(port, timeoutMs) {
  const start = Date.now();
  while (await probePort(port)) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
  return true;
}

// ===== 占用 27017 的到底是谁 =====

// 用 netstat 找出监听指定端口的 PID（不依赖 wmic / powershell）
function findListenPid(port) {
  if (!isWin) return null;
  const r = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || !r.stdout) return null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!/LISTENING/i.test(t)) continue;
    const parts = t.split(/\s+/);
    const local = parts[1] || '';
    const pid = parts[parts.length - 1];
    if (!/^\d+$/.test(pid)) continue;
    // local 形如 0.0.0.0:27017 或 [::]:27017
    if (local.endsWith(':' + port)) return Number(pid);
  }
  return null;
}

// 用 tasklist 取进程名，确认占用者确实是 mongod 再动手
function processName(pid) {
  if (!isWin || !pid) return '';
  const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  const m = (r.stdout || '').trim().match(/^"([^"]+)"/);
  return m ? m[1] : '';
}

// 取进程命令行（仅 Windows，用 PowerShell CIM；不可用时返回空串由调用方降级处理）
function processCommandLine(pid) {
  if (!isWin || !pid) return '';
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    if (r.status !== 0) return '';
    return (r.stdout || '').trim();
  } catch {
    return '';
  }
}

// 尝试关闭 27017 上的旧 mongod，成功返回 true
async function closeExistingMongo(pid) {
  // 先试优雅关闭（有控制台的 mongod 能响应），失败再强杀
  killTree(pid, { force: false });
  if (await waitForPortFree(MONGO_PORT, 1500)) return true;

  // 强杀是安全的：WiredTiger 有 journal，下次启动会自动回放恢复；数据目录不变，数据不丢
  killTree(pid, { force: true });
  return waitForPortFree(MONGO_PORT, 8000);
}

// 判断 27017 已有服务时怎么办
async function resolveOccupiedPort() {
  const pid = findListenPid(MONGO_PORT);
  const name = processName(pid);

  if (DRY_RUN) {
    console.log(yellow(`[dry-run] ${MONGO_PORT} 被 ${name || '未知进程'}(PID ${pid ?? '?'}) 占用；`
      + (MONGO_TAKEOVER ? '正常启动时会先关掉它再拉起托管实例' : 'MONGO_TAKEOVER=0，会直接复用')));
    return REUSE;
  }

  if (!MONGO_TAKEOVER) {
    console.log(cyan(`检测到 ${MONGO_PORT} 已有服务（MONGO_TAKEOVER=0），复用，不重复拉起 MongoDB`));
    return REUSE;
  }

  if (!pid) {
    console.warn(yellow(`无法确定 ${MONGO_PORT} 的占用进程，退化为复用（Ctrl+C 不会关闭它）`));
    return REUSE;
  }

  // 不是我们的 mongod（如 Docker 代理、系统服务）就别乱杀
  if (!/^mongod(\.exe)?$/i.test(name)) {
    console.warn(yellow(`${MONGO_PORT} 被「${name || '未知进程'}」(PID ${pid}) 占用，不是本地 mongod，不动它`));
    console.warn(yellow('退化为复用；若要接管，请先手动关闭它，或改环境变量 MONGO_PORT 换端口'));
    return REUSE;
  }

  console.log(cyan(`检测到残留的 MongoDB（PID ${pid}），先关闭它，再拉起启动器托管的实例`));
  const ok = await closeExistingMongo(pid);
  if (!ok) {
    console.error(red(`已尝试关闭 PID ${pid}，但 ${MONGO_PORT} 仍被占用`));
    console.error(yellow('请手动结束该进程后重试（任务管理器里搜 mongod.exe）'));
    return ABORT;
  }
  console.log(cyan(`旧 MongoDB 已关闭，${MONGO_PORT} 已释放 ✓（数据目录不变，数据保留）`));
  return TAKEOVER;
}

async function ensureMongo() {
  if (await probePort(MONGO_PORT)) {
    const verdict = await resolveOccupiedPort();
    if (verdict === ABORT) return ABORT;
    if (verdict === REUSE) {
      if (!DRY_RUN) console.log(cyan(`复用 ${MONGO_PORT} 上已有的服务（非启动器托管，Ctrl+C 不会关闭它）`));
      return null;
    }
    // TAKEOVER：端口已释放，继续往下拉起我们自己的实例
  }

  if (DRY_RUN) {
    console.log(yellow(`[dry-run] ${MONGO_PORT} 空闲，正常启动时会在 ${MONGO_DB_PATH} 拉起托管 MongoDB`));
    return null;
  }

  if (!fs.existsSync(MONGOD_BIN)) {
    console.warn(yellow(`未找到 mongod：${MONGOD_BIN}`));
    console.warn(yellow('请先放置 MongoDB 免安装版，或在 .env 设 ENABLE_MEMORY_DB=true 改用内存库。'));
    return null;
  }
  if (!fs.existsSync(MONGO_DB_PATH)) fs.mkdirSync(MONGO_DB_PATH, { recursive: true });

  console.log(cyan(`正在拉起本地 MongoDB（数据目录：${MONGO_DB_PATH}）...`));
  const mongod = spawn(MONGOD_BIN, ['--dbpath', MONGO_DB_PATH, '--port', String(MONGO_PORT)], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });

  let errBuf = '';
  mongod.on('error', (e) => { errBuf += `spawn error: ${e.message}\n`; });
  mongod.stderr.on('data', (d) => { errBuf += d.toString(); });

  const ok = await waitForPort(MONGO_PORT, MONGO_READY_TIMEOUT);
  if (!ok) {
    console.warn(yellow('MongoDB 启动超时，最后输出：'));
    if (errBuf) console.error(errBuf.split('\n').slice(-15).join('\n'));
    killTree(mongod.pid);
    return null;
  }
  console.log(cyan('MongoDB 已就绪 ✓'));
  return mongod;
}

const children = [];

// 服务器端口被占用时：能确认是本项目残留的服务器就关掉它，否则报错退出
async function resolveOccupiedServerPort(port) {
  const pid = findListenPid(port);
  const name = processName(pid);

  if (DRY_RUN) {
    console.log(yellow(`[dry-run] 端口 ${port} 被 ${name || '未知进程'}(PID ${pid ?? '?'}) 占用；`
      + (SERVER_TAKEOVER ? '正常启动时会先关掉它再启动服务器' : 'SERVER_TAKEOVER=0，会直接报错退出')));
    return REUSE;
  }

  if (!SERVER_TAKEOVER) {
    console.error(red(`端口 ${port} 已被占用（SERVER_TAKEOVER=0，不接管）`));
    return ABORT;
  }

  if (!pid) {
    console.error(red(`端口 ${port} 已被占用，但无法确定占用进程`));
    return ABORT;
  }

  // 只接管 node 进程，别的程序（nginx / 其它服务）不动
  if (!/^node(\.exe)?$/i.test(name)) {
    console.error(red(`端口 ${port} 被「${name || '未知进程'}」(PID ${pid}) 占用，不是 node，未做处理`));
    console.error(yellow('请手动关闭它，或改 .env 里的 PORT 后重试'));
    return ABORT;
  }

  const cmd = processCommandLine(pid);
  if (cmd && !/serverCode|gameServer|tsx|index\.(ts|js)/i.test(cmd)) {
    console.error(red(`端口 ${port} 被另一个 node 程序占用（PID ${pid}），不是本项目，未做处理：`));
    console.error(yellow(cmd));
    console.error(yellow('请手动关闭它，或改 .env 里的 PORT 后重试'));
    return ABORT;
  }

  console.log(cyan(`端口 ${port} 被上次残留的服务器占用（PID ${pid}${cmd ? '：' + cmd : ''}），先关闭它`));
  killTree(pid, { force: false });
  let freed = await waitForPortFree(port, 1500);
  if (!freed) {
    killTree(pid, { force: true });
    freed = await waitForPortFree(port, 6000);
  }
  if (!freed) {
    console.error(red(`已尝试关闭 PID ${pid}，但端口 ${port} 仍被占用`));
    return ABORT;
  }
  console.log(cyan(`旧服务器已关闭，端口 ${port} 已释放 ✓`));
  return TAKEOVER;
}

// 服务器监听端口：优先环境变量，其次 .env 的 PORT，默认 3000
function readServerPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  try {
    const envPath = path.resolve(SERVER_CODE, '.env');
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, 'utf8').match(/^\s*PORT\s*=\s*(\d+)/m);
      if (m) return Number(m[1]);
    }
  } catch {}
  return 3000;
}

function startServer() {
  console.log(cyan('启动游戏服务器（tsx watch，文件改动自动重启）...'));

  if (!fs.existsSync(TSX_CLI)) {
    console.error(red(`未找到 tsx：${TSX_CLI}`));
    console.error(red('请先在 serverCode 目录执行：npm install'));
    process.exit(1);
  }

  // 用当前 node 直接跑 tsx CLI，等价于 `tsx watch src/index.ts`，但不经由 npm / shell
  const server = spawn(process.execPath, [TSX_CLI, 'watch', 'src/index.ts'], {
    cwd: SERVER_CODE,
    stdio: 'inherit',
  });

  server.on('error', (e) => {
    console.error(red(`启动服务器失败：${e.message}`));
  });

  return server;
}

// 杀掉整个进程树（Windows 上 tsx 会再起一个子 node，普通 kill 杀不干净）
function killTree(pid, { force = true } = {}) {
  if (!pid) return false;
  try {
    if (isWin) {
      const args = ['/pid', String(pid), '/T'];
      if (force) args.push('/F');
      return spawnSync('taskkill', args, { stdio: 'ignore' }).status === 0;
    }
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(cyan('正在关闭附属进程...'));
  for (const c of children) killTree(c.pid);
  setTimeout(() => process.exit(code), 600);
}

(async () => {
  const port = readServerPort();
  // 端口被上次没关掉的服务器占用时，先接管（关掉旧实例），避免起一个注定失败的实例
  if (await probePort(port)) {
    if ((await resolveOccupiedServerPort(port)) === ABORT) {
      shutdown(1);
      return;
    }
  }

  const mongod = await ensureMongo();
  if (mongod === ABORT) {
    shutdown(1);
    return;
  }
  if (mongod) {
    mongod.on('exit', (code) => {
      // 我们自己拉起的 Mongo 若意外退出，提示但不强杀服务器
      console.log(yellow(`MongoDB 进程退出（code=${code}）`));
    });
    children.push(mongod);
  }

  if (DRY_RUN) {
    console.log(yellow('[dry-run] 检测完毕，不启动任何进程'));
    shutdown(0);
    return;
  }

  const server = startServer();
  children.push(server);

  server.on('exit', (code) => {
    console.log(cyan(`服务器进程退出（code=${code}），关闭附属进程...`));
    shutdown(code ?? 0);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
})();
