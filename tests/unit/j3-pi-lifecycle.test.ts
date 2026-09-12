import { it, expect } from 'vitest';
import { PiLifecycle } from '../../packages/adapters/pi/lifecycle.ts';
import { PiRpcPeer } from '../../packages/adapters/pi/rpc-peer.ts';
const tick = () => new Promise((r) => setImmediate(r));
function fixture(overrides: any = {}) {
  const sent: any[] = [],
    events: any[] = [];
  const driver = new PiLifecycle({
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onEvent: (e) => events.push(e),
    ...overrides,
  });
  const event = (e: any) => driver.peer.accept(Buffer.from(JSON.stringify(e) + '\n'));
  const reply = async (type: string, data?: any) => {
    await tick();
    const c = sent.findLast((x) => x.type === type);
    event({ id: c.id, type: 'response', command: type, success: true, data });
  };
  const open = async (state: any = {}) => {
    const p = driver.open({ provider: 'deepseek', modelId: 'observed', thinkingLevel: 'off' });
    await reply('set_model');
    await reply('set_thinking_level');
    await reply('get_state', {
      sessionId: 's1',
      isStreaming: false,
      isCompacting: false,
      pendingMessageCount: 0,
      model: { provider: 'deepseek', id: 'observed' },
      thinkingLevel: 'off',
      ...state,
    });
    return p;
  };
  return { driver, sent, events, event, reply, open };
}
it('pi settles only on agent_settled; acceptance and process stopping remain separate', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r1', text: 'read input' });
  f.event({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
  f.event({ type: 'agent_end' });
  expect(f.events).toHaveLength(0);
  await f.reply('prompt');
  await p;
  expect(f.events.map((x) => x.type)).toEqual(['RunAccepted']);
  f.event({ type: 'agent_settled' });
  f.event({ type: 'agent_settled' });
  expect(f.events.map((x) => x.type)).toEqual(['RunAccepted', 'RunSettled']);
  expect(f.events[1]).not.toHaveProperty('resourcesStopped');
  expect(f.sent.find((x) => x.type === 'prompt')).not.toHaveProperty('streamingBehavior');
  await expect(f.driver.start({ runId: 'r2', text: 'again' })).rejects.toThrow(
    'NATIVE_QUEUE_FORBIDDEN',
  );
  f.driver.peer.end();
});
it('cancellation clears native queue before abort and deduplicates concurrent calls', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', text: 'task' });
  await f.reply('prompt');
  await p;
  const a = f.driver.cancel(),
    b = f.driver.cancel();
  await tick();
  expect(f.sent.at(-1).type).toBe('clear_queue');
  await f.reply('clear_queue', { steering: [], followUp: [] });
  await f.reply('abort');
  expect(await a).toEqual({ state: 'acknowledged' });
  expect(await b).toEqual({ state: 'acknowledged' });
  expect(f.sent.filter((x) => x.type === 'abort')).toHaveLength(1);
  expect(f.events.some((x) => x.type === 'RunSettled')).toBe(false);
  f.driver.peer.end();
});
it('pi rejects native pending messages and model/thinking mismatch', async () => {
  for (const state of [
    { pendingMessageCount: 1 },
    { thinkingLevel: 'high' },
    { isStreaming: true },
  ]) {
    const f = fixture();
    await expect(f.open(state)).rejects.toThrow('NATIVE_STATE_MISMATCH');
  }
});
it('settled with no assistant outcome is ambiguous and never successful', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', text: 'task' });
  await f.reply('prompt');
  await p;
  f.event({ type: 'agent_settled' });
  expect(f.events.at(-1).type).toBe('Disconnected');
  expect(await f.driver.cancel()).toEqual({ state: 'unknown' });
});
it('strict LF preserves Unicode separators and ID command mismatch disconnects', async () => {
  const frames: any[] = [],
    sent: any[] = [];
  const peer = new PiRpcPeer({
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onEvent: (e) => frames.push(e),
    onDisconnect: () => {},
  });
  peer.accept(Buffer.from('{"type":"test","value":"a\u2028b\u2029c"}\r\n'));
  expect(frames[0].value).toBe('a\u2028b\u2029c');
  const p = peer.request('get_state');
  await tick();
  peer.accept(
    Buffer.from(
      JSON.stringify({ id: sent[0].id, type: 'response', command: 'abort', success: true }) + '\n',
    ),
  );
  await expect(p).rejects.toThrow('RPC_PROTOCOL_INVALID');
});
it('timeout has possible side effects, no retry, observer failure contained', async () => {
  let writes = 0;
  const peer = new PiRpcPeer({
    write: async () => {
      writes++;
    },
    onEvent: () => {},
    onDisconnect: () => {
      throw Error('observer');
    },
    timeoutMs: 5,
  });
  await expect(peer.request('prompt', { message: 'small' })).rejects.toMatchObject({
    code: 'RPC_TIMEOUT',
    sideEffects: 'possible',
  });
  expect(writes).toBe(1);
});
it('restores native session and checks persisted ID without replaying startup messages', async () => {
  const f = fixture();
  const p = f.driver.open({
    provider: 'deepseek',
    modelId: 'm',
    thinkingLevel: 'off',
    sessionPath: 'E:/isolated/s.jsonl',
    expectedSessionId: 's',
  });
  f.event({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
  await f.reply('switch_session', { cancelled: false });
  await f.reply('set_model');
  await f.reply('set_thinking_level');
  await f.reply('get_state', {
    sessionId: 's',
    isStreaming: false,
    isCompacting: false,
    pendingMessageCount: 0,
    model: { provider: 'deepseek', id: 'm' },
    thinkingLevel: 'off',
  });
  expect(await p).toEqual({ sessionId: 's', sessionFile: undefined });
  expect(f.events).toEqual([]);
  f.driver.peer.end();
});
it('serialized write failure does not transmit queued commands or expose raw errors', async () => {
  let writes = 0;
  const peer = new PiRpcPeer({
    write: async () => {
      writes++;
      throw Error('sensitive-native-detail');
    },
    onEvent: () => {},
    onDisconnect: () => {},
  });
  const results = await Promise.allSettled([
    peer.request('get_state'),
    peer.request('get_available_models'),
  ]);
  expect(writes).toBe(1);
  for (const result of results) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason.message).toBe('RPC_WRITE_FAILED');
  }
});
it('concurrent open and native slash commands are rejected before additional writes', async () => {
  const f = fixture();
  const opening = f.open();
  await expect(
    f.driver.open({ provider: 'p', modelId: 'm', thinkingLevel: 'off' }),
  ).rejects.toThrow('SESSION_STATE_INVALID');
  await opening;
  const count = f.sent.length;
  await expect(f.driver.start({ runId: 'r', text: '  /extension-command' })).rejects.toThrow(
    'NATIVE_COMMAND_FORBIDDEN',
  );
  expect(f.sent).toHaveLength(count);
  f.driver.peer.end();
});
it('clear_queue rejection makes cancellation unknown and does not issue abort', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', text: 'task' });
  await f.reply('prompt');
  await p;
  const cancel = f.driver.cancel();
  await tick();
  const c = f.sent.at(-1);
  f.event({
    id: c.id,
    type: 'response',
    command: 'clear_queue',
    success: false,
    error: 'raw detail',
  });
  expect(await cancel).toEqual({ state: 'unknown' });
  expect(f.sent.some((x) => x.type === 'abort')).toBe(false);
});

it('prompt 响应放宽到 promptTimeoutMs；控制请求仍受默认活性界', async () => {
  const f = fixture({ timeoutMs: 20, promptTimeoutMs: 4000 });
  await f.open();
  const p = f.driver.start({ runId: 'r1', text: '慢任务' });
  await new Promise((r) => setTimeout(r, 60));
  f.event({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
  f.event({ type: 'agent_settled' });
  await f.reply('prompt');
  await p;
  expect(f.events.map((x) => x.type)).toEqual(['RunAccepted', 'RunSettled']);
  f.driver.peer.end();
});
