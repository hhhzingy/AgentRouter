import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NativeRpcPeer } from '../adapters/shared/rpc-peer.ts';
import type { TransferDriverPort } from '../core-service/context-transfer-engine.ts';

export interface CodexContextPortOptions {
  codexBin: string;
  budgetMs?: number;
}

class CodexContextClient {
  private readonly child: ChildProcessWithoutNullStreams;
  readonly peer: NativeRpcPeer;
  constructor(bin: string, home: string, cwd: string, budgetMs: number) {
    this.child = spawn(bin, ['app-server', '--stdio', '-c', 'features.shell_tool=false', '-c', 'web_search="disabled"'], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: join(home, '.codex'),
        PATH: join(home, 'bin'),
        TEMP: join(home, 'tmp'),
        TMP: join(home, 'tmp'),
        AGENTROUTER_MANAGED_ROLE: '1',
      },
    });
    this.child.stderr.on('data', () => {});
    this.peer = new NativeRpcPeer({
      timeoutMs: budgetMs,
      write: async (bytes) => { this.child.stdin.write(bytes); },
      onNotification: () => {},
      onRequest: async () => { throw Error('NATIVE_REQUEST_DENIED'); },
      onDisconnect: () => {},
    });
    this.child.stdout.on('data', (bytes) => this.peer.accept(bytes));
    this.child.once('close', () => this.peer.end());
  }
  async initialize() {
    await this.peer.request('initialize', { clientInfo: { name: 'agentrouter-context-transfer', version: '1.0.0-dev.0' } });
    this.peer.notify('initialized', {});
  }
  async close() {
    this.peer.disconnect('CONTEXT_PORT_COMPLETE');
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
const turnsHash = (thread: any): string => createHash('sha256')
  .update(JSON.stringify(stable(Array.isArray(thread?.turns) ? thread.turns : [])))
  .digest('hex');

export function createCodexContextPort(opts: CodexContextPortOptions): TransferDriverPort {
  const budgetMs = opts.budgetMs ?? 30_000;
  const homeOf = (value: string | null) => {
    if (!value) throw Error('CODEX_HOME_UNCONFIGURED');
    return value;
  };
  const withClient = async <T>(home: string, cwd: string, fn: (client: CodexContextClient) => Promise<T>) => {
    const client = new CodexContextClient(opts.codexBin, home, cwd, budgetMs);
    try { await client.initialize(); return await fn(client); }
    finally { await client.close(); }
  };
  return {
    async nativeForkTarget({ sourceNativeSessionRef, sessionHome, workspace, operationId, targetNativeSessionRef, recordTargetCreated }) {
      if (targetNativeSessionRef)
        return this.confirmNativeFork!({ harness: 'codex', sessionHome, workspace, sourceNativeSessionRef, nativeSessionRef: targetNativeSessionRef, operationId });
      const home = homeOf(sessionHome);
      return withClient(home, workspace || home, async (client) => {
        const source = await client.peer.request('thread/read', { threadId: sourceNativeSessionRef, includeTurns: true }) as any;
        const expected = turnsHash(source?.thread);
        let dispatched = false;
        try {
          dispatched = true;
          const forked = await client.peer.request('thread/fork', { threadId: sourceNativeSessionRef, excludeTurns: false }) as any;
          const child = String(forked?.thread?.id ?? '');
          if (!child || child === sourceNativeSessionRef) throw Error('CODEX_FORK_REF_INVALID');
          recordTargetCreated(child);
          if (forked?.thread?.forkedFromId !== sourceNativeSessionRef || turnsHash(forked.thread) !== expected)
            throw Error('CODEX_NATIVE_FORK_HISTORY_MISMATCH');
          const sourceAfter = await client.peer.request('thread/read', { threadId: sourceNativeSessionRef, includeTurns: true }) as any;
          if (turnsHash(sourceAfter?.thread) !== expected) throw Error('CODEX_NATIVE_FORK_SOURCE_MUTATED');
          return { nativeSessionRef: child, confirmed: true, acceptedPayloadHash: expected, nativeReceipt: 'codex:thread/fork:' + operationId };
        } catch (error) {
          if (dispatched && !String((error as Error)?.message ?? error).startsWith('CODEX_'))
            throw Error('CONTEXT_NATIVE_FORK_AMBIGUOUS_NO_RETRY');
          throw error;
        }
      });
    },
    async confirmNativeFork({ sourceNativeSessionRef, nativeSessionRef, sessionHome, workspace, operationId, expectedPayloadHash }) {
      try {
        const home = homeOf(sessionHome);
        return await withClient(home, workspace || home, async (client) => {
          const source = await client.peer.request('thread/read', { threadId: sourceNativeSessionRef, includeTurns: true }) as any;
          const child = await client.peer.request('thread/read', { threadId: nativeSessionRef, includeTurns: true }) as any;
          const sourceHash = turnsHash(source?.thread);
          const confirmed = child?.thread?.forkedFromId === sourceNativeSessionRef && turnsHash(child?.thread) === sourceHash &&
            (!expectedPayloadHash || expectedPayloadHash === sourceHash);
          return confirmed
            ? { nativeSessionRef, confirmed: true, acceptedPayloadHash: sourceHash, nativeReceipt: 'codex:cold-read:' + operationId }
            : { nativeSessionRef, confirmed: false };
        });
      } catch { return { nativeSessionRef, confirmed: false }; }
    },
    async exportContext() { throw Error('CODEX_CROSS_HARNESS_EXPORT_UNSUPPORTED'); },
    async initializeTarget() { throw Error('NOT_STARTED: CODEX_PORTABLE_INIT_UNSUPPORTED'); },
    async confirmTarget() { return { confirmed: false }; },
  };
}
