import { JsonLfDecoder } from '../../platform/framing.ts';
import { NativeRpcError } from '../shared/rpc-peer.ts';
/** ZCode Protocol 实验级生命周期(0.16.5 app-server)。
 * 帧形经真实往返确认:{id, method, params} 换行分帧;方法面自官方发行物提取。
 * 会话创建依赖已登录/已配置的 ZCode 实例(沙箱无凭据时挂起)——执行闭环未认证前不宣称可用。 */
export interface ZcodeLifecycleOptions {
  write: (bytes: Buffer) => Promise<void>;
  onEvent: (event: { type: string; payload: unknown }) => void;
  onDisconnect: (reason: string) => void;
  timeoutMs?: number;
}
export class ZcodeLifecycle {
  private decoder = new JsonLfDecoder();
  private closed = false;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private notifications = new Map<string, (params: unknown) => void>();
  private sessionId?: string;
  phase = 'CREATED';
  constructor(private readonly options: ZcodeLifecycleOptions) {}
  /** app-server 无独立 initialize 握手;连接即协议生效。 */
  async initialize(): Promise<void> {
    this.phase = 'INITIALIZE';
    this.notifications.set('session/event', (params) =>
      this.options.onEvent({ type: 'session/event', payload: params }));
  }
  async open(input: { workspacePath: string; workspaceKey: string }): Promise<{ id: string }> {
    if (this.closed) throw new NativeRpcError('RPC_CLOSED', 'none-proven');
    this.phase = 'OPEN';
    const reply = (await this.request('session/create', {
      workspace: { workspacePath: input.workspacePath, workspaceKey: input.workspaceKey },
    })) as { sessionId?: string; session?: { id?: string }; id?: string };
    const id = reply?.sessionId ?? reply?.session?.id ?? reply?.id;
    if (typeof id !== 'string' || !id) throw new NativeRpcError('ZCODE_SESSION_REJECTED', 'possible');
    this.sessionId = id;
    return { id };
  }
  async resume(sessionId: string): Promise<void> {
    this.phase = 'RESUME';
    await this.request('session/resume', { sessionId });
    this.sessionId = sessionId;
  }
  async start(input: { runId: string; text: string }): Promise<void> {
    if (!this.sessionId) throw new NativeRpcError('ZCODE_SESSION_REQUIRED', 'none-proven');
    this.phase = 'START_PROMPT';
    await this.request('session/send', { sessionId: this.sessionId, message: input.text });
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
      void this.options.write(Buffer.from(text + '\n'));
    });
  }
}
