import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLabeledCredential } from '../security/labeled-credential.ts';
import type { TransferDriverPort } from '../core-service/context-transfer-engine.ts';

/** WN01/CT-01:ZCode 0.16.5 冷协议 Transfer 端口(经真实往返探针确认可用):
 * - export = 冷进程 session/resume 读取可见 messages(不调用模型;messages 是官方会话快照)。
 * - initialize = 新 session + seed 提示 + 等 turn.terminal;按 operationId 幂等(重复调用
 *   同 opId 时先 resume 已登记的目标会话而不是再建一个)。
 * - confirm = 冷 resume 目标 id 成功即视为存在(不发消息)。
 * spawn/连接失败抛 Error('NOT_STARTED')(确定无副作用);发出后置结果未知抛其他信息,由引擎保持不确定。 */

interface ZcodePortOptions {
  zcodeCli: string;
  /** 百炼标签凭据文件(仅 initialize 需要模型时使用)。 */
  credentialFile?: string;
  /** 单次协议操作预算(毫秒);超时不追杀未知副作用,转入不确定保持。 */
  budgetMs?: number;
  /** 仅含非秘密 provider 配置文件路径；认证仍留在隔离 HOME。 */
  providerEnv?: Readonly<Record<string, string>>;
}

interface SessionSnapshot {
  sessionId: string;
  messages: Record<string, unknown>[];
  contextWindow: number | null;
  contextUsed: number | null;
}

function visibleText(messages: SessionSnapshot['messages']): { text: string; truncated: boolean } {
  const out: string[] = [];
  let truncated = false;
  for (const m of messages ?? []) {
    const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    const raw = m as Record<string, unknown>;
    const list = (Array.isArray(raw.parts) ? raw.parts : Array.isArray(raw.content) ? raw.content : Array.isArray(raw.text) ? raw.text : []) as Record<string, unknown>[];
    let sawNonText = false;
    for (const part of list) {
      if (typeof part === 'string') { out.push(role + ': ' + part); continue; }
      if ((part.type === 'text' || part.type === undefined) && typeof (part.text ?? part.delta) === 'string') out.push(role + ': ' + String(part.text ?? part.delta));
      else sawNonText = true;
    }
    if (typeof raw.text === 'string') out.push(role + ': ' + raw.text);
    if (sawNonText) truncated = true; // 非文本 part(工具/推理附件)不导出 → 如实标 truncated
  }
  return { text: out.join('\n'), truncated };
}

class ZcodeSessionClient {
  private child: ChildProcessWithoutNullStreams;
  private seq = 0;
  private pending = new Map<string, { method: string; res: (v: unknown) => void; rej: (e: Error) => void }>();
  private buffer = '';
  constructor(private readonly zcodeCli: string, private readonly sessionHome: string, cwd: string, apiKey: string | null, private readonly budgetMs: number, providerEnv: Readonly<Record<string, string>> = {}) {
    this.child = spawn(process.execPath, [zcodeCli, 'app-server'], {
      cwd,
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: join(sessionHome, 'bin'),
        USERPROFILE: sessionHome,
        HOME: sessionHome,
        APPDATA: join(sessionHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(sessionHome, 'AppData', 'Local'),
        XDG_CONFIG_HOME: join(sessionHome, '.config'),
        TEMP: join(sessionHome, 'tmp'),
        TMP: join(sessionHome, 'tmp'),
        AGENTROUTER_MANAGED_ROLE: '1',
        ...providerEnv,
        ...(apiKey ? { ZCODE_API_KEY: apiKey } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (d) => this.onData(String(d)));
    this.child.on('close', () => { for (const p of this.pending.values()) p.rej(Error('NOT_STARTED')); this.pending.clear(); });
  }
  private onData(text: string) {
    this.buffer += text;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, any>;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.method === 'session/requestRuntimePreferences' && msg.id !== undefined) {
        this.child.stdin.write(JSON.stringify({ id: msg.id, result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false } }) + '\n');
        continue;
      }
      if (msg.method === 'interaction/requestPermission' && msg.id !== undefined) {
        const deny = (msg.params?.options ?? []).find((o: any) => o.kind === 'deny');
        this.child.stdin.write(JSON.stringify({ id: msg.id, result: deny?.response ?? { decision: 'deny', reason: 'context port' } }) + '\n');
        continue;
      }
      // 只读迁移端口不应阻塞在新增的 server request；对未知交互统一拒绝，绝不自动批准。
      if (typeof msg.method === 'string' && msg.id !== undefined) {
        this.child.stdin.write(JSON.stringify({ id: msg.id, result: { decision: 'deny', reason: 'context port' } }) + '\n');
        continue;
      }
      if (typeof msg.id === 'string' && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          const detail = String(msg.error?.data?.message ?? msg.error?.data ?? msg.error?.message ?? '');
          const errorClass = /not found/i.test(detail) ? 'NOT_FOUND'
            : /workspace/i.test(detail) ? 'WORKSPACE'
              : /revision|epoch/i.test(detail) ? 'REVISION'
                : /database|sqlite|locked/i.test(detail) ? 'DATABASE'
                  : /row|conversation/i.test(detail) ? 'CONVERSATION'
                    : /invalid state/i.test(detail) ? 'INVALID_STATE'
                      : /cannot read|undefined|null/i.test(detail) ? 'TYPE_ERROR'
                        : /session/i.test(detail) ? 'SESSION'
                          : /permission|access/i.test(detail) ? 'PERMISSION'
                            : 'OTHER';
          p.rej(Error('ZCODE_' + p.method.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase() + '_' + String(msg.error?.data?.code ?? msg.error?.code ?? 'REQUEST_REJECTED') + '_' + errorClass));
        }
        else p.res(msg.result);
      }
    }
  }
  request(method: string, params: unknown): Promise<any> {
    const id = 'ctx' + ++this.seq;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(Error('ZCODE_TIMEOUT_AFTER_SEND')); }, this.budgetMs);
      this.pending.set(id, {
        method,
        res: (v) => { clearTimeout(timer); res(v); },
        rej: (e) => { clearTimeout(timer); rej(e); },
      });
      try { this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); rej(Error('NOT_STARTED')); }
    });
  }
  async close() { try { this.child.kill(); } catch {} }
}

async function withClient<T>(opts: { zcodeCli: string; sessionHome: string; cwd: string; apiKey: string | null; budgetMs: number; providerEnv?: Readonly<Record<string, string>> }, fn: (c: ZcodeSessionClient) => Promise<T>): Promise<T> {
  const c = new ZcodeSessionClient(opts.zcodeCli, opts.sessionHome, opts.cwd, opts.apiKey, opts.budgetMs, opts.providerEnv);
  try { return await fn(c); } finally { await c.close(); }
}

function parseSnapshot(result: any): SessionSnapshot {
  const r = typeof result === 'string' ? JSON.parse(result) : result;
  const session = r?.session ?? {};
  const projection = r?.projection ?? {};
  return {
    sessionId: String(session.sessionId ?? ''),
    messages: Array.isArray(r?.messages) ? r.messages : [],
    contextWindow: Number.isFinite(projection.contextWindow) ? Number(projection.contextWindow) : null,
    contextUsed: Number.isFinite(projection.contextUsed) ? Number(projection.contextUsed) : null,
  };
}

function readCredential(file: string | undefined): { apiKey: string; maxTokens: number } | null {
  if (!file || !existsSync(file)) return null;
  try {
    const cred = parseLabeledCredential(readFileSync(file, 'utf8'));
    return { apiKey: cred.apiKey, maxTokens: 8000 };
  } catch { return null; }
}

const VOLATILE_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'timestamp', 'issuedAt', 'revision', 'logEpoch']);
function stableVisibleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableVisibleValue);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (VOLATILE_KEYS.has(key) || /id$/i.test(key) || /(timestamp|timeMs|durationMs)$/i.test(key) || input[key] === undefined) continue;
    out[key] = stableVisibleValue(input[key]);
  }
  return out;
}
function visibleTranscript(messages: Record<string, any>[]): unknown[] {
  return messages
    .filter((message) => message?.info?.visibility !== 'model-only' && message?.info?.semantics?.transcriptVisibility !== 'hidden')
    .map((message) => ({
      role: message?.info?.role ?? message?.role,
      parts: (Array.isArray(message?.parts) ? message.parts : [])
        .filter((part: any) => part?.timelineType !== 'session_fork')
        .map(stableVisibleValue),
    }))
    .filter((message) => message.parts.length > 0);
}
const transcriptHash = (messages: Record<string, any>[]): string =>
  createHash('sha256').update(JSON.stringify(visibleTranscript(messages))).digest('hex');
function messagesResult(value: any): Record<string, any>[] {
  return (Array.isArray(value) ? value : Array.isArray(value?.messages) ? value.messages : []) as Record<string, any>[];
}
function nativeSessionId(value: any): string {
  const id = value?.forkedSessionId ?? value?.session?.sessionId ?? value?.sessionId;
  if (typeof id !== 'string' || !id) throw Error('ZCODE_SESSION_ID_MISSING');
  return id;
}

export function createZcodeContextPort(opts: ZcodePortOptions): TransferDriverPort {
  const budgetMs = opts.budgetMs ?? 45000;
  const homeOf = (sessionHome: string | null): string => {
    if (!sessionHome) throw Error('ZCODE_HOME_UNCONFIGURED');
    return sessionHome;
  };
  const idempotency = new Map<string, string>(); // operationId → target native session id
  const clientOpts = (sessionHome: string, apiKey: string | null, multiplier = 1, cwd = sessionHome) => ({
    zcodeCli: opts.zcodeCli,
    sessionHome,
    cwd,
    apiKey,
    budgetMs: budgetMs * multiplier,
    providerEnv: opts.providerEnv?.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE
      ? {
          ...opts.providerEnv,
          ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(sessionHome, '.zcode', 'v2', 'provider_config.json'),
        }
      : opts.providerEnv,
  });
  return {
    async nativeForkTarget({ sourceNativeSessionRef, sessionHome, workspace, operationId, targetNativeSessionRef, recordTargetCreated }) {
      const home = homeOf(sessionHome);
      const known = targetNativeSessionRef ?? idempotency.get(operationId);
      if (known) return this.confirmNativeFork!({ harness: 'zcode', sessionHome, sourceNativeSessionRef, nativeSessionRef: known, operationId });
      return withClient(clientOpts(home, null, 1, workspace || home), async (c) => {
        await c.request('session/resume', { sessionId: sourceNativeSessionRef });
        const sourceBefore = messagesResult(await c.request('session/messages', { sessionId: sourceNativeSessionRef }));
        const rowsResult = await c.request('v4/conversation/rowsRange', {
          sessionId: sourceNativeSessionRef,
          clientMode: 'desktop-continuous',
          limit: 200,
        });
        const rows = Array.isArray(rowsResult?.rows) ? rowsResult.rows : [];
        const target = [...rows].reverse().find((row: any) => row?.kind === 'assistantText' && row?.actions?.canFork === true &&
          Number.isSafeInteger(row?.rowId) && typeof row?.entityId === 'string' && row.entityId);
        if (!target) throw Error('NOT_STARTED: ZCODE_FORK_TARGET_UNAVAILABLE');
        const reply = await c.request('v4/command', {
          commandId: 'agentrouter-native-fork-' + operationId,
          clientId: 'agentrouter-context-transfer',
          sessionId: sourceNativeSessionRef,
          baseRevision: rowsResult.atRevision,
          baseLogEpoch: rowsResult.atLogEpoch,
          type: 'forkAssistant',
          payload: { target: { rowId: target.rowId, entityId: target.entityId } },
          issuedAt: Date.now(),
        });
        const ack = reply?.ack ?? reply;
        if (!['accepted', 'duplicate'].includes(ack?.status)) throw Error('ZCODE_NATIVE_FORK_REJECTED');
        const child = nativeSessionId(ack?.result);
        idempotency.set(operationId, child);
        recordTargetCreated(child);
        const sourceAfter = messagesResult(await c.request('session/messages', { sessionId: sourceNativeSessionRef }));
        const childMessages = messagesResult(await c.request('session/messages', { sessionId: child }));
        const beforeHash = transcriptHash(sourceBefore);
        if (transcriptHash(sourceAfter) !== beforeHash) throw Error('ZCODE_NATIVE_FORK_SOURCE_HISTORY_MISMATCH');
        if (transcriptHash(childMessages) !== beforeHash) throw Error('ZCODE_NATIVE_FORK_CHILD_HISTORY_MISMATCH');
        return { nativeSessionRef: child, confirmed: true, acceptedPayloadHash: beforeHash, nativeReceipt: 'zcode:v4/forkAssistant:' + operationId };
      });
    },
    async confirmNativeFork({ sourceNativeSessionRef, nativeSessionRef, sessionHome, workspace, operationId, expectedPayloadHash }) {
      try {
        return await withClient(clientOpts(homeOf(sessionHome), null, 1, workspace || homeOf(sessionHome)), async (c) => {
          await c.request('session/resume', { sessionId: sourceNativeSessionRef });
          await c.request('session/resume', { sessionId: nativeSessionRef });
          const sourceHash = transcriptHash(messagesResult(await c.request('session/messages', { sessionId: sourceNativeSessionRef })));
          const childHash = transcriptHash(messagesResult(await c.request('session/messages', { sessionId: nativeSessionRef })));
          const confirmed = sourceHash === childHash && (!expectedPayloadHash || expectedPayloadHash === sourceHash);
          return confirmed
            ? { nativeSessionRef, confirmed: true, acceptedPayloadHash: sourceHash, nativeReceipt: 'zcode:cold-resume:' + operationId }
            : { nativeSessionRef, confirmed: false };
        });
      } catch { return { nativeSessionRef, confirmed: false }; }
    },
    async exportContext({ nativeSessionRef, sessionHome, workspace }) {
      const home = homeOf(sessionHome);
      const snap = await withClient(clientOpts(home, null, 1, workspace || home), async (c) => {
        return parseSnapshot(await c.request('session/resume', { sessionId: nativeSessionRef }));
      });
      const { text, truncated } = visibleText(snap.messages);
      if (!snap.sessionId) throw Error('ZCODE_RESUME_EMPTY');
      return { text, truncated };
    },
    async sourceCapacity({ nativeSessionRef, sessionHome, workspace }) {
      try {
        const home = homeOf(sessionHome);
        const snap = await withClient(clientOpts(home, null, 1, workspace || home), async (c) => {
          return parseSnapshot(await c.request('session/resume', { sessionId: nativeSessionRef }));
        });
        return { windowTokens: snap.contextWindow, usageTokens: snap.contextUsed };
      } catch { return { windowTokens: null, usageTokens: null }; }
    },
    async targetWindowTokens({ sessionHome, workspace, operationId, targetNativeSessionRef, recordTargetCreated }) {
      try {
        const home = homeOf(sessionHome);
        return await withClient(clientOpts(home, null, 1, workspace || home), async (c) => {
          const existing = targetNativeSessionRef ?? idempotency.get(operationId);
          const snap = existing
            ? parseSnapshot(await c.request('session/resume', { sessionId: existing }))
            : parseSnapshot(await c.request('session/create', { workspace: { workspacePath: workspace || (() => { throw Error('ZCODE_WORKSPACE_UNCONFIGURED'); })(), workspaceKey: 'ar-context-' + operationId } }));
          if (!snap.sessionId) throw Error('ZCODE_SESSION_CREATE_EMPTY');
          idempotency.set(operationId, snap.sessionId);
          if (!existing) recordTargetCreated(snap.sessionId);
          return snap.contextWindow;
        });
      } catch { return null; }
    },
    async initializeTarget({ seedText, sessionHome, workspace, operationId, expectedPayloadHash, targetNativeSessionRef, recordTargetCreated, recordInputDispatch }) {
      // 幂等:同 operationId 已登记目标则仅 confirm,不再创建。
      const known = targetNativeSessionRef ?? idempotency.get(operationId);
      if (known) {
        const ok = await this.confirmTarget({ harness: 'zcode', nativeSessionRef: known, sessionHome, operationId, expectedPayloadHash });
        if (ok.confirmed) return { nativeSessionRef: known, ...ok };
      }
      const cred = readCredential(opts.credentialFile);
      const home = homeOf(sessionHome);
      const target = await withClient(clientOpts(home, cred?.apiKey ?? null, 2, workspace || home), async (c) => {
        if (!workspace) throw Error('ZCODE_WORKSPACE_UNCONFIGURED');
        const sessionId = known ?? parseSnapshot(await c.request('session/create', { workspace: { workspacePath: workspace, workspaceKey: 'ar-context-' + operationId } })).sessionId;
        if (!sessionId) throw Error('ZCODE_SESSION_CREATE_EMPTY');
        idempotency.set(operationId, sessionId);
        if (!known) recordTargetCreated(sessionId);
        else await c.request('session/resume', { sessionId });
        await c.request('session/subscribe', { sessionId, deliveryKind: 'desktop-continuous', includeSnapshot: false });
        const marker = 'AGENTROUTER_CONTEXT_TRANSFER:' + operationId + ':' + expectedPayloadHash;
        recordInputDispatch();
        await c.request('session/send', { sessionId, content:
          marker + '\n以下是同一角色上一工作会话的可见历史(仅用户与助手文本;不含隐藏思维链)。理解后仅回复 READY,不要调用任何工具。\n' + seedText, inputId: 'ctxinit_' + operationId });
        // send 受理后才返回;withClient 在此之后才关进程。模型 READY 文本不是确认证据。
        return sessionId;
      });
      // 回执绑定“本次 operation + 特定 seed hash”，不能以 session exists 替代 seed accepted。
      return { nativeSessionRef: target, confirmed: true, acceptedPayloadHash: expectedPayloadHash, nativeReceipt: 'zcode:session/send:ctxinit_' + operationId };
    },
    async confirmTarget({ nativeSessionRef, sessionHome, workspace, operationId, expectedPayloadHash }) {
      try {
        const home = homeOf(sessionHome);
        const snap = await withClient(clientOpts(home, null, 1, workspace || home), async (c) => {
          const snap = parseSnapshot(await c.request('session/resume', { sessionId: nativeSessionRef }));
          if (!snap.sessionId) throw Error('no');
          return snap;
        });
        const marker = 'AGENTROUTER_CONTEXT_TRANSFER:' + operationId + ':' + expectedPayloadHash;
        // resume 必须能观察到带 operation/hash 的原生输入；仅会话存在不构成 INPUT_ACCEPTED 证据。
        const accepted = JSON.stringify(snap.messages).includes(marker);
        return accepted
          ? { confirmed: true, acceptedPayloadHash: expectedPayloadHash, nativeReceipt: 'zcode:history:' + createHash('sha256').update(marker).digest('hex') }
          : { confirmed: false };
      } catch { return { confirmed: false }; }
    },
  };
}
