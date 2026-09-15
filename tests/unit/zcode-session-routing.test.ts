import { expect, it } from 'vitest';
import { zcodeDriver } from '../../packages/core-service/harness-drivers.ts';

function fixture(replyId = 'bound-native') {
  const sent: any[] = [];
  let lifecycle: ReturnType<typeof zcodeDriver.createLifecycle>;
  lifecycle = zcodeDriver.createLifecycle({ config: {} as any, epoch: 'epoch', promptTimeoutMs: 100,
    onEvent: () => {}, write: async bytes => {
      const request = JSON.parse(bytes.toString()); sent.push(request);
      lifecycle.accept(Buffer.from(JSON.stringify({ id: request.id, result: request.method === 'session/send'
        ? { sessionId: replyId, accepted: true, stateRevision: 1 }
        : { sessionId: replyId, eventSeq: 0, events: [] } }) + '\n'));
    } });
  return { lifecycle, sent };
}
it('恢复已绑定 ZCode session，不调用 create，并按官方 content/inputId 发送', async () => {
  const f = fixture();
  const opened = await f.lifecycle.open({ config: { workspace: 'test-workspace' } as any,
    process: { session: { id: 'bound-native' } } as any, instructions: '' });
  expect(opened.id).toBe('bound-native');
  expect(f.sent.map(r => r.method)).toEqual(['session/resume', 'session/subscribe']);
  await f.lifecycle.start({ runId: 'run', text: 'synthetic text', effort: 'low', epoch: 'epoch' });
  expect(f.sent[1].params).toEqual({ sessionId: 'bound-native', deliveryKind: 'desktop-continuous', includeSnapshot: false });
  expect(f.sent[2].params).toEqual({ sessionId: 'bound-native', content: 'synthetic text', inputId: 'run' });
  f.lifecycle.disconnect();
});
it('恢复响应身份错配时拒绝，禁止 fallback create', async () => {
  const f = fixture('other-native');
  await expect(f.lifecycle.open({ config: { workspace: 'test-workspace' } as any,
    process: { session: { id: 'bound-native' } } as any, instructions: '' })).rejects.toThrow('ZCODE_SESSION_MISMATCH');
  expect(f.sent.map(r => r.method)).toEqual(['session/resume']);
  f.lifecycle.disconnect();
});

it.each([false, true])('ZCode create/resume 传入受信宿主提供的 Role MCP，resume=%s', async resume => {
  const f = fixture();
  const mcpServers = [{ name: 'agentrouter-role', command: 'test-node', args: ['test-bridge'], env: [] }];
  await f.lifecycle.open({ config: { workspace: 'test-workspace' } as any,
    process: { ...(resume ? { session: { id: 'bound-native' } } : {}), mcpServers } as any, instructions: '' });
  expect(f.sent[0].method).toBe(resume ? 'session/resume' : 'session/create');
  expect(f.sent[0].params.mcpServers).toEqual(mcpServers);
  expect(f.sent.map(r => r.method)).toEqual([resume ? 'session/resume' : 'session/create', 'session/subscribe']);
  f.lifecycle.disconnect();
});
