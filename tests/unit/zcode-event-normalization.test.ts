import { expect, it } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

// 0.16.5 官方 app-server 词汇:回合生命周期在 v4/telemetry/event(turnId/sourceCommandId/eventSeq/kind),
// session/event 仅携带文本增量(payload.kind)。历史合成版 type 字段词汇已废弃。
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
  const tel = (eventSeq: number, kind: string, extra: Record<string, unknown> = {}) => driver.accept(Buffer.from(JSON.stringify({
    method: 'v4/telemetry/event', params: { sessionId: 's', eventSeq, kind, turnId: 't', sourceCommandId: 'r', ...extra },
  }) + '\n'));
  const delta = (seq: number, payload: any, extra: Record<string, unknown> = {}) => driver.accept(Buffer.from(JSON.stringify({
    method: 'session/event', params: { sessionId: 's', seq, payload, ...extra },
  }) + '\n'));
  return { driver, events, tel, delta };
}
it('仅归一化本次 input/turn 的可见文本，过滤历史、重复和 reasoning', async () => {
  const f = await fixture();
  f.delta(1, { kind: 'text_delta', delta: 'pre-turn' }); // 未绑定回合前不得产出
  f.tel(1, 'turn.started');
  f.tel(2, 'turn.started', { turnId: 'dup' }); // 已有 turnId 的重复开始忽略
  f.delta(2, { kind: 'reasoning_delta', delta: 'hidden' });
  f.delta(3, { kind: 'text_delta', delta: 'visible' });
  f.delta(3, { kind: 'text_delta', delta: 'duplicate' }); // 同 seq 不重复
  f.delta(4, { kind: 'text_delta', delta: 'wrong-session' }, { sessionId: 'other' });
  expect(f.events.filter(e => e.type === 'TextDelta')).toEqual([
    { type: 'TextDelta', runId: 'r', threadId: 's', turnId: 't', text: 'visible' },
  ]);
  expect(JSON.stringify(f.events)).not.toContain('hidden');
  f.driver.disconnect();
});
it.each([
  ['success', undefined, 'succeeded'],
  ['cancelled', undefined, 'cancelled'],
  [undefined, 'failed', 'failed'],
])('映射 turn.terminal %s/%s 为 %s 且只结算一次', async (status, resultType, outcome) => {
  const f = await fixture();
  f.tel(1, 'turn.started');
  f.tel(2, 'turn.terminal', { status, resultType, turnId: 'old-turn' }); // 错回合不结算
  f.tel(3, 'turn.terminal', { status, resultType });
  f.tel(4, 'turn.terminal', { status, resultType }); // 已结算后不再重复
  expect(f.events.filter(e => e.type === 'RunSettled')).toEqual([
    { type: 'RunSettled', runId: 'r', threadId: 's', turnId: 't', outcome },
  ]);
  f.driver.disconnect();
});
it('工具与权限只传观察元数据，未知终态不报成功', async () => {
  const f = await fixture();
  f.tel(1, 'turn.started');
  f.tel(2, 'tool.updated', { toolCallId: 'call', toolName: 'route_finish', input: 'do-not-forward' });
  f.tel(3, 'permission.requested', { requestId: 'permission', toolCallId: 'call', toolName: 'shell', input: 'do-not-forward' });
  f.tel(4, 'turn.terminal', { status: 'unknown_result' });
  expect(f.events.map(e => e.type)).toEqual(['RunAccepted', 'ToolUpdate', 'PermissionRequested']);
  expect(JSON.stringify(f.events)).not.toContain('do-not-forward');
  expect(f.events[0]).not.toHaveProperty('acceptedPromptHash');
  await expect(f.driver.start({ runId: 'r2', text: 'must-not-overlap' })).rejects.toThrow('ZCODE_RUN_ACTIVE');
  f.driver.disconnect();
});
