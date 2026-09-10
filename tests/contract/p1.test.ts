import { it, expect } from 'vitest';
import {
  validateDefinition,
  validateRequest,
} from '../../packages/client-contract/c1r1p1/index.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import { MockP1Server } from '../../packages/core-api/mock-p1.ts';
it('INT-01 P1 Provider 允许真实来源 false，历史 schema 不改', () => {
  expect(() =>
    validateDefinition('ProviderProfileVM', {
      id: 'provider_test',
      providerId: 'test',
      label: '未登录',
      harness: 'pi',
      status: 'UNVERIFIED',
      mock: false,
    }),
  ).not.toThrow();
});
it('INT-02 定向对话在正式请求中合法，拒绝多余 proposal 字段', () => {
  expect(() =>
    validateRequest({
      v: 1,
      id: 'req_test',
      method: 'conversation.read',
      params: {
        scope: { project_id: 'project_example' },
        role_id: 'role_test',
        task_id: 'task_test',
        run_id: 'run_test',
      },
    }),
  ).not.toThrow();
  expect(() =>
    validateRequest({
      v: 1,
      id: 'req_test',
      method: 'conversation.read',
      params: { x_proposal: true },
    }),
  ).toThrow();
});
it('B0 实际客户端协商 P1，路径句柄不跨连接，可创建空项目', async () => {
  const server = new MockP1Server();
  const a = new P1MemoryTransport(server),
    b = new P1MemoryTransport(server);
  const s = await a.connect({
    clientId: 'client_a',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
  });
  expect(s.hello.contractRevision).toBe('C1R1P1');
  const roots = await s.request('filesystem.listRoots', {});
  const snap = await s.request('system.snapshot', {});
  const lease = await s.request(
    'control.acquire',
    {},
    { operationId: 'op_acquire', expectedRevision: snap.revision, scope: {} },
  );
  const created = await s.request(
    'project.create',
    { name: '新空项目', path_handle: roots.items[0].pathHandle },
    {
      operationId: 'op_project',
      expectedRevision: snap.revision,
      scope: {},
      leaseId: lease.leaseId,
    },
  );
  expect(created.spacesCount).toBe(0);
  await a.close();
  const next = await b.connect({
    clientId: 'client_b',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'observer',
  });
  await expect(
    next.request('filesystem.validateProjectRoot', { path_handle: roots.items[0].pathHandle }),
  ).rejects.toThrow();
  await b.close();
});

it('INT-03 用户任务保留同组显式结果目标，定向分页、幂等和跨组拒绝', async () => {
  const { loadP1Scenario } = await import('../../packages/core-api/mock-p1-scenario.ts');
  const server = new MockP1Server();
  await loadP1Scenario(server, 'two-groups');
  const t = new P1MemoryTransport(server),
    s = await t.connect({
      clientId: 'client_task',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    }),
    snap = await s.request('system.snapshot', {}),
    lease = await s.request(
      'control.acquire',
      {},
      { operationId: 'op_l', scope: {}, expectedRevision: snap.revision },
    );
  const [a, b, , other] = snap.roles;
  const request = {
    kind: 'task.request' as const,
    to: { type: 'role' as const, id: a.id },
    summary: '委托',
    body: '保存完整用户输入',
    inputs: [],
    expected: ['指定验收'],
    completion: { mode: 'result' as const, to: { type: 'role' as const, id: b.id } },
    project_data: { source: 'user' },
  };
  const o = {
    operationId: 'op_submit',
    scope: { project_id: 'project_example', space_id: a.spaceId },
    expectedRevision: snap.revision,
    leaseId: lease.leaseId,
  };
  const task = await s.request('task.submitFromUser', { request }, o);
  expect(task.completionTargetLabel).toBe(b.id);
  expect(await s.request('task.submitFromUser', { request }, o)).toEqual(task);
  expect(server.state.userRequests[0]).toMatchObject({ sender: 'user', request });
  await expect(
    s.request('task.submitFromUser', { request: { ...request, body: '不同载荷' } }, o),
  ).rejects.toThrow('OPERATION_CONFLICT');
  await expect(
    s.request(
      'task.submitFromUser',
      {
        request: { ...request, completion: { mode: 'result', to: { type: 'role', id: other.id } } },
      },
      { ...o, operationId: 'op_cross', expectedRevision: task.revision },
    ),
  ).rejects.toThrow('CROSS_SPACE_DENIED');
  expect(
    (await s.request('conversation.read', { role_id: a.id, scope: o.scope, limit: 1 })).items,
  ).toHaveLength(1);
  expect(
    (await s.request('conversation.read', { role_id: b.id, scope: o.scope })).items,
  ).toHaveLength(0);
  await t.close();
});
it('P1->C1R1 协商不冒用三项勘误；不同操作允许相同 plan hash', async () => {
  const { loadP1Scenario } = await import('../../packages/core-api/mock-p1-scenario.ts');
  const server = new MockP1Server();
  await loadP1Scenario(server, 'two-groups');
  const t = new P1MemoryTransport(server),
    s = await t.connect({
      clientId: 'client_old',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
      contractRevision: 'C1R1',
    });
  expect(s.hello.schemaVersion).toBe(2);
  expect(s.hello.capabilities.methods).not.toContain('task.submitFromUser');
  await expect(s.request('conversation.read', { role_id: 'role_fake' })).rejects.toThrow(
    'INVALID_FRAME',
  );
  await t.close();
  const newT = new P1MemoryTransport(server),
    newS = await newT.connect({
      clientId: 'client_apply',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    }),
    snapshot = await newS.request('system.snapshot', {}),
    lease = await newS.request(
      'control.acquire',
      {},
      { operationId: 'op_new_lease', scope: {}, expectedRevision: snapshot.revision },
    );
  const old = server.state.plans[0];
  await newS.request(
    'rolePlan.apply',
    { plan: old.sourcePlan, plan_hash: old.planHash, confirmed: true, permission_grants: [] },
    {
      operationId: 'op_distinct',
      expectedRevision: snapshot.revision,
      scope: { project_id: 'project_example' },
      leaseId: lease.leaseId,
    },
  );
  expect(server.state.snapshot.roles).toHaveLength(12);
  await newT.close();
});

it('P1 stdio 客户端通过独立 Mock 子进程且事件按 Schema 校验', async () => {
  const { build } = await import('esbuild');
  const { spawn } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  const { StdioServerProxy } = await import('../../packages/client-transport/p1/stdio.ts');
  mkdirSync('.local/b0-tests', { recursive: true });
  await build({
    entryPoints: ['packages/core-api/mock-p1-stdio.ts'],
    outfile: '.local/b0-tests/mock.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
  const child = spawn(process.execPath, ['.local/b0-tests/mock.mjs'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    const t = new P1MemoryTransport(new StdioServerProxy(child.stdout, child.stdin));
    const s = await t.connect({
      clientId: 'client_stdio',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    expect(s.hello.contractRevision).toBe('C1R1P1');
    expect((await s.request('model.list', {})).items).toHaveLength(6);
    await t.close();
  } finally {
    child.kill();
  }
});
it('项目摘要 undefined 不误判介入，其他项目 audit 不污染活动时间', async () => {
  const { MockP1Product } = await import('../../packages/core-api/mock-p1-product.ts');
  const p = new MockP1Product();
  p.data.snapshot.spaces.push({
    id: 'space_legacy',
    projectId: 'project_example',
    name: '旧组',
    status: 'ACTIVE',
    rolesCount: 1,
    queuedTasksCount: 0,
    revision: 1,
  });
  p.data.snapshot.roles.push({
    id: 'role_legacy',
    spaceId: 'space_legacy',
    name: '旧角色',
    status: 'ACTIVE',
    pendingApprovalsCount: 0,
  });
  p.data.audit.push({ projectId: 'other_project', at: 999 });
  const s = p.snapshot();
  expect(s.projects[0].statusSummary.needsUserCount).toBe(0);
  expect(s.projects[0].statusSummary.lastActivityAtMs).toBe(0);
});
