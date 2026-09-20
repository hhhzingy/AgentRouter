import { it, expect } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';
import { DshLifecycle } from '../../packages/adapters/dsh/lifecycle.ts';
const tick = () => new Promise((r) => setImmediate(r));

it('ZcodeLifecycle:session/create往返+事件分发+响应按id关联+断连拒后续', async () => {
  const sent: any[] = [];
  const events: any[] = [];
  let disconnected = '';
  const driver = new ZcodeLifecycle({
    write: async (b) => { sent.push(JSON.parse(b.toString())); },
    onEvent: (e) => events.push(e),
    onDisconnect: (r): void => { disconnected = r; },
  });
  await driver.initialize();
  const p = driver.open({
    workspacePath: 'E:/ws',
    workspaceKey: 'E:/ws',
    model: { providerId: 'account:zai-individual-coding-plan', modelId: 'GLM-5.3' },
  });
  await tick();
  const createFrame = sent.find((x) => x.method === 'session/create');
  expect(createFrame.params).toEqual({
    workspace: { workspacePath: 'E:/ws', workspaceKey: 'E:/ws' },
    model: { providerId: 'account:zai-individual-coding-plan', modelId: 'GLM-5.3' },
  });
  driver.accept(Buffer.from(JSON.stringify({ id: createFrame.id, result: { sessionId: 'sess_1' } }) + '\n'));
  const opened = await p;
  expect(opened.id).toBe('sess_1');
  driver.accept(Buffer.from(JSON.stringify({ method: 'session/event', params: { kind: 'message' } }) + '\n'));
  expect(events).toHaveLength(0); // 未绑定当前 run/turn 的通知不得进入产品事件。
  const ps = driver.start({ runId: 'r1', text: 'hello' });
  await tick();
  const sendFrame = sent.find((x) => x.method === 'session/send');
  expect(sendFrame.params).toEqual({ sessionId: 'sess_1', content: 'hello', inputId: 'r1' });
  driver.accept(Buffer.from(JSON.stringify({ id: sendFrame.id, result: {} }) + '\n'));
  await ps;
  expect(disconnected).toBe('');
  driver.disconnect();
  expect(disconnected).toBe('ZCODE_DISCONNECTED');
  await expect(driver.listSessions()).rejects.toMatchObject({ code: 'RPC_CLOSED' });
});

it('DshLifecycle:initialize/session/new/prompt结算', async () => {
  const sent: any[] = [];
  const events: any[] = [];
  const driver = new DshLifecycle({
    epoch: '1',
    write: async (b) => { sent.push(JSON.parse(b.toString())); },
    onEvent: (e) => events.push(e),
    promptTimeoutMs: 5000,
  });
  const reply = async (method: string, result: any) => {
    await tick();
    const frame = sent.findLast((x) => x.method === method);
    driver.peer.accept(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }) + '\n'));
  };
  const pi = driver.initialize();
  await reply('initialize', { protocolVersion: 1, agentCapabilities: {} });
  await pi;
  const po = driver.open({ cwd: 'E:/ws' });
  await reply('session/new', { sessionId: 'dsh_1' });
  expect((await po).id).toBe('dsh_1');
  const ps = driver.start({ runId: 'r1', text: '17+25' });
  await reply('session/prompt', { stopReason: 'end_turn' });
  await ps;
  expect(events.at(-1)).toMatchObject({ type: 'RunSettled', outcome: 'succeeded' });
  await expect(driver.open({ cwd: 'E:/ws' })).rejects.toThrow('SESSION_STATE_INVALID');
  driver.peer.disconnect();
});

it('DshLifecycle:resume走session/resume;未初始化拒绝', async () => {
  const sent: any[] = [];
  const driver = new DshLifecycle({
    epoch: '1',
    write: async (b) => { sent.push(JSON.parse(b.toString())); },
    onEvent: () => {},
  });
  await expect(driver.open({ cwd: 'E:/ws', nativeSessionId: 'dsh_old' })).rejects.toThrow('SESSION_STATE_INVALID');
  const pi = driver.initialize();
  await tick();
  const frame = sent.findLast((x) => x.method === 'initialize');
  driver.peer.accept(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { protocolVersion: 1, agentCapabilities: {} } }) + '\n'));
  await pi;
  const po = driver.open({ cwd: 'E:/ws', nativeSessionId: 'dsh_old' });
  await tick();
  const resume = sent.findLast((x) => x.method === 'session/resume');
  expect(resume.params).toEqual({ cwd: 'E:/ws', mcpServers: [], sessionId: 'dsh_old' });
  driver.peer.accept(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resume.id, result: { sessionId: 'dsh_old' } }) + '\n'));
  expect((await po).id).toBe('dsh_old');
  driver.peer.disconnect();
});
