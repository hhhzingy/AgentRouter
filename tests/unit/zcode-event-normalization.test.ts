import { expect, it } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

async function fixture() {
  const events: any[] = [];
  let driver: ZcodeLifecycle;
  driver = new ZcodeLifecycle({ onEvent: e => events.push(e), onDisconnect: () => {},
    write: async bytes => {
      const r = JSON.parse(bytes.toString());
      driver.accept(Buffer.from(JSON.stringify({ id: r.id, result: { sessionId: 's', accepted: true } }) + '\n'));
    } });
  await driver.initialize();
  await driver.open({ workspacePath: 'test', workspaceKey: 'test' });
  await driver.start({ runId: 'r', text: 'synthetic' });
  const emit = (type: string, seq: number, payload: any, extra = {}) => driver.accept(Buffer.from(JSON.stringify({
    method: 'session/event', params: { type, seq, sessionId: 's', turnId: 't', payload, ...extra },
  }) + '\n'));
  return { driver, events, emit };
}
it('仅归一化本次 input/turn 的可见文本，过滤历史、重复和 reasoning', async () => {
  const f = await fixture();
  f.emit('turn.started', 1, { inputId: 'old' }, { turnId: 'old' });
  f.emit('model.streaming', 2, { kind: 'text_delta', delta: 'old' }, { turnId: 'old' });
  f.emit('turn.started', 3, { inputId: 'r' });
  f.emit('model.streaming', 4, { kind: 'reasoning_delta', delta: 'hidden' });
  f.emit('model.streaming', 5, { kind: 'text_delta', delta: 'visible' });
  f.emit('model.streaming', 5, { kind: 'text_delta', delta: 'duplicate' });
  f.emit('model.streaming', 6, { kind: 'text_delta', delta: 'wrong-session' }, { sessionId: 'other' });
  expect(f.events.filter(e => e.type === 'TextDelta')).toEqual([
    { type: 'TextDelta', runId: 'r', threadId: 's', turnId: 't', text: 'visible' },
  ]);
  expect(JSON.stringify(f.events)).not.toContain('hidden');
  f.driver.disconnect();
});
it.each([['turn.completed', 'success', 'succeeded'], ['turn.completed', 'cancelled', 'cancelled'], ['turn.failed', undefined, 'failed']])('映射 %s/%s 为 %s 且只结算一次', async (type, resultType, outcome) => {
  const f = await fixture();
  f.emit('turn.started', 1, { inputId: 'r' });
  f.emit(type!, 2, { inputId: 'old', resultType });
  f.emit(type!, 3, { inputId: 'r', resultType });
  f.emit(type!, 4, { inputId: 'r', resultType });
  expect(f.events.filter(e => e.type === 'RunSettled')).toEqual([
    { type: 'RunSettled', runId: 'r', threadId: 's', turnId: 't', outcome },
  ]);
  f.driver.disconnect();
});
it('工具与权限只传观察元数据，未知终态不报成功', async () => {
  const f = await fixture();
  f.emit('turn.started', 1, { inputId: 'r' });
  f.emit('tool.updated', 2, { toolCallId: 'call', toolName: 'route_finish', kind: 'started', input: 'do-not-forward' });
  f.emit('permission.requested', 3, { requestId: 'permission', toolCallId: 'call', toolName: 'shell', input: 'do-not-forward' });
  f.emit('turn.completed', 4, { inputId: 'r', resultType: 'unknown' });
  expect(f.events.map(e => e.type)).toEqual(['RunAccepted', 'ToolUpdate', 'PermissionRequested']);
  expect(JSON.stringify(f.events)).not.toContain('do-not-forward');
  expect(f.events[0]).not.toHaveProperty('acceptedPromptHash');
  await expect(f.driver.start({ runId: 'r2', text: 'must-not-overlap' })).rejects.toThrow('ZCODE_RUN_ACTIVE');
  f.driver.disconnect();
});
