import { it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
import { StdioServerProxy } from '../../packages/client-transport/p1/stdio.ts';

it.each(['truncated', 'close-only'])('断流 %s 拒绝挂起请求且不抛出事件回调异常', async (mode) => {
  const input = new PassThrough(),
    output = new PassThrough();
  const proxy = new StdioServerProxy(input, output, 1000);
  const pending = expect(proxy.handle(proxy.open(), { id: 'pending' })).rejects.toThrow(
    'CONNECTION_LOST',
  );
  if (mode === 'truncated') input.end('{');
  else input.destroy();
  await pending;
  input.destroy();
  output.destroy();
});

it('静默对端超时后终止连接，不重发未知请求', async () => {
  const input = new PassThrough(),
    output = new PassThrough();
  const proxy = new StdioServerProxy(input, output, 25);
  let writes = 0;
  output.on('data', () => writes++);
  const id = proxy.open();
  await expect(proxy.handle(id, { id: 'request_once' })).rejects.toThrow('CONNECTION_LOST');
  await expect(proxy.handle(id, { id: 'request_twice' })).rejects.toThrow('CONNECTION_LOST');
  expect(writes).toBe(1);
  expect(input.destroyed && output.destroyed).toBe(true);
});

it.skipIf(process.platform !== 'win32')(
  '认证握手对端提前关闭立即失败，不等待初始化或自动重试',
  async () => {
    const base = resolve('.local/test-transport');
    mkdirSync(base, { recursive: true });
    const data = mkdtempSync(resolve(base, 'handshake-'));
    const address = '\\\\.\\pipe\\AgentRouter-test-' + randomUUID();
    let attempts = 0;
    const server = createServer((socket) => {
      attempts++;
      socket.once('data', () => socket.end());
    });
    await new Promise<void>((r) => server.listen(address, r));
    writeFileSync(
      resolve(data, 'endpoint.json'),
      JSON.stringify({ address, credential: 'test-only' }),
    );
    const client = new LocalCoreTransport(data);
    const started = Date.now();
    try {
      await expect(
        client.connect({ clientId: 'test', clientVersion: '1', requestedMode: 'observer' }),
      ).rejects.toThrow('CORE_AUTH_CLOSED');
      expect(Date.now() - started).toBeLessThan(1500);
      expect(attempts).toBe(1);
    } finally {
      await client.close();
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(data, { recursive: true });
    }
  },
);
