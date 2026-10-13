import { buildResponse, GatewayResponse } from '../utils/gateway';
import { RequestStore } from '../utils/requestContext';
import { Ctx } from './handlers/types';
import { PushItem } from '../types/gateway';
import { pushArchiveFor } from './roleArchive';
import { CMD } from './cmd';

/**
 * 收尾：本次请求若改了 playerInfo，再附一条 10002。
 * 无推送时返回单条对象；有推送时返回数组。前端两种都认。
 */
export async function finalizeResponse(opts: {
  cmd: number;
  result: any;
  ctx: Ctx;
  store: RequestStore;
}): Promise<GatewayResponse | GatewayResponse[]> {
  const { cmd, result, ctx, store } = opts;

  const wrapped = result && typeof result === 'object' && !Array.isArray(result);
  // 仅当 handler 显式带上 pushes 数组时才按 { data, pushes } 解包，
  // 避免业务 payload 里恰好有 data 字段时被误拆
  const hasPushes = wrapped && Array.isArray((result as any).pushes);
  const mainData = hasPushes ? (result as any).data : result;
  const pushes: PushItem[] = hasPushes ? [...(result as any).pushes] : [];

  await appendArchive(pushes, store.playerInfoRoleId, ctx.clientIp);

  const mainEnv = buildResponse({ code: 0, action: cmd, data: mainData ?? {}, error: 0 });
  if (!pushes.length) return mainEnv;
  return [mainEnv, ...envelopes(pushes)];
}

/** 业务失败时把已经解析到的角色档案附在错误回包后面。系统错误不要调用 */
export async function withArchivePush(
  main: GatewayResponse,
  roleId: string | undefined,
  clientIp?: string
): Promise<GatewayResponse | GatewayResponse[]> {
  const pushes: PushItem[] = [];
  await appendArchive(pushes, roleId, clientIp);
  const extra = pushes.filter((p) => p.action !== main.action);
  if (!extra.length) return main;
  return [main, ...envelopes(extra)];
}

/**
 * 汇总服务端主动推送。后续红点、资源流转等加在这里。
 * playerInfo 有改动时附 10002。改道具、武器不走这里。
 */
async function appendArchive(pushes: PushItem[], roleId: string | undefined, clientIp?: string): Promise<void> {
  if (!roleId) return;
  if (pushes.some((p) => p.action === CMD.ROLE_ARCHIVE_PUSH)) return;
  const push = await pushArchiveFor(roleId, clientIp);
  if (push) pushes.push(push);
}

function envelopes(pushes: PushItem[]): GatewayResponse[] {
  return pushes.map((p) => buildResponse({ code: 0, action: p.action, data: p.data ?? {}, error: 0 }));
}
