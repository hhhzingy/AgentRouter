import { beforeAll, it, expect } from 'vitest';
import { spawnSync, fork } from 'node:child_process';
import { resolve } from 'node:path';
import { startCore, createProjectAndPlan, until, delay } from '../w11-process-support.ts';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
beforeAll(() => {
  const r = spawnSync(process.execPath, ['tools/build-w11-core.mjs'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  expect(r.status).toBe(0);
});
it('真实 Core 退出后本地管道会话立即报告 DISCONNECTED，而不是保持虚假的在线状态', async () => {
  const core = await startCore();
  const client = new LocalCoreTransport(core.dir);
  try {
    const session = await client.connect({
      clientId: 'w11_disconnect_observer',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
      mode: 'LOCAL_CORE',
    });
    expect(session.connectionState()).toBe('CONNECTED_OBSERVER');
    await core.stop();
    await until(async () => session.connectionState(), (state) => state === 'DISCONNECTED');
  } finally {
    await client.close();
    await core.stop();
  }
}, 30000);
it('真实 Core 进程保存配置，独立 Bootstrap 交付不覆盖用户 PAUSED，重启保留章程', async () => {
  let f = await startCore();
  const { project, roles } = await createProjectAndPlan(f);
  try {
    const r = roles[0];
    await f.write(
      'role.updateStatus',
      { id: r.id, status: 'PAUSED' },
      { project_id: project.id, space_id: r.spaceId },
    );
    await f.control('configureFixture', { roleId: r.id, scenario: {} });
    await until(
      () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
      (c) => c.bootstrapState === 'DELIVERED',
    );
    expect(
      (await f.session.request('role.get', { id: r.id, scope: { project_id: project.id } })).status,
    ).toBe('PAUSED');
    const dir = f.dir;
    await f.stop();
    f = await startCore(dir);
    expect((await f.session.request('system.snapshot', {})).roles).toHaveLength(6);
    expect(
      (await f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }))
        .bootstrapState,
    ).toBe('DELIVERED');
  } finally {
    await f.stop();
  }
}, 30000);
it('FixtureHarness 独立进程完成任务；STAGED/HELD 在进程退出前不发布', async () => {
  const f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      r = roles[0];
    await f.control('configureFixture', {
      roleId: r.id,
      scenario: { delayMs: 100, exitDelayMs: 900, duplicate: true },
    });
    await until(
      () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
      (c) => c.bootstrapState === 'DELIVERED',
    );
    await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request' as const,
          to: { type: 'role', id: r.id },
          summary: '收尾屏障',
          body: '模拟工作',
          inputs: [],
          expected: ['结果'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: project.id, space_id: r.spaceId },
    );
    const held = await until(
      () => f.control('inspect'),
      (x) => x.outbox.some((o: any) => o.state === 'HELD'),
    );
    expect(held.sources[0].source).toBe('SIMULATED');
    expect(held.sources[0].resources_stopped).toBe(0);
    await until(
      () => f.session.request('system.snapshot', {}),
      (s) => s.runs.some((r) => r.state === 'SUCCEEDED'),
    );
    const done = await f.control('inspect');
    expect(done.runs).toHaveLength(1);
    expect(done.outbox.every((o: any) => o.state === 'DELIVERED')).toBe(true);
    expect((await f.session.request('inbox.list', {})).items[0].acceptance).toBe('PENDING');
  } finally {
    await f.stop();
  }
}, 30000);
it('异常半帧后 UNKNOWN 与资源隔离跨重启保留，禁止自动重放', async () => {
  let f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      r = roles[0];
    await f.control('configureFixture', { roleId: r.id, scenario: { halfFrame: true } });
    await until(
      () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
      (c) => c.bootstrapState === 'DELIVERED',
    );
    await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request' as const,
          to: { type: 'role', id: r.id },
          summary: '半帧崩溃',
          body: '隔离测试',
          inputs: [],
          expected: ['结论'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: project.id, space_id: r.spaceId },
    );
    const before = await until(
      () => f.control('inspect'),
      (x) => x.runs.some((r: any) => r.state === 'UNKNOWN'),
    );
    expect(before.leases.length).toBeGreaterThan(0);
    const dir = f.dir;
    await f.stop();
    f = await startCore(dir);
    await delay(150);
    const after = await f.control('inspect');
    expect(after.runs).toHaveLength(1);
    expect(after.runs[0].id).toBe(before.runs[0].id);
    expect(after.runs[0].state).toBe('UNKNOWN');
    expect(after.leases.length).toBeGreaterThan(0);
    expect(after.outbox.some((x: any) => x.state === 'DELIVERED' && x.kind === 'RESULT')).toBe(
      false,
    );
  } finally {
    await f.stop();
  }
}, 30000);
it('Core 被终止时未收尾运行跨重启 UNKNOWN，不能视为静默成功', async () => {
  let f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      r = roles[0];
    await f.control('configureFixture', { roleId: r.id, scenario: { delayMs: 5000 } });
    await until(
      () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
      (c) => c.bootstrapState === 'DELIVERED',
    );
    await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request' as const,
          to: { type: 'role', id: r.id },
          summary: '终止 Core',
          body: '隔离测试',
          inputs: [],
          expected: ['结论'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: project.id, space_id: r.spaceId },
    );
    await until(
      () => f.control('inspect'),
      (x) => x.runs.length === 1 && x.sources[0].pid,
    );
    const dir = f.dir;
    await f.stop();
    f = await startCore(dir);
    const after = await f.control('inspect');
    expect(after.runs).toHaveLength(1);
    expect(after.runs[0].state).toBe('UNKNOWN');
    expect(after.leases.length).toBeGreaterThan(0);
  } finally {
    await f.stop();
  }
}, 30000);
const req = (id: string, completion: any = { mode: 'result', to: { type: 'user' } }) => ({
  kind: 'task.request' as const,
  to: { type: 'role' as const, id },
  summary: '进程流水线',
  body: '隔离执行',
  inputs: [],
  expected: ['结论'],
  completion,
});
const fin = (next?: any) => ({
  tool: 'finish',
  payload: {
    outcome: 'succeeded',
    summary: '阶段结果',
    body: '模拟结果',
    outputs: [],
    ...(next ? { next_request: next } : {}),
  },
});
it('真实 Fixture 进程 A→B→C→用户，HELD 不启动下游且不抄送发起者', async () => {
  const f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      [a, b, c] = roles;
    const nextC = req(c.id),
      nextB = req(b.id, { mode: 'handoff', to: { type: 'role', id: c.id }, instruction: '复核' });
    for (const [r, steps] of [
      [a, [fin(nextB)]],
      [b, [fin(nextC)]],
      [c, [fin()]],
    ] as const) {
      await f.control('configureFixture', {
        roleId: r.id,
        scenario: { steps, exitDelayMs: r.id === b.id ? 650 : 0 },
      });
      await until(
        () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
        (x) => x.bootstrapState === 'DELIVERED',
      );
    }
    await f.write(
      'task.submitFromUser',
      {
        request: req(a.id, {
          mode: 'handoff',
          to: { type: 'role', id: b.id },
          instruction: '接续',
        }),
      },
      { project_id: project.id, space_id: a.spaceId },
    );
    await until(
      () => f.control('inspect'),
      (x) =>
        x.runs.some((r: any) => r.role_id === b.id) &&
        x.outbox.some((o: any) => o.state === 'HELD'),
    );
    expect((await f.control('inspect')).runs.some((r: any) => r.role_id === c.id)).toBe(false);
    await until(
      () => f.session.request('inbox.list', {}),
      (x) => x.items.length === 1,
    );
    const done = await f.control('inspect');
    expect(done.runs).toHaveLength(3);
    expect(
      done.messages.filter((m: any) => m.kind === 'task.result' && m.to_kind === 'user'),
    ).toHaveLength(1);
    expect(
      done.messages.filter((m: any) => m.kind === 'task.result' && m.to_role_id === a.id),
    ).toHaveLength(0);
  } finally {
    await f.stop();
  }
}, 30000);
it('子结果续办使用原任务，不被同角色独立队列阻断', async () => {
  const f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      [a, b] = roles;
    await f.control('configureFixture', {
      roleId: a.id,
      scenario: {
        steps: [
          { tool: 'send', payload: req(b.id, { mode: 'result', to: { type: 'role', id: a.id } }) },
          { tool: 'wait', payload: { waiting_for: 'child_results', reason: '汇总' } },
        ],
        continuationSteps: [fin()],
        bySummary: { 独立工作: { steps: [fin()] } },
      },
    });
    await f.control('configureFixture', { roleId: b.id, scenario: {} });
    for (const r of [a, b])
      await until(
        () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
        (x) => x.bootstrapState === 'DELIVERED',
      );
    const first = (await f.write(
      'task.submitFromUser',
      { request: req(a.id) },
      { project_id: project.id, space_id: a.spaceId },
    )) as any;
    await f.write(
      'task.submitFromUser',
      { request: { ...req(a.id), summary: '独立工作' } },
      { project_id: project.id, space_id: a.spaceId },
    );
    await until(
      () => f.session.request('inbox.list', {}),
      (x) => x.items.length === 2,
    );
    const done = await f.control('inspect');
    const runs = done.runs.filter((r: any) => r.role_id === a.id);
    expect(runs).toHaveLength(3);
    expect(runs.filter((r: any) => r.task_id === first.id)).toHaveLength(2);
    expect(done.tasks).toHaveLength(3);
  } finally {
    await f.stop();
  }
}, 30000);
it('提交响应丢失后跨真实 Core 重启重放原 operation_id，仅保留一项任务', async () => {
  let f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      r = roles[0],
      params = { request: req(r.id) },
      scope = { project_id: project.id, space_id: r.spaceId },
      revision = (await f.session.request('system.snapshot', {})).revision;
    await f.control('dropNextReply');
    await expect(
      f.session.request('task.submitFromUser', params, {
        operationId: 'op_ambiguous',
        expectedRevision: revision,
        scope,
        leaseId: f.lease.leaseId,
        timeoutMs: 200,
      }),
    ).rejects.toThrow();
    expect((await f.control('inspect')).tasks).toHaveLength(1);
    const dir = f.dir;
    await f.stop();
    f = await startCore(dir);
    const replay = (await f.write(
      'task.submitFromUser',
      params,
      scope,
      'op_ambiguous',
      revision,
    )) as any;
    const state = await f.control('inspect');
    expect(state.tasks).toHaveLength(1);
    expect(replay.id).toBe(state.tasks[0].id);
    await expect(
      f.write(
        'task.submitFromUser',
        { request: { ...params.request, body: '改变' } },
        scope,
        'op_ambiguous',
        revision,
      ),
    ).rejects.toThrow('OPERATION_CONFLICT');
  } finally {
    await f.stop();
  }
}, 30000);
it('Bootstrap 进程失败只标记交付失败，APPLIED 配置和用户 PAUSED 保留', async () => {
  const f = await startCore();
  try {
    const { project, roles, applied } = await createProjectAndPlan(f),
      r = roles[0];
    await f.write(
      'role.updateStatus',
      { id: r.id, status: 'PAUSED' },
      { project_id: project.id, space_id: r.spaceId },
    );
    await f.control('configureFixture', { roleId: r.id, scenario: { bootstrap: 'fail' } });
    await until(
      () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
      (c) => c.bootstrapState === 'FAILED',
    );
    expect(
      (await f.session.request('rolePlan.get', { id: applied.id, project_id: project.id })).state,
    ).toBe('APPLIED');
    expect(
      (await f.session.request('role.get', { id: r.id, scope: { project_id: project.id } })).status,
    ).toBe('PAUSED');
    expect((await f.control('inspect')).runs).toHaveLength(0);
  } finally {
    await f.stop();
  }
}, 30000);
it('无父任务的定向结果形成 RESULT_HANDLING，GAP 明确保留且不抄送用户', async () => {
  const f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      [a, b] = roles;
    for (const r of [a, b]) {
      await f.control('configureFixture', { roleId: r.id, scenario: { gap: true } });
      await until(
        () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
        (x) => x.bootstrapState === 'DELIVERED',
      );
    }
    await f.write(
      'task.submitFromUser',
      { request: req(a.id, { mode: 'result', to: { type: 'role', id: b.id } }) },
      { project_id: project.id, space_id: a.spaceId },
    );
    await until(
      () => f.session.request('inbox.list', {}),
      (x) => x.items.length === 1,
    );
    const state = await f.control('inspect');
    expect(state.runs.some((r: any) => r.kind === 'RESULT_HANDLING')).toBe(true);
    expect(state.tasks).toHaveLength(2);
    const history = await f.session.request('conversation.read', {
      role_id: a.id,
      scope: { project_id: project.id, space_id: a.spaceId },
    });
    expect(history.items.some((x) => x.kind === 'GAP')).toBe(true);
    expect(history.items.every((x) => x.roleId === a.id)).toBe(true);
  } finally {
    await f.stop();
  }
}, 30000);
it('同一数据目录第二个 Core 被 OS 端点锁拒绝，原实例仍可用', async () => {
  const f = await startCore();
  try {
    const second = fork(resolve('.local/w11-core/core.mjs'), [], {
      execPath: process.execPath,
      silent: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        AGENTROUTER_DATA: f.dir,
      },
    });
    let diagnostic = '';
    second.stderr!.on('data', (b) => (diagnostic += b));
    const code = await new Promise<number | null>((res) => second.once('exit', res));
    expect(code).toBe(2);
    expect(diagnostic).toContain('CORE_ALREADY_RUNNING');
    await expect(f.session.request('system.snapshot', {})).resolves.toBeDefined();
  } finally {
    await f.stop();
  }
}, 30000);
it('不同物理工作区可并行，共享合成 AuthUnit 仍仅允许一项活动运行', async () => {
  for (const [separate, shared] of [
    [false, false],
    [true, false],
    [true, true],
  ]) {
    const f = await startCore();
    try {
      const { project, roles } = await createProjectAndPlan(f, separate),
        [a, b] = roles;
      if (shared) await f.control('shareFixtureAuthUnit', { roleIds: [a.id, b.id] });
      for (const r of [a, b]) {
        await f.control('configureFixture', { roleId: r.id, scenario: { delayMs: 1200 } });
        await until(
          () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
          (x) => x.bootstrapState === 'DELIVERED',
        );
      }
      for (const r of [a, b])
        await f.write(
          'task.submitFromUser',
          { request: req(r.id) },
          { project_id: project.id, space_id: r.spaceId },
        );
      const state = await until(
        () => f.control('inspect'),
        (x) => x.runs.length >= (shared || !separate ? 1 : 2),
      );
      expect(
        state.runs.filter((r: any) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(r.state)),
      ).toHaveLength(shared || !separate ? 1 : 2);
      await until(
        () => f.session.request('inbox.list', {}),
        (x) => x.items.length === 2,
      );
    } finally {
      await f.stop();
    }
  }
}, 30000);
it('取消仅提交意图，Fixture 原生取消并退出后才释放资源', async () => {
  const f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      r = roles[0];
    await f.control('configureFixture', { roleId: r.id, scenario: { delayMs: 5000, steps: [] } });
    await until(
      () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
      (x) => x.bootstrapState === 'DELIVERED',
    );
    await f.write(
      'task.submitFromUser',
      { request: req(r.id) },
      { project_id: project.id, space_id: r.spaceId },
    );
    const started = await until(
      () => f.control('inspect'),
      (x) => x.runs.some((r: any) => r.state === 'RUNNING'),
    );
    await f.write(
      'run.cancel',
      { id: started.runs[0].id },
      { project_id: project.id, space_id: r.spaceId },
    );
    const done = await until(
      () => f.control('inspect'),
      (x) => x.runs[0].state === 'CANCELLED',
    );
    expect(done.sources[0].native_terminal).toBe(1);
    expect(done.sources[0].resources_stopped).toBe(1);
    expect(done.leases).toHaveLength(0);
    expect((await f.session.request('inbox.list', {})).items).toHaveLength(0);
  } finally {
    await f.stop();
  }
}, 30000);
it('同组被动 notice 可读不唤醒，旧 epoch 只入审计，跨组路由拒绝', async () => {
  const f = await startCore();
  try {
    const { project, roles } = await createProjectAndPlan(f),
      [a, b] = roles,
      other = roles.find((r) => r.spaceId !== a.spaceId)!;
    await f.control('configureFixture', {
      roleId: a.id,
      scenario: {
        staleEpoch: true,
        steps: [
          {
            tool: 'send',
            payload: {
              kind: 'notice',
              to: { type: 'role', id: b.id },
              summary: '知悉',
              body: '无需行动',
              inputs: [],
            },
          },
          fin(),
        ],
      },
    });
    await f.control('configureFixture', { roleId: b.id, scenario: {} });
    for (const r of [a, b])
      await until(
        () => f.session.request('roleCharter.get', { project_id: project.id, role_id: r.id }),
        (x) => x.bootstrapState === 'DELIVERED',
      );
    const scope = { project_id: project.id, space_id: a.spaceId };
    await expect(
      f.write(
        'task.submitFromUser',
        { request: req(a.id, { mode: 'result', to: { type: 'role', id: other.id } }) },
        scope,
      ),
    ).rejects.toThrow('CROSS_SPACE_DENIED');
    await f.write('task.submitFromUser', { request: req(a.id) }, scope);
    await until(
      () => f.session.request('inbox.list', {}),
      (x) => x.items.length === 1,
    );
    const state = await f.control('inspect');
    expect(state.runs.every((r: any) => r.role_id === a.id)).toBe(true);
    expect(state.audit.some((x: any) => x.kind === 'STALE_RUN_EVENT')).toBe(true);
    expect(
      (await f.session.request('conversation.read', { role_id: b.id, scope })).items.some(
        (x) => x.kind === 'NOTICE',
      ),
    ).toBe(true);
  } finally {
    await f.stop();
  }
}, 30000);
it('跨组 task.request 与 notice 在真实 Fixture 工具入口拒绝，无目标副作用', async () => {
  for (const kind of ['task.request', 'notice']) {
    const f = await startCore();
    try {
      const { project, roles } = await createProjectAndPlan(f),
        a = roles[0],
        other = roles.find((r) => r.spaceId !== a.spaceId)!;
      const payload =
        kind === 'task.request'
          ? req(other.id)
          : {
              kind: 'notice',
              to: { type: 'role', id: other.id },
              summary: '越界通知',
              body: '应拒绝',
              inputs: [],
            };
      await f.control('configureFixture', {
        roleId: a.id,
        scenario: { steps: [{ tool: 'send', payload }] },
      });
      await until(
        () => f.session.request('roleCharter.get', { project_id: project.id, role_id: a.id }),
        (c) => c.bootstrapState === 'DELIVERED',
      );
      await f.write(
        'task.submitFromUser',
        { request: req(a.id) },
        { project_id: project.id, space_id: a.spaceId },
      );
      const state = await until(
        () => f.control('inspect'),
        (x) => x.runs.some((r: any) => r.state === 'UNKNOWN'),
      );
      expect(state.tasks).toHaveLength(1);
      expect(state.messages.some((m: any) => m.to_role_id === other.id)).toBe(false);
    } finally {
      await f.stop();
    }
  }
}, 30000);
it('真实 Core 配置事务故障回滚，无半套角色/组/初始化', async () => {
  const f = await startCore();
  try {
    await expect(createProjectAndPlan(f, false, true)).rejects.toThrow('INTERNAL_ERROR');
    const snapshot = await f.session.request('system.snapshot', {});
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.spaces).toHaveLength(0);
    expect(snapshot.roles).toHaveLength(0);
    expect((await f.control('inspect')).deliveries).toHaveLength(0);
  } finally {
    await f.stop();
  }
}, 30000);
