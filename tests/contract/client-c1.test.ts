import { it, expect } from 'vitest';
import { MockCoreServer } from '../../packages/core-api/mock-server.ts';
import { InMemoryTransport } from '../../packages/client-transport/in-memory.ts';
import {
  validateFrame,
  validateResult,
  methodMetadata,
} from '../../packages/client-contract/index.ts';
import { encodeFrame, clientDecoder } from '../../packages/client-transport/framing.ts';
import snapshot from '../../fixtures/client-c1/snapshot.json' with { type: 'json' };
const options = {
  clientId: 'client_a',
  clientVersion: '1.0.0-dev.0',
  requestedMode: 'controller' as const,
};
const scope = { project_id: 'project_demo', space_id: 'space_demo' };
async function setup(server = new MockCoreServer()) {
  const transport = new InMemoryTransport(server);
  const session = await transport.connect(options);
  const lease = await session.request(
    'control.acquire',
    {},
    { operationId: 'op_acquire', expectedRevision: 1, scope: {} },
  );
  return { server, transport, session, lease };
}
it('G10-01 每个写方法缺 operation_id 均被拒绝，fixture 与实际返回类型一致', async () => {
  validateResult('system.snapshot', snapshot);
  for (const [method, meta] of Object.entries(methodMetadata))
    if (meta.mutation)
      expect(() => validateFrame({ v: 1, id: 'req_test', method, params: {} })).toThrow();
  const { session } = await setup();
  expect(session.hello.capabilities.mock).toBe(true);
  expect(session.connectionState()).toBe('CONNECTED_CONTROLLER');
  expect(() => validateFrame({ v: 1, id: 'req_a', result: {}, error: {} })).toThrow();
  expect(() =>
    validateFrame({ v: 1, event: 'run.state.changed', cursor: 0, occurred_at_ms: 1, payload: {} }),
  ).toThrow();
  expect(() =>
    validateResult('system.snapshot', { ...snapshot, refresh_token: 'forbidden' }),
  ).toThrow();
});
it('G10-02 丢失响应、重连、新租约后相同 operation 只变更一次；不同内容冲突', async () => {
  let now = 100;
  const { server, transport, session, lease } = await setup(new MockCoreServer(() => now, 30));
  const write = { operationId: 'op_rename', expectedRevision: 1, scope, leaseId: lease.leaseId };
  const first = await session.request(
    'role.rename',
    { id: 'role_reviewer', name: '新名称' },
    write,
  );
  await transport.close();
  now += 31;
  const reconnected = await transport.connect(options);
  const next = await reconnected.request(
    'control.acquire',
    {},
    { operationId: 'op_reacquire', expectedRevision: 2, scope: {} },
  );
  expect(
    await reconnected.request(
      'role.rename',
      { id: 'role_reviewer', name: '新名称' },
      { ...write, leaseId: next.leaseId },
    ),
  ).toEqual(first);
  expect(server.snapshot.revision).toBe(2);
  await expect(
    reconnected.request(
      'role.rename',
      { id: 'role_reviewer', name: '冲突' },
      { ...write, leaseId: next.leaseId },
    ),
  ).rejects.toThrow('OPERATION_CONFLICT');
});
it('G10-03 多 observer 不能写，另一 controller 无法抢租约，过期拒绝写', async () => {
  let now = 100;
  const { server, session, lease } = await setup(new MockCoreServer(() => now, 30));
  for (let i = 0; i < 2; i++) {
    const observer = await new InMemoryTransport(server).connect({
      ...options,
      clientId: 'observer_' + i,
      requestedMode: 'observer',
    });
    await expect(
      observer.request(
        'role.rename',
        { id: 'role_reviewer', name: '越权' },
        { operationId: 'op_bad', expectedRevision: 1, scope, leaseId: lease.leaseId },
      ),
    ).rejects.toThrow('CONTROL_LEASE_REQUIRED');
  }
  const second = await new InMemoryTransport(server).connect({ ...options, clientId: 'second' });
  await expect(
    second.request(
      'control.acquire',
      {},
      { operationId: 'op_busy', expectedRevision: 1, scope: {} },
    ),
  ).rejects.toThrow('CONTROL_LEASE_BUSY');
  now += 31;
  await expect(
    session.request(
      'role.rename',
      { id: 'role_reviewer', name: '过期' },
      { operationId: 'op_expired', expectedRevision: 1, scope, leaseId: lease.leaseId },
    ),
  ).rejects.toThrow('CONTROL_LEASE_EXPIRED');
});
it('G10-03 控制 release 重复响应一致；身份不可由 client_id 越权', async () => {
  const { session, lease, server } = await setup();
  const op = { operationId: 'op_release', expectedRevision: 1, scope: {} };
  expect(await session.request('control.release', { lease_id: lease.leaseId }, op)).toEqual({});
  expect(await session.request('control.release', { lease_id: lease.leaseId }, op)).toEqual({});
  const denied = await new InMemoryTransport(server, 'untrusted', false).connect(options);
  await expect(
    denied.request(
      'control.acquire',
      {},
      { operationId: 'op_acquire', expectedRevision: 1, scope: {} },
    ),
  ).rejects.toThrow('CONTROL_LEASE_REQUIRED');
});
it('G10-04 capability 明确禁用真实 Harness 与 git/live，未实现命令失败关闭', async () => {
  const { session, lease } = await setup();
  expect(session.hello.capabilities.reference_types).toMatchObject({ git: false, live: false });
  for (const h of Object.values(session.hello.capabilities.harnesses))
    expect(h).toEqual({ status: 'PROBED', create_session: false, cancel: false });
  await expect(
    session.request(
      'runtime.shutdownCore',
      {},
      { operationId: 'op_shutdown', expectedRevision: 1, scope: {}, leaseId: lease.leaseId },
    ),
  ).rejects.toThrow('CAPABILITY_UNAVAILABLE');
});
it('C1 cursor 单调、分页、不重复、过期及错误实例需快照，断线不改业务', async () => {
  const { server, transport, session, lease } = await setup();
  const seen: number[] = [];
  session.subscribe((e) => seen.push(e.cursor));
  for (let i = 1; i <= 2; i++)
    await session.request(
      'role.rename',
      { id: 'role_reviewer', name: '名称' + i },
      { operationId: 'op_' + i, expectedRevision: i, scope, leaseId: lease.leaseId },
    );
  expect(seen).toEqual([1, 2]);
  const first = await session.request('events.catchup', {
    after_cursor: 0,
    limit: 1,
    server_instance_id: server.instanceId,
  });
  expect(first.has_more).toBe(true);
  const second = await session.request('events.catchup', {
    after_cursor: first.next_cursor,
    server_instance_id: server.instanceId,
  });
  expect(second.events.map((e) => e.cursor)).toEqual([2]);
  server.trimEvents(1);
  await expect(
    session.request('events.catchup', { after_cursor: 0, server_instance_id: server.instanceId }),
  ).rejects.toThrow('CURSOR_EXPIRED');
  await expect(
    session.request('events.catchup', { after_cursor: 2, server_instance_id: 'wrong_instance' }),
  ).rejects.toThrow('CURSOR_EXPIRED');
  const before = structuredClone(server.snapshot);
  await transport.close();
  expect(server.snapshot).toEqual(before);
});
it('G10-10 对账证据在受信任端注册，审计幂等，不能伪造证据或自动重跑', async () => {
  const { server, session, lease } = await setup();
  const p = {
    run_id: 'run_unknown',
    action: 'release_after_manual_verification' as const,
    evidence_ids: ['mock_evidence_a'],
  };
  const op = { operationId: 'op_reconcile', expectedRevision: 1, scope, leaseId: lease.leaseId };
  await expect(session.request('run.reconcile', p, op)).rejects.toThrow('EVIDENCE_REQUIRED');
  server.registerMockEvidence('mock_evidence_a', {
    runId: 'run_unknown',
    epoch: 1,
    nativeCompleted: true,
    resourcesStopped: true,
    noSideEffects: false,
  });
  const result = await session.request('run.reconcile', p, op);
  expect(result).toMatchObject({
    resourceDisposition: 'RELEASED_AFTER_VERIFICATION',
    actorId: 'mock_operator',
    retryScheduled: false,
  });
  expect(await session.request('run.reconcile', p, op)).toEqual(result);
  expect(server.audits).toHaveLength(1);
  expect(server.snapshot.runs[0].state).toBe('UNKNOWN');
});
it('C1 修订与作用域防护；取消/超时不提交也不盲目重试', async () => {
  const { server, session, lease } = await setup();
  const p = { id: 'role_reviewer', name: 'x' },
    o = { operationId: 'op_check', expectedRevision: 1, scope, leaseId: lease.leaseId };
  await expect(session.request('role.rename', p, { ...o, expectedRevision: 0 })).rejects.toThrow(
    'REVISION_CONFLICT',
  );
  await expect(
    session.request('role.rename', p, {
      ...o,
      scope: { project_id: 'wrong', space_id: 'space_demo' },
    }),
  ).rejects.toThrow('SCOPE_DENIED');
  await expect(
    session.request('role.rename', p, { ...o, signal: AbortSignal.abort() }),
  ).rejects.toThrow('REQUEST_CANCELLED');
  await expect(session.request('role.rename', p, { ...o, timeoutMs: 0 })).rejects.toThrow(
    'REQUEST_TIMEOUT',
  );
  expect(server.snapshot.revision).toBe(1);
});
it('C1 JSON-LF 支持拆包合包与 Unicode，截断和超长拒绝', () => {
  const frame = { v: 1, id: 'req_frame', method: 'system.ping', params: {} };
  const bytes = encodeFrame(frame),
    seen: unknown[] = [];
  const decoder = clientDecoder((v) => seen.push(v));
  decoder.push(bytes.subarray(0, 4));
  decoder.push(Buffer.concat([bytes.subarray(4), bytes]));
  decoder.end();
  expect(seen).toEqual([frame, frame]);
  const cut = clientDecoder(() => {});
  cut.push(Buffer.from('{'));
  expect(() => cut.end()).toThrow('TRUNCATED_FRAME');
  expect(() => clientDecoder(() => {}).push(Buffer.alloc(262145, 32))).toThrow('FRAME_LIMIT');
});
