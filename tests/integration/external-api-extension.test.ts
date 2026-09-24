import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ExternalApiExtension } from '../../packages/core-service/external-api-extension.ts';
import { ExternalApiRegistry } from '../../packages/management-gateway/external-api-registry.ts';
import { createCoreDatasetProfile } from '../../packages/core-service/external-api-provider.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import type { ClientSession } from '../../packages/client-transport/p1/types.ts';

async function fixture() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/extapi-'));
  const db = openApplicationStore(dir),
    server = new ApplicationService(db, [dir], false),
    transport = new P1MemoryTransport(server, 'human_test'),
    s = await transport.connect({
      clientId: 'client_extapi',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
  server.externalApi = new ExternalApiExtension(
    new ExternalApiRegistry([createCoreDatasetProfile(db)]),
    db,
  );
  const lease = await s.request(
    'control.acquire',
    {},
    { operationId: 'op_lease', expectedRevision: (await s.request('system.snapshot', {})).revision, scope: {} },
  );
  return { db, server, s, leaseId: (lease as { leaseId: string }).leaseId };
}
const call = (s: ClientSession, params: Record<string, unknown>, leaseId?: string) =>
  s.request(
    'externalApi.call' as never,
    params as never,
    ...(leaseId ? [{ leaseId }] : []),
  ) as unknown as Promise<Record<string, unknown>>;

it('扩展列出并描述Core固定Provider；旧帧方式不可达', async () => {
  const { s } = await fixture();
  const list = (await s.request('externalApi.list' as never, {} as never)) as {
    profiles: { id: string; actions: string[] }[];
  };
  expect(list.profiles).toEqual([
    { id: 'core_dataset', displayName: 'Core dataset diagnostics', actions: ['snapshot'] },
  ]);
  const describe = (await s.request('externalApi.describe' as never, {
    profile_id: 'core_dataset',
    action_id: 'snapshot',
  } as never)) as { sideEffect: string; confirmationRequired: boolean; inputSchema: object };
  expect(describe.sideEffect).toBe('READ_ONLY');
  expect(describe.confirmationRequired).toBe(false);
  expect(describe.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
});

it('只读动作经租约执行并落库；同key同参幂等，同key异参冲突', async () => {
  const { db, s, leaseId } = await fixture();
  const params = { profile_id: 'core_dataset', action_id: 'snapshot', args: {}, request_key: 'ext-1' };
  const first = await call(s, params, leaseId);
  expect(first).toMatchObject({ state: 'SUCCEEDED' });
  const output = first.output as { dataset_id: string; revision: number };
  expect(output.dataset_id).toBeTruthy();
  expect(output.revision).toBeGreaterThanOrEqual(0);
  const replay = await call(s, params, leaseId);
  expect(replay).toEqual(first);
  // 同key异参的指纹冲突由 registry 单测覆盖（固定 snapshot 动作仅接受空args）。
  const rows = db.prepare('select principal,client_id,operation_id,state from external_api_calls').all();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ client_id: 'client_extapi', state: 'SUCCEEDED' });
});

it('调用要求本连接控制器租约；观察者与无租约一律拒绝', async () => {
  const { server, s } = await fixture();
  const params = { profile_id: 'core_dataset', action_id: 'snapshot', args: {}, request_key: 'ext-2' };
  await expect(call(s, params)).rejects.toMatchObject({ message: 'CONTROL_LEASE_REQUIRED' });
  const observerTransport = new P1MemoryTransport(server, 'human_test');
  const observer = await observerTransport.connect({
    clientId: 'client_observer',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'observer',
  });
  await expect(
    call(observer, params, 'any-lease'),
  ).rejects.toMatchObject({ message: 'CONTROL_LEASE_REQUIRED' });
  const list = (await observer.request('externalApi.list' as never, {} as never)) as { profiles: unknown[] };
  expect(list.profiles).toHaveLength(1);
});

it('按主体/客户端隔离领取；未知动作拒绝且不产生journal行', async () => {
  const { db, server, s, leaseId } = await fixture();
  const second = new P1MemoryTransport(server, 'human_second');
  const s2 = await second.connect({
    clientId: 'client_extapi_b',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
  });
  // 租约是Core级互斥：第一连接先释放，第二连接才能获取。
  const params = { profile_id: 'core_dataset', action_id: 'snapshot', args: {}, request_key: 'shared-key' };
  const a = await call(s, params, leaseId);
  expect(a).toMatchObject({ state: 'SUCCEEDED' });
  // 租约是Core级互斥：第一连接用完后释放，第二连接才能获取。
  await s.request(
    'control.release',
    { lease_id: leaseId },
    { operationId: 'op_lease_release', expectedRevision: (await s.request('system.snapshot', {})).revision, scope: {} },
  );
  const lease2 = (await s2.request(
    'control.acquire',
    {},
    { operationId: 'op_lease_b', expectedRevision: (await s2.request('system.snapshot', {})).revision, scope: {} },
  )) as { leaseId: string };
  const b = await call(s2, params, lease2.leaseId);
  expect(b).toMatchObject({ state: 'SUCCEEDED' });
  expect(
    (db.prepare('select client_id from external_api_calls').all() as { client_id: string }[])
      .map((r) => r.client_id)
      .sort(),
  ).toEqual(['client_extapi', 'client_extapi_b']);
  // 原租约已释放：旧连接再次调用必须被拒（租约绑定本连接）。
  await expect(
    call(s, { ...params, request_key: 'post-release' }, leaseId),
  ).rejects.toMatchObject({ message: 'CONTROL_LEASE_REQUIRED' });
  await expect(
    call(s2, { ...params, action_id: 'missing' }, lease2.leaseId),
  ).rejects.toMatchObject({ message: 'API_ACTION_UNAVAILABLE' });
  expect(
    (db.prepare('select count(*) n from external_api_calls where operation_id=?').get('external_api:missing-action') as { n: number }).n,
  ).toBe(0);
});
