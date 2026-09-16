import { expect, it } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

function fixture(result: unknown) {
  let driver: ZcodeLifecycle;
  driver = new ZcodeLifecycle({ onEvent: () => {}, onDisconnect: () => {}, write: async bytes => {
    const request = JSON.parse(bytes.toString());
    driver.accept(Buffer.from(JSON.stringify({ id: request.id, result }) + '\n'));
  } });
  return driver;
}
it('create 读取官方 Wbt snapshot.session.sessionId', async () => {
  const d = fixture({ session: { sessionId: 'native' }, projection: { sessionId: 'native' }, runtime: { eventSeq: 0 } });
  await expect(d.open({ workspacePath: 'test', workspaceKey: 'test' })).resolves.toEqual({ id: 'native' });
  d.disconnect();
});
it('resume 读取官方完整 snapshot 而非要求顶层 sessionId', async () => {
  const d = fixture({ session: { sessionId: 'native' }, projection: { sessionId: 'native' }, runtime: { eventSeq: 9 } });
  await expect(d.resume('native')).resolves.toBeUndefined();
  d.disconnect();
});
it('拒绝 snapshot 的 session 与 projection 身份冲突', async () => {
  const d = fixture({ sessionId: 'native', session: { sessionId: 'native' }, projection: { sessionId: 'other' } });
  await expect(d.resume('native')).rejects.toThrow('ZCODE_SESSION_MISMATCH');
  d.disconnect();
});
it('拒绝身份错配或含意外历史的订阅响应', async () => {
  const d = fixture({ sessionId: 'native', eventSeq: 9, events: [{ type: 'turn.started' }] });
  await d.open({ workspacePath: 'test', workspaceKey: 'test' });
  await expect(d.subscribe()).rejects.toThrow('ZCODE_SUBSCRIBE_REJECTED');
  d.disconnect();
});
it('订阅 eventSeq 之前的事件不能绑定新 run', async () => {
  const events: any[] = [];
  let d: ZcodeLifecycle;
  d = new ZcodeLifecycle({ onEvent: e => events.push(e), onDisconnect: () => {}, write: async bytes => {
    const r = JSON.parse(bytes.toString());
    d.accept(Buffer.from(JSON.stringify({ id: r.id, result: { sessionId: 'native', eventSeq: 9, events: [] } }) + '\n'));
  } });
  await d.initialize();
  await d.open({ workspacePath: 'test', workspaceKey: 'test' });
  await d.subscribe();
  await d.start({ runId: 'run', text: 'synthetic' });
  // 0.16.5 官方词汇:v4/telemetry/event 以 eventSeq 计;早于订阅 floors 的不得绑定。
  for (const seq of [8, 9, 10]) d.accept(Buffer.from(JSON.stringify({ method: 'v4/telemetry/event', params: {
    sessionId: 'native', turnId: 'turn-' + seq, eventSeq: seq, kind: 'turn.started', sourceCommandId: 'run',
  } }) + '\n'));
  expect(events).toEqual([{ type: 'RunAccepted', runId: 'run', threadId: 'native', turnId: 'turn-10' }]);
  d.disconnect();
});
