import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createZcodeContextPort } from '../../packages/platform/zcode-context-port.ts';

const enabled = process.env.AGENTROUTER_V11_ZCODE_NATIVE_FORK === '1';
const runtime = 'E:/software/ZCode/resources/glm/zcode.cjs';
const builtinProviderConfig = 'E:/software/ZCode/resources/config/provider/zcode-builtin.json';
const dutHome = process.env.AGENTROUTER_V11_ZCODE_FORK_HOME
  ? resolve(process.env.AGENTROUTER_V11_ZCODE_FORK_HOME)
  : '';

class RpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, { method: string; resolve: (value: any) => void; reject: (error: Error) => void }>();
  private seq = 0;
  private buffer = '';
  private stderr = '';
  private nonProtocolStdout = '';

  constructor(cwd: string) {
    this.child = spawn(process.execPath, [runtime, 'app-server'], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        HOME: dutHome,
        USERPROFILE: dutHome,
        APPDATA: join(dutHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(dutHome, 'AppData', 'Local'),
        XDG_CONFIG_HOME: join(dutHome, '.config'),
        TEMP: join(dutHome, 'tmp'),
        TMP: join(dutHome, 'tmp'),
        PATH: '',
        AGENTROUTER_MANAGED_ROLE: '1',
        ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: builtinProviderConfig,
        ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(dutHome, '.zcode', 'v2', 'provider_config.json'),
      },
    });
    this.child.stderr.on('data', (bytes) => { this.stderr = (this.stderr + bytes.toString()).slice(-65_536); });
    this.child.stdout.on('data', (bytes) => this.accept(bytes.toString()));
    this.child.once('close', (code) => {
      const diagnostics = this.stderr + '\n' + this.nonProtocolStdout;
      const stderrClass = /appData/i.test(diagnostics) ? 'APPDATA'
        : /database|sqlite|locked/i.test(diagnostics) ? 'DATABASE'
          : /model config/i.test(diagnostics) ? 'MODEL_CONFIG'
            : /permission|access denied|EPERM|EACCES/i.test(diagnostics) ? 'PERMISSION'
              : /module not found|ERR_MODULE_NOT_FOUND/i.test(diagnostics) ? 'MODULE'
                : /ENOENT/i.test(diagnostics) ? 'ENOENT'
                  : /ERR_INVALID_ARG_TYPE/i.test(diagnostics) ? 'INVALID_ARG'
                    : /TypeError/i.test(diagnostics) ? 'TYPE_ERROR'
                      : /ReferenceError/i.test(diagnostics) ? 'REFERENCE_ERROR'
                        : /SyntaxError/i.test(diagnostics) ? 'SYNTAX_ERROR'
                          : /unknown (?:option|command)/i.test(diagnostics) ? 'UNKNOWN_COMMAND'
                            : 'OTHER';
      for (const entry of this.pending.values()) entry.reject(Error('ZCODE_EXITED_' + String(code ?? 'SIGNAL') + '_' + stderrClass + '_AFTER_' + entry.method.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()));
      this.pending.clear();
    });
  }

  private accept(text: string) {
    this.buffer += text;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      let frame: any;
      try { frame = JSON.parse(line); } catch {
        this.nonProtocolStdout = (this.nonProtocolStdout + line + '\n').slice(-65_536);
        continue;
      }
      if (frame.id !== undefined && typeof frame.method === 'string') {
        const result = frame.method === 'session/requestRuntimePreferences'
          ? { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false }
          : { decision: 'deny', reason: 'native fork probe' };
        this.child.stdin.write(JSON.stringify({ id: frame.id, result }) + '\n');
        continue;
      }
      const entry = this.pending.get(String(frame.id));
      if (!entry) continue;
      this.pending.delete(String(frame.id));
      if (frame.error) {
        const rawCode = frame.error?.data?.code ?? frame.error?.code;
        const safeCode = String(rawCode ?? 'REJECTED').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80);
        entry.reject(Error('ZCODE_' + entry.method.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase() + '_' + safeCode));
      }
      else entry.resolve(frame.result);
    }
  }

  request(method: string, params: unknown): Promise<any> {
    const id = `fork-${++this.seq}`;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(Error('ZCODE_TIMEOUT'));
      }, 30_000);
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolvePromise(value); },
        reject: (error) => { clearTimeout(timer); rejectPromise(error); },
      });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const closed = new Promise<void>((resolveClose) => this.child.once('close', () => resolveClose()));
    this.child.kill();
    await closed;
  }
}

function sessionId(value: any): string {
  const id = value?.forkedSessionId ?? value?.session?.sessionId ?? value?.sessionId;
  if (typeof id !== 'string' || !id) throw Error('ZCODE_SESSION_ID_MISSING');
  return id;
}

const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

function messagesOf(value: any): any[] {
  return Array.isArray(value) ? value : Array.isArray(value?.messages) ? value.messages : [];
}

function sourceMessageIds(value: any): string[] {
  return messagesOf(value).map((message) => String(message?.info?.id ?? message?.id ?? ''));
}

function visibleTranscript(value: any): unknown[] {
  return messagesOf(value)
    .filter((message) => message?.info?.visibility !== 'model-only' &&
      message?.info?.semantics?.transcriptVisibility !== 'hidden')
    .map((message) => ({
      role: message?.info?.role ?? message?.role,
      parts: (Array.isArray(message?.parts) ? message.parts : [])
        .filter((part: any) => part?.timelineType !== 'session_fork')
        .map((part: any) => ({
          type: part?.type,
          text: part?.text,
          state: part?.state?.status,
          display: part?.display,
          timelineType: part?.timelineType,
        })),
    }))
    .filter((message) => message.parts.length > 0);
}

it.skipIf(!enabled)('ZCode 0.16.9 native fork 不改写源工作区且子会话可 cold resume', { timeout: 90_000 }, async () => {
  expect(existsSync(runtime)).toBe(true);
  expect(existsSync(dutHome)).toBe(true);
  expect(existsSync(builtinProviderConfig)).toBe(true);
  expect(existsSync(join(dutHome, '.zcode', 'v2', 'provider_config.json'))).toBe(true);
  const runRoot = resolve(dutHome, '../../..');
  const workspace = join(runRoot, 'workspace');
  expect(existsSync(workspace)).toBe(true);
  const sentinel = join(workspace, `.agentrouter-fork-probe-${randomUUID()}.tmp`);

  const first = new RpcClient(workspace);
  let sourceId = '';
  let forkedId = '';
  let sourceBefore: any;
  let sentinelBeforeFork = '';
  try {
    const listed = await first.request('session/list', {});
    const sessions = Array.isArray(listed?.sessions) ? listed.sessions : [];
    for (const candidate of sessions) {
      const candidateId = sessionId(candidate);
      try {
        await first.request('session/resume', { sessionId: candidateId });
        const candidateMessages = await first.request('session/messages', { sessionId: candidateId });
        const messages = Array.isArray(candidateMessages) ? candidateMessages : candidateMessages?.messages;
        if (Array.isArray(messages) && messages.length > 0) { sourceId = candidateId; break; }
      } catch { /* 跳过不可恢复的历史条目，不泄漏原生错误正文 */ }
    }
    expect(sourceId, '隔离 PASS run 必须包含可见历史源会话').not.toBe('');
    sourceBefore = await first.request('session/messages', { sessionId: sourceId });
    writeFileSync(sentinel, 'before-fork-' + randomUUID() + '\n');
    sentinelBeforeFork = digest(readFileSync(sentinel));
  } finally {
    await first.close();
  }

  // 正式端口执行首次 fork；独立原始客户端只负责之后的只读核验。
  const port = createZcodeContextPort({
    zcodeCli: runtime,
    providerEnv: { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: builtinProviderConfig },
    budgetMs: 30_000,
  });
  let adapterChild = '';
  const operationId = 'live-' + randomUUID();
  const fork = await port.nativeForkTarget!({
    harness: 'zcode',
    sessionHome: dutHome,
    workspace,
    sourceNativeSessionRef: sourceId,
    operationId,
    recordTargetCreated: (id) => { adapterChild = id; },
  });
  expect(fork.confirmed).toBe(true);
  expect(adapterChild).toBe(fork.nativeSessionRef);
  expect(fork.acceptedPayloadHash).toMatch(/^[0-9a-f]{64}$/);
  forkedId = adapterChild;

  const second = new RpcClient(workspace);
  try {
    expect(sessionId(await second.request('session/resume', { sessionId: sourceId }))).toBe(sourceId);
    expect(sessionId(await second.request('session/resume', { sessionId: forkedId }))).toBe(forkedId);
    const sourceAfter = await second.request('session/messages', { sessionId: sourceId });
    const forkedMessages = await second.request('session/messages', { sessionId: forkedId });
    expect(sourceMessageIds(sourceAfter)).toEqual(sourceMessageIds(sourceBefore));
    expect(visibleTranscript(sourceAfter)).toEqual(visibleTranscript(sourceBefore));
    expect(visibleTranscript(forkedMessages)).toEqual(visibleTranscript(sourceBefore));
    expect(digest(readFileSync(sentinel))).toBe(sentinelBeforeFork);
  } finally {
    await second.close();
  }
  const cold = await port.confirmNativeFork!({
    harness: 'zcode',
    sessionHome: dutHome,
    workspace,
    sourceNativeSessionRef: sourceId,
    nativeSessionRef: adapterChild,
    operationId,
    expectedPayloadHash: fork.acceptedPayloadHash,
  });
  expect(cold.confirmed).toBe(true);
  if (existsSync(sentinel)) unlinkSync(sentinel);
});
