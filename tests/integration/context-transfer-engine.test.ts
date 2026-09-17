import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { ContextTransferEngine, type TransferDriverPort } from '../../packages/core-service/context-transfer-engine.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

// WC01:一次性 Context Transfer 引擎闭环(fixture 端口;真实 harness 端口由 WC02/WC05 live 覆盖)。
async function fixture(portOverrides: Partial<TransferDriverPort> = {}, capability = 'FULL_VISIBLE') {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/ctxfer-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_ctxfer',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  const calls: Record<string, number> = {};
  const port: TransferDriverPort = {
    exportContext: async () => { calls.export = (calls.export ?? 0) + 1; return { text: 'CTX-MARKER-alpha-42', truncated: false }; },
    initializeTarget: async () => { calls.init = (calls.init ?? 0) + 1; return { nativeSessionRef: 'native-target-1', confirmed: true }; },
    confirmTarget: async () => { calls.confirm = (calls.confirm ?? 0) + 1; return { confirmed: true }; },
    targetWindowTokens: async () => 1000,
    sourceCapacity: async () => ({ windowTokens: 800, usageTokens: null }),
    ...portOverrides,
  };
  const ports = new Map([['pi', port]]);
  const extension = new RoleSessionExtension(
    db,
    undefined,
    () => ({ historyExport: capability }),
    ports,
  );
  server.roleSession = extension;
  const engine = new ContextTransferEngine({
    db,
    ports,
    // 在请求事务返回后同步启动;fake 端口的微任务使引擎步骤运行在事务提交之后。
    schedule: (fn) => fn(),
    commit: (input) => extension.commitTransfer(input),
  });
  extension.attachTransferEngine(engine);
  server.externalApi = undefined;
  const snap = await s.request('system.snapshot', {}),
    lease = await s.request('control.acquire', {}, { operationId: 'op_lease', expectedRevision: snap.revision, scope: {} });
  let n = 0;
  const write = async (m: Method, p: any, scope: Scope = {}, op?: string) =>
    s.request(m, p, {
      operationId: op ?? 'op_' + ++n,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
      scope,
      leaseId: (lease as { leaseId: string }).leaseId,
    });
  const roots = await s.request('filesystem.listRoots', {});
  const project = (await write('project.create', { name: '迁移闭环项目', path_handle: roots.items[0].pathHandle })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  plan.roles[0].workspace_ref = ws.items[0].id;
  const v = await s.request('rolePlan.validate', { plan });
  await write('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] }, { project_id: project.id }, 'apply');
  const snap2 = await s.request('system.snapshot', {});
  const roleId = (snap2.roles as { id: string }[])[0].id;
  // 种子 ACTIVE WS 并附 native ref(生产中由真实 Run 写入;此处直接以 DB 代表原生侧事实)。
  const listing0 = (await s.request('roleSession.list' as never, { role_id: roleId } as never)) as unknown as { sessions: { id: string }[] };
  const firstSessionId = listing0.sessions[0].id;
  db.prepare('update role_sessions set native_session_ref=? where id=?').run('native-source-1', firstSessionId);
  let rk = 0;
  const intents = new Map<string, { preflightHash: string; expectedRevision: number }>();
  const rsCall = async (method: string, params: Record<string, unknown>, requestKey = 'rk' + ++rk) => {
    // 同 request_key 的重试=原样重发同一 intent(相同 preflight/revision);新 key 才取新快照。
    let intent = intents.get(requestKey);
    if (!intent) {
      const pre = (await s.request('roleSession.preflight' as never, { role_id: params.role_id } as never)) as unknown as { preflight_hash: string };
      intent = { preflightHash: pre.preflight_hash, expectedRevision: (await s.request('system.snapshot', {})).revision };
      intents.set(requestKey, intent);
    }
    return s.request(method as never, params as never, {
      leaseId: (lease as { leaseId: string }).leaseId,
      requestKey,
      operationId: 'rsop_' + requestKey,
      expectedRevision: intent.expectedRevision,
      preflightHash: intent.preflightHash,
    } as never) as unknown as Promise<Record<string, any>>;
  };
  const settle = async (opId: string, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const st = (await s.request('roleSession.transferStatus' as never, { role_id: roleId, op_id: opId } as never)) as unknown as { state: string; error_code?: string | null; session?: any };
      if (st.state === 'COMMITTED' || st.state === 'FAILED') return st;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error('TRANSFER_SETTLE_TIMEOUT');
  };
  return { db, s, roleId, firstSessionId, port, calls, rsCall, settle };
}

it('SH-02:T≥S 且 A=null 直接迁移;提交后新 WS 携带 native ref,旧 WS 归档', async () => {
  const f = await fixture();
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '继承会话', context_mode: 'inherit' })) as any;
  expect(created.transfer?.op_id).toBeTruthy();
  const st = await f.settle(created.transfer.op_id);
  expect(st.state).toBe('COMMITTED');
  expect(st.session?.hasNativeSession).toBe(true);
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[]; active_session_id: string };
  const actives = listing.sessions.filter((x) => x.state === 'ACTIVE');
  expect(actives).toHaveLength(1);
  expect(actives[0].id).not.toBe(f.firstSessionId);
  expect(listing.sessions.find((x) => x.id === f.firstSessionId)?.state).toBe('ARCHIVED');
});

it('SH-03:目标初始化失败 → 原 ACTIVE 与 binding 原样,op=FAILED', async () => {
  const f = await fixture({ initializeTarget: async () => { throw Error('down'); } });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '继承失败', context_mode: 'inherit' })) as any;
  const st = await f.settle(created.transfer.op_id);
  expect(st.state).toBe('FAILED');
  expect(st.error_code).toBe('CONTEXT_TARGET_INIT_FAILED');
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[]; active_session_id: string };
  expect(listing.active_session_id).toBe(f.firstSessionId);
  expect(listing.sessions).toHaveLength(1);
});

it('T<S 且 A 未知 → ASK_USER 显式失败;COMPRESS 无通道 → 显式失败', async () => {
  const ask = await fixture({ targetWindowTokens: async () => 500 });
  const c1 = (await ask.rsCall('roleSession.create', { role_id: ask.roleId, name: 'ask', context_mode: 'inherit' })) as any;
  expect((await ask.settle(c1.transfer.op_id)).error_code).toBe('CONTEXT_CAPACITY_ASK_USER');
  const comp = await fixture({ targetWindowTokens: async () => 100, sourceCapacity: async () => ({ windowTokens: 800, usageTokens: 900 }) });
  const c2 = (await comp.rsCall('roleSession.create', { role_id: comp.roleId, name: 'comp', context_mode: 'inherit' })) as any;
  expect((await comp.settle(c2.transfer.op_id)).error_code).toBe('CONTEXT_SOURCE_COMPRESSION_UNAVAILABLE');
});

it('SH-01:来源能力非 FULL_VISIBLE → create 即显式拒绝(不再硬编码放行/拒绝)', async () => {
  const f = await fixture({}, 'PARTIAL');
  await expect(f.rsCall('roleSession.create', { role_id: f.roleId, name: 'x', context_mode: 'inherit' })).rejects.toThrow('CONTEXT_EXPORT_UNSUPPORTED');
});

it('重启后 SEEDED 恢复走 confirm 且只提交一次;相同 request_key 不重复创建', async () => {
  const f = await fixture({ initializeTarget: async (i) => { await new Promise((r) => setTimeout(r, 150)); return { nativeSessionRef: 'native-target-1', confirmed: true }; } });
  // 直接构造一次"初始化已发出但进程中断"的持久状态:SEEDED + 持久目标引用(等价 ops 表的崩溃核对职责)。
  const listing0 = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[] };
  const activeId = listing0.sessions.find((x) => x.state === 'ACTIVE')!.id;
  const opId = 'ctop_' + 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  f.db
    .prepare("insert into context_transfer_ops(id,role_id,from_session_id,to_session_id,mode,capacity_json,state,created_at_ms,updated_at_ms) values(?,?,?,NULL,'inherit',?,'SEEDED',?,?)")
    .run(opId, f.roleId, activeId, JSON.stringify({ target_harness: 'pi', source_harness: 'pi', name: '恢复会话', target_native_ref: 'native-target-9' }), Date.now(), Date.now());
  // 重启:同库重建 extension/engine(新实例),恢复 SEEDED → confirm → 提交一次
  const extension2 = new RoleSessionExtension(f.db, undefined, () => ({ historyExport: 'FULL_VISIBLE' }), new Map([['pi', f.port]]));
  const engine2 = new ContextTransferEngine({ db: f.db, ports: new Map([['pi', f.port]]), schedule: (fn) => fn(), commit: (i) => extension2.commitTransfer(i) });
  extension2.attachTransferEngine(engine2);
  engine2.resumeInterrupted();
  await new Promise((r) => setTimeout(r, 30));
  const st2 = (await f.s.request('roleSession.transferStatus' as never, { role_id: f.roleId, op_id: opId } as never)) as unknown as { state: string; error_code?: string | null; session?: any };
  expect(st2.state).toBe('COMMITTED');
  expect(f.calls.confirm).toBe(1);
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[] };
  expect(listing.sessions.filter((x) => x.state === 'ACTIVE')).toHaveLength(1);
  // 已终态的 op 再 resume 不动(不重复提交)
  engine2.resumeInterrupted();
  await new Promise((r) => setTimeout(r, 20));
  const listing2 = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[] };
  expect(listing2.sessions.filter((x) => x.state === 'ACTIVE')).toHaveLength(1);
  // 同 request_key 重放:世界状态未变(preflight 哈希一致)→ 账本返回同一结果,不重复创建/初始化;
  // 已提交后状态已变 → 显式 OPERATION_CONFLICT(防陈旧意图盲重放),客户端以 transferStatus 为准。
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '正常迁移', context_mode: 'inherit' }, 'rk-same')) as any;
  const replay = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '正常迁移', context_mode: 'inherit' }, 'rk-same')) as any;
  expect(JSON.stringify(replay)).toBe(JSON.stringify(created));
  await f.settle(created.transfer.op_id);
  // 账本幂等:提交后再重放同一 intent → 返回原始句柄(不新建/不重复初始化);客户端以 transferStatus 为准。
  const again = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '正常迁移', context_mode: 'inherit' }, 'rk-same')) as any;
  expect(again.transfer.op_id).toBe(created.transfer.op_id);
  const st3 = (await f.s.request('roleSession.transferStatus' as never, { role_id: f.roleId, op_id: created.transfer.op_id } as never)) as unknown as { state: string };
  expect(st3.state).toBe('COMMITTED');
  const ops = f.db.prepare('select count(*) c from context_transfer_ops').get() as { c: number };
  expect(ops.c).toBe(2); // 手工 SEEDED 一条 + 正常迁移一条
});
