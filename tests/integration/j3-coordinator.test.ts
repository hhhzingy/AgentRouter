import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';
import type {
  ExecutionBackend,
  ExecutionExit,
} from '../../packages/core-service/execution-backend.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';
async function fixture(clock = () => Date.now()) {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/app-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], true, clock),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_app',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  const snap = await s.request('system.snapshot', {}),
    lease = await s.request(
      'control.acquire',
      {},
      { operationId: 'op_lease', expectedRevision: snap.revision, scope: {} },
    );
  let n = 0;
  const write = async (m: Method, p: any, scope: Scope = {}, op?: string, revision?: number) =>
    s.request(m, p, {
      operationId: op ?? 'op_' + ++n,
      expectedRevision: revision ?? (await s.request('system.snapshot', {})).revision,
      scope,
      leaseId: lease.leaseId,
    });
  const roots = await s.request('filesystem.listRoots', {}),
    project = (await write('project.create', {
      name: '持久项目',
      path_handle: roots.items[0].pathHandle,
    })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  for (const g of plan.groups) g.workspace_ref = ws.items[0].id;
  for (const r of plan.roles) r.workspace_ref = ws.items[0].id;
  return {
    dir,
    db,
    server,
    transport,
    s,
    write,
    project,
    plan,
    async close() {
      await transport.close();
      db.close();
    },
  };
}

async function setup(mode: 'unknown' | 'broken' | 'throw' | 'commit-failure') {
  const f = await fixture();
  const v = await f.s.request('rolePlan.validate', { plan: f.plan });
  await f.write(
    'rolePlan.apply',
    { plan: f.plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
    { project_id: f.project.id },
  );
  const role = (await f.s.request('system.snapshot', {})).roles[0];
  let launches = 0,
    shutdownRequested = false;
  f.server.onShutdown = () => {
    shutdownRequested = true;
  };
  const backend: ExecutionBackend = {
    launch(_key, packet, frame, exit, broken) {
      launches++;
      if (mode === 'throw') throw Error('SPAWN_FAILED_WITHOUT_STOP_PROOF');
      setImmediate(() => {
        frame({ kind: 'charter', epoch: packet.epoch, charterHash: packet.charterHash });
        frame({ kind: 'terminal', epoch: packet.epoch });
        if (mode === 'broken') broken?.();
        if (mode === 'commit-failure')
          f.db.exec(
            "CREATE TRIGGER j3_fail BEFORE UPDATE ON initialization_attempts BEGIN SELECT RAISE(ABORT,'INJECTED_STORAGE_FAILURE'); END",
          );
        const proof: ExecutionExit = {
          code: 0,
          stop: {
            kind: mode === 'unknown' ? 'unknown' : 'fixture-parent-exit',
            epoch: packet.epoch,
          },
        };
        exit(proof);
        // 重复退出和晚到帧不可将首次 UNKNOWN 翻为成功。
        frame({ kind: 'terminal', epoch: packet.epoch });
        exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } });
      });
      return {};
    },
    cancel() {
      return false;
    },
    async stop() {},
  };
  const coordinator = new ExecutionCoordinator(f.server, backend);
  coordinator.configure(role.id, {});
  for (let i = 0; i < 100; i++) {
    if (
      shutdownRequested ||
      f.db
        .prepare(
          "select 1 from initialization_attempts where state in ('UNKNOWN','FAILED','DELIVERED')",
        )
        .get()
    )
      break;
    await new Promise((r) => setTimeout(r, 5));
  }
  return {
    ...f,
    coordinator,
    launches: () => launches,
    shutdownRequested: () => shutdownRequested,
  };
}
it.each(['unknown', 'throw'] as const)(
  'Bootstrap %s 保留隔离租约，重复终止不得成功或自动重跑',
  async (mode) => {
    const f = await setup(mode);
    try {
      expect(f.db.prepare('select state from initialization_attempts').get()).toEqual({
        state: 'UNKNOWN',
      });
      expect(f.db.prepare('select state from initialization_leases').all()).toEqual([
        { state: 'QUARANTINED' },
      ]);
      expect(
        f.db.prepare("select reason from bootstrap_deliveries where state='FAILED'").get(),
      ).toEqual({ reason: 'BOOTSTRAP_STOP_UNPROVEN' });
      f.coordinator.kick();
      await new Promise((r) => setTimeout(r, 20));
      expect(f.launches()).toBe(1);
    } finally {
      await f.coordinator.stop();
      await f.close();
    }
  },
);
it('Bootstrap 合法 terminal 后出现坏帧不得交付，即使进程退出码为零', async () => {
  const f = await setup('broken');
  try {
    expect(f.db.prepare('select state from initialization_attempts').get()).toEqual({
      state: 'FAILED',
    });
    expect(f.db.prepare('select * from initialization_leases').all()).toHaveLength(0);
  } finally {
    await f.coordinator.stop();
    await f.close();
  }
});

it.each([
  'unknown',
  'no-terminal',
  'stale',
  'broken',
  'valid',
  'cancel-throw',
  'stop-timeout',
] as const)('Run %s：原生屏障与资源隔离由同一 Core 保持', async (mode) => {
  const f = await fixture();
  let late: (() => void) | undefined;
  const backend: ExecutionBackend = {
    launch(_key, packet, frame, exit, broken) {
      setImmediate(() => {
        if (packet.mode === 'bootstrap') {
          frame({ kind: 'charter', epoch: packet.epoch, charterHash: packet.charterHash });
          frame({ kind: 'terminal', epoch: packet.epoch });
          exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } });
          return;
        }
        frame({ key: 'accepted', kind: 'accepted', epoch: packet.epoch });
        frame({
          key: 'finish',
          kind: 'tool',
          tool: 'finish',
          operationId: 'op-finish',
          epoch: packet.epoch,
          payload: { outcome: 'succeeded', summary: '离线结果', body: '屏障验证', outputs: [] },
        });
        if (mode !== 'no-terminal')
          frame({ key: 'terminal', kind: 'terminal', outcome: 'succeeded', epoch: packet.epoch });
        if (mode === 'broken') broken?.();
        const complete = () => {
          exit({
            code: 0,
            stop: {
              kind: mode === 'unknown' ? 'unknown' : 'fixture-parent-exit',
              epoch: mode === 'stale' ? packet.epoch - 1 : packet.epoch,
            },
          });
          frame({
            key: 'late-finish',
            kind: 'tool',
            tool: 'finish',
            operationId: 'late-op',
            epoch: packet.epoch,
            payload: { outcome: 'succeeded', summary: '晚到', body: '禁止再交付', outputs: [] },
          });
          exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } });
        };
        if (mode === 'cancel-throw' || mode === 'stop-timeout') late = complete;
        else complete();
      });
      return {};
    },
    cancel() {
      throw Error('CANCEL_PORT_BROKEN');
    },
    async stop() {},
  };
  const coordinator = new ExecutionCoordinator(f.server, backend);
  try {
    const v = await f.s.request('rolePlan.validate', { plan: f.plan });
    await f.write(
      'rolePlan.apply',
      { plan: f.plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
      { project_id: f.project.id },
    );
    const role = (await f.s.request('system.snapshot', {})).roles[0];
    coordinator.configure(role.id, {});
    for (
      let i = 0;
      i < 100 &&
      !f.db.prepare("select 1 from initialization_attempts where state='DELIVERED'").get();
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request',
          to: { type: 'role', id: role.id },
          summary: '停止屏障',
          body: '离线',
          inputs: [],
          expected: ['结果'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: f.project.id, space_id: role.spaceId },
    );
    for (let i = 0; i < 100 && !f.db.prepare('select 1 from results').get(); i++)
      await new Promise((r) => setTimeout(r, 5));
    if (mode === 'cancel-throw') {
      const run = f.db.prepare('select id,binding_epoch as epoch from runs').get() as {
        id: string;
        epoch: number;
      };
      f.db
        .prepare("insert into cancel_intents values(?,?,'PENDING',?)")
        .run(run.id, run.epoch, Date.now());
      coordinator.kick();
      await new Promise((r) => setTimeout(r, 20));
    }
    if (mode === 'stop-timeout') {
      await coordinator.stop();
      late?.();
    }
    const state = f.db.prepare('select state from runs').get();
    expect(state).toEqual({ state: mode === 'valid' ? 'SUCCEEDED' : 'UNKNOWN' });
    if (mode === 'valid') {
      expect(f.db.prepare('select * from resource_leases').all()).toHaveLength(0);
      expect(
        f.db.prepare("select * from results where publication_state='PUBLISHED'").all(),
      ).toHaveLength(1);
    } else {
      expect(
        f.db.prepare("select * from resource_leases where state='QUARANTINED'").all().length,
      ).toBeGreaterThan(0);
      expect(
        f.db.prepare("select * from results where publication_state='PUBLISHED'").all(),
      ).toHaveLength(0);
      expect(f.db.prepare("select * from outbox where state='HELD'").all().length).toBeGreaterThan(
        0,
      );
    }
  } finally {
    await coordinator.stop();
    await f.close();
    late?.();
  }
});

it('Bootstrap 终止事务失败触发停止，保留未完成记录由重启隔离恢复', async () => {
  const f = await setup('commit-failure');
  try {
    expect(f.shutdownRequested()).toBe(true);
    expect(f.db.prepare('select state from initialization_attempts').get()).toEqual({
      state: 'STARTING',
    });
    expect(f.db.prepare('select state from initialization_leases').all()).toEqual([
      { state: 'HELD' },
    ]);
    f.db.exec('DROP TRIGGER j3_fail');
    new ApplicationService(f.db, [f.dir], true);
    expect(f.db.prepare('select state from initialization_attempts').get()).toEqual({
      state: 'UNKNOWN',
    });
    expect(f.db.prepare('select state from initialization_leases').all()).toEqual([
      { state: 'QUARANTINED' },
    ]);
  } finally {
    await f.coordinator.stop();
    await f.close();
  }
});
