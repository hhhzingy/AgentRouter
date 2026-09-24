import { it, expect } from 'vitest';
import { KimiLifecycle } from '../../packages/adapters/kimi/lifecycle.ts';
import { kimiDriver } from '../../packages/core-service/harness-drivers.ts';
it('Kimi 任务轮作废一次性 Bootstrap ACK 并用 route_finish 提交终态', () => {
  const request = { kind: 'task.request', body: '17+25' };
  const charter = { mission: '做算术任务' };
  const prompt = kimiDriver.runPrompt!({ request, charter, charterHash: 'hash' });
  expect(prompt).toContain('AGENTROUTER_CHARTER_ACK:hash');
  expect(prompt).toContain('指令已作废');
  expect(prompt).toContain(JSON.stringify(charter));
  expect(prompt).toContain(JSON.stringify(request));
  expect(prompt).toContain('必须调用 route_finish 提交终态');
  expect(prompt).toContain('自然语言回答');
  expect(prompt).toContain('outcome(不是 status)、summary、body、outputs');
  expect(prompt).toContain('outcome="failed"');
});
const tick = () => new Promise((r) => setImmediate(r));
function fixture(
  onApproval?: (method: string, params: unknown) => Promise<unknown>,
  overrides: Record<string, unknown> = {},
) {
  const sent: any[] = [],
    events: any[] = [];
  const driver = new KimiLifecycle({
    epoch: 'epoch-1',
    onApproval,
    ...overrides,
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onEvent: (e) => events.push(e),
  });
  const accept = (m: any) =>
    driver.peer.accept(Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n'));
  const reply = async (method: string, result: any) => {
    await tick();
    accept({ id: sent.findLast((x) => x.method === method).id, result });
  };
  const initialize = async (caps = { loadSession: true }) => {
    const p = driver.initialize();
    await reply('initialize', { protocolVersion: 1, agentCapabilities: caps });
    await p;
  };
  const open = async (configOptions: any[] = []) => {
    await initialize();
    const p = driver.open({ cwd: 'E:/isolated' });
    await reply('session/new', { sessionId: 's1', configOptions });
    await p;
  };
  return { driver, sent, events, accept, reply, initialize, open };
}
it('协商只声明已实现的客户端能力，未知版本拒绝', async () => {
  const f = fixture();
  const p = f.driver.initialize();
  await f.reply('initialize', { protocolVersion: 2, agentCapabilities: {} });
  await expect(p).rejects.toThrow('ACP_VERSION_UNVERIFIED');
  expect(f.sent[0].params.clientCapabilities).toEqual({});
});
it('单业务轮响应才结算，文本携带可信 epoch，没有停止证明', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r1', epoch: 'epoch-1', text: '小任务' });
  f.accept({
    method: 'session/update',
    params: {
      sessionId: 's1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '答' } },
    },
  });
  expect(f.events[0]).toMatchObject({ type: 'TextDelta', epoch: 'epoch-1', runId: 'r1' });
  await expect(f.driver.start({ runId: 'r2', epoch: 'epoch-1', text: '' })).rejects.toThrow(
    'NATIVE_QUEUE_FORBIDDEN',
  );
  await f.reply('session/prompt', { stopReason: 'end_turn' });
  await p;
  expect(f.events.at(-1)).toMatchObject({ type: 'RunSettled', outcome: 'succeeded' });
  expect(f.events.at(-1)).not.toHaveProperty('resourcesStopped');
  f.driver.peer.disconnect();
});
it('load 回放只记录历史且逆向工具被拒绝', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return {};
  });
  await f.initialize();
  const p = f.driver.open({ cwd: 'E:/isolated', nativeSessionId: 's1' });
  f.accept({
    method: 'session/update',
    params: { sessionId: 's1', update: { sessionUpdate: 'tool_call', toolCallId: 'old' } },
  });
  f.accept({ id: 'reverse', method: 'session/request_permission', params: { sessionId: 's1' } });
  await f.reply('session/load', {});
  await p;
  await tick();
  expect(f.events[0].type).toBe('HistoryReplay');
  expect(calls).toBe(0);
  expect(f.sent.find((x) => x.id === 'reverse').error).toBeDefined();
  f.driver.peer.disconnect();
});
it('未协商 load 不发送恢复；重复 initialize/open 被拒绝', async () => {
  const f = fixture();
  const init = f.driver.initialize();
  await expect(f.driver.initialize()).rejects.toThrow('SESSION_STATE_INVALID');
  await f.reply('initialize', { protocolVersion: 1, agentCapabilities: {} });
  await init;
  await expect(f.driver.open({ cwd: 'E:/isolated', nativeSessionId: 's1' })).rejects.toThrow(
    'ACP_LOAD_UNAVAILABLE',
  );
  const p = f.driver.open({ cwd: 'E:/isolated' });
  await expect(f.driver.open({ cwd: 'E:/isolated' })).rejects.toThrow('SESSION_STATE_INVALID');
  await f.reply('session/new', { sessionId: 's1' });
  await p;
  f.driver.peer.disconnect();
});
it('取消通知只发送一次且不提前结算，旧 epoch 不发送', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' });
  expect(() => f.driver.cancel('old')).toThrow('EPOCH_MISMATCH');
  expect(f.driver.cancel('epoch-1').state).toBe('requested');
  f.driver.cancel('epoch-1');
  await tick();
  expect(f.sent.filter((x) => x.method === 'session/cancel')).toHaveLength(1);
  expect(f.events).toHaveLength(0);
  await f.reply('session/prompt', { stopReason: 'cancelled' });
  await p;
  expect(f.events.at(-1).outcome).toBe('cancelled');
  f.driver.peer.disconnect();
});
it('审批默认拒绝，未实现文件 RPC 即使有审批处理器仍拒绝', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' });
  for (const method of ['session/request_permission', 'fs/read_text_file'])
    f.accept({ id: method, method, params: { sessionId: 's1' } });
  await tick();
  await tick();
  expect(f.sent.filter((x) => x.error)).toHaveLength(2);
  await f.reply('session/prompt', { stopReason: 'refusal' });
  await p;
  f.driver.peer.disconnect();
});
it('晚到审批在取消后拒绝', async () => {
  let finish!: (v: unknown) => void;
  const f = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  await f.open();
  const p = f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' });
  f.accept({ id: 'approval', method: 'session/request_permission', params: { sessionId: 's1' } });
  await tick();
  f.driver.cancel('epoch-1');
  finish({ outcome: { outcome: 'selected', optionId: 'allow' } });
  await tick();
  expect(f.sent.find((x) => x.id === 'approval').error).toBeDefined();
  await f.reply('session/prompt', { stopReason: 'cancelled' });
  await p;
  f.driver.peer.disconnect();
});
it('错误 session 更新断线、prompt UNKNOWN 而非结算', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' });
  f.accept({
    method: 'session/update',
    params: { sessionId: 'other', update: { sessionUpdate: 'plan' } },
  });
  await expect(p).rejects.toThrow('RPC_INVALID_FRAME');
  expect(f.events.some((x) => x.type === 'RunSettled')).toBe(false);
});
it('模型与思考配置只允许运行时目录的值，配置期间不准启动', async () => {
  const f = fixture();
  const opts = [
    {
      id: 'model',
      type: 'select',
      currentValue: 'actual-k2.7',
      options: [{ value: 'actual-k2.7' }],
    },
  ];
  await f.open(opts);
  await expect(f.driver.configure('model', 'invented')).rejects.toThrow('ACP_CONFIG_UNAVAILABLE');
  const p = f.driver.configure('model', 'actual-k2.7');
  await expect(f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' })).rejects.toThrow(
    'NATIVE_QUEUE_FORBIDDEN',
  );
  await f.reply('session/set_config_option', { configOptions: opts });
  await p;
  expect(f.sent.find((x) => x.method === 'session/set_config_option').params.value).toBe(
    'actual-k2.7',
  );
  f.driver.peer.disconnect();
});
it('未核验 stopReason 进入不确定态，不伪造完成', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' });
  await f.reply('session/prompt', { stopReason: 'unknown' });
  await expect(p).rejects.toThrow('ACP_OUTCOME_UNVERIFIED');
  expect(f.events.some((x) => x.type === 'RunSettled')).toBe(false);
});

it.each(['wrong', undefined])(
  '配置回执 currentValue=%s 不匹配时关闭实例，不执行 prompt',
  async (currentValue) => {
    const f = fixture();
    await f.open([
      { id: 'model', type: 'select', currentValue: 'old', options: [{ value: 'actual-k2.7' }] },
    ]);
    const p = f.driver.configure('model', 'actual-k2.7');
    await f.reply('session/set_config_option', {
      configOptions: [
        { id: 'model', type: 'select', currentValue, options: [{ value: 'actual-k2.7' }] },
      ],
    });
    await expect(p).rejects.toThrow('ACP_CONFIG_NOT_APPLIED');
    await expect(f.driver.start({ runId: 'r', epoch: 'epoch-1', text: '' })).rejects.toThrow(
      'NATIVE_QUEUE_FORBIDDEN',
    );
    expect(f.sent.some((x) => x.method === 'session/prompt')).toBe(false);
  },
);

it('业务轮响应放宽到 promptTimeoutMs；控制请求仍受默认活性界', async () => {
  const f = fixture(undefined, { timeoutMs: 20, promptTimeoutMs: 4000 });
  await f.open();
  const p = f.driver.start({ runId: 'r1', epoch: 'epoch-1', text: '慢任务' });
  await new Promise((r) => setTimeout(r, 60));
  expect(f.events.some((e) => e.type === 'Disconnected')).toBe(false);
  await f.reply('session/prompt', { stopReason: 'end_turn' });
  await p;
  expect(f.events.at(-1)).toMatchObject({ type: 'RunSettled', outcome: 'succeeded' });
  f.driver.peer.disconnect();
});
