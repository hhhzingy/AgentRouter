import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';
import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { Management } from '../../packages/runtime/management.ts';
import type {
  ExecutionBackend,
  ExecutionExit,
} from '../../packages/core-service/execution-backend.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

/** R5:Run 执行溯源(provenance 入 Run)+显式降级登记。
 * 失败 run 的 provenance 记录 harness/诊断/降级判定;降级只声明待执行,不静默重派。 */
async function fixture(harness = 'kimi_code') {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/prov-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], true),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_prov',
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
  const write = async (m: Method, p: any, scope: Scope = {}, op?: string) =>
    s.request(m, p, {
      operationId: op ?? 'op_' + ++n,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
      scope,
      leaseId: lease.leaseId,
    });
  const roots = await s.request('filesystem.listRoots', {}),
    project = (await write('project.create', {
      name: '溯源项目',
      path_handle: roots.items[0].pathHandle,
    })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  plan.roles[0].workspace_ref = ws.items[0].id;
  plan.roles[0].runtime.harness = harness as never;
  const v = await s.request('rolePlan.validate', { plan });
  await write('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] }, { project_id: project.id });
  const role = (await s.request('system.snapshot', {})).roles[0];
  return {
    dir, db, server, transport, s, write, project, role,
    async close() { await transport.close(); db.close(); },
  };
}

it('run 终态写入执行溯源;显式降级配置命中诊断时标记 FALLBACK_PENDING 且不自动重派', async () => {
  const f = await fixture();
  try {
    const role = f.role;
    // Bootstrap:合法交付
    const backend: ExecutionBackend = {
      launch(_key, packet, frame, exit) {
        setImmediate(() => {
          frame({ kind: 'charter', epoch: packet.epoch, charterHash: packet.charterHash });
          if (packet.mode === 'run') {
            frame({ kind: 'diagnostic', epoch: packet.epoch, code: 'KIMI_QUOTA_EXHAUSTED' });
            frame({ kind: 'terminal', epoch: packet.epoch, outcome: 'failed' });
          } else frame({ kind: 'terminal', epoch: packet.epoch });
          exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } });
        });
        return {};
      },
      cancel: () => false,
      async stop() {},
    };
    const coordinator = new ExecutionCoordinator(f.server, backend);
    coordinator.configure(role.id, {});
    // 等待 bootstrap 交付
    for (let i = 0; i < 200; i++) {
      if (f.db.prepare("select 1 from bootstrap_deliveries where state='DELIVERED'").get()) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(f.db.prepare("select state from bootstrap_deliveries where state='DELIVERED'").get()).toBeTruthy();
    // 登记显式降级:Kimi 失败(配额类)→ DeepSeek
    const m = new Management(f.db);
    m.setProfileFallback(role.id, { harness: 'deepseek_harness', reason_codes: ['QUOTA', 'RATE_LIMIT'] });
    // 派发一个任务,run 将以 KIMI_QUOTA_EXHAUSTED + failed 收尾
    await f.write(
      'task.submitFromUser',
      { request: { kind: 'task.request', to: { type: 'role', id: role.id }, summary: '溯源任务', body: 'b', inputs: [], expected: ['x'], completion: { mode: 'result', to: { type: 'user' } } } },
      { project_id: f.project.id, space_id: role.spaceId },
    );
    coordinator.kick();
    for (let i = 0; i < 200; i++) {
      const run = f.db.prepare("select state, execution_provenance from runs order by created_at_ms desc limit 1").get() as { state: string; execution_provenance: string | null };
      if (run?.execution_provenance) {
        const p = JSON.parse(run.execution_provenance);
        expect(run.state).toBe('FAILED');
        expect(p.harness).toBe('kimi_code');
        expect(p.outcome).toBe('failed');
        expect(p.diagnostic).toBe('KIMI_QUOTA_EXHAUSTED');
        expect(p.fallback).toMatchObject({ to: 'deepseek_harness', matched_code: 'QUOTA', dispatched: false });
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    // 触发态写入 profile(权威派发门)
    const prof = f.db.prepare('select fallback_json from execution_profiles where role_id=?').get(role.id) as { fallback_json: string };
    const fbNow = JSON.parse(prof.fallback_json);
    expect(fbNow.triggered).toMatchObject({ reason: 'KIMI_QUOTA_EXHAUSTED', from_run: expect.any(String) });
    // 再 kick 不自动重派:仍只有一个 run
    coordinator.kick();
    await new Promise((r) => setTimeout(r, 50));
    expect((f.db.prepare('select count(*) n from runs').get() as { n: number }).n).toBe(1);
    await coordinator.stop();
  } finally {
    await f.close();
  }
});

it('无降级配置时失败 run 仍记录 provenance,但不标记降级也不阻断派发', async () => {
  const f = await fixture('pi');
  try {
    const role = f.role;
    const backend: ExecutionBackend = {
      launch(_key, packet, frame, exit) {
        setImmediate(() => {
          frame({ kind: 'charter', epoch: packet.epoch, charterHash: packet.charterHash });
          if (packet.mode === 'run') {
            frame({ kind: 'diagnostic', epoch: packet.epoch, code: 'NATIVE_SOME_ERROR' });
            frame({ kind: 'terminal', epoch: packet.epoch, outcome: 'failed' });
          } else frame({ kind: 'terminal', epoch: packet.epoch });
          exit({ code: 0, stop: { kind: 'fixture-parent-exit', epoch: packet.epoch } });
        });
        return {};
      },
      cancel: () => false,
      async stop() {},
    };
    const coordinator = new ExecutionCoordinator(f.server, backend);
    coordinator.configure(role.id, {});
    for (let i = 0; i < 200; i++) {
      if (f.db.prepare("select 1 from bootstrap_deliveries where state='DELIVERED'").get()) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    await f.write(
      'task.submitFromUser',
      { request: { kind: 'task.request', to: { type: 'role', id: role.id }, summary: '无降级任务', body: 'b', inputs: [], expected: ['x'], completion: { mode: 'result', to: { type: 'user' } } } },
      { project_id: f.project.id, space_id: role.spaceId },
    );
    coordinator.kick();
    for (let i = 0; i < 200; i++) {
      const run = f.db.prepare("select execution_provenance from runs order by created_at_ms desc limit 1").get() as { execution_provenance: string | null };
      if (run?.execution_provenance) {
        const p = JSON.parse(run.execution_provenance);
        expect(p.harness).toBe('pi');
        expect(p.fallback).toBeNull();
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    const slot = f.db.prepare('select blocked_reason from role_slots where role_id=?').get(role.id) as { blocked_reason: string | null };
    expect(slot.blocked_reason).not.toBe('FALLBACK_PENDING');
    await coordinator.stop();
  } finally {
    await f.close();
  }
});

it('setProfileFallback 校验:未知角色/非法结构拒绝;null 清除', async () => {
  const f = await fixture();
  try {
    const m = new Management(f.db);
    expect(() => m.setProfileFallback('role_missing', { harness: 'x', reason_codes: ['Q'] })).toThrow('INVALID_ROLE');
    const role = f.role;
    f.db.prepare("insert into execution_profiles(role_id,source,scenario_json,verified) values(?,'SIMULATED','{}',1)").run(role.id);
    expect(() => m.setProfileFallback(role.id, { harness: 'BAD!', reason_codes: ['Q'] })).toThrow('INVALID_FALLBACK_CONFIG');
    expect(() => m.setProfileFallback(role.id, { harness: 'deepseek_harness', reason_codes: [] })).toThrow('INVALID_FALLBACK_CONFIG');
    m.setProfileFallback(role.id, { harness: 'deepseek_harness', reason_codes: ['QUOTA'] });
    expect(JSON.parse((f.db.prepare('select fallback_json from execution_profiles where role_id=?').get(role.id) as { fallback_json: string }).fallback_json)).toEqual({ harness: 'deepseek_harness', reason_codes: ['QUOTA'] });
    m.setProfileFallback(role.id, null);
    expect((f.db.prepare('select fallback_json from execution_profiles where role_id=?').get(role.id) as { fallback_json: string | null }).fallback_json).toBeNull();
  } finally {
    await f.close();
  }
});
