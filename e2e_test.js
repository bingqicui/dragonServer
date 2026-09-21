// 端到端测试：启动服务器（内存 MongoDB + 第三方登录桩），覆盖网关 cmd 全流程与协议兼容。
// 运行前需先 npm run build 生成 dist/。执行：node e2e_test.js
const { spawn } = require('child_process');

const SERVER_DIR = __dirname;
const PORT = 4399;
const BASE = `http://localhost:${PORT}`;

const child = spawn(
  process.execPath,
  ['dist/index.js'],
  {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      ENABLE_MEMORY_DB: 'true',
      AUTH_STUB: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

child.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
child.stderr.on('data', (d) => process.stderr.write('[server-err] ' + d));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name} -> ${detail || ''}`);
    console.log(`  ✗ ${name}  ${detail || ''}`);
  }
}

async function reqRaw(envObj, encrypted, tokenOverride) {
  if (tokenOverride !== undefined) envObj.token = tokenOverride;
  const jsonStr = JSON.stringify(envObj);
  let body = jsonStr;
  if (encrypted) {
    const o = Buffer.from(jsonStr, 'utf8').toString('base64');
    const s = require('crypto').createHash('md5').update(jsonStr + '9572').digest('hex');
    body = JSON.stringify({ o, s });
  }
  const resp = await fetch(BASE + '/gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  let data = null;
  try { data = await resp.json(); } catch {}
  return { status: resp.status, data };
}

async function waitHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function run() {
  const ok = await waitHealth();
  if (!ok) {
    console.error('服务器启动超时');
    child.kill('SIGKILL');
    process.exit(1);
  }
  console.log('服务器就绪，开始测试...\n');

  const uname = 'e2e_acc_' + Date.now();

  let g = await reqRaw({ cmd: 2, payload: { loginType: 0, username: uname, password: '123456' } }, false);
  check('账号登录(cmd=2)', g.data && g.data.ErrorCode === 0 && g.data.Payload && g.data.Payload.token && g.data.Payload.accountId, JSON.stringify(g.data));
  check('登录返回区列表(cmd=2)', g.data && g.data.Payload && Array.isArray(g.data.Payload.zones) && g.data.Payload.zones.length >= 2, JSON.stringify(g.data));
  const accToken = g.data.Payload.token;
  const accountId = g.data.Payload.accountId;

  g = await reqRaw({ cmd: 8, payload: { weaponId: 'sword_01' } }, false, accToken);
  check('账号token不能进游戏接口(cmd=8)', g.data && g.data.ErrorCode !== 0, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 14, payload: { zoneId: 1 } }, false, accToken);
  check('进入1区(cmd=14)', g.data && g.data.ErrorCode === 0 && g.data.Payload.zoneId === 1 && g.data.Payload.userId && g.data.Payload.accountId === accountId, JSON.stringify(g.data));
  const z1Token = g.data.Payload.token;
  const z1UserId = g.data.Payload.userId;

  g = await reqRaw({ cmd: 8, payload: { weaponId: 'sword_01' } }, false, z1Token);
  check('武器解锁(扣500剩500,cmd=8)', g.data && g.data.ErrorCode === 0 && g.data.Payload.coins === 500, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 9, payload: { weaponId: 'sword_01', targetLevel: 2 } }, false, z1Token);
  check('武器升级L2(扣100剩400,cmd=9)', g.data && g.data.ErrorCode === 0 && g.data.Payload.coins === 400, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 9, payload: { weaponId: 'sword_01', targetLevel: 4 } }, false, z1Token);
  check('跳级升级被拦截(cmd=9)', g.data && g.data.ErrorCode !== 0, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 7, payload: {} }, false, z1Token);
  check('武器列表(cmd=7)', g.data && g.data.ErrorCode === 0 && g.data.Payload.weapons, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 4, payload: {} }, false, z1Token);
  check('玩家档案(金币400,cmd=4)', g.data && g.data.ErrorCode === 0 && g.data.Payload.coins === 400 && g.data.Payload.zoneId === 1, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 1001, payload: { userData: { level: 5, exp: 100 } } }, false, z1Token);
  check('保存玩家存档(cmd=1001)', g.data && g.data.ErrorCode === 0 && g.data.Payload.userData.level === 5, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 4, payload: {} }, false, z1Token);
  check('读档(level=5,cmd=4)', g.data && g.data.ErrorCode === 0 && g.data.Payload.userData.level === 5, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 14, payload: { zoneId: 2 } }, false, accToken);
  check('进入2区创角(cmd=14)', g.data && g.data.ErrorCode === 0 && g.data.Payload.zoneId === 2 && g.data.Payload.userId && g.data.Payload.userId !== z1UserId, JSON.stringify(g.data));
  const z2Token = g.data.Payload.token;

  g = await reqRaw({ cmd: 4, payload: {} }, false, z2Token);
  check('2区独立金币1000(cmd=4)', g.data && g.data.ErrorCode === 0 && g.data.Payload.coins === 1000 && g.data.Payload.zoneId === 2, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 4, payload: {} }, false, z1Token);
  check('1区金币不受2区影响(cmd=4)', g.data && g.data.ErrorCode === 0 && g.data.Payload.coins === 400, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 13, payload: {} }, false, accToken);
  const z1 = g.data && g.data.Payload && g.data.Payload.zones && g.data.Payload.zones.find((z) => z.zoneId === 1);
  const z2 = g.data && g.data.Payload && g.data.Payload.zones && g.data.Payload.zones.find((z) => z.zoneId === 2);
  check('区列表标记已有角色(cmd=13)', z1 && z1.hasRole && z2 && z2.hasRole, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 14, payload: { zoneId: 99 } }, false, accToken);
  check('非法区被拦截(cmd=14)', g.data && g.data.ErrorCode !== 0, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 2, payload: { loginType: 1, code: 'wxcode_abc' } }, false);
  check('微信登录(建号,cmd=2)', g.data && g.data.ErrorCode === 0 && g.data.Payload.token && g.data.Payload.accountId, JSON.stringify(g.data));
  const wxAccToken = g.data.Payload.token;
  const wxAccountId = g.data.Payload.accountId;

  g = await reqRaw({ cmd: 2, payload: { loginType: 1, code: 'wxcode_abc' } }, false);
  check('微信登录幂等(同accountId,cmd=2)', g.data && g.data.ErrorCode === 0 && g.data.Payload.accountId === wxAccountId, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 14, payload: { zoneId: 1 } }, false, wxAccToken);
  check('微信进入1区(cmd=14)', g.data && g.data.ErrorCode === 0 && g.data.Payload.token, JSON.stringify(g.data));
  const wxGameToken = g.data.Payload.token;

  g = await reqRaw({ cmd: 2, payload: { loginType: 2, idToken: 'ggtoken_xyz' } }, false);
  check('Google登录(建号,cmd=2)', g.data && g.data.ErrorCode === 0 && g.data.Payload.token, JSON.stringify(g.data));
  const ggAccToken = g.data.Payload.token;

  g = await reqRaw({ cmd: 2, payload: { loginType: 99 } }, false);
  check('非法loginType被拦截(cmd=2)', g.data && g.data.ErrorCode !== 0, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 4, payload: {} }, false, wxGameToken);
  check('微信游戏token可用(cmd=4)', g.data && g.data.ErrorCode === 0 && g.data.Payload.username.startsWith('wechat_'), JSON.stringify(g.data));

  g = await reqRaw({ cmd: 14, payload: { zoneId: 1 } }, false, ggAccToken);
  const ggGameToken = g.data && g.data.Payload && g.data.Payload.token;
  g = await reqRaw({ cmd: 4, payload: {} }, false, ggGameToken);
  check('Google游戏token可用(cmd=4)', g.data && g.data.ErrorCode === 0 && g.data.Payload.username.startsWith('google_'), JSON.stringify(g.data));

  g = await reqRaw({ cmd: 5, payload: {} }, false);
  check('网关心跳(明文)', g.data && g.data.ErrorCode === 0, JSON.stringify(g.data));

  g = await reqRaw({ cmd: 5, payload: {} }, true);
  check('网关心跳(加密验签)', g.data && g.data.ErrorCode === 0, JSON.stringify(g.data));

  {
    const jsonStr = JSON.stringify({ cmd: 5, payload: {} });
    const badBody = JSON.stringify({ o: Buffer.from(jsonStr, 'utf8').toString('base64'), s: 'deadbeef' });
    const r17 = await fetch(BASE + '/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: badBody,
    });
    let d17 = null;
    try { d17 = await r17.json(); } catch {}
    check('网关坏签名被拦截', d17 && d17.ErrorCode !== 0, JSON.stringify(d17));
  }

  g = await reqRaw({ cmd: 99999, payload: {} }, false);
  check('网关未知cmd被拦截', g.data && g.data.ErrorCode !== 0, JSON.stringify(g.data));

  console.log(`\n结果：通过 ${passed} / 失败 ${failed}`);
  if (failed > 0) {
    console.log('失败项：\n - ' + failures.join('\n - '));
  }
}

run()
  .catch((e) => {
    console.error('测试异常：', e);
    failed++;
  })
  .finally(() => {
    try { child.kill('SIGKILL'); } catch {}
    process.exit(failed > 0 ? 1 : 0);
  });
