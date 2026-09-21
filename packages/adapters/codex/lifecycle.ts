import { NativeRpcPeer, type NativeRpcOptions } from '../shared/rpc-peer.ts';
import { codexSettled } from './events.ts';
export interface CodexLifecycleOptions {
  write: NativeRpcOptions['write'];
  onEvent: (event: {
    type: string;
    runId?: string;
    threadId?: string;
    turnId?: string;
    acceptedPromptHash?: string;
    text?: string;
    outcome?: string;
    diagnosticCode?: string;
  }) => void;
  /** Core 绑定的审批处理器；未提供时原生逆向请求全部拒绝。 */
  onApproval?: NativeRpcOptions['onRequest'];
  timeoutMs?: number;
}
/** 本机 0.153.4 schema 驱动的协议生命周期。进程、账号和整树停止证明由隔离后端负责。
 * 每个实例最多一个业务轮次，禁止原生内部排队；下一轮由 Core 派发到新实例并 resume。
 */
export class CodexLifecycle {
  readonly peer: NativeRpcPeer;
  phase = 'CREATED';
  private initialized = false;
  private initializing = false;
  private opening = false;
  private threadId?: string;
  private active?: {
    runId: string;
    turnId?: string;
    terminal: boolean;
    cancelRequested: boolean;
    interruptSent: boolean;
  };
  private uncertain = false;
  private interruptPending?: Promise<unknown>;
  private earlyNotifications: Array<[string, unknown]> = [];
  constructor(private readonly options: CodexLifecycleOptions) {
    this.peer = new NativeRpcPeer({
      write: options.write,
      timeoutMs: options.timeoutMs,
      onNotification: (method, params) => this.notification(method, params),
      onRequest: async (method, params) => {
        const p = params as any;
        if (
          !this.active ||
          !this.active.turnId ||
          this.active.terminal ||
          this.uncertain ||
          p?.threadId !== this.threadId ||
          p?.turnId !== this.active.turnId
        )
          throw Error('NATIVE_IDENTITY_MISMATCH');
        if (
          ![
            'item/commandExecution/requestApproval',
            'item/fileChange/requestApproval',
            'item/tool/requestUserInput',
            'item/permissions/requestApproval',
          ].includes(method) ||
          !options.onApproval
        )
          throw Error('NATIVE_REQUEST_DENIED');
        const run = this.active;
        const result = await options.onApproval(method, params);
        if (this.active !== run || run.terminal || this.uncertain) throw Error('APPROVAL_EXPIRED');
        return result;
      },
      onDisconnect: () => {
        this.uncertain = true;
        options.onEvent({
          type: 'Disconnected',
          runId: this.active?.runId,
          threadId: this.threadId,
          turnId: this.active?.turnId,
        });
      },
    });
  }
  async initialize() {
    if (this.initialized || this.initializing || this.uncertain) throw Error('ALREADY_INITIALIZED');
    this.phase = 'INITIALIZE';
    this.initializing = true;
    try {
      await this.peer.request('initialize', {
        clientInfo: { name: 'agentrouter', version: '1.0.0-dev.0' },
      });
      this.peer.notify('initialized', {});
      this.initialized = true;
    } catch (error) {
      this.uncertain = true;
      throw error;
    } finally {
      this.initializing = false;
    }
  }
  async open(input: {
    cwd: string;
    model: string;
    instructions: string;
    nativeSessionId?: string;
  }) {
    if (!this.initialized || this.threadId || this.opening || this.uncertain)
      throw Error('SESSION_STATE_INVALID');
    this.phase = 'OPEN';
    this.opening = true;
    try {
      const result = (await this.peer.request(
        input.nativeSessionId ? 'thread/resume' : 'thread/start',
        {
          cwd: input.cwd,
          model: input.model,
          developerInstructions: input.instructions,
          ...(input.nativeSessionId ? { threadId: input.nativeSessionId } : {}),
        },
      )) as any;
      if (
        typeof result?.thread?.id !== 'string' ||
        !result.thread.id ||
        (input.nativeSessionId && result.thread.id !== input.nativeSessionId)
      ) {
        this.peer.disconnect('NATIVE_IDENTITY_MISMATCH');
        throw Error('NATIVE_IDENTITY_MISMATCH');
      }
      this.threadId = result.thread.id;
      return this.threadId;
    } catch (error) {
      this.uncertain = true;
      throw error;
    } finally {
      this.opening = false;
    }
  }
  async start(input: { runId: string; text: string; effort?: string }) {
    if (!this.threadId || this.active || this.uncertain) throw Error('NATIVE_QUEUE_FORBIDDEN');
    this.phase = 'START_PROMPT';
    this.active = {
      runId: input.runId,
      terminal: false,
      cancelRequested: false,
      interruptSent: false,
    };
    try {
      const result = (await this.peer.request('turn/start', {
        threadId: this.threadId,
        input: [{ type: 'text', text: input.text }],
        ...(input.effort ? { effort: input.effort } : {}),
      })) as any;
      this.bindTurn(result?.turn?.id);
      this.options.onEvent({
        type: 'RunAccepted',
        acceptedPromptHash: createHash('sha256').update(input.text, 'utf8').digest('hex'),
        runId: input.runId,
        threadId: this.threadId,
        turnId: this.active.turnId,
      });
      for (const [method, params] of this.earlyNotifications.splice(0))
        this.notification(method, params);
      await this.interruptIfRequested();
      return { state: 'accepted' as const, nativeRequestId: this.active.turnId };
    } catch (error) {
      this.uncertain = true;
      throw error;
    }
  }
  async cancel() {
    if (!this.active) return { state: 'not-running' as const };
    if (this.uncertain) return { state: 'unknown' as const };
    if (this.active.terminal) return { state: 'not-running' as const };
    this.active.cancelRequested = true;
    if (!this.active.turnId) return { state: 'requested' as const };
    try {
      await this.interruptIfRequested();
      return { state: 'acknowledged' as const };
    } catch {
      return { state: 'unknown' as const };
    }
  }
  private async interruptIfRequested() {
    const run = this.active;
    if (!run || !run.turnId || run.terminal || !run.cancelRequested || this.uncertain) return;
    if (run.interruptSent) {
      await this.interruptPending;
      return;
    }
    run.interruptSent = true;
    try {
      this.interruptPending = this.peer.request('turn/interrupt', {
        threadId: this.threadId,
        turnId: run.turnId,
      });
      await this.interruptPending;
    } catch (error) {
      this.uncertain = true;
      throw error;
    }
  }
  private bindTurn(id: unknown) {
    if (
      !this.active ||
      typeof id !== 'string' ||
      !id ||
      (this.active.turnId && this.active.turnId !== id)
    ) {
      this.peer.disconnect('NATIVE_IDENTITY_MISMATCH');
      throw Error('NATIVE_IDENTITY_MISMATCH');
    }
    this.active.turnId = id;
  }
  private notification(method: string, params: unknown) {
    const p = params as any,
      run = this.active;
    if (!run || this.uncertain || run.terminal) return;
    if (!['turn/started', 'turn/completed', 'item/agentMessage/delta'].includes(method)) return;
    if (p?.threadId !== this.threadId) throw Error('NATIVE_IDENTITY_MISMATCH');
    if (!run.turnId) {
      if (this.earlyNotifications.length >= 64) throw Error('EARLY_NOTIFICATION_LIMIT');
      this.earlyNotifications.push([method, params]);
      return;
    }
    if (method === 'turn/started') {
      this.bindTurn(p.turn?.id);
      return;
    }
    if (method === 'turn/completed') {
      this.bindTurn(p.turn?.id);
      const settled = codexSettled({ method, params: p }, this.threadId!, run.turnId!);
      if (settled) {
        run.terminal = true;
        this.options.onEvent({
          type: 'RunSettled',
          runId: run.runId,
          threadId: this.threadId,
          turnId: run.turnId,
          outcome: settled.outcome,
          ...(settled.diagnosticCode ? { diagnosticCode: settled.diagnosticCode } : {}),
        });
      }
    } else {
      if (p.turnId !== run.turnId || typeof p.delta !== 'string')
        throw Error('NATIVE_IDENTITY_MISMATCH');
      this.options.onEvent({
        type: 'TextDelta',
        runId: run.runId,
        threadId: this.threadId,
        turnId: run.turnId,
        text: p.delta,
      });
    }
  }
}
import { createHash } from 'node:crypto';
