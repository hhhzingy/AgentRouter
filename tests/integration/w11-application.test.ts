import { createHash } from 'node:crypto';
import { Management } from '../../packages/runtime/management.ts';
import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { ClientSession } from '../../packages/client-transport/p1/types.ts';
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';
async function fixture(clock = () => Date.now()) {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/app-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false, clock),
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
it('空项目→RolePlan配置事务；Bootstrap独立PENDING，无虚假可运行模型', async () => {
  const f = await fixture();
  try {
    expect((await f.s.request('system.snapshot', {})).spaces).toHaveLength(0);
    const v = await f.s.request('rolePlan.validate', { plan: f.plan });
    expect(v.valid).toBe(true);
    const p = (await f.write(
      'rolePlan.apply',
      { plan: f.plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
      { project_id: f.project.id },
    )) as any;
    expect(p.state).toBe('APPLIED');
    const snap = await f.s.request('system.snapshot', {});
    expect(snap.roles).toHaveLength(6);
    expect(snap.roles.every((r) => r.bootstrapState === 'PENDING')).toBe(true);
    expect(f.server.core.dispatch(snap.roles[0].id)).toBeNull();
    expect(f.s.hello.capabilities.mock).toBe(false);
    expect(f.s.hello.capabilities.methods).not.toContain('workspace.createWorktree');
    expect(f.s.hello.capabilities.methods).not.toContain('space.reconfigure.commit');
  } finally {
    await f.close();
  }
});
it('配置故障回滚无半套角色或成功账本；重启同操作重放保留原结果', async () => {
  const f = await fixture();
  const v = await f.s.request('rolePlan.validate', { plan: f.plan }),
    params = {
      plan: f.plan,
      plan_hash: v.planHash,
      confirmed: true as const,
      permission_grants: [],
    },
    scope = { project_id: f.project.id },
    revision = (await f.s.request('system.snapshot', {})).revision;
  f.server.failNextCommit = true;
  await expect(f.write('rolePlan.apply', params, scope, 'op_apply', revision)).rejects.toThrow(
    'INTERNAL_ERROR',
  );
  expect(f.db.prepare('select * from roles').all()).toHaveLength(0);
  const applied = await f.write('rolePlan.apply', params, scope, 'op_apply', revision);
  await f.close();
  const db = openApplicationStore(f.dir),
    server = new ApplicationService(db, [f.dir]),
    t = new P1MemoryTransport(server, 'human_test');
  try {
    const s = await t.connect({
        clientId: 'client_app',
        clientVersion: '1.0.0-dev.0',
        requestedMode: 'controller',
      }),
      lease = await s.request(
        'control.acquire',
        {},
        {
          operationId: 'op_restart',
          expectedRevision: (await s.request('system.snapshot', {})).revision,
          scope: {},
        },
      );
    expect(
      await s.request('rolePlan.apply', params, {
        operationId: 'op_apply',
        expectedRevision: revision,
        scope,
        leaseId: lease.leaseId,
      }),
    ).toEqual(applied);
    expect(db.prepare('select * from roles').all()).toHaveLength(6);
  } finally {
    await t.close();
    db.close();
  }
});
it('用户任务 sender=user，明确结果目标入库；对话角色过滤不混页', async () => {
  const f = await fixture();
  try {
    const v = await f.s.request('rolePlan.validate', { plan: f.plan });
    await f.write(
      'rolePlan.apply',
      { plan: f.plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
      { project_id: f.project.id },
    );
    const rs = (await f.s.request('system.snapshot', {})).roles;
    const a = rs[0],
      b = rs.find((r) => r.id !== a.id && r.spaceId === a.spaceId)!,
      foreign = rs.find((r) => r.spaceId !== a.spaceId)!;
    const scope = { project_id: f.project.id, space_id: a.spaceId },
      request = {
        kind: 'task.request',
        to: { type: 'role', id: a.id },
        summary: '正式用户任务',
        body: '完整正文',
        inputs: [],
        expected: ['验收点'],
        completion: { mode: 'result', to: { type: 'role', id: b.id } },
        on_problem: { type: 'user' },
        project_data: { origin: 'user' },
      };
    const task = (await f.write('task.submitFromUser', { request }, scope)) as any;
    const row = f.db.prepare('select * from messages where task_id=?').get(task.id) as any;
    expect(row.from_kind).toBe('user');
    expect(row.from_role_id).toBeNull();
    expect(JSON.parse(row.payload_json)).toEqual(request);
    expect(
      (await f.s.request('conversation.read', { role_id: a.id, scope })).items.some(
        (x) => x.taskId === task.id,
      ),
    ).toBe(true);
    expect(
      (await f.s.request('conversation.read', { role_id: b.id, scope })).items.some(
        (x) => x.taskId === task.id,
      ),
    ).toBe(false);
    await expect(
      f.write(
        'task.submitFromUser',
        {
          request: {
            ...request,
            completion: { mode: 'result', to: { type: 'role', id: foreign.id } },
          },
        },
        scope,
      ),
    ).rejects.toThrow('CROSS_SPACE_DENIED');
  } finally {
    await f.close();
  }
});
it('快照到订阅之间的已提交事件不漏失，重复通知不重复交付', async () => {
  const f = await fixture();
  try {
    const snapshot = await f.s.request('system.snapshot', {});
    await f.write('project.archive', { id: f.project.id }, { project_id: f.project.id });
    const received: number[] = [];
    const off = f.s.subscribe((e) => received.push(e.cursor));
    f.server.notify();
    f.server.notify();
    expect(received.length).toBeGreaterThan(0);
    expect(received.every((c) => c > snapshot.cursor)).toBe(true);
    expect(new Set(received).size).toBe(received.length);
    const catchup = await f.s.request('events.catchup', {
      server_instance_id: f.s.hello.serverInstanceId,
      after_cursor: snapshot.cursor,
    });
    expect(catchup.events.map((x) => x.cursor)).toEqual(received);
    off();
  } finally {
    await f.close();
  }
});
it('Observer 和跨连接路径句柄拒绝；历史命令不能绕过当前授权', async () => {
  const f = await fixture();
  const observer = new P1MemoryTransport(f.server, 'human_observer');
  try {
    const o = await observer.connect({
      clientId: 'client_observer',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    await expect(
      o.request(
        'project.archive',
        { id: f.project.id },
        {
          operationId: 'op_unauth',
          leaseId: 'lease_forged',
          expectedRevision: (await o.request('system.snapshot', {})).revision,
          scope: { project_id: f.project.id },
        },
      ),
    ).rejects.toThrow('CONTROL_LEASE_REQUIRED');
    const roots = await f.s.request('filesystem.listRoots', {});
    await expect(
      o.request('filesystem.validateProjectRoot', { path_handle: roots.items[0].pathHandle }),
    ).rejects.toThrow('SCOPE_DENIED');
    const revision = (await f.s.request('system.snapshot', {})).revision;
    await f.write(
      'project.archive',
      { id: f.project.id },
      { project_id: f.project.id },
      'op_saved',
      revision,
    );
    const denied = new P1MemoryTransport(f.server, 'human_test', false),
      s = await denied.connect({
        clientId: 'client_app',
        clientVersion: '1.0.0-dev.0',
        requestedMode: 'controller',
      });
    await expect(
      s.request(
        'project.archive',
        { id: f.project.id },
        {
          operationId: 'op_saved',
          leaseId: 'lease_forged',
          expectedRevision: revision,
          scope: { project_id: f.project.id },
        },
      ),
    ).rejects.toThrow('CONTROL_LEASE_REQUIRED');
    await denied.close();
  } finally {
    await observer.close();
    await f.close();
  }
});
it('过期租约拒绝写入，事务回滚不触发 Core 关机', async () => {
  let now = Date.now();
  const f = await fixture(() => now);
  try {
    let shutdown = 0;
    f.server.onShutdown = () => {
      shutdown++;
    };
    f.server.failNextCommit = true;
    await expect(f.write('runtime.shutdownCore', {})).rejects.toThrow('INTERNAL_ERROR');
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdown).toBe(0);
    now += 31000;
    await expect(
      f.write('project.archive', { id: f.project.id }, { project_id: f.project.id }),
    ).rejects.toThrow('CONTROL_LEASE_EXPIRED');
    expect((await f.s.request('project.get', { id: f.project.id, scope: {} })).status).toBe(
      'ACTIVE',
    );
  } finally {
    await f.close();
  }
});
it('旧角色缺少章程不会误计需介入，项目活动和汇总不串项目', async () => {
  const f = await fixture();
  try {
    const before = (await f.s.request('project.get', { id: f.project.id, scope: {} }))
      .statusSummary!;
    const m = new Management(f.db),
      legacy = m.createProject('旧项目', f.dir);
    m.createRole({
      spaceId: legacy.space,
      name: '旧角色',
      description: '迁移前记录',
      harness: 'codex',
      workspaceId: legacy.workspace,
    });
    const after = (await f.s.request('project.get', { id: f.project.id, scope: {} }))
      .statusSummary!;
    expect(after).toEqual(before);
    const old = (await f.s.request('project.get', { id: legacy.project, scope: {} }))
      .statusSummary!;
    expect(old.needsUserCount).toBe(0);
    expect(old.groups[0].roles).toHaveLength(1);
    expect(after.groups).toHaveLength(0);
  } finally {
    await f.close();
  }
});
it('角色对话分页先过滤再分页，错误组写入拒绝且不改变角色', async () => {
  const f = await fixture();
  try {
    const v = await f.s.request('rolePlan.validate', { plan: f.plan });
    await f.write(
      'rolePlan.apply',
      { plan: f.plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
      { project_id: f.project.id },
    );
    const rs = (await f.s.request('system.snapshot', {})).roles,
      a = rs[0],
      other = rs.find((r) => r.spaceId !== a.spaceId)!;
    const scope = { project_id: f.project.id, space_id: a.spaceId };
    for (let i = 0; i < 3; i++)
      await f.write(
        'task.submitFromUser',
        {
          request: {
            kind: 'task.request',
            to: { type: 'role', id: a.id },
            summary: '分页 ' + i,
            body: '用户正文',
            inputs: [],
            expected: ['结论'],
            completion: { mode: 'result', to: { type: 'user' } },
          },
        },
        scope,
      );
    const first = await f.s.request('conversation.read', { role_id: a.id, scope, limit: 2 }),
      next = await f.s.request('conversation.read', {
        role_id: a.id,
        scope,
        limit: 2,
        after_id: first.next_id!,
      });
    expect(first.has_more).toBe(true);
    expect([...first.items, ...next.items].every((x) => x.roleId === a.id)).toBe(true);
    expect(new Set([...first.items, ...next.items].map((x) => x.id)).size).toBe(4);
    await expect(
      f.write(
        'role.rename',
        { id: a.id, name: '越权' },
        { project_id: f.project.id, space_id: other.spaceId },
      ),
    ).rejects.toThrow('SCOPE_DENIED');
    expect((await f.s.request('role.get', { id: a.id, scope })).name).toBe(a.name);
  } finally {
    await f.close();
  }
});

it('J1 产物按项目授权、分块一致性、缺失与损坏拒绝下载', async () => {
  const f = await fixture();
  const restricted = new P1MemoryTransport({
    open: () => f.server.open('human_restricted', true, new Set()),
    handle: (c, r) => f.server.handle(c, r),
    subscribe: (c, h) => f.server.subscribe(c, h),
    disconnect: (c) => f.server.disconnect(c),
  });
  try {
    const bytes = Buffer.alloc(70000, 74),
      sha = createHash('sha256').update(bytes).digest('hex');
    mkdirSync(resolve(f.dir, 'artifacts'));
    writeFileSync(resolve(f.dir, 'artifacts', sha), bytes);
    f.db
      .prepare('insert into artifacts values(?,?,?,?,?,?,?,?,?)')
      .run(
        'artifact_j1',
        f.project.id,
        sha,
        sha,
        bytes.length,
        'text/plain',
        JSON.stringify({ name: 'synthetic.txt' }),
        'AVAILABLE',
        Date.now(),
      );
    expect((await f.s.request('artifact.verify', { id: 'artifact_j1' })).state).toBe('AVAILABLE');
    const first = await f.s.request('artifact.download', { id: 'artifact_j1', limit_bytes: 65536 });
    const second = await f.s.request('artifact.download', {
      id: 'artifact_j1',
      offset_bytes: first.byteSize,
    });
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(
      Buffer.concat([Buffer.from(first.content, 'base64'), Buffer.from(second.content, 'base64')]),
    ).toEqual(bytes);
    await expect(
      f.s.request('artifact.download', { id: 'artifact_j1', offset_bytes: 70001 }),
    ).rejects.toThrow('INVALID_PARAMS');
    const other = new Management(f.db).createProject('无关项目', f.dir);
    await expect(
      f.s.request('artifact.get', { id: 'artifact_j1', scope: { project_id: other.project } }),
    ).rejects.toThrow('SCOPE_DENIED');
    const denied = await restricted.connect({
      clientId: 'client_restricted',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    expect((await denied.request('artifact.list', {})).items).toHaveLength(0);
    await expect(denied.request('artifact.get', { id: 'artifact_j1', scope: {} })).rejects.toThrow(
      'SCOPE_DENIED',
    );
    writeFileSync(resolve(f.dir, 'artifacts', sha), 'damaged');
    expect((await f.s.request('artifact.verify', { id: 'artifact_j1' })).state).toBe('QUARANTINED');
    await expect(f.s.request('artifact.download', { id: 'artifact_j1' })).rejects.toThrow(
      'CAPABILITY_UNAVAILABLE',
    );
    f.db
      .prepare('update artifacts set storage_key=? where id=?')
      .run('0'.repeat(64), 'artifact_j1');
    expect((await f.s.request('artifact.verify', { id: 'artifact_j1' })).state).toBe('MISSING');
    await expect(f.s.request('artifact.download', { id: 'artifact_j1' })).rejects.toThrow(
      'CAPABILITY_UNAVAILABLE',
    );
    f.db.prepare('update artifacts set storage_key=? where id=?').run('../escape', 'artifact_j1');
    await expect(f.s.request('artifact.get', { id: 'artifact_j1', scope: {} })).rejects.toThrow(
      'INVALID_PARAMS',
    );
  } finally {
    await restricted.close();
    await f.close();
  }
});
it('J1 Main 目录授权受控制租约限制，句柄不能跨连接使用', async () => {
  const f = await fixture();
  const t = new P1MemoryTransport(f.server, 'human_test');
  try {
    const c = (f.transport as unknown as { connection: string }).connection;
    const selected = mkdtempSync(resolve('.local/w11-tests/selected-'));
    const grant = f.server.grantSelectedDirectory(c, selected);
    expect(
      (await f.s.request('filesystem.validateProjectRoot', { path_handle: grant.pathHandle }))
        .items[0].displayPath,
    ).toBe(selected);
    const observer = await t.connect({
      clientId: 'client_observer',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    const observerId = (t as unknown as { connection: string }).connection;
    expect(() => f.server.grantSelectedDirectory(observerId, selected)).toThrow('SCOPE_DENIED');
    await expect(
      observer.request('filesystem.validateProjectRoot', { path_handle: grant.pathHandle }),
    ).rejects.toThrow('SCOPE_DENIED');
    expect(() => f.server.grantSelectedDirectory(c, '\\\\server\\share')).toThrow('SCOPE_DENIED');
    const file = resolve(selected, 'file.txt');
    writeFileSync(file, 'fixture');
    expect(() => f.server.grantSelectedDirectory(c, file)).toThrow('SCOPE_DENIED');
  } finally {
    await t.close();
    await f.close();
  }
});

it('J2 项目范围先过滤再分页，150 条无 role 事件不串项目且游标无丢重', async()=>{
 const f=await fixture();
 try{
  const m=new Management(f.db),a=m.createProject('同名项目',f.dir),b=m.createProject('同名项目',f.dir);
  const insert=f.db.prepare('insert into conversation_items(id,project_id,space_id,kind,title,body,at_ms) values(?,?,?,?,?,?,?)');
  for(let i=0;i<150;i++){
   insert.run('j2_a_'+i,a.project,a.space,'SYSTEM_EVENT','历史 A '+i,'第 '+i+' 条',i);
   insert.run('j2_b_'+i,b.project,b.space,'SYSTEM_EVENT','历史 B '+i,'第 '+i+' 条',i);
  }
  const first=await f.s.request('conversation.read',{scope:{project_id:a.project},limit:100});
  const second=await f.s.request('conversation.read',{scope:{project_id:a.project},limit:100,after_id:first.next_id!});
  expect(first.items).toHaveLength(100);expect(second.items).toHaveLength(50);
  expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(150);
  expect([...first.items,...second.items].every(x=>x.id.startsWith('j2_a_'))).toBe(true);
  await expect(f.s.request('conversation.read',{scope:{project_id:b.project},after_id:first.next_id!})).rejects.toThrow('CURSOR_INVALID');
  const connection=(f.transport as unknown as {connection:string}).connection;
  expect(f.server.desktopContext(connection).dataId).toMatch(/^dataset_/);
 }finally{await f.close();}
});

it('J2 现有组增员事务更新名单，保留暂停及最小权限；重名和故障均不留半成品',async()=>{
 const f=await fixture();try{
  const v=await f.s.request('rolePlan.validate',{plan:f.plan});await f.write('rolePlan.apply',{plan:f.plan,plan_hash:v.planHash,confirmed:true,permission_grants:[]},{project_id:f.project.id});
  const snap=await f.s.request('system.snapshot',{}),space=snap.spaces[0],role=snap.roles.find(r=>r.spaceId===space.id)!;
  const charter=await f.s.request('roleCharter.get',{project_id:f.project.id,role_id:role.id});
  await f.write('role.updateStatus',{id:role.id,status:'PAUSED'},{project_id:f.project.id,space_id:space.id});
  const spec={...charter.spec,role_key:'j2_new_role',display_name:'新增资料角色',requested_permissions:{...charter.spec.requested_permissions,allowed_paths:['docs']}};
  const params={spec,confirmed:true as const,permissions:{...spec.requested_permissions,allowed_paths:['docs','not_requested']}};
  const scope={project_id:f.project.id,space_id:space.id};
  f.server.failNextCommit=true;await expect(f.write('role.createFromSpec',params,scope)).rejects.toThrow('INTERNAL_ERROR');expect((await f.s.request('system.snapshot',{})).roles).toHaveLength(6);
  const created=await f.write('role.createFromSpec',params,scope) as any;
  const latest=await f.s.request('roleCharter.get',{project_id:f.project.id,role_id:role.id});expect(latest.directory.some(r=>r.roleId===created.id)).toBe(true);expect(latest.revision).toBe(charter.revision+1);
  const granted=await f.s.request('roleCharter.get',{project_id:f.project.id,role_id:created.id});expect(granted.effectivePermissions.allowed_paths).toEqual(['docs']);expect(granted.effectivePermissions.workspace_access).toBe('read_only');
  expect((await f.s.request('role.get',{id:role.id,scope})).status).toBe('PAUSED');
  await expect(f.write('role.createFromSpec',{...params,spec:{...spec,role_key:'other_key'}},scope)).rejects.toThrow('PLAN_INVALID');expect((await f.s.request('system.snapshot',{})).roles).toHaveLength(7);
 }finally{await f.close();}
});
