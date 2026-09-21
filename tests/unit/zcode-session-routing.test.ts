import { expect, it } from 'vitest';
import { zcodeDriver } from '../../packages/core-service/harness-drivers.ts';

const zcodeModelSelection = { providerId: 'account:test', modelId: 'GLM-5.3' };

function fixture() {
  const sent: any[] = [];
  let lifecycle: ReturnType<typeof zcodeDriver.createLifecycle>;
  lifecycle = zcodeDriver.createLifecycle({ config: {} as any, epoch: 'epoch', promptTimeoutMs: 100,
    onEvent: () => {}, write: async bytes => {
      const request = JSON.parse(bytes.toString()); sent.push(request);
      const sessionId = request.params?.sessionId ?? 'new-native';
      lifecycle.accept(Buffer.from(JSON.stringify({ id: request.id, result: request.method === 'session/send'
        ? { sessionId, accepted: true, stateRevision: 1 }
        : { sessionId, eventSeq: 0, events: [] } }) + '\n'));
    } });
  return { lifecycle, sent };
}
it('已有原生引用时按 0.16.9 合同 resume 同会话，并按官方 content/inputId 发送', async () => {
  const f = fixture();
  const opened = await f.lifecycle.open({ config: { workspace: 'test-workspace' } as any,
    process: { session: { id: 'stale-native' }, zcodeModelSelection } as any, instructions: '' });
  expect(opened.id).toBe('stale-native');
  expect(f.sent.map(r => r.method)).toEqual(['session/resume', 'session/subscribe']);
  expect(f.sent[0].params).toMatchObject({ sessionId: 'stale-native', workspace: { workspacePath: 'test-workspace', workspaceKey: 'test-workspace' } });
  await f.lifecycle.start({ runId: 'run', text: 'synthetic text', effort: 'low', epoch: 'epoch' });
  expect(f.sent[2].params).toEqual({ sessionId: 'stale-native', content: 'synthetic text', inputId: 'run' });
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
