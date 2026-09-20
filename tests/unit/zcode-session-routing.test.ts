import { expect, it } from 'vitest';
import { zcodeDriver } from '../../packages/core-service/harness-drivers.ts';

const zcodeModelSelection = { providerId: 'account:test', modelId: 'GLM-5.3' };

function fixture() {
  const sent: any[] = [];
  let lifecycle: ReturnType<typeof zcodeDriver.createLifecycle>;
  lifecycle = zcodeDriver.createLifecycle({ config: {} as any, epoch: 'epoch', promptTimeoutMs: 100,
    onEvent: () => {}, write: async bytes => {
      const request = JSON.parse(bytes.toString()); sent.push(request);
      lifecycle.accept(Buffer.from(JSON.stringify({ id: request.id, result: request.method === 'session/send'
        ? { sessionId: 'new-native', accepted: true, stateRevision: 1 }
        : { sessionId: 'new-native', eventSeq: 0, events: [] } }) + '\n'));
    } });
  return { lifecycle, sent };
}
// 0.16.5 实测:冷进程 resume 后 send 报 ZCODE_RUNTIME_MODEL_UNAVAILABLE,官方续轮不可跨进程。
// 驱动契约改为:忽略旧 session 引用,任务轮一律 session/create 新会话 + runPrompt 重申章程。
it('任务轮始终新会话,不调用 session/resume,并按官方 content/inputId 发送', async () => {
  const f = fixture();
  const opened = await f.lifecycle.open({ config: { workspace: 'test-workspace' } as any,
    process: { session: { id: 'stale-native' }, zcodeModelSelection } as any, instructions: '' });
  expect(opened.id).toBe('new-native');
  expect(f.sent.map(r => r.method)).toEqual(['session/create', 'session/subscribe']);
  expect(f.sent[0].params.model).toEqual(zcodeModelSelection);
  await f.lifecycle.start({ runId: 'run', text: 'synthetic text', effort: 'low', epoch: 'epoch' });
  expect(f.sent[2].params).toEqual({ sessionId: 'new-native', content: 'synthetic text', inputId: 'run' });
  f.lifecycle.disconnect();
});
it('新会话路径同样传入受信宿主提供的 Role MCP', async () => {
  const f = fixture();
  const mcpServers = [{ name: 'agentrouter-role', command: 'test-node', args: ['test-bridge'], env: [] }];
  await f.lifecycle.open({ config: { workspace: 'test-workspace' } as any,
    process: { mcpServers, zcodeModelSelection } as any, instructions: '' });
  expect(f.sent[0].method).toBe('session/create');
  expect(f.sent[0].params.mcpServers).toEqual(mcpServers);
  expect(f.sent[0].params.model).toEqual(zcodeModelSelection);
  expect(f.sent.map(r => r.method)).toEqual(['session/create', 'session/subscribe']);
  f.lifecycle.disconnect();
});
it('任务轮 runPrompt 作废 bootstrap ACK 并重申章程(新会话无历史)', async () => {
  const prompt = (zcodeDriver as { runPrompt?: (x: unknown) => string }).runPrompt!({
    request: { summary: 's' }, charter: { mission: 'm' }, charterHash: 'h'.repeat(64),
  });
  expect(prompt).toContain('作废');
  expect(prompt).toContain('route_context');
  expect(prompt).toContain(JSON.stringify({ mission: 'm' }));
});
