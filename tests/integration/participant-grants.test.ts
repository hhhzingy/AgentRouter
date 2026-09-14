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
  const dir = mkdtempSync(resolve('.local/w11-tests/pgrant-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false, clock),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_setup',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  server.participant = new ParticipantExtension(db);
  const lease = await s.request(
    'control.acquire',
    {},
    { operationId: 'op_lease', expectedRevision: (await s.request('system.snapshot', {})).revision, scope: {} },
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
      name: 'grant测试',
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
  const spaceId = (db.prepare('select space_id from roles where id=?').get(roleId) as { space_id: string }).space_id;
  // 管理面签发 grant(全局租约)——操作员动作
  const issueGrant = async () =>
    (await s.request(
      'participant.grant.issue' as never,
      { role_id: roleId } as never,
      { leaseId: (lease as { leaseId: string }).leaseId },
    )) as unknown as { grant_id: string; token: string; generation: number; revoked_previous: boolean };
  // 参与者连接工厂(controller 模式但不取全局 lease;模拟两个聊天各一连接)
  const makeParticipant = async (clientId: string) => {
    const t = new P1MemoryTransport(server, 'human_test');
    const p = await t.connect({ clientId, clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    const attach = (grantId: string, token: string) =>
      p.request(
        'participant.attach' as never,
        { role_id: roleId, grant_id: grantId, grant_token: token } as never,
      ) as unknown as Promise<{ generation: number; project_id: string; space_id: string }>;
    const artifact = (name: string, content: string) =>
      p.request(
        'participant.artifact' as never,
        { role_id: roleId, name, content } as never,
      ) as unknown as Promise<Record<string, unknown>>;
    const sendInput = async (task: string, body: string) =>
      p.request(
        'conversation.sendUserInput' as never,
        { role_id: roleId, task_id: task, body } as never,
        {
          operationId: 'pinput_' + clientId + '_' + Math.random().toString(36).slice(2),
          expectedRevision: (await p.request('system.snapshot' as never, {} as never) as unknown as { revision: number }).revision,
          scope: { project_id: project.id, space_id: spaceId },
          // 冻结写帧必填 lease 字段;attachment 旁路服务端忽略其值(F-02:适配器统一注入)
          leaseId: 'participant-attachment',
        },
      ) as unknown as Promise<{ entityId: string }>;
    return { t, p, attach, artifact, sendInput };
  };
  // 使任务进入 WAITING_INPUT(fixture 直改 DB;写路径仍走服务校验)
  const makeWaitingTask = async (summary: string) => {
    await write(
      'task.submitFromUser',
      { request: { kind: 'task.request', to: { type: 'role', id: roleId }, summary, body: 'b', inputs: [], expected: ['x'], completion: { mode: 'result', to: { type: 'user' } } } },
      { project_id: project.id, space_id: spaceId },
      'task-' + summary,
    );
    const task = db.prepare('select id from tasks where summary=?').get(summary) as { id: string };
    db.prepare("update tasks set state='WAITING_INPUT' where id=?").run(task.id);
    db.prepare("insert into wait_records(task_id,waiting_for,reason,dependency_json,ready,updated_at_ms) values(?,?,?,?,0,?)").run(
      task.id, 'user_input', '等待参与者输入', '{}', clock(),
    );
    return task.id;
  };
  return {
    dir, db, server, s, write, project, spaceId, roleId, lease, issueGrant,
    makeParticipant, makeWaitingTask,
    async close() {
      await transport.close();
      db.close();
    },
  };
}

it('PART-01/02/03:签发grant→attach→真实WAITING_INPUT任务 sendUserInput 成功,输入恰好一次进入正确任务并进入产物正路径', async () => {
  const f = await fixture();
  try {
    const g = await f.issueGrant();
    expect(g.grant_id).toMatch(/^pgrant_/);
    expect(g.revoked_previous).toBe(false);
    const part = await f.makeParticipant('client_chatA');
    const at = await part.attach(g.grant_id, g.token);
    expect(at.project_id).toBe(f.project.id);
    expect(at.space_id).toBe(f.spaceId);
    const task = await f.makeWaitingTask('T1');
    const r = await part.sendInput(task, '回答A');
    expect(r.entityId).toBe(task);
    const items = f.db.prepare("select count(*) c from conversation_items where task_id=? and body='回答A'").get(task) as { c: number };
    expect(items.c).toBe(1);
    const taskSession = f.db.prepare('select role_session_id from tasks where id=?').get(task) as { role_session_id: string };
    const context = f.db.prepare('select portable_kind,source_work_session_id,content_json from role_context_entries where role_id=? order by context_seq desc limit 1').get(f.roleId) as { portable_kind: string; source_work_session_id: string; content_json: string };
    expect(context).toMatchObject({ portable_kind: 'USER_MESSAGE', source_work_session_id: taskSession.role_session_id });
    expect(JSON.parse(context.content_json)).toMatchObject({ body: '回答A', task_id: task });
    const wr = f.db.prepare('select ready from wait_records where task_id=?').get(task) as { ready: number };
    expect(wr.ready).toBe(1);
    // 正路径产物
    await expect(part.artifact('note.md', '# ok')).resolves.toMatchObject({ name: 'note.md' });
    // 无 grant attach 被拒(PART-06)
    await expect(part.attach('', '')).rejects.toMatchObject({ message: 'PARTICIPANT_GRANT_REVOKED' });
  } finally { await f.close(); }
});

it('PART-04/05/08:同角色新签发撤销旧grant;旧聊天写/重挂接被拒,不能自行重签发', async () => {
  const f = await fixture();
  try {
    const gA = await f.issueGrant();
    const chatA = await f.makeParticipant('client_chatA');
    await chatA.attach(gA.grant_id, gA.token);
    // 操作员为新聊天签发接管
    const gB = await f.issueGrant();
    expect(gB.revoked_previous).toBe(true);
    const chatB = await f.makeParticipant('client_chatB');
    await chatB.attach(gB.grant_id, gB.token);
    // 旧聊天写被拒
    await expect(chatA.artifact('late.md', 'x')).rejects.toMatchObject({ message: 'PARTICIPANT_GENERATION_STALE' });
    // 旧聊天凭据再挂接被拒
    await expect(chatA.attach(gA.grant_id, gA.token)).rejects.toMatchObject({ message: 'PARTICIPANT_GRANT_REVOKED' });
    // 新聊天正常
    await expect(chatB.artifact('fresh.md', 'y')).resolves.toMatchObject({ name: 'fresh.md' });
  } finally { await f.close(); }
});

it('PART-07:连接断开清理挂接;同grant重连再attach恢复,grant保持ACTIVE', async () => {
  const f = await fixture();
  try {
    const g = await f.issueGrant();
    const part = await f.makeParticipant('client_re');
    await part.attach(g.grant_id, g.token);
    await part.t.close();
    // 断开后该连接不再持有挂接;grant 本身仍 ACTIVE(可重挂)
    const list = (await f.s.request(
      'participant.grant.list' as never,
      { role_id: f.roleId } as never,
      { leaseId: (f.lease as { leaseId: string }).leaseId },
    )) as unknown as { grants: { id: string; state: string }[] };
    expect(list.grants.find((x) => x.id === g.grant_id)?.state).toBe('ACTIVE');
    const part2 = await f.makeParticipant('client_re2');
    await part2.attach(g.grant_id, g.token);
    await expect(part2.artifact('after-reconnect.md', 'z')).resolves.toMatchObject({ name: 'after-reconnect.md' });
    await part2.t.close();
  } finally { await f.close(); }
});

it('PART-09:挂接不占全局租约——>120s 后写仍成功且管理面并发 acquire 正常', async () => {
  let now = 1_000_000;
  const f = await fixture(() => now);
  try {
    const g = await f.issueGrant();
    const part = await f.makeParticipant('client_long');
    await part.attach(g.grant_id, g.token);
    // 参与者挂接期间管理面释放/重新 acquire(挂接不占租约)
    await f.s.request(
      'control.release',
      { lease_id: (f.lease as { leaseId: string }).leaseId },
      { operationId: 'op_release_setup', expectedRevision: (await f.s.request('system.snapshot', {})).revision, scope: {} },
    );
    const lease2 = await f.s.request(
      'control.acquire',
      {},
      { operationId: 'op_reacquire', expectedRevision: (await f.s.request('system.snapshot', {})).revision, scope: {} },
    );
    expect((lease2 as { leaseId: string }).leaseId).toBeTruthy();
    // 时钟前进 30 分钟:attachment 写不受任何租约过期影响(旧模型 30s 必失败)
    now += 30 * 60_000;
    await expect(part.artifact('long.md', 'w')).resolves.toMatchObject({ name: 'long.md' });
  } finally { await f.close(); }
});

it('PART-10:grant.revoke 撤销后旧聊天失效;grant.issue 需要全局租约(无租约连接被拒)', async () => {
  const f = await fixture();
  try {
    const g = await f.issueGrant();
    const part = await f.makeParticipant('client_r');
    await part.attach(g.grant_id, g.token);
    // 无租约的参与者连接不能自行签发
    await expect(
      part.p.request('participant.grant.issue' as never, { role_id: f.roleId } as never, { leaseId: 'nope' } as never),
    ).rejects.toThrow(/CONTROL_LEASE|SCOPE|LEASE/);
    // 管理面 revoke
    await f.s.request(
      'participant.grant.revoke' as never,
      { grant_id: g.grant_id } as never,
      { leaseId: (f.lease as { leaseId: string }).leaseId },
    );
    await expect(part.artifact('post-revoke.md', 'x')).rejects.toMatchObject({ message: 'PARTICIPANT_GENERATION_STALE' });
    await expect(part.attach(g.grant_id, g.token)).rejects.toMatchObject({ message: 'PARTICIPANT_GRANT_REVOKED' });
  } finally { await f.close(); }
});
