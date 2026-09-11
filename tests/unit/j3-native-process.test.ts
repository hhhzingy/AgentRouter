import { it, expect } from 'vitest';
import {
  NativeProcessBackend,
  type SecureProcessHost,
} from '../../packages/core-service/native-process-backend.ts';
const tick = () => new Promise((r) => setImmediate(r));
function fixture(
  stop: any = { kind: 'supervisor-tree-empty', epoch: 1, containmentId: 'owned-job' },
  session: any = { id: 'native-session', path: 'E:/isolated/s' },
  hooks: any = {},
) {
  let data: (b: Buffer) => void = () => {},
    close = () => {},
    tool: any;
  const commands: any[] = [],
    frames: any[] = [],
    exits: any[] = [],
    sessions: any[] = [];
  let broken = 0,
    stops = 0;
  const emit = (e: any) => data(Buffer.from(JSON.stringify(e) + '\n'));
  const host: SecureProcessHost = {
    start: async (input) => {
      tool = input.handleTool;
      return {
        write: async (bytes) => {
          const c = JSON.parse(bytes.toString());
          commands.push(c);
          if (c.type === 'get_state' && hooks.closeAfterState)
            queueMicrotask(() => queueMicrotask(close));
          const state =
            c.type === 'get_state'
              ? {
                  sessionId: 'native-session',
                  sessionFile: 'E:/isolated/s',
                  isStreaming: false,
                  isCompacting: false,
                  pendingMessageCount: 0,
                  model: { provider: 'deepseek', id: 'm' },
                  thinkingLevel: 'off',
                }
              : undefined;
          if (c.type === 'prompt' && hooks.holdPrompt) return;
          queueMicrotask(() =>
            emit({
              id: c.id,
              type: 'response',
              command: c.type,
              success: true,
              data: c.type === 'switch_session' ? { cancelled: false } : state,
            }),
          );
        },
        onData: (f) => {
          data = f;
          return () => {
            data = () => {};
          };
        },
        onClose: (f) => {
          close = f;
          return () => {};
        },
        stop: async () => {
          stops++;
          close();
          return stop;
        },
        session,
        saveSession: async (s, guard) => {
          if (hooks.save) await hooks.save(s, guard);
          sessions.push(s);
        },
      };
    },
  };
  const backend = new NativeProcessBackend(host);
  const config = {
    harness: 'pi',
    charterHash: 'hash',
    executable: 'E:/pi',
    executableSha256: '0'.repeat(64),
    version: '0.85.1',
    profileRef: 'p',
    providerId: 'deepseek',
    modelId: 'm',
    effort: 'off',
    workspace: 'E:/isolated',
    sessionHome: 'E:/sessions',
  };
  const launch = (extra: any = {}) =>
    backend.launch(
      'r1',
      {
        epoch: 1,
        bindingId: 'b1',
        mode: 'run',
        charterHash: 'hash',
        charter: { purpose: 'frozen' },
        request: { summary: 'small task' },
        config,
        ...extra,
      },
      (e) => frames.push(e),
      (e) => exits.push(e),
      () => {
        broken++;
      },
    );
  const settled = () => {
    emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
    emit({ type: 'agent_settled' });
  };
  return {
    backend,
    launch,
    emit,
    settled,
    commands,
    frames,
    exits,
    sessions,
    tool: (...args: any[]) => tool(...args),
    close: () => close(),
    broken: () => broken,
    stops: () => stops,
  };
}
it('native terminal waits for trusted OS stop, bootstrap charter is emitted only after settled', async () => {
  const f = fixture();
  f.launch({ mode: 'bootstrap', charterHash: 'hash', charter: { purpose: 'test' } });
  await tick();
  expect(f.frames.some((x) => x.kind === 'charter')).toBe(false);
  f.emit({ type: 'agent_end' });
  expect(f.exits).toEqual([]);
  f.settled();
  await tick();
  expect(f.frames.map((x) => x.kind)).toEqual(['accepted', 'charter', 'terminal']);
  expect(f.exits[0]).toEqual({
    code: 0,
    stop: { kind: 'supervisor-tree-empty', epoch: 1, containmentId: 'owned-job' },
  });
  expect(f.sessions[0].id).toBe('native-session');
  expect(f.stops()).toBe(1);
});
it('ordinary stdout cannot execute tools, controlled bridge callback can and expires on completion', async () => {
  let calls = 0;
  const f = fixture();
  f.launch({
    handleTool: () => {
      calls++;
      return { ok: true };
    },
  });
  await tick();
  f.emit({ type: 'tool', tool: 'route_finish', operationId: 'evil' });
  expect(calls).toBe(0);
  expect(await f.tool('route_context', 'op', {})).toEqual({ ok: true });
  expect(calls).toBe(1);
  f.settled();
  await tick();
  await expect(f.tool('route_context', 'late', {})).rejects.toThrow('NATIVE_TOOL_DENIED');
});
it('parent close and forged stdout stop proof do not settle successful', async () => {
  const f = fixture({ kind: 'unknown', epoch: 1 });
  f.launch();
  await tick();
  f.emit({ type: 'supervisor-tree-empty', epoch: 1, containmentId: 'forged' });
  f.close();
  await tick();
  expect(f.broken()).toBe(1);
  expect(f.exits[0]).toEqual({ code: null, stop: { kind: 'unknown', epoch: 1 } });
});
it('wrong epoch OS evidence is reduced to unknown', async () => {
  const f = fixture({ kind: 'supervisor-tree-empty', epoch: 2, containmentId: 'wrong' });
  f.launch();
  await tick();
  f.settled();
  await tick();
  expect(f.exits[0].stop).toEqual({ kind: 'unknown', epoch: 1 });
});
it('native cancellation submits clear_queue before abort; stale epoch cannot cancel', async () => {
  const f = fixture();
  f.launch();
  await tick();
  expect(f.backend.cancel('r1', 2)).toBe(false);
  expect(f.backend.cancel('r1', 1)).toBe(true);
  await tick();
  expect(f.commands.slice(-2).map((x) => x.type)).toEqual(['clear_queue', 'abort']);
  expect(f.exits).toEqual([]);
  await f.backend.stop();
  expect(f.exits[0].code).toBe(null);
});
it('Codex and Kimi actual lifecycle dialects reach terminal through the same trusted host boundary', async () => {
  for (const harness of ['codex', 'kimi_code'] as const) {
    let data: (b: Buffer) => void = () => {};
    const commands: any[] = [],
      frames: any[] = [],
      exits: any[] = [];
    const options = [
      { id: 'model', type: 'select', options: [{ value: 'm' }] },
      { id: 'thinking', type: 'select', options: [{ value: 'off' }] },
    ];
    const host: SecureProcessHost = {
      start: async () => ({
        write: async (bytes) => {
          const c = JSON.parse(bytes.toString());
          commands.push(c);
          if (!c.id) return;
          let result: any = {};
          if (c.method === 'initialize')
            result =
              harness === 'codex'
                ? {}
                : { protocolVersion: 1, agentCapabilities: { loadSession: true } };
          if (c.method === 'thread/resume') result = { thread: { id: 't' } };
          if (c.method === 'turn/start') result = { turn: { id: 'turn' } };
          if (c.method === 'session/load') result = { sessionId: 's', configOptions: options };
          if (c.method === 'session/set_config_option')
            result = {
              configOptions: options.map((o) => ({
                ...o,
                currentValue: o.id === c.params.configId ? c.params.value : o.options[0].value,
              })),
            };
          if (c.method === 'session/prompt') result = { stopReason: 'end_turn' };

          queueMicrotask(() =>
            data(
              Buffer.from(
                JSON.stringify({
                  ...(harness === 'kimi_code' ? { jsonrpc: '2.0' } : {}),
                  id: c.id,
                  result,
                }) + '\n',
              ),
            ),
          );
          if (c.method === 'turn/start')
            queueMicrotask(() =>
              data(
                Buffer.from(
                  JSON.stringify({
                    method: 'turn/completed',
                    params: { threadId: 't', turn: { id: 'turn', status: 'completed' } },
                  }) + '\n',
                ),
              ),
            );
        },
        onData: (listener) => {
          data = listener;
          return () => {};
        },
        onClose: () => () => {},
        stop: async () => ({ kind: 'supervisor-tree-empty', epoch: 1, containmentId: 'job' }),
        session: { id: harness === 'codex' ? 't' : 's' },
        saveSession: async () => {},
        kimiConfiguration: { modelConfigId: 'model', effortConfigId: 'thinking' },
      }),
    };
    const backend = new NativeProcessBackend(host);
    backend.launch(
      'r',
      {
        epoch: 1,
        bindingId: 'b',
        mode: 'run',
        charterHash: 'hash',
        charter: { purpose: 'frozen' },
        request: { summary: 'task' },
        config: {
          harness,
          charterHash: 'hash',
          modelId: 'm',
          effort: 'off',
          workspace: 'E:/isolated',
        },
      },
      (e) => frames.push(e),
      (e) => exits.push(e),
    );
    await tick();
    await tick();
    expect(frames.map((x) => x.kind)).toEqual(['accepted', 'terminal']);
    expect(exits).toHaveLength(1);
    expect(exits[0].code).toBe(0);
    if (harness === 'codex') {
      const resume = commands.find((x) => x.method === 'thread/resume');
      expect(resume.params.developerInstructions).toContain('frozen');
      expect(resume.params.developerInstructions).not.toBe('');
    }
    expect(
      commands.some((x) => x.method === (harness === 'codex' ? 'turn/start' : 'session/prompt')),
    ).toBe(true);
  }
});
it('legal failed and cancelled outcomes retain normal protocol exit code', async () => {
  for (const stopReason of ['error', 'aborted']) {
    const f = fixture();
    f.launch();
    await tick();
    f.emit({ type: 'message_end', message: { role: 'assistant', stopReason } });
    f.emit({ type: 'agent_settled' });
    await tick();
    expect(f.frames.at(-1).outcome).toBe(stopReason === 'error' ? 'failed' : 'cancelled');
    expect(f.exits[0].code).toBe(0);
    expect(f.broken()).toBe(0);
  }
});
it('late host startup after deadline is stopped and never prompted; hung stop is bounded unknown', async () => {
  let resolveHost: any,
    stops = 0,
    writes = 0;
  const exits: any[] = [];
  const host: SecureProcessHost = {
    start: () =>
      new Promise((resolve) => {
        resolveHost = resolve;
      }),
  };
  const backend = new NativeProcessBackend(host, 5, 5);
  backend.launch(
    'r',
    {
      epoch: 1,
      bindingId: 'b',
      mode: 'run',
      charterHash: 'hash',
      charter: { purpose: 'frozen' },
      config: { harness: 'pi' },
    },
    () => {},
    (e) => exits.push(e),
  );
  await new Promise((r) => setTimeout(r, 15));
  expect(exits).toHaveLength(1);
  expect(exits[0].stop.kind).toBe('unknown');
  expect(() =>
    backend.launch(
      'r',
      { epoch: 2, bindingId: 'b', mode: 'run', config: { harness: 'pi' } },
      () => {},
      () => {},
    ),
  ).toThrow('NATIVE_LAUNCH_INVALID');
  resolveHost({
    write: async () => {
      writes++;
    },
    onData: () => () => {},
    onClose: () => () => {},
    saveSession: async () => {},
    stop: () => {
      stops++;
      return new Promise(() => {});
    },
  });
  await new Promise((r) => setTimeout(r, 15));
  expect(stops).toBe(1);
  expect(writes).toBe(0);
  expect(exits).toHaveLength(1);
  await backend.stop();
});

it('missing persisted session refuses business execution without any native prompt', async () => {
  for (const session of [{}, { id: 'native-session' }]) {
    const f = fixture(undefined, session);
    f.launch();
    await tick();
    expect(f.commands).toEqual([]);
    expect(f.broken()).toBe(1);
    expect(f.exits[0].code).toBe(null);
  }
});

it('trusted first tool establishes acceptance before Core tool execution', async () => {
  const f = fixture(undefined, undefined, { holdPrompt: true });
  let called = false;
  f.launch({
    handleTool: () => {
      called = true;
      expect(f.frames.at(-1).kind).toBe('accepted');
    },
  });
  await tick();
  expect(f.frames).toEqual([]);
  await f.tool('route_context', 'first', {});
  expect(called).toBe(true);
  await f.backend.stop();
});
it('close after open response prevents session persistence', async () => {
  const f = fixture(undefined, undefined, { closeAfterState: true });
  f.launch();
  await tick();
  expect(f.sessions).toEqual([]);
  expect(f.commands.some((x) => x.type === 'prompt')).toBe(false);
});
it('save finishing after stop receives revoked guard and cannot start prompt', async () => {
  let finishSave: any, guard: any;
  const f = fixture(undefined, undefined, {
    save: async (_s: any, g: any) => {
      guard = g;
      await new Promise((resolve) => {
        finishSave = resolve;
      });
    },
  });
  f.launch();
  await tick();
  expect(guard.isCurrent()).toBe(true);
  await f.backend.stop();
  expect(guard.isCurrent()).toBe(false);
  finishSave();
  await tick();
  expect(f.commands.some((x) => x.type === 'prompt')).toBe(false);
  expect(f.exits).toHaveLength(1);
});
it('unknown containment remains available for later cleanup without rewriting Core exit', async () => {
  const proof: any = { kind: 'unknown', epoch: 1 };
  const f = fixture(proof);
  f.launch();
  await tick();
  f.close();
  await tick();
  expect(f.exits).toHaveLength(1);
  expect(f.stops()).toBe(1);
  proof.kind = 'supervisor-tree-empty';
  proof.containmentId = 'owned-job';
  await f.backend.stop();
  expect(f.stops()).toBe(2);
  expect(f.exits).toHaveLength(1);
  expect(f.exits[0].stop.kind).toBe('unknown');
  await f.backend.stop();
  expect(f.stops()).toBe(2);
});
