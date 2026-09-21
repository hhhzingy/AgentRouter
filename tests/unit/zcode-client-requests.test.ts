import { expect, it, vi } from 'vitest';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

it('响应官方 runtime preferences，不默认批准未知交互', async () => {
  const sent: any[] = [];
  const lifecycle = new ZcodeLifecycle({ write: async bytes => { sent.push(JSON.parse(bytes.toString())); }, onEvent: () => {}, onDisconnect: () => {} });
  lifecycle.accept(Buffer.from(JSON.stringify({ id: 'server-1', method: 'session/requestRuntimePreferences', params: {} }) + '\n'));
  lifecycle.accept(Buffer.from(JSON.stringify({ id: 'server-2', method: 'interaction/unknown', params: {} }) + '\n'));
  await Promise.resolve(); await Promise.resolve();
  expect(sent[0]).toEqual({ id: 'server-1', result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false } });
  expect(sent[1]).toMatchObject({ id: 'server-2', error: { code: -32601 } });
  lifecycle.disconnect();
});

it('保留安全的 Provider reason code，不把错误正文写入诊断', async () => {
  let lifecycle: ZcodeLifecycle;
  lifecycle = new ZcodeLifecycle({ write: async bytes => {
    const request = JSON.parse(bytes.toString());
    lifecycle.accept(Buffer.from(JSON.stringify({ id: request.id, error: { code: -32000, message: 'token secret', data: { code: 'provider.notInRegistry' } } }) + '\n'));
  }, onEvent: () => {}, onDisconnect: () => {} });
  await expect(lifecycle.listSessions()).rejects.toMatchObject({ code: 'ZCODE_PROVIDER_NOT_IN_REGISTRY' });
  lifecycle.disconnect();
});

it('serves provider runtime auth only after account overlay sync', async () => {
  const sent: any[] = [];
  let lifecycle: ZcodeLifecycle;
  const host = {
    probe: vi.fn(() => ({
      providerId: 'account:bigmodel-individual-coding-plan',
      modelId: 'GLM-5.3-Flash',
      accountIdentityHash: 'a'.repeat(64),
      credentialAvailable: true as const,
      credentialFileSha256: 'b'.repeat(64),
      builtinFileSha256: 'c'.repeat(64),
      basedOnZCodeBuiltinRevision: 'zcode-builtin:30:test',
    })),
    overlay: {
      revision: 'overlay-revision',
      basedOnZCodeBuiltinRevision: 'zcode-builtin:30:test',
      providers: { 'account:bigmodel-individual-coding-plan': {} },
      states: { 'account:bigmodel-individual-coding-plan': {} },
    },
    resolveRuntimeHeaders: vi.fn(async () => ({
      headersApplied: true as const,
      requestAuth: { apiKey: ['synthetic', 'runtime', 'secret'].join('-') },
    })),
    close: vi.fn(),
  };
  lifecycle = new ZcodeLifecycle({
    write: async (bytes) => {
      const message = JSON.parse(bytes.toString());
      sent.push(message);
      if (message.method === 'provider/updateAccountConfig')
        lifecycle.accept(
          Buffer.from(
            JSON.stringify({
              id: message.id,
              result: {
                receivedRevision: message.params.revision,
                providerCount: 1,
                status: 'received',
              },
            }) + '\n',
          ),
        );
      if (message.method === 'session/create')
        lifecycle.accept(
          Buffer.from(
            JSON.stringify({
              id: message.id,
              result: { session: { sessionId: 'session-1' }, eventSeq: 0 },
            }) + '\n',
          ),
        );
    },
    onEvent: () => {},
    onDisconnect: () => {},
  });
  await lifecycle.initialize();
  await lifecycle.attachExistingAccountHost(host, {
    workspacePath: 'C:\\work',
    workspaceKey: 'C:\\work',
  });
  await lifecycle.open({ workspacePath: 'C:\\work', workspaceKey: 'C:\\work' });
  lifecycle.accept(
    Buffer.from(
      JSON.stringify({
        id: 'server-runtime',
        method: 'interaction/requestProviderRuntimeHeaders',
        params: {
          requestId: 'request-1',
          sessionId: 'session-1',
          workspace: { workspacePath: 'C:\\work', workspaceKey: 'C:\\work' },
          modelSelection: {
            providerId: 'account:bigmodel-individual-coding-plan',
            modelId: 'GLM-5.3-Flash',
          },
          providerId: 'account:bigmodel-individual-coding-plan',
          accountAccess: {
            type: 'zhipu-account',
            accountType: 'bigmodel',
            mode: 'individual-coding-plan',
            entitled: true,
          },
          reason: 'model-request',
        },
      }) + '\n',
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  expect(host.resolveRuntimeHeaders).toHaveBeenCalledOnce();
  expect(sent).toContainEqual({
    id: 'server-runtime',
    result: {
      headersApplied: true,
      requestAuth: { apiKey: ['synthetic', 'runtime', 'secret'].join('-') },
    },
  });
  lifecycle.disconnect();
  expect(host.close).toHaveBeenCalledOnce();
});

it('cancellation fences a late runtime secret response', async () => {
  const sent: any[] = [];
  let resolveAuth!: (value: {
    headersApplied: true;
    requestAuth: { apiKey: string };
  }) => void;
  const host = {
    probe: () => ({
      providerId: 'account:bigmodel-individual-coding-plan',
      modelId: 'GLM-5.3-Flash',
      accountIdentityHash: 'a'.repeat(64),
      credentialAvailable: true as const,
      credentialFileSha256: 'b'.repeat(64),
      builtinFileSha256: 'c'.repeat(64),
      basedOnZCodeBuiltinRevision: 'zcode-builtin:30:test',
    }),
    overlay: {
      revision: 'overlay-revision',
      basedOnZCodeBuiltinRevision: 'zcode-builtin:30:test',
      providers: { 'account:bigmodel-individual-coding-plan': {} },
      states: { 'account:bigmodel-individual-coding-plan': {} },
    },
    resolveRuntimeHeaders: () =>
      new Promise<{
        headersApplied: true;
        requestAuth: { apiKey: string };
      }>((resolve) => {
        resolveAuth = resolve;
      }),
    close: () => {},
  };
  let lifecycle: ZcodeLifecycle;
  lifecycle = new ZcodeLifecycle({
    write: async (bytes) => {
      const message = JSON.parse(bytes.toString());
      sent.push(message);
      if (message.method === 'provider/updateAccountConfig')
        lifecycle.accept(
          Buffer.from(
            JSON.stringify({
              id: message.id,
              result: {
                receivedRevision: message.params.revision,
                providerCount: 1,
                status: 'received',
              },
            }) + '\n',
          ),
        );
      if (message.method === 'session/create')
        lifecycle.accept(
          Buffer.from(
            JSON.stringify({
              id: message.id,
              result: { session: { sessionId: 'session-1' }, eventSeq: 0 },
            }) + '\n',
          ),
        );
    },
    onEvent: () => {},
    onDisconnect: () => {},
  });
  await lifecycle.initialize();
  await lifecycle.attachExistingAccountHost(host, {
    workspacePath: 'C:\\work',
    workspaceKey: 'C:\\work',
  });
  await lifecycle.open({ workspacePath: 'C:\\work', workspaceKey: 'C:\\work' });
  const params = {
    requestId: 'request-cancel',
    sessionId: 'session-1',
    workspace: { workspacePath: 'C:\\work', workspaceKey: 'C:\\work' },
    modelSelection: {
      providerId: 'account:bigmodel-individual-coding-plan',
      modelId: 'GLM-5.3-Flash',
    },
    providerId: 'account:bigmodel-individual-coding-plan',
    accountAccess: {
      type: 'zhipu-account',
      accountType: 'bigmodel',
      mode: 'individual-coding-plan',
      entitled: true,
    },
    reason: 'model-request',
  };
  lifecycle.accept(
    Buffer.from(
      JSON.stringify({
        id: 'server-cancel',
        method: 'interaction/requestProviderRuntimeHeaders',
        params,
      }) + '\n',
    ),
  );
  lifecycle.accept(
    Buffer.from(
      JSON.stringify({
        method: 'interaction/providerRuntimeHeadersCancelled',
        params: {
          requestId: params.requestId,
          sessionId: params.sessionId,
          workspace: params.workspace,
        },
      }) + '\n',
    ),
  );
  resolveAuth({
    headersApplied: true,
    requestAuth: { apiKey: ['late', 'secret', 'must', 'not', 'be', 'sent'].join('-') },
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(sent.some((message) => message.id === 'server-cancel')).toBe(false);
  expect(JSON.stringify(sent)).not.toContain('late-secret-must-not-be-sent');
  lifecycle.disconnect();
});

it('deduplicates reannounced runtime-auth requests and replies to each protocol id', async () => {
  const sent: any[] = [];
  let resolveAuth!: (value: {
    headersApplied: true;
    requestAuth: { apiKey: string };
  }) => void;
  const host = {
    resolveRuntimeHeaders: vi.fn(
      () =>
        new Promise<{
          headersApplied: true;
          requestAuth: { apiKey: string };
        }>((resolve) => {
          resolveAuth = resolve;
        }),
    ),
    close: vi.fn(),
  };
  const lifecycle = new ZcodeLifecycle({
    write: async (bytes) => {
      sent.push(JSON.parse(bytes.toString()));
    },
    onEvent: () => {},
    onDisconnect: () => {},
  });
  const params = {
    requestId: 'request-reannounced',
    sessionId: 'session-1',
    workspace: { workspacePath: 'C:\\work', workspaceKey: 'C:\\work' },
    modelSelection: {
      providerId: 'account:bigmodel-individual-coding-plan',
      modelId: 'GLM-5.3-Flash',
    },
    providerId: 'account:bigmodel-individual-coding-plan',
    accountAccess: {
      type: 'zhipu-account',
      accountType: 'bigmodel',
      mode: 'individual-coding-plan',
      entitled: true,
    },
    reason: 'model-request',
  };
  Object.assign(lifecycle as any, {
    accountHost: host,
    accountWorkspace: params.workspace,
    sessionId: params.sessionId,
  });
  for (const id of ['server-reannounce-1', 'server-reannounce-2'])
    lifecycle.accept(
      Buffer.from(
        JSON.stringify({
          id,
          method: 'interaction/requestProviderRuntimeHeaders',
          params,
        }) + '\n',
      ),
    );
  expect(host.resolveRuntimeHeaders).toHaveBeenCalledOnce();
  resolveAuth({
    headersApplied: true,
    requestAuth: { apiKey: ['synthetic', 'reannounced', 'secret'].join('-') },
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(sent.map((message) => message.id).sort()).toEqual([
    'server-reannounce-1',
    'server-reannounce-2',
  ]);
  lifecycle.disconnect();
});

it('disconnect aborts pending runtime auth and fences its late response', async () => {
  const sent: any[] = [];
  let resolveAuth!: (value: {
    headersApplied: true;
    requestAuth: { apiKey: string };
  }) => void;
  let signal: AbortSignal | undefined;
  const host = {
    resolveRuntimeHeaders: vi.fn(
      (_request, expected) => {
        signal = expected.signal;
        return new Promise<{
          headersApplied: true;
          requestAuth: { apiKey: string };
        }>((resolve) => {
          resolveAuth = resolve;
        });
      },
    ),
    close: vi.fn(),
  };
  const lifecycle = new ZcodeLifecycle({
    write: async (bytes) => {
      sent.push(JSON.parse(bytes.toString()));
    },
    onEvent: () => {},
    onDisconnect: () => {},
  });
  const params = {
    requestId: 'request-disconnect',
    sessionId: 'session-1',
    workspace: { workspacePath: 'C:\\work', workspaceKey: 'C:\\work' },
    modelSelection: {
      providerId: 'account:bigmodel-individual-coding-plan',
      modelId: 'GLM-5.3-Flash',
    },
    providerId: 'account:bigmodel-individual-coding-plan',
    accountAccess: {
      type: 'zhipu-account',
      accountType: 'bigmodel',
      mode: 'individual-coding-plan',
      entitled: true,
    },
    reason: 'model-request',
  };
  Object.assign(lifecycle as any, {
    accountHost: host,
    accountWorkspace: params.workspace,
    sessionId: params.sessionId,
  });
  lifecycle.accept(
    Buffer.from(
      JSON.stringify({
        id: 'server-disconnect',
        method: 'interaction/requestProviderRuntimeHeaders',
        params,
      }) + '\n',
    ),
  );
  lifecycle.disconnect();
  expect(signal?.aborted).toBe(true);
  expect(host.close).toHaveBeenCalledOnce();
  resolveAuth({
    headersApplied: true,
    requestAuth: { apiKey: ['late', 'disconnect', 'secret'].join('-') },
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(sent).toEqual([]);
});
