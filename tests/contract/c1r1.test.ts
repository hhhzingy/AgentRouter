import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { MockC1R1Server } from '../../packages/core-api/mock-c1r1.ts';
import { InMemoryTransport } from '../../packages/client-transport/in-memory.ts';
import type { MockCoreServer } from '../../packages/core-api/mock-server.ts';
import { validateResult as oldResult } from '../../packages/client-contract/index.ts';
import {
  methodMetadata,
  type Method,
  type RolePlanInput,
  type ReconfigurationInput,
  digest,
} from '../../packages/client-contract/c1r1/index.ts';
import planSeed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import oldSchema from '../../contracts/client-api.c1.schema.json' with { type: 'json' };
import schema from '../../contracts/client-api.c1r1.schema.json' with { type: 'json' };
const plan = () => structuredClone(planSeed) as RolePlanInput;
class Client {
  id = 'client_test';
  connection: string;
  lease = 'lease_observer';
  counter = 0;
  constructor(
    readonly server: MockC1R1Server,
    readonly observer = false,
  ) {
    this.connection = server.open('mock_human');
  }
  async initialize() {
    await this.call('system.initialize', {
      client_protocol: 'agentrouter-client/1',
      client_version: '1.0.0-dev.0',
      client_id: this.id,
      requested_mode: this.observer ? 'observer' : 'controller',
      contract_revision: 'C1R1',
    });
    if (!this.observer) this.lease = (await this.call('control.acquire', {})).leaseId;
    return this;
  }
  async call(method: Method, params: any, options: any = {}): Promise<any> {
    const meta = methodMetadata[method];
    const response = await this.server.handle(this.connection, {
      v: 1,
      id: 'req_' + ++this.counter,
      method,
      params,
      ...(meta.mutation
        ? {
            client_id: this.id,
            operation_id: options.op ?? 'op_' + this.counter,
            expected_revision: options.revision ?? this.server.state.snapshot.revision,
            scope:
              options.scope ?? (meta.scope === 'global' ? {} : { project_id: 'project_example' }),
            ...(method.startsWith('control.') ? {} : { lease_id: this.lease }),
          }
        : {}),
    });
    if (response.error) throw Error(response.error.code);
    return response.result;
  }
}
async function setup() {
  const server = new MockC1R1Server();
  return { server, client: await new Client(server).initialize() };
}
async function apply(client: Client, p = plan(), options: any = {}) {
  const v = await client.call('rolePlan.validate', { plan: p });
  return client.call(
    'rolePlan.apply',
    { plan: p, plan_hash: v.planHash, confirmed: true, permission_grants: [] },
    options,
  );
}
async function ready() {
  const f = await setup();
  const applied = await apply(f.client);
  return { ...f, applied };
}
function merge(server: MockC1R1Server): ReconfigurationInput {
  const s = server.state.snapshot;
  return {
    mode: 'MERGE',
    source_space_ids: s.spaces.filter((g: any) => g.status === 'ACTIVE').map((g: any) => g.id),
    targets: [
      {
        group_key: 'merged',
        display_name: '合并组',
        purpose: '明确合并未来通信',
        rules: {
          handoff_requirements: [],
          completion_definition: ['用户验收'],
          parallelism_notes: '不合并工作树',
        },
      },
    ],
    assignments: s.roles.map((r: any) => ({
      role_id: r.id,
      target_group_key: 'merged',
      workspace_id: server.state.charters.filter((c: any) => c.roleId === r.id).at(-1).workspaceId,
    })),
    task_dispositions: [],
  };
}
async function preview(client: Client, p: ReconfigurationInput) {
  await client.call('runtime.drain', {});
  return client.call('space.reconfigure.preview', { plan: p });
}
async function commit(client: Client, p: any, options: any = {}) {
  return client.call(
    'space.reconfigure.commit',
    { plan_id: p.planId, plan_hash: p.planHash, confirmed: true },
    options,
  );
}
function task(role: any, id = 'task_test') {
  return {
    spaceId: role.spaceId,
    assigneeRoleId: role.id,
    summary: '未开始任务',
    state: 'QUEUED',
    acceptance: 'PENDING',
    completionTargetLabel: '用户',
    createdAtMs: 1,
    updatedAtMs: 1,
    revision: 1,
    policyRevision: 1,
  };
}
it('CR1-01/02 历史冻结不变，C1R1 生成无漂移且全部旧方法保留', () => {
  const frozen = JSON.parse(readFileSync('docs/api/freeze.c1.json', 'utf8'));
  for (const [p, hash] of Object.entries(frozen.sha256_lf))
    expect(
      createHash('sha256').update(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')).digest('hex'),
    ).toBe(hash);
  for (const [name, meta] of Object.entries(oldSchema['x-methods'])) {
    expect((schema['x-methods'] as any)[name]).toEqual(meta);
    if (name !== 'system.initialize')
      expect((schema.$defs as any)[meta.params]).toEqual((oldSchema.$defs as any)[meta.params]);
  }
  const r = spawnSync(process.execPath, ['tools/generate-client-c1r1.mjs', '--check'], {
    encoding: 'utf8',
  });
  expect(r.status).toBe(0);
});
it('CR1-05 输入仅临时 key，拒绝真实 ID/授权字段、重复 key、错组/工作区', async () => {
  const { client } = await setup();
  expect((await client.call('rolePlan.validate', { plan: plan() })).valid).toBe(true);
  const invalid: any = plan();
  invalid.roles[0].role_id = 'role_forged';
  await expect(client.call('rolePlan.validate', { plan: invalid })).rejects.toThrow(
    'INVALID_FRAME',
  );
  delete invalid.roles[0].role_id;
  invalid.roles[0].effective_permissions = {};
  await expect(client.call('rolePlan.validate', { plan: invalid })).rejects.toThrow(
    'INVALID_FRAME',
  );
  for (const mutate of [
    (p: any) => (p.roles[1].role_key = p.roles[0].role_key),
    (p: any) => (p.roles[0].group_key = 'missing'),
    (p: any) => (p.roles[0].workspace_ref = 'foreign'),
  ]) {
    const p = plan();
    mutate(p);
    expect((await client.call('rolePlan.validate', { plan: p })).valid).toBe(false);
  }
});
it('CR1-06 Apply 原子创建2组6角色/Binding/章程/Bootstrap，重放不会重复', async () => {
  const { client, server } = await setup();
  const first = await apply(client, plan(), { op: 'op_apply', revision: 1 });
  const again = await apply(client, plan(), { op: 'op_apply', revision: 1 });
  expect(again).toEqual(first);
  const d = server.state;
  expect(d.snapshot.spaces).toHaveLength(2);
  expect(d.snapshot.roles).toHaveLength(6);
  expect(d.bindings).toHaveLength(6);
  expect(d.charters).toHaveLength(6);
  expect(d.bootstrap).toHaveLength(6);
  expect(d.snapshot.roles.every((r: any) => r.status === 'PAUSED')).toBe(true);
  const changed = plan();
  changed.title = '修改方案';
  await expect(apply(client, changed, { op: 'op_apply', revision: 1 })).rejects.toThrow(
    'OPERATION_CONFLICT',
  );
});
it('CR1-06 故障注入无半完成，失败后同 operation 可以安全重试', async () => {
  const { client, server } = await setup();
  const before = server.state;
  server.injectCommitFailure();
  await expect(apply(client, plan(), { op: 'op_fault', revision: 1 })).rejects.toThrow(
    'INTERNAL_ERROR',
  );
  expect(server.state).toEqual(before);
  await apply(client, plan(), { op: 'op_fault', revision: 1 });
  expect(server.state.snapshot.roles).toHaveLength(6);
});
it('权限请求不是授权，用户/Core/Harness 交集不允许自动网络或管理员工具', async () => {
  const { client, server } = await setup();
  const p = plan();
  p.roles[0].requested_permissions.tool_profiles = ['admin', 'build'];
  const v = await client.call('rolePlan.validate', { plan: p });
  await client.call('rolePlan.apply', {
    plan: p,
    plan_hash: v.planHash,
    confirmed: true,
    permission_grants: [
      {
        role_key: p.roles[0].role_key,
        permissions: {
          workspace_access: 'read_write',
          allowed_paths: ['packages', 'unrequested'],
          tool_profiles: ['admin', 'build'],
          network_profile: 'custom_request',
        },
      },
    ],
  });
  const e = server.state.charters[0].effectivePermissions;
  expect(e).toEqual({
    workspace_access: 'read_only',
    allowed_paths: ['packages'],
    tool_profiles: [],
    network_profile: 'none',
  });
});
it('CR1-03/04 同组 task/result/notice 可记录，跨组全部拒绝且无回执/任务唤醒', async () => {
  const { server } = await ready();
  const roles = server.state.snapshot.roles;
  const before = server.state.snapshot.tasks.length;
  for (const kind of ['task.request', 'task.result', 'notice'] as const) {
    expect(server.routeMock(roles[0].id, roles[1].id, kind)).toEqual({});
    expect(() => server.routeMock(roles[0].id, roles[3].id, kind)).toThrow('CROSS_SPACE_DENIED');
  }
  expect(server.state.messages).toHaveLength(3);
  expect(server.state.snapshot.tasks).toHaveLength(before);
});
it('Role Plan 结果/异常目标跨组在语义验证阶段拒绝', async () => {
  const { client } = await setup();
  const p = plan();
  p.roles[0].default_completion_target = { type: 'role_key', role_key: p.roles[3].role_key };
  const v = await client.call('rolePlan.validate', { plan: p });
  expect(v.errors).toContainEqual({ code: 'CROSS_SPACE_DENIED', field: p.roles[0].role_key });
  await expect(apply(client, p)).rejects.toThrow('PLAN_INVALID');
});
it('CR1-07 Bootstrap 失败/未交付不能派发，交付也不能绕过模型未验证', async () => {
  const { server } = await ready();
  const role = server.state.snapshot.roles[0];
  server.setMockBlocker('task', 'task_test', task(role));
  expect(() => server.dispatchMock(role.id)).toThrow('BOOTSTRAP_REQUIRED');
  server.advanceMockBootstrap(role.id, 'DELIVERING', 1, 1);
  server.advanceMockBootstrap(role.id, 'FAILED', 1, 1);
  expect(() => server.dispatchMock(role.id)).toThrow('BOOTSTRAP_REQUIRED');
  server.advanceMockBootstrap(role.id, 'DELIVERING', 1, 1);
  server.advanceMockBootstrap(role.id, 'DELIVERED', 1, 1);
  expect(() => server.dispatchMock(role.id)).toThrow('MODEL_UNVERIFIED');
  expect(server.state.snapshot.roles[0].status).toBe('PAUSED');
});
it('模拟目录验证及 Bootstrap 成功后才锁章程/规则派首任务，旧 epoch 拒绝', async () => {
  const { server, client } = await ready();
  const r = server.state.snapshot.roles[0],
    m = server.state.catalog[0];
  server.registerMockCatalog(m.provider_profile_id, [
    { ...m, source: 'RUNTIME', availability: 'AVAILABLE', tool_support: 'SUPPORTED' },
  ]);
  await client.call('model.refresh', { provider_profile_id: m.provider_profile_id });
  server.setMockBlocker('task', 'task_first', task(r));
  expect(() => server.advanceMockBootstrap(r.id, 'DELIVERED', 1, 99)).toThrow('REVISION_CONFLICT');
  server.advanceMockBootstrap(r.id, 'DELIVERING', 1, 1);
  server.advanceMockBootstrap(r.id, 'DELIVERED', 1, 1);
  expect(server.dispatchMock(r.id)?.state).toBe('RUNNING');
  expect(server.state.snapshot.tasks[0]).toMatchObject({ charterRevision: 1, policyRevision: 1 });
});
it('CR1-08/09 六个seed明确未验证，档位按模型，禁止双 reasoning 参数', async () => {
  const { client } = await setup();
  const catalog = (await client.call('model.list', {})).items;
  expect(catalog).toHaveLength(6);
  expect(catalog.every((m: any) => m.source === 'SEED' && m.availability === 'UNVERIFIED')).toBe(
    true,
  );
  expect(catalog.find((m: any) => m.model_id === 'qwen3.8-max').reasoning.levels).toEqual([
    'none',
    'low',
    'medium',
    'xhigh',
  ]);
  expect(catalog[0].reasoning.levels).toEqual(['low', 'high', 'max']);
  const p = plan();
  p.roles[0].runtime.reasoning_effort = 'medium';
  expect((await client.call('rolePlan.validate', { plan: p })).valid).toBe(false);
  (p.roles[0].runtime as any).thinking_budget = 100;
  await expect(client.call('rolePlan.validate', { plan: p })).rejects.toThrow('INVALID_FRAME');
});
it('Runtime 覆盖缓存和 seed，刷新不静默改角色选择，缺失模型无法回落为可启动', async () => {
  const { client, server } = await ready();
  const m = server.state.catalog[0],
    selection = server.state.snapshot.roles[0].modelSelection;
  server.registerMockCatalog(
    m.provider_profile_id,
    [{ ...m, availability: 'AVAILABLE', source: 'VERIFIED_CACHE', tool_support: 'SUPPORTED' }],
    'VERIFIED_CACHE',
  );
  await client.call('model.refresh', { provider_profile_id: m.provider_profile_id });
  expect(
    (
      await client.call('model.get', {
        provider_profile_id: m.provider_profile_id,
        model_id: m.model_id,
      })
    ).source,
  ).toBe('VERIFIED_CACHE');
  server.registerMockCatalog(m.provider_profile_id, []);
  await client.call('model.refresh', { provider_profile_id: m.provider_profile_id });
  const observed = await client.call('model.get', {
    provider_profile_id: m.provider_profile_id,
    model_id: m.model_id,
  });
  expect(observed).toMatchObject({ source: 'RUNTIME', availability: 'UNVERIFIED' });
  expect(server.state.snapshot.roles[0].modelSelection).toEqual(selection);
});
it('CR1-10 合并创建新组并归档旧组；身份/历史/工作区保留，章程只含新组', async () => {
  const { client, server } = await ready();
  const ids = server.state.snapshot.roles.map((r: any) => r.id),
    workspaces = server.state.workspaces;
  server.routeMock(ids[0], ids[1], 'notice');
  const messages = server.state.messages;
  const p = await preview(client, merge(server));
  expect(p.blockers).toEqual([]);
  const result = await commit(client, p, { op: 'op_merge' });
  expect(result.newSpaceIds).toHaveLength(1);
  expect(
    result.transitionPackets.every((x: any) => x.strategy === 'NEW_SESSION_WITH_HANDOVER'),
  ).toBe(true);
  expect(server.state.snapshot.roles.map((r: any) => r.id)).toEqual(ids);
  expect(server.state.snapshot.spaces.filter((g: any) => g.status === 'ARCHIVED')).toHaveLength(2);
  expect(server.state.messages).toEqual(messages);
  expect(server.state.workspaces).toEqual(workspaces);
  expect(server.state.charters).toHaveLength(12);
  expect(server.state.memberships).toHaveLength(12);
  expect(server.state.snapshot.roles.every((r: any) => r.bootstrapState === 'PENDING')).toBe(true);
  expect(await commit(client, p, { op: 'op_merge', revision: p.expectedRevision })).toEqual(result);
});
it('CR1-10 拆分唯一归属且跨新组通信被拒绝', async () => {
  const { client, server } = await ready();
  const source = server.state.snapshot.spaces[0],
    roles = server.state.snapshot.roles.filter((r: any) => r.spaceId === source.id),
    base = merge(server);
  const p: ReconfigurationInput = {
    ...base,
    mode: 'SPLIT',
    source_space_ids: [source.id],
    targets: [
      { ...base.targets[0], group_key: 'left' },
      { ...base.targets[0], group_key: 'right' },
    ],
    assignments: roles.map((r: any, i: number) => ({
      role_id: r.id,
      target_group_key: i === 0 ? 'left' : 'right',
      workspace_id: 'workspace_core',
    })),
  };
  await commit(client, await preview(client, p));
  expect(new Set(server.state.snapshot.roles.map((r: any) => r.id)).size).toBe(6);
  expect(() => server.routeMock(roles[0].id, roles[1].id, 'notice')).toThrow('CROSS_SPACE_DENIED');
});
for (const state of ['STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING', 'UNKNOWN'])
  it('CR1-11 ' + state + ' 阻止组重构', async () => {
    const { client, server } = await ready();
    const role = server.state.snapshot.roles[0];
    server.setMockBlocker('run', 'run_block', {
      roleId: role.id,
      harness: 'pi',
      state,
      reconciliationRequired: state === 'UNKNOWN',
      revision: 1,
    });
    const p = await preview(client, merge(server));
    expect(
      p.blockers.some((b: any) => b.code === (state === 'UNKNOWN' ? 'UNKNOWN_RUN' : 'ACTIVE_RUN')),
    ).toBe(true);
    await expect(commit(client, p)).rejects.toThrow('RECONFIGURATION_BLOCKED');
    expect(server.state.snapshot.spaces).toHaveLength(2);
  });
it('账号切换、资源不确定、无目标角色、规则/会话无效均返回 blockers', async () => {
  const { client, server } = await ready();
  server.setMockBlocker('switch', server.state.snapshot.spaces[0].id, true);
  server.setMockBlocker('lease', 'workspace_core', true);
  const input = merge(server);
  input.assignments.pop();
  input.assignments[0].session_strategy = 'NATIVE_RESUME_WITH_TRANSITION';
  input.targets[0].rules.completion_definition = [' '];
  const p = await preview(client, input);
  const codes = p.blockers.map((b: any) => b.code);
  for (const code of [
    'ACCOUNT_SWITCHING',
    'RESOURCE_LEASE_UNCERTAIN',
    'ROLE_DESTINATION_REQUIRED',
    'RULES_INVALID',
    'SESSION_STRATEGY_UNSUPPORTED',
  ])
    expect(codes).toContain(code);
});
it('CR1-12 未处置队列阻断，MOVE 生成后继任务而不改旧任务组/规则', async () => {
  const { client, server } = await ready();
  const role = server.state.snapshot.roles[0];
  server.setMockBlocker('task', 'task_move', task(role));
  let input = merge(server);
  expect((await preview(client, input)).blockers.map((x: any) => x.code)).toContain(
    'TASK_DISPOSITION_REQUIRED',
  );
  input.task_dispositions = [{ task_id: 'task_move', action: 'MOVE_WITH_ASSIGNEE' }];
  await commit(client, await preview(client, input));
  const tasks = server.state.snapshot.tasks;
  expect(tasks[0]).toMatchObject({ spaceId: role.spaceId, state: 'SUSPENDED', policyRevision: 1 });
  expect(tasks[1]).toMatchObject({ sourceTaskId: 'task_move', state: 'QUEUED' });
  expect(tasks[1].spaceId).not.toBe(role.spaceId);
  expect(server.state.taskHistory[0].state).toBe('QUEUED');
});
it('等待下属结果不可静默迁移；CANCEL 需要原因', async () => {
  const { client, server } = await ready();
  const role = server.state.snapshot.roles[0];
  server.setMockBlocker('task', 'task_wait', { ...task(role), state: 'WAITING_INPUT' });
  const input = merge(server);
  input.task_dispositions = [{ task_id: 'task_wait', action: 'CANCEL' }];
  const p = await preview(client, input);
  expect(p.blockers.map((x: any) => x.code)).toEqual(
    expect.arrayContaining(['UNRESOLVED_TASK', 'CANCEL_REASON_REQUIRED']),
  );
});
it('Commit 重新预检，hash/revision 绑定，注入失败不发生部分迁移', async () => {
  const { client, server } = await ready();
  const p = await preview(client, merge(server));
  await expect(
    client.call('space.reconfigure.commit', {
      plan_id: p.planId,
      plan_hash: 'wrong',
      confirmed: true,
    }),
  ).rejects.toThrow('PLAN_HASH_MISMATCH');
  server.setMockBlocker('switch', server.state.snapshot.spaces[0].id, true);
  await expect(commit(client, p)).rejects.toThrow('RECONFIGURATION_BLOCKED');
  server.setMockBlocker('switch', server.state.snapshot.spaces[0].id, false);
  const before = server.state;
  server.injectCommitFailure();
  await expect(commit(client, p)).rejects.toThrow('INTERNAL_ERROR');
  expect(server.state).toEqual(before);
  await client.call('workspace.createWorktree', {
    label: '附加',
    base_commit: 'abc',
    branch_name: 'mock',
  });
  await expect(commit(client, p)).rejects.toThrow('REVISION_CONFLICT');
});
it('Preview abort 后不可 commit；观察者无法 apply', async () => {
  const { client, server } = await ready();
  const p = await preview(client, merge(server));
  await client.call('space.reconfigure.abort', { plan_id: p.planId });
  await expect(commit(client, p)).rejects.toThrow('PLAN_STATE_CONFLICT');
  const observer = await new Client(server, true).initialize();
  await expect(apply(observer)).rejects.toThrow('CONTROL_LEASE_REQUIRED');
});
it('CR1-13 Workspace/worktree 仅 Mock 元数据，绑定中的工作区不归档', async () => {
  const { client, server } = await ready();
  expect(
    (await client.call('workspace.list', { project_id: 'project_example' })).items,
  ).toHaveLength(2);
  await expect(client.call('workspace.archive', { id: 'workspace_core' })).rejects.toThrow(
    'RECONFIGURATION_BLOCKED',
  );
  const w = await client.call('workspace.createWorktree', {
    label: '离线工作区',
    base_commit: 'fixed',
    branch_name: 'mock_branch',
  });
  expect(w.kind).toBe('WORKTREE');
  expect((await client.call('workspace.archive', { id: w.id })).status).toBe('ARCHIVED');
  expect(server.state.workspaces).toHaveLength(3);
});
it('角色章程更新保留版本并重置 Bootstrap；新 UI 创建路径要求完整 spec', async () => {
  const { client, server } = await ready();
  const r = server.state.snapshot.roles[0],
    old = server.state.charters[0],
    spec = structuredClone(old.spec);
  spec.mission = '更新后的职责';
  const scope = { project_id: 'project_example', space_id: r.spaceId };
  const c = await client.call(
    'roleCharter.update',
    { role_id: r.id, spec, confirmed: true, permissions: old.effectivePermissions },
    { scope },
  );
  expect(c.revision).toBe(2);
  expect(c.bootstrapState).toBe('PENDING');
  expect(server.state.charters[0]).toEqual(old);
  expect(
    (await client.call('roleCharter.listHistory', { role_id: r.id, project_id: 'project_example' }))
      .items,
  ).toHaveLength(2);
  const another = { ...spec, role_key: 'manual_new', display_name: '手工新角色' };
  const created = await client.call(
    'role.createFromSpec',
    { spec: another, confirmed: true, permissions: old.effectivePermissions },
    { scope },
  );
  expect(created.status).toBe('PAUSED');
  expect(created.charterRevision).toBe(1);
});
it('CR1-14 原 C1 客户端可读取同一服务新建角色，闭合旧 Schema 验证通过', async () => {
  const { server, client } = await ready();
  const transport = new InMemoryTransport(server as unknown as MockCoreServer);
  const legacy = await transport.connect({
    clientId: 'client_legacy',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'observer',
  });
  oldResult('system.initialize', legacy.hello);
  expect(legacy.hello.schemaVersion).toBe(1);
  expect(legacy.hello.capabilities.methods).not.toContain('rolePlan.apply');
  const snapshot = await legacy.request('system.snapshot', {});
  oldResult('system.snapshot', snapshot);
  expect(snapshot.roles).toHaveLength(6);
  expect('bootstrapState' in snapshot.roles[0]).toBe(false);
  expect('statusSummary' in snapshot.projects[0]).toBe(false);
  expect((await client.call('system.snapshot', {})).projects[0].statusSummary.groups).toHaveLength(
    2,
  );
});

it('拆组不会静默改变指定结果去向，用户明确替换后才能预览通过', async () => {
  const { server, client } = await setup();
  const input = plan();
  input.roles[0].default_completion_target = {
    type: 'role_key',
    role_key: input.roles[1].role_key,
  };
  await apply(client, input);
  const source = server.state.snapshot.spaces[0],
    roles = server.state.snapshot.roles.filter((r: any) => r.spaceId === source.id),
    base = merge(server);
  const change: ReconfigurationInput = {
    ...base,
    mode: 'SPLIT',
    source_space_ids: [source.id],
    targets: [
      { ...base.targets[0], group_key: 'left' },
      { ...base.targets[0], group_key: 'right' },
    ],
    assignments: roles.map((r: any, i: number) => ({
      role_id: r.id,
      target_group_key: i === 0 ? 'left' : 'right',
      workspace_id: 'workspace_core',
    })),
  };
  expect((await preview(client, change)).blockers.map((b: any) => b.code)).toContain(
    'RESULT_TARGET_REVIEW_REQUIRED',
  );
  change.assignments[0].completion_to = { type: 'user' };
  const pr = await preview(client, change);
  expect(pr.blockers).toEqual([]);
  await commit(client, pr);
  expect(
    server.state.charters.filter((c: any) => c.roleId === roles[0].id).at(-1).spec
      .default_completion_target,
  ).toEqual({ type: 'user' });
});
it('章程改模型/工作区时更新 Binding epoch 和角色投影，旧 Binding 不改写', async () => {
  const { server, client } = await ready();
  const role = server.state.snapshot.roles[0],
    old = server.state.bindings[0],
    charter = server.state.charters[0],
    spec = structuredClone(charter.spec);
  spec.runtime = plan().roles[3].runtime;
  spec.workspace_ref = 'workspace_ui';
  spec.display_name = '更名角色';
  await client.call(
    'roleCharter.update',
    { role_id: role.id, spec, confirmed: true, permissions: charter.effectivePermissions },
    { scope: { project_id: 'project_example', space_id: role.spaceId } },
  );
  const bindings = server.state.bindings.filter((b: any) => b.roleId === role.id);
  expect(bindings[0]).toEqual({ ...old, current: false });
  expect(bindings[1]).toMatchObject({
    epoch: 2,
    modelSelection: spec.runtime,
    workspaceLabel: 'ui',
    current: true,
  });
  expect(server.state.snapshot.roles[0].name).toBe('更名角色');
  expect(() => server.advanceMockBootstrap(role.id, 'DELIVERING', 2, 1)).toThrow(
    'REVISION_CONFLICT',
  );
});
it('有效帧仍必须确认并匹配项目 scope；不确认或错项目不产生状态', async () => {
  const { server, client } = await setup();
  const p = plan(),
    v = await client.call('rolePlan.validate', { plan: p }),
    before = server.state;
  await expect(
    client.call('rolePlan.apply', {
      plan: p,
      plan_hash: v.planHash,
      confirmed: false,
      permission_grants: [],
    }),
  ).rejects.toThrow('INVALID_FRAME');
  await expect(apply(client, p, { scope: { project_id: 'project_foreign' } })).rejects.toThrow(
    'SCOPE_DENIED',
  );
  expect(server.state).toEqual(before);
});
it('KEEP_ARCHIVED_ONLY 不启动，目标工作区不确定租约也阻断重构', async () => {
  const { server, client } = await ready();
  const w = await client.call('workspace.createWorktree', {
      label: '目标工作区',
      base_commit: 'fixed',
      branch_name: 'mock_target',
    }),
    change = merge(server);
  change.assignments[0].workspace_id = w.id;
  change.assignments[0].session_strategy = 'KEEP_ARCHIVED_ONLY';
  server.setMockBlocker('lease', w.id, true);
  expect((await preview(client, change)).blockers.map((b: any) => b.code)).toContain(
    'RESOURCE_LEASE_UNCERTAIN',
  );
  server.setMockBlocker('lease', w.id, false);
  await commit(client, await preview(client, change));
  const role = server.state.snapshot.roles[0],
    c = server.state.charters.filter((c: any) => c.roleId === role.id).at(-1),
    m = server.state.catalog[0];
  server.registerMockCatalog(m.provider_profile_id, [
    { ...m, source: 'RUNTIME', availability: 'AVAILABLE', tool_support: 'SUPPORTED' },
  ]);
  await client.call('model.refresh', { provider_profile_id: m.provider_profile_id });
  server.advanceMockBootstrap(role.id, 'DELIVERING', c.revision, c.bindingEpoch);
  server.advanceMockBootstrap(role.id, 'DELIVERED', c.revision, c.bindingEpoch);
  expect(server.state.snapshot.roles[0].status).toBe('PAUSED');
  expect(() => server.dispatchMock(role.id)).toThrow('PLAN_STATE_CONFLICT');
});

it('发布给 UIAI 的实际夹具符合 C1R1 VM 合同', async () => {
  const { validateResponse } = await import('../../packages/client-contract/c1r1/index.ts');
  const demo = JSON.parse(readFileSync('fixtures/client-c1r1/demo.json', 'utf8'));
  for (const [key, method] of Object.entries({
    hello: 'system.initialize',
    validation: 'rolePlan.validate',
    applied: 'rolePlan.apply',
    snapshot: 'system.snapshot',
    preview: 'space.reconfigure.preview',
    committed: 'space.reconfigure.commit',
  }))
    validateResponse(method as Method, demo[key]);
  expect(demo.snapshot.spaces).toHaveLength(2);
  expect(demo.snapshot.roles).toHaveLength(6);
  expect(demo.crossGroupError).toBe('CROSS_SPACE_DENIED');
  expect(demo.realHarnessSupport).toBe(0);
});
