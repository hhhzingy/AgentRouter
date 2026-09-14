import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';
import type { ExecutionBackend, ExecutionExit } from '../../packages/core-service/execution-backend.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { Method, RolePlanInput, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

type CapturedPacket = {
  key: string;
  mode: string;
  roleSessionId?: string;
  activationId?: string;
  activationEpoch?: number;
  contextSync?: any;
};

type Fixture = {
  dir: string;
  db: import('better-sqlite3').Database;
  server: ApplicationService;
  transport: P1MemoryTransport;
  s: Awaited<ReturnType<P1MemoryTransport['connect']>>;
  lease: { leaseId: string };
  project: { id: string };
  role: { id: string; spaceId: string };
  packets: CapturedPacket[];
  preReceipt: { sessionId: string; cursor: number }[];
  coordinator: ExecutionCoordinator;
  write: (method: Method, params: any, scope?: Scope, operationId?: string) => Promise<any>;
  roleMutation: (method: string, params: Record<string, unknown>, operationId: string) => Promise<any>;
  close: () => Promise<void>;
};

const cleanupRoots: string[] = [];
afterEach(() => {
  for (const root of cleanupRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function waitUntil(label: string, check: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error('TIMEOUT_' + label);
}

async function createFixture(): Promise<Fixture> {
  const root = resolve('.local/v11-rc-tests');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(resolve(root, 'context-'));
  cleanupRoots.push(dir);
  const db = openApplicationStore(dir);
  const server = new ApplicationService(db, [dir], true);
  server.roleSession = new RoleSessionExtension(db);
  const transport = new P1MemoryTransport(server, 'v11_rc_controller');
  const s = await transport.connect({
    clientId: 'client_v11_rc',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
  });
  const initial = await s.request('system.snapshot', {});
  const lease = (await s.request(
    'control.acquire',
    {},
    { operationId: 'v11-rc-lease', expectedRevision: initial.revision, scope: {} },
  )) as { leaseId: string };
  let operationNumber = 0;
  const write = async (method: Method, params: any, scope: Scope = {}, operationId?: string) =>
    s.request(method, params, {
      operationId: operationId ?? 'v11-rc-op-' + ++operationNumber,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
      scope,
      leaseId: lease.leaseId,
    });

  const roots = await s.request('filesystem.listRoots', {});
  const project = (await write('project.create', {
    name: 'V1.1 context continuity RC',
    path_handle: roots.items[0].pathHandle,
  })) as { id: string };
  const workspaces = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.project_id = project.id;
  plan.groups[0].workspace_ref = workspaces.items[0].id;
  plan.roles[0].workspace_ref = workspaces.items[0].id;
  const validation = await s.request('rolePlan.validate', { plan });
  await write(
    'rolePlan.apply',
    { plan, plan_hash: validation.planHash, confirmed: true, permission_grants: [] },
    { project_id: project.id },
    'v11-rc-plan',
  );
  const role = (await s.request('system.snapshot', {})).roles[0] as { id: string; spaceId: string };

  const packets: CapturedPacket[] = [];
  const preReceipt: { sessionId: string; cursor: number }[] = [];
  const backend: ExecutionBackend = {
    launch(key, rawPacket, frame, exit) {
      const packet = rawPacket as any;
      packets.push({
        key,
        mode: String(packet.mode),
        ...(packet.roleSessionId ? { roleSessionId: String(packet.roleSessionId) } : {}),
        ...(packet.activationId ? { activationId: String(packet.activationId) } : {}),
        ...(packet.activationEpoch !== undefined ? { activationEpoch: Number(packet.activationEpoch) } : {}),
        ...(packet.contextSync ? { contextSync: structuredClone(packet.contextSync) } : {}),
      });
      setImmediate(() => {
        if (packet.mode === 'bootstrap') {
          frame({ kind: 'charter', epoch: packet.epoch, charterHash: packet.charterHash });
          frame({ kind: 'terminal', epoch: packet.epoch });
          exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } } satisfies ExecutionExit);
          return;
        }
        frame({ key: 'accepted', kind: 'accepted', epoch: packet.epoch });
        if (packet.contextSync) {
          const sessionId = String(packet.roleSessionId);
          const before = db
            .prepare('select synced_through_seq from role_session_context_state where role_session_id=?')
            .get(sessionId) as { synced_through_seq: number };
          preReceipt.push({ sessionId, cursor: Number(before.synced_through_seq) });
          frame({
            key: 'context-receipt',
            kind: 'context_confirmed',
            epoch: packet.epoch,
            stableMarker: packet.contextSync.stable_marker,
            nativeReceipt: {
              marker: packet.contextSync.stable_marker,
              accepted: true,
              source: 'fixture-native',
            },
          });
        }
        const finishOperation = 'fixture-finish-' + key;
        frame({
          key: 'finish',
          kind: 'tool',
          tool: 'finish',
          operationId: finishOperation,
          epoch: packet.epoch,
          payload: {
            outcome: 'succeeded',
            summary: 'V1.1 RC fixture result',
            body: 'visible result',
            outputs: [],
          },
        });
        frame({ key: 'terminal', kind: 'terminal', outcome: 'succeeded', epoch: packet.epoch });
        exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } } satisfies ExecutionExit);
      });
      return {};
    },
    cancel: () => false,
    stop: async () => {},
  };
  const coordinator = new ExecutionCoordinator(server, backend);
  coordinator.configure(role.id, {});

  const roleMutation = async (method: string, params: Record<string, unknown>, operationId: string) => {
    const snapshot = await s.request('system.snapshot', {});
    const preflightParams = {
      role_id: role.id,
      ...(typeof params.session_id === 'string' ? { session_id: params.session_id } : {}),
      ...(typeof params.target_harness === 'string' ? { target_harness: params.target_harness } : {}),
    };
    const preflight = (await s.request(
      'roleSession.preflight' as never,
      preflightParams as never,
    )) as { preflight_hash: string };
    return s.request(
      method as never,
      { role_id: role.id, ...params } as never,
      {
        leaseId: lease.leaseId,
        requestKey: operationId,
        operationId,
        expectedRevision: snapshot.revision,
        preflightHash: preflight.preflight_hash,
      } as never,
    );
  };

  return {
    dir,
    db,
    server,
    transport,
    s,
    lease,
    project,
    role,
    packets,
    preReceipt,
    coordinator,
    write,
    roleMutation,
    close: async () => {
      await coordinator.stop();
      await transport.close();
      db.close();
    },
  };
}

async function submitTask(f: Fixture, summary: string, body: string, operationId: string) {
  await f.write(
    'task.submitFromUser',
    {
      request: {
        kind: 'task.request',
        to: { type: 'role', id: f.role.id },
        summary,
        body,
        inputs: [],
        expected: ['visible result'],
        completion: { mode: 'result', to: { type: 'user' } },
      },
    },
    { project_id: f.project.id, space_id: f.role.spaceId },
    operationId,
  );
  await waitUntil('task-' + summary, () => {
    const result = f.db
      .prepare('select id from results where task_id=(select id from tasks where summary=?)')
      .get(summary);
    const run = f.db
      .prepare('select state from runs where task_id=(select id from tasks where summary=?) order by created_at_ms desc limit 1')
      .get(summary) as { state?: string } | undefined;
    const slot = f.db
      .prepare('select active_run_id from role_slots where role_id=?')
      .get(f.role.id) as { active_run_id?: string | null } | undefined;
    return Boolean(result && run && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(String(run.state)) && !slot?.active_run_id);
  });
}

it('RoleSession→Coordinator 真实贯穿 FULL/DELTA、native receipt、目标排除与同 WS activation', async () => {
  const f = await createFixture();
  try {
    await waitUntil('bootstrap', () =>
      f.db.prepare("select 1 from bootstrap_deliveries where state='DELIVERED'").get() !== undefined,
    );
    const initialList = (await f.s.request('roleSession.list' as never, { role_id: f.role.id } as never)) as {
      sessions: { id: string; state: string }[];
      active_session_id: string;
    };
    const sessionA = initialList.active_session_id;
    expect(initialList.sessions).toHaveLength(1);
    await submitTask(f, 'A-initial', 'initial visible task', 'task-a-initial');

    // 这是受信 Fixture 对初始 WS 的 Native Session 保存；preflight 随后允许继续旧 WS。
    const nativeA = JSON.stringify({ id: 'fixture-native-a' });
    f.db
      .prepare('update role_sessions set native_session_ref=?,native_session_ref_hash=?,native_session_bound_at_ms=? where id=?')
      .run(nativeA, 'fixture-hash-a', Date.now(), sessionA);
    const preflightB = (await f.s.request(
      'roleSession.preflight' as never,
      { role_id: f.role.id, target_harness: 'pi' } as never,
    )) as any;
    expect(preflightB.recommended_action).toBe('CONTINUE_EXISTING');
    expect(preflightB.new_session_available).toBe(true);

    const created = (await f.roleMutation(
      'roleSession.create',
      { name: 'B-new-full', target_harness: 'pi' },
      'v11-rc-create-b',
    )) as { session: { id: string; harness: string; state: string } };
    const sessionB = created.session.id;
    expect(created.session).toMatchObject({ harness: 'pi', state: 'ACTIVE' });
    expect(
      (await f.s.request('roleSession.list' as never, { role_id: f.role.id } as never) as any).sessions,
    ).toHaveLength(2);
    await submitTask(f, 'B-full', 'new WS must inherit visible context', 'task-b-full');

    const bPacket = [...f.packets].reverse().find((packet) => packet.roleSessionId === sessionB && packet.contextSync);
    expect(bPacket?.contextSync).toMatchObject({
      type: 'AGENTROUTER_CONTEXT_SYNC',
      mode: 'FULL',
      target_work_session_id: sessionB,
    });
    const bEntries = bPacket?.contextSync.portable_context.entries ?? [];
    expect(bEntries.length).toBeGreaterThan(0);
    expect(bEntries.every((entry: any) => entry.sourceWorkSessionId !== sessionB)).toBe(true);
    expect(JSON.stringify(bPacket?.contextSync.authoritative_state)).not.toContain('native_session_ref');
    expect(JSON.stringify(bPacket?.contextSync)).not.toMatch(/hidden_reasoning|secret|credential|\bkv\b/i);
    const bHead = Number((f.db.prepare('select head_seq from role_context_heads where role_id=?').get(f.role.id) as any).head_seq);
    const bState = f.db.prepare('select synced_through_seq,fidelity from role_session_context_state where role_session_id=?').get(sessionB) as any;
    expect(bState.synced_through_seq).toBeGreaterThan(0);
    expect(bState.synced_through_seq).toBeLessThan(bHead);
    expect(f.preReceipt.find((receipt) => receipt.sessionId === sessionB)?.cursor).toBe(0);

    const switched = (await f.roleMutation(
      'roleSession.switch',
      { session_id: sessionA },
      'v11-rc-switch-a',
    )) as { id: string };
    expect(switched.id).toBe(sessionA);
    await submitTask(f, 'A-resume-full', 'resume old WS', 'task-a-resume');
    const aFull = [...f.packets].reverse().find((packet) => packet.roleSessionId === sessionA && packet.contextSync);
    expect(aFull?.contextSync.mode).toBe('FULL');
    const activationBeforeModelChange = aFull?.activationId;
    const aStateBeforeDelta = f.db.prepare('select synced_through_seq from role_session_context_state where role_session_id=?').get(sessionA) as any;

    f.server.contextStore.appendConversation({
      roleId: f.role.id,
      sourceWorkSessionId: sessionB,
      sourceId: 'external-b-visible',
      kind: 'NOTICE',
      title: '外部可见进展',
      body: '来自 B 的可迁移上下文',
    });
    const currentBindingForModel = f.db.prepare('select model_json from bindings where role_id=? and is_current=1').get(f.role.id) as { model_json: string };
    const modelAfterSwitch = JSON.parse(currentBindingForModel.model_json) as Record<string, unknown>;
    modelAfterSwitch.reasoning_effort = 'high';
    f.db.prepare('update bindings set model_json=? where role_id=? and is_current=1').run(
      JSON.stringify(modelAfterSwitch),
      f.role.id,
    );
    await submitTask(f, 'A-resume-delta', 'same WS model and effort change', 'task-a-delta');
    const aDelta = [...f.packets].reverse().find((packet) => packet.roleSessionId === sessionA && packet.contextSync);
    expect(aDelta?.contextSync.mode).toBe('DELTA');
    expect(aDelta?.contextSync.portable_context.from_seq).toBe(Number(aStateBeforeDelta.synced_through_seq));
    const deltaEntries = aDelta?.contextSync.portable_context.entries ?? [];
    expect(deltaEntries.some((entry: any) => entry.sourceId === 'external-b-visible')).toBe(true);
    expect(deltaEntries.every((entry: any) => entry.sourceWorkSessionId !== sessionA)).toBe(true);
    expect(aDelta?.activationId).toBe(activationBeforeModelChange);
    expect(
      (f.db.prepare('select count(*) as n from role_session_activations where role_id=?').get(f.role.id) as any).n,
    ).toBe(3);
    const aState = f.db.prepare('select synced_through_seq,fidelity from role_session_context_state where role_session_id=?').get(sessionA) as any;
    expect(aState.synced_through_seq).toBeGreaterThan(Number(aStateBeforeDelta.synced_through_seq));

    // 当前 binding 切为 Kimi 后，目标 Harness 没有旧 WS 候选；仍可新建并继承，不伪造旧 WS resume。
    const oldBinding = f.db.prepare('select * from bindings where role_id=? and is_current=1').get(f.role.id) as any;
    f.db.prepare('update bindings set is_current=0 where id=?').run(oldBinding.id);
    f.db.prepare(
      'insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,continuity_mode,created_at_ms) values(?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'binding-v11-kimi',
      f.role.id,
      'kimi_code',
      oldBinding.workspace_id,
      oldBinding.model_json,
      oldBinding.capability_json,
      Number(oldBinding.epoch) + 1,
      1,
      'NEW',
      Date.now(),
    );
    const crossPreflight = (await f.s.request(
      'roleSession.preflight' as never,
      { role_id: f.role.id, target_harness: 'kimi_code' } as never,
    )) as any;
    expect(crossPreflight).toMatchObject({
      recommended_action: 'CREATE_NEW_INHERIT',
      new_session_available: true,
      resume_candidate: null,
    });
    const cross = (await f.roleMutation(
      'roleSession.create',
      { name: 'Kimi-new-full', target_harness: 'kimi_code' },
      'v11-rc-create-kimi',
    )) as { session: { id: string; harness: string; state: string } };
    expect(cross.session).toMatchObject({ harness: 'kimi_code', state: 'ACTIVE' });
    expect(f.db.prepare('select count(*) as n from role_session_handoffs').get()).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});
