import { it, expect } from 'vitest';
import { NativeRpcPeer } from '../../packages/adapters/shared/rpc-peer.ts';
const frame = (v: unknown) => Buffer.from(JSON.stringify(v) + '\n');
it('原生响应按请求 ID 关联；乱序/重复不额外发请求', async () => {
  const sent: any[] = [];
  const peer = new NativeRpcPeer({
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onNotification() {},
    onDisconnect() {},
  });
  const first = peer.request('first', {}),
    second = peer.request('second', {});
  await new Promise((r) => setImmediate(r));
  peer.accept(frame({ id: sent[1].id, result: 2 }));
  peer.accept(frame({ id: sent[0].id, result: 1 }));
  peer.accept(frame({ id: sent[0].id, result: 9 }));
  expect(await first).toBe(1);
  expect(await second).toBe(2);
  expect(sent).toHaveLength(2);
  peer.disconnect();
});
it('发送后断线/超时不重试，明确 possible side effects', async () => {
  let sent = 0;
  const peer = new NativeRpcPeer({
    write: async () => {
      sent++;
    },
    timeoutMs: 10,
    onNotification() {},
    onDisconnect() {},
  });
  await expect(peer.request('turn/start', {})).rejects.toMatchObject({
    code: 'RPC_TIMEOUT',
    sideEffects: 'possible',
  });
  expect(sent).toBe(1);
  await expect(peer.request('turn/start', {})).rejects.toMatchObject({
    code: 'RPC_CLOSED',
    sideEffects: 'none-proven',
  });
});
it('逆向请求重复 ID 只执行一次；参数变化断开而非重放', async () => {
  let calls = 0;
  const sent: any[] = [];
  let reason = '';
  const peer = new NativeRpcPeer({
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onNotification() {},
    onDisconnect: (r) => {
      reason = r;
    },
    onRequest: async () => {
      calls++;
      return {};
    },
  });
  const m = { id: 1, method: 'item/tool/call', params: { tool: 'route_finish' } };
  peer.accept(frame(m));
  peer.accept(frame(m));
  await new Promise((r) => setImmediate(r));
  expect(calls).toBe(1);
  expect(sent).toHaveLength(2);
  peer.accept(frame({ ...m, params: { tool: 'route_send' } }));
  expect(reason).toBe('RPC_INVALID_FRAME');
  expect(calls).toBe(1);
});
it('未注册逆向方法拒绝且不泄露异常正文', async () => {
  const sent: any[] = [];
  const peer = new NativeRpcPeer({
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onNotification() {},
    onDisconnect() {},
    onRequest: async () => {
      throw Error('private-canary-value');
    },
  });
  peer.accept(frame({ id: 'reverse', method: 'unknown', params: {} }));
  await new Promise((r) => setImmediate(r));
  expect(JSON.stringify(sent)).not.toContain('private-canary-value');
  expect(sent[0].error.message).toBe('REQUEST_REJECTED');
  peer.disconnect();
});
it('半帧断线、无效 UTF-8 及写失败均拒绝待处理调用', async () => {
  for (const mode of ['partial', 'utf8', 'write']) {
    const peer = new NativeRpcPeer({
      write: async () => {
        if (mode === 'write') throw Error('EPIPE');
      },
      onNotification() {},
      onDisconnect() {},
    });
    const p = peer.request('turn/start', {});
    const assertion = expect(p).rejects.toMatchObject({ sideEffects: 'possible' });
    if (mode === 'partial') {
      peer.accept(Buffer.from('{'));
      peer.end();
    }
    if (mode === 'utf8') peer.accept(Buffer.from([0xff, 10]));
    await assertion;
  }
});
it('关闭后的异步逆向结果不会写入已关闭连接', async () => {
  let release!: () => void,
    writes = 0;
  const peer = new NativeRpcPeer({
    write: async () => {
      writes++;
    },
    onNotification() {},
    onDisconnect() {},
    onRequest: () =>
      new Promise<void>((r) => {
        release = r;
      }),
  });
  peer.accept(frame({ id: 1, method: 'tool', params: {} }));
  await new Promise((r) => setImmediate(r));
  peer.disconnect();
  release();
  await new Promise((r) => setImmediate(r));
  expect(writes).toBe(0);
});

it('异步 writer 保持帧顺序；首写失败不提交第二帧', async () => {
  for (const fail of [false, true]) {
    let finish!: () => void;
    const sent: string[] = [];
    const peer = new NativeRpcPeer({
      write: (b) => {
        sent.push(JSON.parse(b.toString()).method);
        return new Promise<void>((resolve, reject) => {
          finish = () => (fail ? reject(Error('write failed')) : resolve());
        });
      },
      onNotification() {},
      onDisconnect() {},
    });
    peer.notify('initialized', {});
    peer.notify('thread/start', {});
    expect(sent).toEqual(['initialized']);
    finish();
    await new Promise((r) => setImmediate(r));
    expect(sent).toEqual(fail ? ['initialized'] : ['initialized', 'thread/start']);
    peer.disconnect();
  }
});
it.each([
  { method: 'tool', id: 1, params: {} },
  { jsonrpc: '1.0', method: 'tool', id: 1 },
  { jsonrpc: '2.0', method: 'tool', id: 1, result: {} },
  { jsonrpc: '2.0', id: 'a', error: 'canary' },
])('ACP 错误信封不进入逆向回调', async (value) => {
  let invoked = 0,
    disconnected = false;
  const peer = new NativeRpcPeer({
    jsonrpc: '2.0',
    write: async () => {},
    onNotification() {},
    onRequest: async () => {
      invoked++;
    },
    onDisconnect() {
      disconnected = true;
    },
  });
  peer.accept(frame(value));
  await new Promise((r) => setImmediate(r));
  expect(invoked).toBe(0);
  expect(disconnected).toBe(true);
});
