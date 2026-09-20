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
  /** interaction/requestPermission 白名单决策:返回所选 option 的 response 原样回帧。 */
  onApproval?: (params: unknown) => { decision: string; reason?: string } | undefined;
}
export class ZcodeLifecycle {
  private decoder = new JsonLfDecoder();
  private closed = false;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private notifications = new Map<string, (params: unknown) => void>();
  private sessionId?: string;
  private eventFloor = 0;
  private deltaFloor = 0;
  private active?: { runId: string; turnId?: string; seq: number };
  phase = 'CREATED';
  constructor(private readonly options: ZcodeLifecycleOptions) {}
  /** app-server 无独立 initialize 握手;连接即协议生效。 */
  async initialize(): Promise<void> {
    this.phase = 'INITIALIZE';
    this.notifications.set('v4/telemetry/event', (params) => this.telemetryEvent(params));
    this.notifications.set('session/event', (params) => this.streamDelta(params));
  }
  async open(input: {
    workspacePath: string;
    workspaceKey: string;
    mcpServers?: unknown[];
    model?: { providerId: string; modelId: string };
  }): Promise<{ id: string }> {
    if (this.closed) throw new NativeRpcError('RPC_CLOSED', 'none-proven');
    this.phase = 'OPEN';
    const reply = (await this.request('session/create', {
      workspace: { workspacePath: input.workspacePath, workspaceKey: input.workspaceKey },
      ...(input.mcpServers ? { mcpServers: input.mcpServers } : {}),
      ...(input.model ? { model: input.model } : {}),
    }));
    const id = this.snapshotSessionId(reply);
    this.sessionId = id;
    return { id };
  }
  async resume(sessionId: string, mcpServers?: unknown[]): Promise<void> {
    this.phase = 'RESUME';
    const reply = await this.request('session/resume', { sessionId, ...(mcpServers ? { mcpServers } : {}) });
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
    if (ids.some(id => typeof id !== 'string' || !id))
      throw new NativeRpcError('ZCODE_SESSION_REJECTED', 'possible');
    // 0.16.5 空闲投影里 projection.sessionId 为 'unknown' 占位;仅真实 id 参与一致性校验。
    const known = ids.filter(id => id !== 'unknown');
    if (!known.length) throw new NativeRpcError('ZCODE_SESSION_REJECTED', 'possible');
    if (new Set(known).size !== 1) throw new NativeRpcError('ZCODE_SESSION_MISMATCH', 'possible');
    return known[0] as string;
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
  /** 0.16.5 官方 app-server:回合生命周期由 v4/telemetry/event 承载(含 turnId/sourceCommandId/eventSeq/kind)。 */
  private telemetryEvent(value: unknown): void {
    if (!value || typeof value !== 'object' || this.closed || !this.active) return;
    const e = value as Record<string, any>;
    const active = this.active;
    if (e.sessionId !== this.sessionId || !Number.isSafeInteger(e.eventSeq) || e.eventSeq <= active.seq) return;
    if (e.kind === 'turn.started') {
      if (e.sourceCommandId !== active.runId || active.turnId) return;
      if (typeof e.turnId !== 'string' || !e.turnId) return;
      active.turnId = e.turnId;
      active.seq = e.eventSeq;
      // 原生开始事件不是持久化 receipt；不附 acceptedPromptHash。
      this.options.onEvent({ type: 'RunAccepted', runId: active.runId, threadId: this.sessionId, turnId: e.turnId });
      return;
    }
    if (typeof e.turnId !== 'string' || e.turnId !== active.turnId) return;
    active.seq = e.eventSeq;
    const identity = { runId: active.runId, threadId: this.sessionId, turnId: e.turnId };
    if ((e.kind === 'tool.updated' || e.kind === 'tool.completed') && typeof e.toolCallId === 'string')
      this.options.onEvent({ type: 'ToolUpdate', ...identity,
        payload: { toolCallId: e.toolCallId, kind: e.kind, toolName: e.toolName } });
    if (e.kind === 'permission.requested')
      this.options.onEvent({ type: 'PermissionRequested', ...identity,
        payload: { requestId: e.requestId, toolCallId: e.toolCallId, toolName: e.toolName } });
    const outcome = e.kind === 'turn.terminal'
      ? e.status === 'success' || e.resultType === 'success'
        ? 'succeeded'
        : e.status === 'cancelled' || e.resultType === 'cancelled'
          ? 'cancelled'
          : e.status === 'failed' || e.resultType === 'failed'
            ? 'failed'
            : undefined
      : undefined;
    if (outcome) {
      this.active = undefined;
      this.options.onEvent({ type: 'RunSettled', ...identity, outcome });
    }
  }
  /** session/event 无 turnId,仅作当前回合的文本增量源。 */
  private streamDelta(value: unknown): void {
    if (!value || typeof value !== 'object' || this.closed) return;
    const active = this.active;
    if (!active || !active.turnId) return;
    const e = value as Record<string, any>;
    if (e.sessionId !== this.sessionId || !Number.isSafeInteger(e.seq) || e.seq <= this.deltaFloor) return;
    this.deltaFloor = e.seq;
    const p = e.payload;
    if (p && typeof p === 'object' && p.kind === 'text_delta' && typeof p.delta === 'string' && p.delta)
      this.options.onEvent({ type: 'TextDelta', runId: active.runId, threadId: this.sessionId, turnId: active.turnId, text: p.delta });
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
          if (m.error) {
            if (process.env.AR_ZCODE_DEBUG) console.error('[zcode-reject]', key, JSON.stringify(m.error).slice(0, 300));
            entry.reject(new NativeRpcError('ZCODE_REQUEST_REJECTED', 'possible'));
          }
          else entry.resolve(m.result);
        } else if (typeof m.method === 'string') {
          if (process.env.AR_ZCODE_DEBUG && m.id === undefined) {
            const pp = m.params as Record<string, any> | undefined;
            console.error('[zcode-notif]', m.method, 'k=' + String(pp?.kind ?? pp?.payload?.kind ?? ''), 'd=' + String(pp?.payload?.delta ?? pp?.payload?.response ?? '').slice(0, 160), JSON.stringify(pp).slice(0, 120));
          }
          if (m.id !== undefined) {
            if (process.env.AR_ZCODE_DEBUG) console.error('[zcode-srvreq]', m.method, String((m.params as { toolName?: unknown })?.toolName ?? ''));
            let reply;
            if (m.method === 'session/requestRuntimePreferences')
              reply = { id: m.id, result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: false } };
            else if (m.method === 'interaction/requestPermission') {
              // 托管角色:仅白名单策略可放行;无匹配时选 deny option 的 response。
              const p = m.params as { options?: { kind?: string; response?: { decision: string; reason?: string } }[] };
              const decided = this.options.onApproval?.(m.params);
              const pick = decided?.decision === 'allow'
                ? (p?.options ?? []).find((o) => o.kind === 'allow_once')
                : (p?.options ?? []).find((o) => o.kind === 'deny');
              const fallback = (p?.options ?? []).find((o) => o.kind === 'deny');
              reply = { id: m.id, result: (pick ?? fallback)?.response ?? { decision: 'deny', reason: 'No approval policy' } };
            }
            else reply = { id: m.id, error: { code: -32601, message: 'Unsupported managed client request' } };
            void Promise.resolve().then(() => this.options.write(Buffer.from(JSON.stringify(reply) + '\n')))
              .catch(() => this.disconnect('ZCODE_TRANSPORT_FAILED'));
          } else this.notifications.get(m.method)?.(m.params);
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
