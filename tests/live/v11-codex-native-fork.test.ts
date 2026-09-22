import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { NativeRpcPeer } from '../../packages/adapters/shared/rpc-peer.ts';
import { createCodexContextPort } from '../../packages/platform/codex-context-port.ts';

const enabled = process.env.AGENTROUTER_V11_CODEX_NATIVE_FORK === '1';
const dutHome = process.env.AGENTROUTER_V11_CODEX_FORK_HOME
  ? resolve(process.env.AGENTROUTER_V11_CODEX_FORK_HOME)
  : '';
const codex = process.env.AGENTROUTER_V11_CODEX_BIN ? resolve(process.env.AGENTROUTER_V11_CODEX_BIN) : '';

class CodexClient {
  private readonly child: ChildProcessWithoutNullStreams;
  readonly peer: NativeRpcPeer;
  constructor() {
    const codexHome = join(dutHome, '.codex');
    this.child = spawn(codex, ['app-server', '--stdio', '-c', 'features.shell_tool=false', '-c', 'web_search="disabled"'], {
      cwd: dutHome,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        HOME: dutHome,
        USERPROFILE: dutHome,
        CODEX_HOME: codexHome,
        PATH: join(dutHome, 'bin'),
        TEMP: join(dutHome, 'tmp'),
        TMP: join(dutHome, 'tmp'),
        AGENTROUTER_MANAGED_ROLE: '1',
      },
    });
    this.child.stderr.on('data', () => {});
    this.peer = new NativeRpcPeer({
      timeoutMs: 30_000,
      write: async (bytes) => { this.child.stdin.write(bytes); },
      onNotification: () => {},
      onRequest: async () => { throw Error('NATIVE_REQUEST_DENIED'); },
      onDisconnect: () => {},
    });
    this.child.stdout.on('data', (bytes) => this.peer.accept(bytes));
    this.child.once('close', () => this.peer.end());
  }
  async initialize() {
    await this.peer.request('initialize', { clientInfo: { name: 'agentrouter-codex-fork-probe', version: '1.0.0-dev.0' } });
    this.peer.notify('initialized', {});
  }
  async close() {
    this.peer.disconnect('PROBE_COMPLETE');
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const closed = new Promise<void>((resolveClose) => this.child.once('close', () => resolveClose()));
    this.child.kill();
    await closed;
  }
}

const volatile = /(^id$|id$|timestamp|createdAt|updatedAt|revision|epoch|path$|rollout|tokenUsage)/i;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (volatile.test(key) || item === undefined) continue;
    out[key] = stable(item);
  }
  return out;
}
const turnsDigest = (thread: any): string => createHash('sha256')
  .update(JSON.stringify(stable(Array.isArray(thread?.turns) ? thread.turns : [])))
  .digest('hex');

it.skipIf(!enabled)('Codex app-server thread/fork 保留完整可见 turns 且父子可 cold resume', { timeout: 90_000 }, async () => {
  expect(existsSync(codex)).toBe(true);
  expect(existsSync(join(dutHome, '.codex', 'auth.json'))).toBe(true);
  const first = new CodexClient();
  let sourceId = '';
  let childId = '';
  let expectedDigest = '';
  try {
    await first.initialize();
    const listed = await first.peer.request('thread/list', { limit: 100, sourceKinds: [] }) as any;
    for (const candidate of Array.isArray(listed?.data) ? listed.data : []) {
      if (typeof candidate?.id !== 'string') continue;
      try {
        const read = await first.peer.request('thread/read', { threadId: candidate.id, includeTurns: true }) as any;
        if (Array.isArray(read?.thread?.turns) && read.thread.turns.length > 0) {
          sourceId = candidate.id;
          expectedDigest = turnsDigest(read.thread);
          break;
        }
      } catch { /* 仅选择可读取的隔离历史，不输出错误或内容。 */ }
    }
    expect(sourceId, '隔离 Codex DUT 必须存在已完成历史 thread').not.toBe('');
  } finally {
    await first.close();
  }

  const port = createCodexContextPort({ codexBin: codex, budgetMs: 30_000 });
  const operationId = 'live-codex-native-fork';
  const forked = await port.nativeForkTarget!({
    harness: 'codex',
    sessionHome: dutHome,
    workspace: dutHome,
    sourceNativeSessionRef: sourceId,
    operationId,
    recordTargetCreated: (id) => { childId = id; },
  });
  expect(forked.confirmed).toBe(true);
  expect(forked.acceptedPayloadHash).toBe(expectedDigest);
  expect(forked.nativeSessionRef).toBe(childId);

  const second = new CodexClient();
  try {
    await second.initialize();
    const source = await second.peer.request('thread/resume', { threadId: sourceId }) as any;
    const child = await second.peer.request('thread/resume', { threadId: childId }) as any;
    expect(String(source?.thread?.id ?? '')).toBe(sourceId);
    expect(String(child?.thread?.id ?? '')).toBe(childId);
    expect(turnsDigest(source.thread)).toBe(expectedDigest);
    expect(turnsDigest(child.thread)).toBe(expectedDigest);
  } finally {
    await second.close();
  }

  const cold = await port.confirmNativeFork!({
    harness: 'codex',
    sessionHome: dutHome,
    workspace: dutHome,
    sourceNativeSessionRef: sourceId,
    nativeSessionRef: childId,
    operationId,
    expectedPayloadHash: expectedDigest,
  });
  expect(cold.confirmed).toBe(true);
});
