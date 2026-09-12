import { NativeRpcPeer, type NativeRpcOptions } from '../shared/rpc-peer.ts';
/** DeepSeek Harness (dsh --profile acp) 实验级 ACP 生命周期,0.1.5-rc.2。
 * 与 Kimi 同属 ACP;差异:恢复走 session/resume(非 session/load)。
 * 真实任务/恢复/取消需 DeepSeek DUT 凭据;凭据到位前不宣称执行闭环可用。 */
export interface DshLifecycleOptions {
  epoch: string;
  write: NativeRpcOptions['write'];
  onEvent: (event: { type: string; outcome?: string; text?: string }) => void;
  onApproval?: NativeRpcOptions['onRequest'];
  timeoutMs?: number;
  promptTimeoutMs?: number;
}
export class DshLifecycle {
  readonly peer: NativeRpcPeer;
  phase = 'CREATED';
  private initialized = false;
  private sessionId?: string;
  private uncertain = false;
  private active?: { runId: string; terminal: boolean; cancelled: boolean };
  constructor(private readonly options: DshLifecycleOptions) {
    if (!options.epoch) throw Error('EPOCH_REQUIRED');
    this.peer = new NativeRpcPeer({
      write: options.write,
      jsonrpc: '2.0',
      timeoutMs: options.timeoutMs,
      onNotification: (method, params) => this.notification(method, params),
      onRequest: async (_method, params) => {
        if (!this.active || this.active.terminal || this.uncertain) throw Error('NATIVE_IDENTITY_MISMATCH');
        if (!options.onApproval) throw Error('NATIVE_REQUEST_DENIED');
        const run = this.active;
        const result = await options.onApproval(_method, params);
        if (this.active !== run || run.terminal || this.uncertain) throw Error('APPROVAL_EXPIRED');
        return result;
      },
      onDisconnect: (reason) => {
        this.uncertain = true;
        this.options.onEvent({ type: 'Disconnected', outcome: reason });
      },
    });
  }
  async initialize(): Promise<void> {
    if (this.initialized || this.uncertain) throw Error('SESSION_STATE_INVALID');
    this.phase = 'INITIALIZE';
    const result = (await this.peer.request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'agentrouter', version: '1.0.0-dev.0' },
      clientCapabilities: {},
    })) as any;
    if (result?.protocolVersion !== 1 || !result?.agentCapabilities)
      throw Error('ACP_VERSION_UNVERIFIED');
    this.initialized = true;
  }
  /** 每业务轮新会话(dsh 恢复走 session/resume,由 open 的 nativeSessionId 决定)。 */
  async open(input: { cwd: string; nativeSessionId?: string }): Promise<{ id: string }> {
    if (!this.initialized || this.sessionId || this.uncertain) throw Error('SESSION_STATE_INVALID');
    this.phase = 'OPEN';
    const result = (await this.peer.request(
      input.nativeSessionId ? 'session/resume' : 'session/new',
      { cwd: input.cwd, ...(input.nativeSessionId ? { sessionId: input.nativeSessionId } : {}) },
    )) as any;
    const id = input.nativeSessionId ?? result?.sessionId;
    if (typeof id !== 'string' || !id) throw Error('NATIVE_IDENTITY_MISMATCH');
    this.sessionId = id;
    return { id };
  }
  async start(input: { runId: string; text: string }): Promise<void> {
    if (!this.sessionId || this.active || this.uncertain) throw Error('NATIVE_QUEUE_FORBIDDEN');
    this.phase = 'START_PROMPT';
    this.active = { runId: input.runId, terminal: false, cancelled: false };
    try {
      const response = (await this.peer.request(
        'session/prompt',
        { sessionId: this.sessionId, prompt: [{ type: 'text', text: input.text }] },
        { timeoutMs: this.options.promptTimeoutMs },
      )) as any;
      const outcome = response?.stopReason === 'cancelled' ? 'cancelled' : response?.stopReason === 'refusal' ? 'failed' : 'succeeded';
      this.active.terminal = true;
      this.options.onEvent({ type: 'RunSettled', outcome });
    } catch (error) {
      this.peer.disconnect('ACP_PROMPT_UNCERTAIN');
      throw error;
    }
  }
  async cancel(): Promise<{ state: string }> {
    if (this.uncertain) return { state: 'unknown' };
    if (!this.active || this.active.terminal) return { state: 'not-running' };
    if (!this.active.cancelled) {
      this.active.cancelled = true;
      this.peer.notify('session/cancel', { sessionId: this.sessionId });
    }
    return { state: 'requested' };
  }
  private notification(method: string, params: unknown) {
    if (method !== 'session/update' || this.uncertain || !this.active || this.active.terminal) return;
    const p = params as any;
    if (p?.sessionId !== this.sessionId) throw Error('NATIVE_IDENTITY_MISMATCH');
    if (p?.update?.sessionUpdate === 'agent_message_chunk' && p.update.content?.type === 'text')
      this.options.onEvent({ type: 'TextDelta', text: p.update.content.text });
  }
}
