import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ParticipantExtension } from '../../packages/core-service/participant-extension.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

async function fixture(clock: () => number = Date.now) {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/patt-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false, clock),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_setup',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  server.participant = new ParticipantExtension(db);
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
      name: '挂接测试',
      path_handle: roots.items[0].pathHandle,
    })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  plan.roles[0].workspace_ref = ws.items[0].id;
  const v = await s.request('rolePlan.validate', { plan });
  await write(
    'rolePlan.apply',
    { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
    { project_id: project.id },
    'apply',
  );
  const roleId = ((await s.request('role.list', { scope: { project_id: project.id } })) as any)
    .items[0].id;
  // 参与者连接(controller 模式,但绝不取全局 lease)
  const pTransport = new P1MemoryTransport(server, 'human_test');
  const p = await pTransport.connect({
    clientId: 'client_participant',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
  });
  const attach = () =>
    p.request('participant.attach' as never, { role_id: roleId } as never) as unknown as Promise<{
      generation: number;
    }>;
  const artifactVia = (conn: any, name: string, content: string) =>
    conn.request(
      'participant.artifact' as never,
      { role_id: roleId, name, content } as never,
    ) as unknown as Promise<Record<string, unknown>>;
  const artifact = (name: string, content: string) => artifactVia(p, name, content);
  const spaceId = (db.prepare('select space_id from roles where id=?').get(roleId) as { space_id: string }).space_id;
  return { dir, db, server, s, lease, project, spaceId, p, pTransport, roleId, attach, artifact, write, async close() {
    await pTransport.close().catch(() => {});
    await transport.close();
    db.close();
  } };
}

it('attach后无lease可写产物;>120s后依然可写(无租约过期)', async () => {
  let now = 1_000_000;
  const f = await fixture(() => now);
  try {
    const a = await f.attach();
    expect(a.generation).toBe(1);
    // 时钟前进10分钟(旧设计下30s租约早已过期)
    now += 600_000;
    const reg = (await f.artifact('long-session.md', '# ok')) as Record<string, unknown>;
    expect(reg.sha256).toBeTruthy();
  } finally {
    await f.close();
  }
});

it('新接管使旧连接generation失效;同连接幂等;断连清理后可重新挂接', async () => {
  const f = await fixture();
  try {
    const a1 = await f.attach();
    expect(a1.generation).toBe(1);
    const again = await f.attach();
    expect(again.generation).toBe(1); // 同连接幂等
    // 第二个参与者连接接管
    const p2Transport = new P1MemoryTransport(f.server, 'human_test');
    const p2 = await p2Transport.connect({
      clientId: 'client_participant_b',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
    const a2 = (await p2.request('participant.attach' as never, {
      role_id: f.roleId,
    } as never)) as unknown as { generation: number };
    expect(a2.generation).toBe(2);
    // 旧连接写入被拒
    await expect(f.artifact('old.md', 'x')).rejects.toMatchObject({
      message: 'PARTICIPANT_GENERATION_STALE',
    });
    // 新连接可写
    const p2Artifact = (name: string, content: string) =>
      p2.request(
        'participant.artifact' as never,
        { role_id: f.roleId, name, content } as never,
      ) as unknown as Promise<Record<string, unknown>>;
    await expect(p2Artifact('new.md', 'y')).resolves.toMatchObject({ name: 'new.md' });
    // 断连清理:conn2 关闭后旧连接可重新挂接(gen 3)
    await p2Transport.close();
    const a3 = await f.attach();
    expect(a3.generation).toBe(3);
  } finally {
    await f.close();
  }
});

it('Participant在线期间Management controller可正常acquire;发送用户输入走attachment旁路(非CONTROL_LEASE)', async () => {
  const f = await fixture();
  try {
    await f.attach();
    // 管理面并发acquire:先释放 setup 租约,再重新 acquire(此时参与者仍在线挂接)
    await f.s.request(
      'control.release',
      { lease_id: (f.lease as { leaseId: string }).leaseId },
      { operationId: 'op_release', expectedRevision: (await f.s.request('system.snapshot', {})).revision, scope: {} },
    );
    const lease2 = await f.s.request(
      'control.acquire',
      {},
      { operationId: 'mgmt_acquire', expectedRevision: (await f.s.request('system.snapshot', {})).revision, scope: {} },
    );
    expect((lease2 as { leaseId: string }).leaseId).toBeTruthy();
    // sendUserInput:无lease,直发到业务校验层(PLAN_STATE_CONFLICT=任务非WAITING_INPUT),证明lease已非门槛
    try {
      await f.p.request(
        'conversation.sendUserInput' as never,
        { role_id: f.roleId, task_id: 'task_none', body: 'x' } as never,
        {
          operationId: 'part_send_1',
          expectedRevision: (await f.p.request('system.snapshot' as never, {} as never) as unknown as { revision: number }).revision,
          scope: { project_id: (f.project as { id: string }).id, space_id: f.spaceId },
          leaseId: 'participant-attachment', // 占位:冻结帧必填,服务端 attachment 旁路忽略
        },
      );
      throw Error('unexpected-resolve');
    } catch (e: any) {
      if (e.message === 'unexpected-resolve') throw e;
      console.log('SENDERR stack:', e.stack);
      expect(e.message).toBe('PLAN_STATE_CONFLICT');
    }
  } finally {
    await f.close();
  }
});
