import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { CodexLifecycle } from '../../packages/adapters/codex/lifecycle.ts';
function fixture(onApproval?: (method: string, params: unknown) => Promise<unknown>) {
  const sent: any[] = [],
    events: any[] = [];
  const driver = new CodexLifecycle({
    onApproval,
    write: async (b) => {
      sent.push(JSON.parse(b.toString()));
    },
    onEvent: (e) => events.push(e),
  });
  const reply = async (method: string, result: any) => {
    await new Promise((r) => setImmediate(r));
    const req = sent.findLast((x) => x.method === method);
    driver.peer.accept(Buffer.from(JSON.stringify({ id: req.id, result }) + '\n'));
  };
  const event = (method: string, params: any) =>
    driver.peer.accept(Buffer.from(JSON.stringify({ method, params }) + '\n'));
  const open = async () => {
    const i = driver.initialize();
    reply('initialize', {});
    await i;
    const o = driver.open({
      cwd: 'E:/isolated',
      model: 'runtime-discovered-model',
      instructions: '冻结章程',
    });
    reply('thread/start', { thread: { id: 'thread-1' } });
    await o;
  };
  return { driver, sent, events, reply, event, open };
}
it('真实协议命令与原生完成分离；终态不授予资源停止证明，也不允许内部第二轮', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'run-1', text: '任务' });
  f.reply('turn/start', { turn: { id: 'turn-1' } });
  await p;
  expect(f.events.map((e) => e.type)).toEqual(['RunAccepted']);
  expect(f.events[0]).toMatchObject({ runId: 'run-1', threadId: 'thread-1', turnId: 'turn-1', acceptedPromptHash: createHash('sha256').update('任务').digest('hex') });
  f.event('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
  f.event('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
  expect(f.events.filter((e) => e.type === 'RunSettled')).toHaveLength(1);
  expect(f.events.at(-1)).not.toHaveProperty('resourcesStopped');
  await expect(f.driver.start({ runId: 'run-2', text: '不能排队' })).rejects.toThrow(
    'NATIVE_QUEUE_FORBIDDEN',
  );
  f.driver.peer.disconnect();
});
it('turn/start 回应前取消会在获得原生 ID 后发送，ack 不是完成', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'run-1', text: '任务' });
  expect(await f.driver.cancel()).toEqual({ state: 'requested' });
  f.reply('turn/start', { turn: { id: 'turn-1' } });
  await new Promise((r) => setImmediate(r));
  const cancel = f.sent.find((x) => x.method === 'turn/interrupt');
  expect(cancel.params).toEqual({ threadId: 'thread-1', turnId: 'turn-1' });
  f.reply('turn/interrupt', {});
  await p;
  expect(f.events.some((e) => e.type === 'RunSettled')).toBe(false);
  f.driver.peer.disconnect();
});
it('错误 thread/turn 身份断线而非错误结算', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'run-1', text: '任务' });
  f.reply('turn/start', { turn: { id: 'turn-1' } });
  await p;
  f.event('turn/completed', {
    threadId: 'other-thread',
    turn: { id: 'turn-1', status: 'completed' },
  });
  expect(f.events.at(-1).type).toBe('Disconnected');
  expect(f.events.some((e) => e.type === 'RunSettled')).toBe(false);
});

it('先到终态必须等 turn/start 响应绑定后按 accepted→settled 处理', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'run-1', text: '任务' });
  f.event('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
  expect(f.events).toHaveLength(0);
  f.reply('turn/start', { turn: { id: 'turn-1' } });
  await p;
  expect(f.events.map((e) => e.type)).toEqual(['RunAccepted', 'RunSettled']);
  f.driver.peer.disconnect();
});
it('并发取消调用共享原生 ack，不能提前显示确认', async () => {
  const f = fixture();
  await f.open();
  const p = f.driver.start({ runId: 'run-1', text: '任务' });
  f.reply('turn/start', { turn: { id: 'turn-1' } });
  await p;
  let completed = 0;
  const a = f.driver.cancel().then((v) => {
      completed++;
      return v;
    }),
    b = f.driver.cancel().then((v) => {
      completed++;
      return v;
    });
  await new Promise((r) => setImmediate(r));
  expect(completed).toBe(0);
  expect(f.sent.filter((x) => x.method === 'turn/interrupt')).toHaveLength(1);
  f.reply('turn/interrupt', {});
  expect(await a).toEqual({ state: 'acknowledged' });
  expect(await b).toEqual({ state: 'acknowledged' });
  f.driver.peer.disconnect();
});

it('并发初始化和 open/resume 竞争不会启动第二个原生会话', async () => {
  const f = fixture();
  const i = f.driver.initialize();
  await expect(f.driver.initialize()).rejects.toThrow('ALREADY_INITIALIZED');
  await f.reply('initialize', {});
  await i;
  const open = f.driver.open({ cwd: 'E:/isolated', model: 'discovered', instructions: 'charter' });
  await expect(
    f.driver.open({
      cwd: 'E:/isolated',
      model: 'discovered',
      instructions: 'charter',
      nativeSessionId: 'other',
    }),
  ).rejects.toThrow('SESSION_STATE_INVALID');
  await f.reply('thread/start', { thread: { id: 'thread-1' } });
  await open;
  expect(f.sent.filter((x) => ['thread/start', 'thread/resume'].includes(x.method))).toHaveLength(
    1,
  );
  f.driver.peer.disconnect();
});

it.each(['terminal','disconnect'] as const)('人工审批等待期间 %s，晚到批准不返回原生端', async mode => {
 let release!: (value: unknown) => void;
 const f=fixture(()=>new Promise(r=>{release=r;}));await f.open();const start=f.driver.start({runId:'run-1',text:'task'});await f.reply('turn/start',{turn:{id:'turn-1'}});await start;
 f.driver.peer.accept(Buffer.from(JSON.stringify({id:7,method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',turnId:'turn-1'}})+'\n'));
 await new Promise(r=>setImmediate(r));
 if(mode==='terminal')f.event('turn/completed',{threadId:'thread-1',turn:{id:'turn-1',status:'completed'}});else f.driver.peer.disconnect();
 release({decision:'accept'});await new Promise(r=>setImmediate(r));
 const response=f.sent.find(x=>x.id===7);if(mode==='terminal')expect(response.error.message).toBe('REQUEST_REJECTED');else expect(response).toBeUndefined();
 expect(f.sent.some(x=>x.id===7&&x.result?.decision==='accept')).toBe(false);f.driver.peer.disconnect();
});
