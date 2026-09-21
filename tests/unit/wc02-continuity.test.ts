import { it, expect } from 'vitest';
import {
  NativeProcessBackend,
  type SecureProcessHost,
} from '../../packages/core-service/native-process-backend.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { zcodeDriver, builtInDrivers } from '../../packages/core-service/harness-drivers.ts';

// WC02:zcode 0.16.9 正式 cold resume 已接线，但真实 DUT 前仍为 IMPLEMENTED_UNVERIFIED；
// SH-05:runPrompt 不再硬编码限制工具集。

it('内置驱动 continuity 事实:zcode 0.16.9 为 SAME_SESSION_CONTINUOUS 但仍待真实验证', () => {
  const registry = builtInDrivers();
  for (const harness of registry.list()) {
    const rec = registry.capabilities(harness);
    void rec;
  }
  expect(zcodeDriver.continuity).toBe('SAME_SESSION_CONTINUOUS');
  expect(zcodeDriver.contextCapabilities?.native_resume).toBe('IMPLEMENTED_UNVERIFIED');
});

it('SH-05:zcode runPrompt 不再硬编码限制为 context/finish,工具以角色授权为准', () => {
  const prompt = (zcodeDriver as { runPrompt: (x: unknown) => string }).runPrompt({
    request: { summary: 's' },
    charter: { mission: 'm' },
    charterHash: 'h'.repeat(64),
  });
  expect(prompt).not.toContain('不要使用其他工具');
  expect(prompt).toContain('授权');
  expect(prompt).toContain('mcp__agentrouter-role__');
});

function backendFixture(driver: any, sessions: any[]) {
  let data: (b: Buffer) => void = () => {};
  let closeCb: () => void = () => {};
  const exits: any[] = [];
  const emit = (e: any) => data(Buffer.from(JSON.stringify(e) + '\n'));
  const host: SecureProcessHost = {
    start: async () => ({
      write: async (bytes) => {
        const c = JSON.parse(bytes.toString());
        if (c.method === 'hello') queueMicrotask(() => emit({ id: c.id, result: {} }));
      },
      onData: (f) => {
        data = f;
        return () => {
          data = () => {};
        };
      },
      onClose: (f) => {
        closeCb = f;
        return () => {};
      },
      stop: async () => ({ kind: 'supervisor-tree-empty', epoch: 1, containmentId: 'job' }),
      saveSession: async (s) => {
        sessions.push(s.id);
      },
    }),
  };
  const fakeLifecycle = (onEvent: (e: any) => void) => ({
    initialize: async () => {},
    open: async () => ({ id: 'fresh-' + (sessions.length + 1) }),
    start: async () => {
      onEvent({ type: 'RunAccepted', runId: 'r', threadId: 't', turnId: 'tn' });
      onEvent({ type: 'RunSettled', runId: 'r', threadId: 't', turnId: 'tn', outcome: 'succeeded' });
    },
    accept: () => {},
    disconnect: () => {},
  });
  const registry = { require: () => driver };
  const backend = new NativeProcessBackend(host, 120000, 10000, registry as never);
  const launchOnce = (roleSessionId: string) =>
    new Promise<void>((res) => {
      backend.launch(
        'run_' + roleSessionId + '_' + sessions.length,
        {
          epoch: 1,
          bindingId: 'b1',
          mode: 'run',
          charterHash: 'hash',
          charter: { purpose: 'frozen' },
          request: { summary: 't' },
          roleSessionId,
          config: { harness: 'fake', charterHash: 'hash', workspace: 'E:/w', sessionHome: 'E:/s' },
        } as never,
        () => {},
        () => res(),
        () => {},
      );
      queueMicrotask(() => {
        // lifecycle 在 backend 内部创建;这里通过写通道无法直接拿到,用事件注入代替:
      });
    });
  void closeCb;
  void emit;
  return { backend, launchOnce, fakeLifecycle };
}

it('WC02:连续性不支持的驱动,同 WorkSession 只保存首个 native ref(不暗换)', async () => {
  const sessions: any[] = [];
  const driver = {
    harness: 'fake',
    continuity: 'SESSION_CONTINUATION_UNSUPPORTED',
    supportsFreshSession: true,
    requiresSessionPath: false,
    processArgs: () => [],
    createLifecycle: ({ onEvent }: any) => ({
      initialize: async () => {},
      open: async () => ({ id: 'fresh-' + (sessions.length + 1) }),
      start: async () => {
        onEvent({ type: 'RunAccepted', runId: 'r', threadId: 't', turnId: 'tn' });
        onEvent({ type: 'RunSettled', runId: 'r', threadId: 't', turnId: 'tn', outcome: 'succeeded' });
      },
      accept: () => {},
      disconnect: () => {},
    }),
  };
  const { backend, launchOnce } = backendFixture(driver, sessions);
  void launchOnce;
  // 直接经 backend.launch 驱动两次同 WS run
  const run = (key: string) =>
    new Promise<void>((res) => {
      backend.launch(
        key,
        {
          epoch: 1,
          bindingId: 'b1',
          mode: 'run',
          charterHash: 'hash',
          charter: { purpose: 'frozen' },
          request: { summary: 't' },
          roleSessionId: 'ws-1',
          config: { harness: 'fake', charterHash: 'hash', workspace: 'E:/w', sessionHome: 'E:/s' },
        } as never,
        () => {},
        () => res(),
        () => {},
      );
    });
  await run('k1');
  await run('k2');
  // 第二次 run 的新鲜会话不覆盖 WS 引用:仍只有第一次的 ref 落库
  expect(sessions).toEqual(['fresh-1']);
  await backend.stop();
});

it('WC02:连续性正常的驱动,同 WS 各 run 引用照常保存', async () => {
  const sessions: any[] = [];
  const driver = {
    harness: 'fake',
    continuity: 'SAME_SESSION_CONTINUOUS',
    supportsFreshSession: true,
    requiresSessionPath: false,
    processArgs: () => [],
    createLifecycle: ({ onEvent }: any) => ({
      initialize: async () => {},
      open: async () => ({ id: 'cont-' + (sessions.length + 1) }),
      start: async () => {
        onEvent({ type: 'RunAccepted', runId: 'r', threadId: 't', turnId: 'tn' });
        onEvent({ type: 'RunSettled', runId: 'r', threadId: 't', turnId: 'tn', outcome: 'succeeded' });
      },
      accept: () => {},
      disconnect: () => {},
    }),
  };
  const { backend } = backendFixture(driver, sessions);
  const run = (key: string) =>
    new Promise<void>((res) => {
      backend.launch(
        key,
        {
          epoch: 1,
          bindingId: 'b1',
          mode: 'run',
          charterHash: 'hash',
          charter: { purpose: 'frozen' },
          request: { summary: 't' },
          roleSessionId: 'ws-1',
          config: { harness: 'fake', charterHash: 'hash', workspace: 'E:/w', sessionHome: 'E:/s' },
        } as never,
        () => {},
        () => res(),
        () => {},
      );
    });
  await run('k1');
  await run('k2');
  expect(sessions).toEqual(['cont-1', 'cont-2']);
  await backend.stop();
});
