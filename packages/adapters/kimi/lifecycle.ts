import { NativeRpcPeer, type NativeRpcOptions } from '../shared/rpc-peer.ts';
import { kimiSettled } from './events.ts';
export interface KimiLifecycleOptions {
  epoch: string;
  write: NativeRpcOptions['write'];
  onEvent: (event: {
    type: string;
    epoch: string;
    sessionId?: string;
    runId?: string;
    text?: string;
    outcome?: string;
    update?: unknown;
  }) => void;
  onApproval?: NativeRpcOptions['onRequest'];
  timeoutMs?: number;
}
/** 当前 Kimi Code ACP v1。每实例一个业务轮；epoch 由可信调用者绑定，不接受模型自报。
 * session/load 的回放只形成历史事件；RunSettled 从不构成资源停止证明。
 */
export class KimiLifecycle {
  readonly peer: NativeRpcPeer;
  private initialized = false;
  private busy = false;
  private uncertain = false;
  private sessionId?: string;
  private loadingId?: string;
  private capabilities: any = {};
  private configOptions: any[] = [];
  private active?: { runId: string; terminal: boolean; cancelled: boolean };
  constructor(private readonly options: KimiLifecycleOptions) {
    if (!options.epoch) throw Error('EPOCH_REQUIRED');
    this.peer = new NativeRpcPeer({
      write: options.write,
      jsonrpc: '2.0',
      timeoutMs: options.timeoutMs,
      onNotification: (method, params) => this.notification(method, params),
      onRequest: async (method, params) => {
        const run = this.active,
          p = params as any;
        if (
          !run ||
          run.terminal ||
          run.cancelled ||
          this.uncertain ||
          this.loadingId ||
          p?.sessionId !== this.sessionId
        )
          throw Error('NATIVE_IDENTITY_MISMATCH');
        if (method !== 'session/request_permission' || !options.onApproval)
          throw Error('NATIVE_REQUEST_DENIED');
        const result = await options.onApproval(method, params);
        if (this.active !== run || run.terminal || run.cancelled || this.uncertain)
          throw Error('APPROVAL_EXPIRED');
        return result;
      },
      onDisconnect: () => {
        this.uncertain = true;
        this.emit({ type: 'Disconnected' });
      },
    });
  }
  private emit(event: { type: string; text?: string; outcome?: string; update?: unknown }) {
    this.options.onEvent({
      ...event,
      epoch: this.options.epoch,
      sessionId: this.sessionId ?? this.loadingId,
      runId: this.active?.runId,
    });
  }
  async initialize() {
    if (this.initialized || this.busy || this.uncertain) throw Error('SESSION_STATE_INVALID');
    this.busy = true;
    try {
      const result = (await this.peer.request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'agentrouter', version: '1.0.0-dev.0' },
        clientCapabilities: {},
      })) as any;
      if (
        result?.protocolVersion !== 1 ||
        !result.agentCapabilities ||
        typeof result.agentCapabilities !== 'object'
      )
        throw Error('ACP_VERSION_UNVERIFIED');
      this.capabilities = result.agentCapabilities;
      this.initialized = true;
      return {
        protocolVersion: 1,
        agentInfo: result.agentInfo,
        agentCapabilities: this.capabilities,
      };
    } catch (error) {
      this.peer.disconnect('ACP_INITIALIZE_FAILED');
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async open(input: { cwd: string; nativeSessionId?: string; mcpServers?: unknown[] }) {
    if (!this.initialized || this.busy || this.sessionId || this.uncertain)
      throw Error('SESSION_STATE_INVALID');
    if (input.nativeSessionId && this.capabilities.loadSession !== true)
      throw Error('ACP_LOAD_UNAVAILABLE');
    for (const server of input.mcpServers ?? []) {
      const kind = (server as any)?.type;
      if ((kind === 'http' || kind === 'sse') && this.capabilities.mcpCapabilities?.[kind] !== true)
        throw Error('ACP_MCP_UNAVAILABLE');
      if (kind !== undefined && !['stdio', 'http', 'sse'].includes(kind))
        throw Error('ACP_MCP_UNAVAILABLE');
    }
    this.busy = true;
    this.loadingId = input.nativeSessionId;
    try {
      const result = (await this.peer.request(
        input.nativeSessionId ? 'session/load' : 'session/new',
        {
          cwd: input.cwd,
          mcpServers: input.mcpServers ?? [],
          ...(input.nativeSessionId ? { sessionId: input.nativeSessionId } : {}),
        },
      )) as any;
      const id = input.nativeSessionId ?? result?.sessionId;
      if (
        typeof id !== 'string' ||
        !id ||
        (result?.sessionId !== undefined && result.sessionId !== id)
      )
        throw Error('NATIVE_IDENTITY_MISMATCH');
      this.sessionId = id;
      this.configOptions = Array.isArray(result?.configOptions) ? result.configOptions : [];
      return { sessionId: id, configOptions: structuredClone(this.configOptions) };
    } catch (error) {
      this.peer.disconnect('ACP_OPEN_FAILED');
      throw error;
    } finally {
      this.busy = false;
      this.loadingId = undefined;
    }
  }
  async configure(configId: string, value: string) {
    if (!this.sessionId || this.busy || this.active || this.uncertain)
      throw Error('SESSION_STATE_INVALID');
    const option = this.configOptions.find((x) => x?.id === configId && x.type === 'select');
    const values = (option?.options ?? []).flatMap((x: any) =>
      Array.isArray(x.options) ? x.options : [x],
    );
    if (!values.some((x: any) => x?.value === value)) throw Error('ACP_CONFIG_UNAVAILABLE');
    this.busy = true;
    try {
      const result = (await this.peer.request('session/set_config_option', {
        sessionId: this.sessionId,
        configId,
        value,
      })) as any;
      if (!Array.isArray(result?.configOptions)) throw Error('ACP_CONFIG_RESPONSE_INVALID');
      const applied = result.configOptions.filter((x: any) => x?.id === configId);
      if (applied.length !== 1 || applied[0].type !== 'select' || applied[0].currentValue !== value)
        throw Error('ACP_CONFIG_NOT_APPLIED');
      this.configOptions = result.configOptions;
      return structuredClone(this.configOptions);
    } catch (error) {
      this.peer.disconnect('ACP_CONFIG_FAILED');
      throw error;
    } finally {
      this.busy = false;
    }
  }
  /** ACP prompt 回应即终态；调用方必须并发消费事件和 cancel，不能将写入当成原生接受。 */
  async start(input: { runId: string; text: string; epoch: string }) {
    if (input.epoch !== this.options.epoch) throw Error('EPOCH_MISMATCH');
    if (!this.sessionId || this.busy || this.active || this.uncertain)
      throw Error('NATIVE_QUEUE_FORBIDDEN');
    this.active = { runId: input.runId, terminal: false, cancelled: false };
    try {
      const response = await this.peer.request('session/prompt', {
        sessionId: this.sessionId,
        prompt: [{ type: 'text', text: input.text }],
      });
      const settled = kimiSettled({ result: response }, 1)!;
      this.active.terminal = true;
      this.emit({ type: 'RunSettled', outcome: settled.outcome });
      return { state: 'settled' as const, outcome: settled.outcome };
    } catch (error) {
      this.peer.disconnect('ACP_PROMPT_UNCERTAIN');
      throw error;
    }
  }
  cancel(epoch: string) {
    if (epoch !== this.options.epoch) throw Error('EPOCH_MISMATCH');
    if (this.uncertain) return { state: 'unknown' as const };
    if (!this.active || this.active.terminal) return { state: 'not-running' as const };
    if (!this.active.cancelled) {
      this.active.cancelled = true;
      this.peer.notify('session/cancel', { sessionId: this.sessionId });
    }
    return { state: 'requested' as const }; // notification has no native acknowledgment
  }
  private notification(method: string, params: unknown) {
    if (method !== 'session/update' || this.uncertain) return;
    const p = params as any;
    if (
      p?.sessionId !== (this.sessionId ?? this.loadingId) ||
      !p?.update ||
      typeof p.update.sessionUpdate !== 'string'
    )
      throw Error('NATIVE_IDENTITY_MISMATCH');
    if (this.loadingId) {
      this.emit({ type: 'HistoryReplay', update: p.update });
      return;
    }
    if (!this.active || this.active.terminal) return;
    const update = p.update;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
      if (typeof update.content.text !== 'string') throw Error('ACP_UPDATE_INVALID');
      this.emit({ type: 'TextDelta', text: update.content.text });
    } else this.emit({ type: 'SessionUpdate', update });
  }
}
