import { expect, it } from 'vitest';
import { ManagementGateway } from '../../packages/management-gateway/index.ts';
import type { ClientTransport } from '../../packages/client-transport/p1/types.ts';

function fixture() {
  const calls: { method: string; params: unknown; options: any }[] = [];
  const transport = {
    async connect() {
      return {
        hello: { capabilities: { mock: false, methods: ['control.acquire'] } },
        async request(method: string, params: unknown, options: unknown) {
          calls.push({ method, params, options });
          if (method === 'control.acquire') return { leaseId: 'lease' };
          if (method === 'system.snapshot') return { revision: 999 };
          if (method === 'roleSession.preflight') return { preflight_hash: 'f'.repeat(64) };
          throw Error('REQUEST_TIMEOUT');
        },
      };
    },
    async close() {},
  } as unknown as ClientTransport;
  return { gateway: new ManagementGateway(transport, 'controller'), calls };
}

it('响应丢失并重建 Gateway 后原样转发调用方保存的请求键、revision 和 preflight', async () => {
  const command = { request_key: 'saved-command', expected_revision: 7, preflight_hash: 'a'.repeat(64) };
  const writes: any[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const f = fixture();
    try {
      await f.gateway.connect();
      await f.gateway.call('router_control_acquire', { params: {}, request_key: 'lease', expected_revision: 1, scope: {} });
      await expect(f.gateway.roleSessionCreate('role', '新会话', 'pi', command)).rejects.toThrow('REQUEST_TIMEOUT');
      const write = f.calls.find(c => c.method === 'roleSession.create')!;
      expect(write.options).toMatchObject({ requestKey: command.request_key, expectedRevision: 7, preflightHash: command.preflight_hash });
      expect(f.calls.some(c => c.method === 'system.snapshot' || c.method === 'roleSession.preflight')).toBe(false);
      writes.push(write);
    } finally { await f.gateway.close(); }
  }
  expect(writes[1]).toEqual(writes[0]);
});

it('缺少调用方元数据时拒绝新建和切换', async () => {
  const f = fixture();
  try {
    await f.gateway.connect();
    await f.gateway.call('router_control_acquire', { params: {}, request_key: 'lease', expected_revision: 1, scope: {} });
    await expect(f.gateway.roleSessionCreate('role', 'new')).rejects.toThrow('REQUEST_KEY_AND_REVISION_REQUIRED');
    await expect(f.gateway.roleSessionSwitch('role', 'session')).rejects.toThrow('REQUEST_KEY_AND_REVISION_REQUIRED');
    expect(f.calls).toHaveLength(1);
  } finally { await f.gateway.close(); }
});

// —— WN02:context_mode 透传 / transferStatus 查询 / router_status 数据最小化 / P2 协商 ——
function richFixture() {
  const calls: { method: string; params: unknown; options: any }[] = [];
  const transport = {
    async connect() {
      return {
        hello: {
          contractRevision: 'C1R1P1',
          capabilities: { mock: false, methods: ['control.acquire', 'system.snapshot', 'contract.upgrade'] },
        },
        async request(method: string, params: unknown, options: unknown) {
          calls.push({ method, params, options });
          if (method === 'control.acquire') return { leaseId: 'lease' };
          if (method === 'contract.upgrade') return { revision: 'C1R1P2' };
          if (method === 'system.snapshot')
            return {
              revision: 999,
              projects: [{ id: 'project_abcd1234', name: 'p', status: 'ACTIVE', hostLabel: 'DESKTOP-HAP', displayRoot: 'C:\\Users\\hap\\secret', spacesCount: 1, activeRunsCount: 0, issuesCount: 0 }],
            };
          if (method === 'roleSession.preflight') return { preflight_hash: 'f'.repeat(64) };
          if (method === 'roleSession.create') return { transfer: { op_id: 'ctop_1', state: 'PREPARING' } };
          if (method === 'roleSession.transferStatus') return { op_id: 'ctop_1', state: 'COMMITTED', role_id: 'role' };
          throw Error('REQUEST_TIMEOUT');
        },
      };
    },
    async close() {},
  } as unknown as ClientTransport;
  return { gateway: new ManagementGateway(transport, 'controller'), calls };
}

it('WN02:能力含 contract.upgrade 时协商 P2(只读亦不改写权)', async () => {
  const f = richFixture();
  await f.gateway.connect();
  expect(f.calls.some((c) => c.method === 'contract.upgrade')).toBe(true);
  expect(f.gateway.p2).toBe(true);
  await f.gateway.close();
});

it('WN02:create 透传 context_mode=inherit;transferStatus 只读查询可达', async () => {
  const f = richFixture();
  await f.gateway.connect();
  await f.gateway.call('router_control_acquire', { params: {}, request_key: 'lease', expected_revision: 1, scope: {} });
  const command = { request_key: 'wn02-create', expected_revision: 999, preflight_hash: 'f'.repeat(64) };
  await f.gateway.roleSessionCreate('role', '继承会话', undefined, command, 'inherit');
  const created = f.calls.find((c) => c.method === 'roleSession.create')!;
  expect(created.params).toMatchObject({ context_mode: 'inherit' });
  const status = (await f.gateway.roleSessionTransferStatus('role', 'ctop_1')) as { state: string };
  expect(status.state).toBe('COMMITTED');
  await f.gateway.close();
});

it('WN02:router_status 模型视图剥离 hostLabel/displayRoot 并给出 root_alias', async () => {
  const f = richFixture();
  await f.gateway.connect();
  const out = (await f.gateway.call('router_status')) as {
    snapshot: { projects: Record<string, unknown>[] };
    protocol: string;
    dynamic_harness_visible: boolean;
  };
  const project = out.snapshot.projects[0];
  expect(project).not.toHaveProperty('hostLabel');
  expect(project).not.toHaveProperty('displayRoot');
  expect(project.root_alias).toBe('root#abcd1234');
  expect(out.dynamic_harness_visible).toBe(true);
  await f.gateway.close();
});
