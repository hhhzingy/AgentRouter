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
