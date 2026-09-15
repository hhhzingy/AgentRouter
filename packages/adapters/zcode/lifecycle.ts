import { JsonLfDecoder } from '../../platform/framing.ts';
import { NativeRpcError } from '../shared/rpc-peer.ts';
/** ZCode Protocol 实验级生命周期(0.16.5 app-server)。
 * 帧形经真实往返确认:{id, method, params} 换行分帧;方法面自官方发行物提取。
 * 会话创建依赖已登录/已配置的 ZCode 实例(沙箱无凭据时挂起)——执行闭环未认证前不宣称可用。 */
export interface ZcodeLifecycleOptions {
  write: (bytes: Buffer) => Promise<void>;
  onEvent: (event: { type: string; payload?: unknown; runId?: string; threadId?: string; turnId?: string; text?: string; outcome?: string }) => void;
  onDisconnect: (reason: string) => void;
  timeoutMs?: number;
}
export class ZcodeLifecycle {
  private decoder = new JsonLfDecoder();
  private closed = false;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private notifications = new Map<string, (params: unknown) => void>();
  private sessionId?: string;
  private eventFloor = 0;
  private active?: { runId: string; turnId?: string; seq: number };
  phase = 'CREATED';
  constructor(private readonly options: ZcodeLifecycleOptions) {}
  /** app-server 无独立 initialize 握手;连接即协议生效。 */
  async initialize(): Promise<void> {
    this.phase = 'INITIALIZE';
    this.notifications.set('session/event', (params) => this.sessionEvent(params));
  }
  async open(input: { workspacePath: string; workspaceKey: string }): Promise<{ id: string }> {
    if (this.closed) throw new NativeRpcError('RPC_CLOSED', 'none-proven');
    this.phase = 'OPEN';
    const reply = (await this.request('session/create', {
      workspace: { workspacePath: input.workspacePath, workspaceKey: input.workspaceKey },
    }));
    const id = this.snapshotSessionId(reply);
    this.sessionId = id;
    return { id };
  }
  async resume(sessionId: string): Promise<void> {
    this.phase = 'RESUME';
    const reply = await this.request('session/resume', { sessionId });
    if (this.snapshotSessionId(reply) !== sessionId)
      throw new NativeRpcError('ZCODE_SESSION_MISMATCH', 'possible');
    this.sessionId = sessionId;
  }
  private snapshotSessionId(value: unknown): string {
    const reply = value as { sessionId?: unknown; id?: unknown;
      session?: { sessionId?: unknown; id?: unknown }; projection?: { sessionId?: unknown } } | null;
    // 当前官方 Wbt/fse 形状为 session.sessionId；保留既有实验版响应兼容。
    const ids = [reply?.session?.sessionId, reply?.sessionId, reply?.session?.id,
      reply?.id, reply?.projection?.sessionId].filter(id => id !== undefined);
    if (!ids.length || ids.some(id => typeof id !== 'string' || !id))
      throw new NativeRpcError('ZCODE_SESSION_REJECTED', 'possible');
    if (new Set(ids).size !== 1) throw new NativeRpcError('ZCODE_SESSION_MISMATCH', 'possible');
    return ids[0] as string;
  }
  async subscribe(): Promise<void> {
    if (!this.sessionId || this.active) throw new NativeRpcError('ZCODE_SUBSCRIBE_STATE_INVALID', 'none-proven');
    const reply = await this.request('session/subscribe', {
      sessionId: this.sessionId, deliveryKind: 'desktop-continuous', includeSnapshot: false,
    }) as { sessionId?: string; eventSeq?: number; events?: unknown[] };
    if (reply?.sessionId !== this.sessionId || !Number.isSafeInteger(reply.eventSeq)
      || reply.eventSeq! < 0 || !Array.isArray(reply.events) || reply.events.length !== 0)
      throw new NativeRpcError('ZCODE_SUBSCRIBE_REJECTED', 'possible');
    this.eventFloor = reply.eventSeq!;
  }
  async start(input: { runId: string; text: string }): Promise<void> {
    if (!this.sessionId) throw new NativeRpcError('ZCODE_SESSION_REQUIRED', 'none-proven');
    if (this.active) throw new NativeRpcError('ZCODE_RUN_ACTIVE', 'none-proven');
    this.phase = 'START_PROMPT';
    this.active = { runId: input.runId, seq: this.eventFloor };
    await this.request('session/send', { sessionId: this.sessionId, content: input.text, inputId: input.runId });
  }
  private sessionEvent(value: unknown): void {
    if (!value || typeof value !== 'object' || this.closed || !this.active) return;
    const e = value as Record<string, any>;
    const p = e.payload;
    const active = this.active;
    if (e.sessionId !== this.sessionId || typeof e.turnId !== 'string' || !e.turnId
      || !Number.isSafeInteger(e.seq) || e.seq <= active.seq || !p || typeof p !== 'object'
      || (p.inputId !== undefined && p.inputId !== active.runId)) return;
    if (e.type === 'turn.started') {
      if (p.inputId !== active.runId || active.turnId) return;
      active.turnId = e.turnId;
      active.seq = e.seq;
      // 原生开始事件不是持久化 receipt；不附 acceptedPromptHash。
      this.options.onEvent({ type: 'RunAccepted', runId: active.runId, threadId: this.sessionId, turnId: e.turnId });
      return;
    }
    if (e.turnId !== active.turnId) return;
    active.seq = e.seq;
    const identity = { runId: active.runId, threadId: this.sessionId, turnId: e.turnId };
    if (e.type === 'model.streaming' && p.kind === 'text_delta' && typeof p.delta === 'string')
      this.options.onEvent({ type: 'TextDelta', ...identity, text: p.delta });
    if (e.type === 'tool.updated' && typeof p.toolCallId === 'string')
      this.options.onEvent({ type: 'ToolUpdate', ...identity,
        payload: { toolCallId: p.toolCallId, kind: p.kind, toolName: p.toolName } });
    if (e.type === 'permission.requested')
      this.options.onEvent({ type: 'PermissionRequested', ...identity,
        payload: { requestId: p.requestId, toolCallId: p.toolCallId, toolName: p.toolName } });
    const outcome = e.type === 'turn.failed' ? 'failed' : e.type === 'turn.completed'
      ? p.resultType === 'success' ? 'succeeded' : p.resultType === 'cancelled' ? 'cancelled' : undefined
      : undefined;
    if (outcome) {
      this.active = undefined;
      this.options.onEvent({ type: 'RunSettled', ...identity, outcome });
    }
  }
  async cancel(): Promise<void> {
    if (!this.sessionId) return;
    await this.request('session/stop', { sessionId: this.sessionId });
  }
  async listSessions(): Promise<unknown> {
    return this.request('session/list', {});
  }
  accept(bytes: Buffer): void {
    try {
      for (const frame of this.decoder.push(bytes)) {
        const m = frame as { id?: unknown; result?: unknown; error?: unknown; method?: unknown; params?: unknown };
        if (m.id !== undefined && (m.result !== undefined || m.error !== undefined)) {
          const key = String(m.id);
          const entry = this.pending.get(key);
          if (!entry) continue;
          this.pending.delete(key);
          clearTimeout(entry.timer);
          if (m.error) entry.reject(new NativeRpcError('ZCODE_REQUEST_REJECTED', 'possible'));
          else entry.resolve(m.result);
        } else if (typeof m.method === 'string') {
          this.notifications.get(m.method)?.(m.params);
        }
      }
    } catch {
      this.disconnect('ZCODE_INVALID_FRAME');
    }
  }
  disconnect(reason = 'ZCODE_DISCONNECTED'): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new NativeRpcError(reason, 'possible'));
    }
    this.pending.clear();
    this.options.onDisconnect(reason);
  }
  private request(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new NativeRpcError('RPC_CLOSED', 'none-proven'));
    const id = 'z' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const text = JSON.stringify({ id, method, params });
    if (Buffer.byteLength(text) > 262144) return Promise.reject(new NativeRpcError('RPC_REQUEST_INVALID', 'none-proven'));
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => this.disconnect('RPC_TIMEOUT'), this.options.timeoutMs ?? 30000);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      void Promise.resolve()
        .then(() => this.options.write(Buffer.from(text + '\n')))
        .catch(() => this.disconnect('ZCODE_TRANSPORT_FAILED'));
    });
  }
}
