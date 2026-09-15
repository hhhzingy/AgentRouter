import { expect, it, vi } from 'vitest';
import { createSnapshotSource } from '../../apps/web-console/snapshot-source.mjs';

it('观察者协商 P2，合并并发读取且只投影允许字段', async () => {
  const request = vi.fn(async (method: string) => method === 'contract.upgrade' ? { revision: 'C1R1P2' } : {
    projects: [], roles: [{ id: 'r', name: '测试角色', harness: 'zcode', native_session_ref: 'private-ref' }], tasks: [], runs: [], secret: 'not-for-browser',
  });
  const transport = { connect: vi.fn(async (_options: Record<string, unknown>) => ({ request })), close: vi.fn() };
  const read = createSnapshotSource(transport, () => 100);
  const [a, b] = await Promise.all([read(), read()]);
  expect(a).toBe(b);
  expect(transport.connect).toHaveBeenCalledTimes(1);
  expect(transport.connect.mock.calls[0][0]).toMatchObject({ requestedMode: 'observer' });
  expect(request.mock.calls.map(c => c[0])).toEqual(['contract.upgrade', 'system.snapshot']);
  expect(a.roles[0].harness).toBe('zcode');
  expect(JSON.stringify(a)).not.toMatch(/private-ref|not-for-browser/);
  await read();
  expect(request).toHaveBeenCalledTimes(2);
});

it('失联不返回过期成功结果，下一次读取重新连接', async () => {
  let time = 100, failed = false;
  const request = vi.fn(async (method: string) => {
    if (failed) throw Error('sensitive transport detail');
    return method === 'contract.upgrade' ? {} : { projects: [], roles: [], tasks: [], runs: [] };
  });
  const transport = { connect: vi.fn(async () => ({ request })), close: vi.fn() };
  const read = createSnapshotSource(transport, () => time);
  await read();
  time = 1200; failed = true;
  await expect(read()).rejects.toThrow('CORE_UNAVAILABLE');
  expect(transport.close).toHaveBeenCalledTimes(1);
  failed = false;
  expect((await read()).updatedAt).toBe(1200);
  expect(transport.connect).toHaveBeenCalledTimes(2);
});
