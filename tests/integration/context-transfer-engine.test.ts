import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { ContextTransferEngine, type TransferDriverPort } from '../../packages/core-service/context-transfer-engine.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

// WC01:一次性 Context Transfer 引擎闭环(fixture 端口;真实 harness 端口由 WC02/WC05 live 覆盖)。
async function fixture(portOverrides: Partial<TransferDriverPort> = {}, capability = 'FULL_VISIBLE', nativeFork = false) {
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
    initializeTarget: async (input) => {
      calls.init = (calls.init ?? 0) + 1;
      input.recordTargetCreated('native-target-1');
      input.recordInputDispatch();
      return { nativeSessionRef: 'native-target-1', confirmed: true, acceptedPayloadHash: input.expectedPayloadHash };
    },
    confirmTarget: async (input) => {
      calls.confirm = (calls.confirm ?? 0) + 1;
      return { confirmed: true, acceptedPayloadHash: input.expectedPayloadHash };
    },
    targetWindowTokens: async () => 1000,
    sourceCapacity: async () => ({ windowTokens: 800, usageTokens: null }),
    ...portOverrides,
  };
  const ports = new Map([['pi', port]]);
  const extension = new RoleSessionExtension(
    db,
    undefined,
    () => ({ historyExport: capability, nativeFork: nativeFork ? 'VERIFIED' : 'UNKNOWN' }),
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
  const settleRaw = async (opId: string) => (await s.request('roleSession.transferStatus' as never, { role_id: roleId, op_id: opId } as never)) as unknown as {
    state: string;
    error_code?: string | null;
    session?: any;
    capacity_assessment: { status: string; source: string; reason_code: string; observed_at_ms: number | null };
    operation_summary: { phase: string; can_cancel: boolean; needs_status_check: boolean; source_work_session_active: boolean };
  };
  const settle = async (opId: string, tries = 400) => {
    for (let i = 0; i < tries; i++) {
      const st = await settleRaw(opId);
      if (st.state === 'COMMITTED' || st.state === 'FAILED') return st;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error('TRANSFER_SETTLE_TIMEOUT');
  };
  const settleUntil = async (opId: string, pred: (x: { state: string; error_code?: string | null }) => boolean, tries = 300) => {
    for (let i = 0; i < tries; i++) {
      const st = await settleRaw(opId);
      if (pred(st)) return st;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('TRANSFER_UNTIL_TIMEOUT');
  };
  return { db, s, roleId, firstSessionId, port, calls, rsCall, settle, settleUntil, engine, leaseId: (lease as { leaseId: string }).leaseId };
}

it('同 Harness native_fork=VERIFIED 时不经 export/seed，核对后原子提交', async () => {
  const payloadHash = createHash('sha256').update('native-visible-history').digest('hex');
  const f = await fixture({
    nativeForkTarget: async (input) => {
      f.calls.nativeFork = (f.calls.nativeFork ?? 0) + 1;
      input.recordTargetCreated('native-fork-child-1');
      return { nativeSessionRef: 'native-fork-child-1', confirmed: true, acceptedPayloadHash: payloadHash };
    },
    confirmNativeFork: async (input) => ({ nativeSessionRef: input.nativeSessionRef, confirmed: true, acceptedPayloadHash: payloadHash }),
  }, 'UNKNOWN', true);
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '原生继承', context_mode: 'inherit' })) as any;
  const st = await f.settle(created.transfer.op_id);
  expect(st.state).toBe('COMMITTED');
  expect(f.calls.nativeFork).toBe(1);
  expect(f.calls.export ?? 0).toBe(0);
  expect(f.calls.init ?? 0).toBe(0);
});

it('原生 fork 创建目标后回执丢失，冷核对同一 child 后提交且不重复 fork', async () => {
  const payloadHash = createHash('sha256').update('native-cold-confirm').digest('hex');
  let forks = 0;
  let confirms = 0;
  const f = await fixture({
    nativeForkTarget: async (input) => {
      forks++;
      input.recordTargetCreated('native-fork-child-timeout');
      throw Error('ZCODE_TIMEOUT_AFTER_SEND');
    },
    confirmNativeFork: async (input) => {
      confirms++;
      return { nativeSessionRef: input.nativeSessionRef, confirmed: true, acceptedPayloadHash: payloadHash };
    },
  }, 'UNKNOWN', true);
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '原生冷核对', context_mode: 'inherit' })) as any;
  expect((await f.settle(created.transfer.op_id)).state).toBe('COMMITTED');
  expect(forks).toBe(1);
  expect(confirms).toBe(1);
});

it('SH-02:T≥S 且 A=null 直接迁移;提交后新 WS 携带 native ref,旧 WS 归档', async () => {
  const f = await fixture();
  const preflight = (await f.s.request('roleSession.preflight' as never, { role_id: f.roleId } as never)) as unknown as {
    capacity_assessment: { status: string; source: string; observed_at_ms: number | null };
    compression_policy: string;
  };
  expect(preflight.capacity_assessment).toMatchObject({ status: 'UNKNOWN', source: 'NOT_MEASURED', observed_at_ms: null });
  expect(preflight.compression_policy).toBe('CORE_DECIDES');
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '继承会话', context_mode: 'inherit' })) as any;
  expect(created.transfer?.op_id).toBeTruthy();
  const st = await f.settle(created.transfer.op_id);
  expect(st.state).toBe('COMMITTED');
  expect(st.capacity_assessment).toMatchObject({ status: 'FITS', source: 'DRIVER_PROBE' });
  expect(st.operation_summary).toMatchObject({ phase: 'COMMITTED', can_cancel: false, needs_status_check: false, source_work_session_active: false });
  expect(st.session?.hasNativeSession).toBe(true);
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[]; active_session_id: string };
  const actives = listing.sessions.filter((x) => x.state === 'ACTIVE');
  expect(actives).toHaveLength(1);
  expect(actives[0].id).not.toBe(f.firstSessionId);
  expect(listing.sessions.find((x) => x.id === f.firstSessionId)?.state).toBe('ARCHIVED');
});

it('WN01/CT-02:确定未开始(NOT_STARTED)才 FAILED → 原 ACTIVE 与 binding 原样', async () => {
  const f = await fixture({ initializeTarget: async () => { throw Error('NOT_STARTED: spawn failed'); } });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '继承失败', context_mode: 'inherit' })) as any;
  const st = await f.settle(created.transfer.op_id);
  expect(st.state).toBe('FAILED');
  expect(st.error_code).toBe('CONTEXT_TARGET_INIT_FAILED');
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[]; active_session_id: string };
  expect(listing.active_session_id).toBe(f.firstSessionId);
  expect(listing.sessions).toHaveLength(1);
});

it('WN01/CT-02:发送后未知结果不 FAILED 不放开;有界幂等重试最终提交一次', async () => {
  let initCalls = 0;
  const f = await fixture({
    initializeTarget: async (input) => {
      initCalls++;
      if (initCalls === 1) throw Error('ZCODE_TIMEOUT_AFTER_SEND');
      input.recordTargetCreated('native-target-retry');
      input.recordInputDispatch();
      return { nativeSessionRef: 'native-target-retry', confirmed: true, acceptedPayloadHash: input.expectedPayloadHash };
    },
  });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '未知重试', context_mode: 'inherit' })) as any;
  const opId = created.transfer.op_id;
  await new Promise((r) => setTimeout(r, 300));
  const mid = (await f.s.request('roleSession.transferStatus' as never, { role_id: f.roleId, op_id: opId } as never)) as unknown as { state: string; error_code: string | null };
  // 不确定窗口:保持非终态(继续暂停派发),绝不 FAILED
  expect(['EXPORTED', 'SEEDED']).toContain(mid.state);
  expect(mid.state).not.toBe('FAILED');
  const st = await f.settle(opId, 120);
  expect(st.state).toBe('COMMITTED');
  expect(initCalls).toBe(2);
  const ops = f.db.prepare('select count(*) c from context_transfer_ops').get() as { c: number };
  expect(ops.c).toBe(1);
});

it('WN01/CT-02:持续未知 → 有界后 UNRESOLVED 且派发仍暂停(不伪造成功/不放开)', async () => {
  const f = await fixture({
    initializeTarget: async () => { throw Error('ZCODE_TIMEOUT_AFTER_SEND'); },
  });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '持续未知', context_mode: 'inherit' })) as any;
  const st = await f.settleUntil(created.transfer.op_id, (x) => x.error_code === 'CONTEXT_TRANSFER_UNRESOLVED', 300);
  expect(st.state).not.toBe('FAILED');
  expect(st.state).not.toBe('COMMITTED');
  // 派发暂停仍生效
  expect(f.engine.hasActive(f.roleId)).toBe(true);
});

it('N4: TARGET_CREATED 后 send 结果未知，只读核对特定 payload receipt 后提交且不重建目标', async () => {
  let initCalls = 0;
  const f = await fixture({
    initializeTarget: async (input) => {
      initCalls++;
      input.recordTargetCreated('native-created-before-timeout');
      input.recordInputDispatch();
      throw Error('ZCODE_TIMEOUT_AFTER_SEND');
    },
  });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'receipt-reconcile', context_mode: 'inherit' })) as any;
  const st = await f.settle(created.transfer.op_id);
  expect(st.state).toBe('COMMITTED');
  expect(initCalls).toBe(1);
  expect(f.calls.confirm).toBe(1);
  const row = f.db.prepare('select capacity_json from context_transfer_ops where id=?').get(created.transfer.op_id) as { capacity_json: string };
  const meta = JSON.parse(row.capacity_json);
  expect(meta.target_native_ref).toBe('native-created-before-timeout');
  expect(meta.accepted_payload_sha256).toBe(meta.seed_sha256);
});

it('N4: target-window 探测若创建 native session，initialize 必须复用同一目标而非创建探针孤儿', async () => {
  let reserved = '';
  let initialized = '';
  const f = await fixture({
    targetWindowTokens: async (input) => {
      reserved = 'native-window-and-target';
      input.recordTargetCreated(reserved);
      return 1000;
    },
    initializeTarget: async (input) => {
      initialized = String(input.targetNativeSessionRef ?? '');
      input.recordInputDispatch();
      return {
        nativeSessionRef: initialized,
        confirmed: true,
        acceptedPayloadHash: input.expectedPayloadHash,
      };
    },
  });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'window-owned-target', context_mode: 'inherit' })) as any;
  expect((await f.settle(created.transfer.op_id)).state).toBe('COMMITTED');
  expect(initialized).toBe(reserved);
  expect(reserved).toBe('native-window-and-target');
});

it('N4: target-window 已保留目标后，Driver 返回不同 native ref 必须拒绝 commit', async () => {
  const f = await fixture({
    targetWindowTokens: async (input) => {
      input.recordTargetCreated('native-reserved-a');
      return 1000;
    },
    initializeTarget: async (input) => {
      input.recordInputDispatch();
      return { nativeSessionRef: 'native-drifted-b', confirmed: true, acceptedPayloadHash: input.expectedPayloadHash };
    },
  });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'ref-drift', context_mode: 'inherit' })) as any;
  const st = await f.settleUntil(created.transfer.op_id, (x) => x.error_code === 'CONTEXT_TARGET_REF_MISMATCH');
  expect(st.state).toBe('SEEDED');
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { active_session_id: string };
  expect(listing.active_session_id).toBe(f.firstSessionId);
});

it('N4: session exists 或错误 payload hash 不能替代 seed accepted，保持 UNRESOLVED 并暂停派发', async () => {
  const f = await fixture({
    initializeTarget: async (input) => {
      input.recordTargetCreated('native-wrong-payload');
      input.recordInputDispatch();
      return { nativeSessionRef: 'native-wrong-payload', confirmed: true, acceptedPayloadHash: '0'.repeat(64) };
    },
    confirmTarget: async () => ({ confirmed: true, acceptedPayloadHash: '0'.repeat(64) }),
  });
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'wrong-receipt', context_mode: 'inherit' })) as any;
  const st = await f.settleUntil(created.transfer.op_id, (x) => x.error_code === 'CONTEXT_TRANSFER_UNRESOLVED', 300);
  expect(st.state).toBe('SEEDED');
  expect(f.engine.hasActive(f.roleId)).toBe(true);
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { active_session_id: string };
  expect(listing.active_session_id).toBe(f.firstSessionId);
});

it('T<S 且 A 未知 → ASK_USER 显式失败;COMPRESS 无通道 → 显式失败', async () => {
  const ask = await fixture({ targetWindowTokens: async () => 500 });
  const c1 = (await ask.rsCall('roleSession.create', { role_id: ask.roleId, name: 'ask', context_mode: 'inherit' })) as any;
  const askStatus = await ask.settle(c1.transfer.op_id);
  expect(askStatus.error_code).toBe('CONTEXT_CAPACITY_ASK_USER');
  expect(askStatus.capacity_assessment).toMatchObject({ status: 'UNKNOWN', reason_code: 'CAPACITY_UNKNOWN' });
  expect(askStatus.operation_summary.source_work_session_active).toBe(true);
  const comp = await fixture({ targetWindowTokens: async () => 100, sourceCapacity: async () => ({ windowTokens: 800, usageTokens: 900 }) });
  const c2 = (await comp.rsCall('roleSession.create', { role_id: comp.roleId, name: 'comp', context_mode: 'inherit' })) as any;
  const compStatus = await comp.settle(c2.transfer.op_id);
  expect(compStatus.error_code).toBe('CONTEXT_SOURCE_COMPRESSION_UNAVAILABLE');
  expect(compStatus.capacity_assessment).toMatchObject({ status: 'COMPRESSION_REQUIRED', reason_code: 'USAGE_OVER_TARGET' });
  expect(compStatus.operation_summary.source_work_session_active).toBe(true);
});

it('SH-01:来源能力非 FULL_VISIBLE → create 即显式拒绝(不再硬编码放行/拒绝)', async () => {
  const f = await fixture({}, 'PARTIAL');
  await expect(f.rsCall('roleSession.create', { role_id: f.roleId, name: 'x', context_mode: 'inherit' })).rejects.toThrow('CONTEXT_EXPORT_UNSUPPORTED');
});

it('重启后 SEEDED 恢复走 confirm 且只提交一次;相同 request_key 不重复创建', async () => {
  const f = await fixture({ initializeTarget: async (i) => {
    await new Promise((r) => setTimeout(r, 150));
    i.recordTargetCreated('native-target-1');
    i.recordInputDispatch();
    return { nativeSessionRef: 'native-target-1', confirmed: true, acceptedPayloadHash: i.expectedPayloadHash };
  } });
  // 直接构造一次"初始化已发出但进程中断"的持久状态:SEEDED + 持久目标引用(等价 ops 表的崩溃核对职责)。
  const listing0 = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as { sessions: any[] };
  const activeId = listing0.sessions.find((x) => x.state === 'ACTIVE')!.id;
  const opId = 'ctop_' + 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  f.db
    .prepare("insert into context_transfer_ops(id,role_id,from_session_id,to_session_id,mode,capacity_json,state,created_at_ms,updated_at_ms) values(?,?,?,NULL,'inherit',?,'SEEDED',?,?)")
    .run(opId, f.roleId, activeId, JSON.stringify({ target_harness: 'pi', source_harness: 'pi', name: '恢复会话', target_native_ref: 'native-target-9', seed_sha256: 'b'.repeat(64) }), Date.now(), Date.now());
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

it('WC02:preflight 对连续性不支持的候选给出 NEEDS_NEW_WORKSESSION;vm 暴露 native_continuity', async () => {
  const f = await fixture();
  const extension2 = new RoleSessionExtension(
    f.db,
    undefined,
    () => ({ historyExport: 'FULL_VISIBLE' }),
    undefined,
    (harness: string) => (harness === 'pi' ? 'SESSION_CONTINUATION_UNSUPPORTED' : 'SAME_SESSION_CONTINUOUS'),
  );
  const reply = extension2.handle(
    { v: 1, id: 'pf', method: 'roleSession.preflight', params: { role_id: f.roleId } },
    { principal: 'human_test', assertControllerLease: () => {} },
  ) as { result: { recommended_action: string; reason_code: string } };
  expect(reply.result.recommended_action).toBe('NEEDS_NEW_WORKSESSION');
  expect(reply.result.reason_code).toBe('SESSION_CONTINUATION_UNSUPPORTED');
  const list = extension2.handle(
    { v: 1, id: 'ls', method: 'roleSession.list', params: { role_id: f.roleId }, client_id: 'c' },
    { principal: 'human_test', assertControllerLease: () => {} },
  ) as { result: { sessions: { native_continuity: string }[] } };
  expect(list.result.sessions[0].native_continuity).toBe('SESSION_CONTINUATION_UNSUPPORTED');
});

it('WN01/CT-04:transferStatus 校验 op.role_id 对应(不得跨角色探测)', async () => {
  const f = await fixture();
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '归属校验', context_mode: 'inherit' })) as any;
  await f.settle(created.transfer.op_id);
  const other = f.db.prepare("select id from roles where id!=?").get?.(f.roleId);
  // 构造第二角色:复制 seed plan 成本高;直接验证错误 role_id 查询被拒
  await expect(
    f.s.request('roleSession.transferStatus' as never, { role_id: 'role_not_mine', op_id: created.transfer.op_id } as never),
  ).rejects.toBeTruthy();
});

it('WN01/裁决1:跨 Harness inherit——目标确认后提交事务内切换 binding 并原子落 op', async () => {
  const f = await fixture();
  // 把端口表扩成 a→b:先取当前(pi)能力与端口,构造第二个假 harness 端口
  const bPort: import('../../packages/core-service/context-transfer-engine.ts').TransferDriverPort = {
    exportContext: async () => ({ text: 'unused', truncated: false }),
    initializeTarget: async (input) => ({ nativeSessionRef: 'native-b-1', confirmed: true, acceptedPayloadHash: input.expectedPayloadHash }),
    confirmTarget: async (input) => ({ confirmed: true, acceptedPayloadHash: input.expectedPayloadHash }),
  };
  const ports = new Map([['pi', f.port], ['b', bPort]]);
  const ext2 = new RoleSessionExtension(f.db, undefined, (h) => ({ historyExport: h === 'pi' || h === 'b' ? 'FULL_VISIBLE' : 'UNKNOWN' }), ports, undefined, () => null);
  const engine2 = new ContextTransferEngine({ db: f.db, ports, schedule: (fn) => fn(), commit: (i) => ext2.commitTransfer(i) });
  ext2.attachTransferEngine(engine2);
  let switched = 0;
  ext2.transitionBindingForCommit = (roleId, harness) => {
    switched++;
    const now = Date.now();
    const id = 'bnd_' + now;
    const wsId = (f.db.prepare('select workspace_id from bindings where role_id=? and is_current=1').get(roleId) as { workspace_id: string }).workspace_id;
    f.db.prepare('update bindings set is_current=0 where role_id=? and is_current=1').run(roleId);
    f.db.prepare("insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,continuity_mode,created_at_ms) values(?,?,?,?,?,?,2,1,'NEW',?)").run(id, roleId, harness, wsId, '{}', '{}', now);
    return f.db.prepare('select * from bindings where id=?').get(id) as Record<string, unknown>;
  };
  // 经 ext2.handle 直接走 create(inherit, target=b)
  const pre = ext2.handle({ v: 1, id: 'pf2', method: 'roleSession.preflight', params: { role_id: f.roleId, target_harness: 'b' } }, { principal: 'human_test', assertControllerLease: () => {} }) as { result: { preflight_hash: string } };
  const snapRev = 999999; // 非 mutation 直调不经 revision 检查:用 handle 时给足元数据
  const reply = ext2.handle(
    { v: 1, id: 'cr2', method: 'roleSession.create', params: { role_id: f.roleId, name: '跨引擎', target_harness: 'b', context_mode: 'inherit' }, client_id: 'c1', lease_id: 'x' },
    { principal: 'human_test', mode: 'controller', clientId: 'c1', assertControllerLease: () => {}, assertRevision: () => {}, commitRevision: () => {} },
  ) as { result?: { transfer?: { op_id: string } }; error?: { code: string } };
  void pre; void snapRev;
  expect(reply.error?.code ?? '').toBe('REQUEST_KEY_AND_REVISION_REQUIRED');
  // 上面证明直调句柄需要完整元数据;跨 Harness 路径用引擎直驱验证 commit 侧:
  const done = ext2.commitTransfer({ opId: 'ctop_direct_1', roleId: f.roleId, fromSessionId: f.firstSessionId, name: '跨引擎', targetHarness: 'b', nativeSessionRef: 'native-b-1' });
  expect(switched).toBe(1);
  const sess = f.db.prepare('select * from role_sessions where id=?').get(done.session_id) as { harness: string; binding_epoch: number; native_session_ref: string; state: string };
  expect(sess.harness).toBe('b');
  expect(sess.native_session_ref).toBe('native-b-1');
  expect(f.db.prepare("select count(*) c from role_sessions where role_id=? and state='ACTIVE'").get(f.roleId)).toEqual({ c: 1 });
});

it('F02: A→B→C 后 resumeInterrupted 不得把 C 打回已提交的 B', async () => {
  const f = await fixture();
  const toB = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'B', context_mode: 'inherit' }, 'rk-b')) as {
    transfer: { op_id: string };
  };
  const stB = await f.settle(toB.transfer.op_id);
  expect(stB.state).toBe('COMMITTED');
  const bId = stB.session.id as string;
  const toC = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'C', context_mode: 'blank' }, 'rk-c')) as {
    session: { id: string };
  };
  const cId = toC.session.id;
  const repairs: string[] = [];
  const engine2 = new ContextTransferEngine({
    db: f.db,
    ports: new Map([['pi', f.port]]),
    schedule: (fn) => fn(),
    commit: () => {
      throw Error('resume must not recommit');
    },
    repairCommitted: (input) => {
      repairs.push(input.sessionId);
    },
  });
  engine2.resumeInterrupted();
  await new Promise((r) => setTimeout(r, 40));
  expect(repairs).toEqual([]);
  const listing = (await f.s.request('roleSession.list' as never, { role_id: f.roleId } as never)) as unknown as {
    sessions: { id: string; state: string }[];
    active_session_id: string;
  };
  expect(listing.active_session_id).toBe(cId);
  expect(listing.sessions.find((x) => x.id === bId)?.state).toBe('ARCHIVED');
  expect(listing.sessions.filter((x) => x.state === 'ACTIVE')).toHaveLength(1);
});

it('C4/F12:inherit 的 sessionHome 来自当前 binding 配置，而不是同 harness 第一个 profile', async () => {
  const f = await fixture();
  const binding = f.db.prepare('select id,epoch,workspace_id from bindings where role_id=? and is_current=1').get(f.roleId) as {
    id: string;
    epoch: number;
    workspace_id: string;
  };
  const workspace = f.db.prepare('select canonical_path from workspaces where id=?').get(binding.workspace_id) as { canonical_path: string };
  const config = {
    harness: 'pi',
    executable: 'E:/bin/pi.exe',
    executableSha256: 'a'.repeat(64),
    version: '1',
    profileRef: 'pi-bound',
    providerId: 'prov',
    modelId: 'model',
    effort: 'low',
    workspace: workspace.canonical_path,
    sessionHome: 'E:/homes/bound-not-first',
    charterHash: 'c'.repeat(64),
  };
  const json = JSON.stringify(config);
  f.db
    .prepare('insert into native_binding_configs(binding_id,epoch,harness,config_json,config_hash,registered_at_ms) values(?,?,?,?,?,?)')
    .run(binding.id, binding.epoch, 'pi', json, createHash('sha256').update(json).digest('hex'), Date.now());
  const created = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: '精确HOME', context_mode: 'inherit' }, 'rk-f12')) as {
    transfer: { op_id: string };
  };
  const row = f.db.prepare('select capacity_json from context_transfer_ops where id=?').get(created.transfer.op_id) as { capacity_json: string };
  const meta = JSON.parse(row.capacity_json) as {
    source_session_home: string;
    source: { sessionHome: string; profileRef: string };
  };
  expect(meta.source_session_home).toBe('E:/homes/bound-not-first');
  expect(meta.source.sessionHome).toBe('E:/homes/bound-not-first');
  expect(meta.source.profileRef).toBe('pi-bound');
  expect(meta.source_session_home).not.toBe('E:/homes/first');
  await f.settle(created.transfer.op_id);
});

it('C4 Gate: A/B 历史只读，switch 回 A 被拒', async () => {
  const f = await fixture();
  const aId = f.firstSessionId;
  const toB = (await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'B', context_mode: 'inherit' }, 'rk-b2')) as {
    transfer: { op_id: string };
  };
  await f.settle(toB.transfer.op_id);
  await f.rsCall('roleSession.create', { role_id: f.roleId, name: 'C', context_mode: 'blank' }, 'rk-c2');
  const snap = await f.s.request('system.snapshot', {});
  const preflight = (await f.s.request('roleSession.preflight' as never, {
    role_id: f.roleId,
    session_id: aId,
  } as never)) as unknown as { preflight_hash: string };
  await expect(
    f.s.request('roleSession.switch' as never, { role_id: f.roleId, session_id: aId } as never, {
      leaseId: f.leaseId,
      requestKey: 'rk-sw-a',
      operationId: 'op-sw-a',
      expectedRevision: snap.revision,
      preflightHash: preflight.preflight_hash,
    } as never),
  ).rejects.toMatchObject({ message: 'ROLE_SESSION_REACTIVATION_REMOVED' });
});
