import { expect, it } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

it('响应官方 runtime preferences，不默认批准未知交互', async () => {
  const sent: any[] = [];
  const lifecycle = new ZcodeLifecycle({ write: async bytes => { sent.push(JSON.parse(bytes.toString())); }, onEvent: () => {}, onDisconnect: () => {} });
  lifecycle.accept(Buffer.from(JSON.stringify({ id: 'server-1', method: 'session/requestRuntimePreferences', params: {} }) + '\n'));
  lifecycle.accept(Buffer.from(JSON.stringify({ id: 'server-2', method: 'interaction/unknown', params: {} }) + '\n'));
  await Promise.resolve(); await Promise.resolve();
  expect(sent[0]).toEqual({ id: 'server-1', result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false } });
  expect(sent[1]).toMatchObject({ id: 'server-2', error: { code: -32601 } });
  lifecycle.disconnect();
});

it('保留安全的 Provider reason code，不把错误正文写入诊断', async () => {
  let lifecycle: ZcodeLifecycle;
  lifecycle = new ZcodeLifecycle({ write: async bytes => {
    const request = JSON.parse(bytes.toString());
    lifecycle.accept(Buffer.from(JSON.stringify({ id: request.id, error: { code: -32000, message: 'token secret', data: { code: 'provider.notInRegistry' } } }) + '\n'));
  }, onEvent: () => {}, onDisconnect: () => {} });
  await expect(lifecycle.listSessions()).rejects.toMatchObject({ code: 'ZCODE_PROVIDER_NOT_IN_REGISTRY' });
  lifecycle.disconnect();
});
