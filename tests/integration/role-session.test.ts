import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

async function fixture() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/rsess-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_rsess',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  server.roleSession = new RoleSessionExtension(db);
  server.externalApi = undefined;
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
  const roots = await s.request('filesystem.listRoots', {});
  const project = (await write('project.create', {
    name: '会话闭环项目',
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
  const snap2 = await s.request('system.snapshot', {});
  const roleId = (snap2.roles as { id: string }[])[0].id;
  const rs = async (method: string, params: Record<string, unknown>, withLease = true) =>
    s.request(
      method as never,
      params as never,
      ...(withLease ? [{ leaseId: (lease as { leaseId: string }).leaseId }] : []),
    ) as unknown as Promise<Record<string, unknown>>;
  return { dir, db, server, s, write, project, roleId, rs, async close() { await transport.close(); db.close(); } };
}

it('角色创建即有初始会话；任务与会话条目归入活动会话', async () => {
  const f = await fixture();
  try {
    const list = (await f.rs('roleSession.list', { role_id: f.roleId })) as { sessions: { id: string; seq: number; name: string; state: string; generation: number }[]; active_session_id: string };
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]).toMatchObject({ seq: 1, name: '初始会话', state: 'ACTIVE', generation: 1 });
    expect(list.active_session_id).toBe(list.sessions[0].id);
    // 派发一个真实任务（不接Harness，任务停在QUEUED——会话归属在创建时确定）
    await f.write(
      'task.submitFromUser',
      { request: { kind: 'task.request', to: { type: 'role', id: f.roleId }, summary: '任务一', body: 'body-1', inputs: [], expected: ['x'], completion: { mode: 'result', to: { type: 'user' } } } },
      { project_id: f.project.id, space_id: (await f.s.request('system.snapshot', {})).spaces[0].id },
      'task-1',
    );
    const db = f.db;
    const task1 = db.prepare('select role_session_id from tasks order by created_at_ms desc limit 1').get() as { role_session_id: string };
    expect(task1.role_session_id).toBe(list.sessions[0].id);
  } finally { await f.close(); }
});

it('新建会话/切回/幂等switch；两边历史按会话隔离；旧任务迟到的对话仍归旧会话', async () => {
  const f = await fixture();
  try {
    const first = await f.rs('roleSession.list', { role_id: f.roleId });
    const sessionA = first.active_session_id;
    // 会话A下先派发任务一
    await f.write(
      'task.submitFromUser',
      { request: { kind: 'task.request', to: { type: 'role', id: f.roleId }, summary: '任务一', body: 'body-1', inputs: [], expected: ['x'], completion: { mode: 'result', to: { type: 'user' } } } },
      { project_id: f.project.id, space_id: (await f.s.request('system.snapshot', {})).spaces[0].id },
      'task-1',
    );
    const created = (await f.rs('roleSession.create', { role_id: f.roleId, name: '新方向' })) as { session: { id: string; generation: number; state: string } };
    expect(created.session.state).toBe('ACTIVE');
    expect(created.session.generation).toBe(2);
    const afterCreate = await f.rs('roleSession.list', { role_id: f.roleId });
    expect(afterCreate.sessions).toHaveLength(2);
    expect(afterCreate.active_session_id).toBe(created.session.id);
    // 会话B下派发任务二
    await f.write(
      'task.submitFromUser',
      { request: { kind: 'task.request', to: { type: 'role', id: f.roleId }, summary: '任务二', body: 'body-2', inputs: [], expected: ['y'], completion: { mode: 'result', to: { type: 'user' } } } },
      { project_id: f.project.id, space_id: (await f.s.request('system.snapshot', {})).spaces[0].id },
      'task-2',
    );
    const task2 = f.db.prepare('select role_session_id from tasks order by created_at_ms desc limit 1').get() as { role_session_id: string };
    expect(task2.role_session_id).toBe(created.session.id);
    // 切回A；再切一次A（幂等，generation不变）
    const back = (await f.rs('roleSession.switch', { role_id: f.roleId, session_id: sessionA })) as { id: string; generation: number };
    expect(back.id).toBe(sessionA);
    const backAgain = (await f.rs('roleSession.switch', { role_id: f.roleId, session_id: sessionA })) as { generation: number };
    expect(backAgain.generation).toBe(back.generation);
    // 任务一的迟到对话条目写入时任务一已属A——即使当前活动会话是A，验证派生来源是任务而非当前活动
    const item = f.db.prepare('select role_session_id from conversation_items where task_id=(select id from tasks where summary=? )').get('任务一') as { role_session_id: string };
    expect(item.role_session_id).toBe(sessionA);
    const item2 = f.db.prepare('select role_session_id from conversation_items where task_id=(select id from tasks where summary=?)').get('任务二') as { role_session_id: string };
    expect(item2.role_session_id).toBe(created.session.id);
    // history 按会话隔离
    const taskId = (summary: string) => (f.db.prepare('select id from tasks where summary=?').get(summary) as { id: string }).id;
    const t1 = taskId('任务一'), t2 = taskId('任务二');
    const hA = (await f.rs('roleSession.history', { role_id: f.roleId, session_id: sessionA })) as { items: { task_id: string | null }[] };
    const hB = (await f.rs('roleSession.history', { role_id: f.roleId, session_id: created.session.id })) as { items: { task_id: string | null }[] };
    expect(hA.items.some((i) => i.task_id === t1)).toBe(true);
    expect(hA.items.some((i) => i.task_id === t2)).toBe(false);
    expect(hB.items.some((i) => i.task_id === t2)).toBe(true);
    expect(hB.items.some((i) => i.task_id === t1)).toBe(false);
  } finally { await f.close(); }
});

it('create/switch需要控制器租约；未知角色/会话拒绝；观察者可读', async () => {
  const { db, server, s, roleId, rs } = await fixture();
  try {
    await expect(rs('roleSession.create', { role_id: roleId, name: 'x' }, false)).rejects.toMatchObject({ message: 'CONTROL_LEASE_REQUIRED' });
    await expect(rs('roleSession.switch', { role_id: roleId, session_id: 'rsess_missing' })).rejects.toMatchObject({ message: 'ROLE_SESSION_NOT_FOUND' });
    await expect(rs('roleSession.list', { role_id: 'role_missing' })).rejects.toMatchObject({ message: 'ROLE_NOT_FOUND' });
    const observerTransport = new P1MemoryTransport(server, 'human_obs');
    const observer = await observerTransport.connect({ clientId: 'client_obs', clientVersion: '1.0.0-dev.0', requestedMode: 'observer' });
    const list = (await observer.request('roleSession.list' as never, { role_id: roleId } as never)) as { sessions: unknown[] };
    expect(list.sessions).toHaveLength(1);
    await expect(
      observer.request('roleSession.create' as never, { role_id: roleId, name: 'nope' } as never),
    ).rejects.toMatchObject({ message: 'CONTROL_LEASE_REQUIRED' });
  } finally { await db.close(); }
});
