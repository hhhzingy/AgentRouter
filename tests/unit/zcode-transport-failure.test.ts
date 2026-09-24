import { expect, it, vi } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

it('ZCode 写入失败立即关闭连接并拒绝所有等待请求', async () => {
  const onDisconnect = vi.fn();
  const lifecycle = new ZcodeLifecycle({
    write: async () => { throw Error('private transport diagnostic'); },
    onEvent: () => {}, onDisconnect, timeoutMs: 100,
  });
  await expect(lifecycle.listSessions()).rejects.toThrow('ZCODE_TRANSPORT_FAILED');
  expect(onDisconnect).toHaveBeenCalledExactlyOnceWith('ZCODE_TRANSPORT_FAILED');
  await expect(lifecycle.listSessions()).rejects.toThrow('RPC_CLOSED');
});
