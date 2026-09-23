import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import { setAllowedHarnesses } from '../../packages/runtime/management.ts';
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

async function fixture() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/p2-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_p2setup',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  server.registeredHarnesses = () => ['pi', 'codex', 'kimi_code', 'deepseek_harness', 'zcode'];
  setAllowedHarnesses(['pi', 'codex', 'kimi_code', 'deepseek_harness', 'zcode']);
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
      leaseId: (lease as { leaseId: string }).leaseId,
    });
  const roots = await s.request('filesystem.listRoots', {}),
    project = (await write('project.create', {
      name: 'C1R1P2 兼容项目',
      path_handle: roots.items[0].pathHandle,
    })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  plan.roles[0].workspace_ref = ws.items[0].id;
  plan.roles[0].runtime = {
    harness: 'deepseek_harness' as any,
    provider_profile_id: 'agentrouter-deepseek',
    model_id: 'deepseek-v4-flash',
    reasoning_effort: 'off',
    selection_source: 'runtime',
  };
  return { dir, db, server, s, write, project, plan, ws, async close() {
    await transport.close();
    db.close();
  } };
}

it('C1R1P1 客户端:动态 harness 计划在冻结枚举处拒绝(行为与升级前一致)', async () => {
  const f = await fixture();
  try {
    await expect(f.s.request('rolePlan.validate', { plan: f.plan })).rejects.toMatchObject({
      message: 'INVALID_FRAME',
    });
  } finally {
    await f.close();
  }
});

it('C1R1P2 升级后:validate/apply 接受动态 harness;未注册 harness 拒绝', async () => {
  const f = await fixture();
  try {
    const up = (await f.s.request('contract.upgrade' as never, {
      revision: 'C1R1P2',
    } as never)) as unknown as { revision: string; harnesses: string[] };
    expect(up.revision).toBe('C1R1P2');
    expect(up.harnesses).toContain('deepseek_harness');
    const v = (await f.s.request('rolePlan.validate' as never, { plan: f.plan } as never)) as unknown as {
      valid: boolean;
      planHash: string;
      errors: { code: string; field: string }[];
    };
    console.log('V2 validate errors:', JSON.stringify(v.errors));
    expect(v.valid).toBe(true);
    const applied = (await f.write(
      'rolePlan.apply' as never,
      {
        plan: f.plan,
        plan_hash: v.planHash,
        confirmed: true,
        permission_grants: [
          { role_key: f.plan.roles[0].role_key, permissions: f.plan.roles[0].requested_permissions },
        ],
      },
      { project_id: f.project.id },
      'apply',
    ) as unknown) as { state: string };
    expect(applied.state).toBe('APPLIED');
    // 未注册 harness:服务端注册表判定拒绝
    const bad = JSON.parse(JSON.stringify(f.plan));
    bad.roles[0].runtime = {
      harness: 'nosuch_harness',
      provider_profile_id: 'agentrouter-deepseek',
      model_id: 'deepseek-v4-flash',
      reasoning_effort: 'off',
      selection_source: 'runtime',
    };
    const vb = (await f.s.request('rolePlan.validate' as never, { plan: bad } as never)) as unknown as {
      valid: boolean;
      errors: { code: string }[];
    };
    expect(vb.valid).toBe(false);
  } finally {
    await f.close();
  }
});

it('升级连接的快照/事件不破坏 C1R1P1 第二连接(投影裁剪)', async () => {
  const f = await fixture();
  try {
    const up = await f.s.request('contract.upgrade' as never, { revision: 'C1R1P2' } as never);
    expect((up as any).revision).toBe('C1R1P2');
    const pv = (await f.s.request('rolePlan.validate' as never, { plan: f.plan } as never)) as unknown as { planHash: string };
    await f.write('rolePlan.apply' as never, {
      plan: f.plan,
      plan_hash: pv.planHash,
      confirmed: true,
      permission_grants: [
        { role_key: f.plan.roles[0].role_key, permissions: f.plan.roles[0].requested_permissions },
      ],
    } as never, { project_id: f.project.id }, 'apply');
    // 第二条 C1R1P1 连接:快照照常可读(角色状态可见,harness 计划内容不进其事件校验面)
    const t2 = new P1MemoryTransport(f.server, 'human_test');
    const s2 = await t2.connect({
      clientId: 'client_p1_obs',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    const snap = (await s2.request('system.snapshot', {})) as any;
    // 动态 harness 角色对旧协议连接不可见(投影裁剪)
    expect(snap.roles).toHaveLength(0);
    await s2.request('contract.upgrade' as never, { revision: 'C1R1P2' } as never);
    const upgraded = await s2.request('system.snapshot', {});
    expect(upgraded.roles).toHaveLength(1);
    expect(upgraded.roles[0].harness).toBe('deepseek_harness');
    await t2.close();
  } finally {
    await f.close();
  }
});

it('contract.upgrade 允许 observer 升级读取;未知 revision 拒绝', async () => {
  const f = await fixture();
  try {
    const t = new P1MemoryTransport(f.server, 'human_x');
    const obs = await t.connect({
      clientId: 'client_unauth',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    await expect(
      obs.request('contract.upgrade' as never, { revision: 'C1R1P2' } as never),
    ).resolves.toMatchObject({ revision: 'C1R1P2' });
    await t.close();
    await expect(
      f.s.request('contract.upgrade' as never, { revision: 'C9' } as never),
    ).rejects.toMatchObject({ message: 'INVALID_PARAMS' });
  } finally {
    await f.close();
  }
});

it('New WorkSession 能力仅由受信宿主已配置的可新建 Native Harness 开放', async () => {
  const f = await fixture();
  try {
    const before = await f.s.request('harness.list' as never, {} as never) as { harnesses: Record<string,{create_session:boolean}> };
    expect(before.harnesses.codex.create_session).toBe(false);
    expect(before.harnesses.kimi_code.create_session).toBe(false);
    expect(before.harnesses.pi.create_session).toBe(false);
    f.server.creatableHarnesses = () => ['pi', 'codex'];
    const after = await f.s.request('harness.list' as never, {} as never) as typeof before;
    expect(after.harnesses.codex.create_session).toBe(true);
    expect(after.harnesses.pi.create_session).toBe(true);
    expect(after.harnesses.kimi_code.create_session).toBe(false);
  } finally {
    await f.close();
  }
});
