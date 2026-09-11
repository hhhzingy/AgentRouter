import { PiRpcPeer } from './rpc-peer.ts';
import { PiRunEvents } from './events.ts';
/** A fresh isolated process per business turn; caller owns cwd/profile/extension and stop proof. */
export class PiLifecycle {
  readonly peer: PiRpcPeer;
  private opening = false;
  private sessionId?: string;
  private uncertain = false;
  private active?: { runId: string; accepted: boolean; terminal: boolean };
  private early: any[] = [];
  private cancelPending?: Promise<{ state: 'acknowledged' | 'unknown' }>;
  private normalizer = new PiRunEvents();
  constructor(
    private options: {
      write: (b: Buffer) => Promise<void>;
      onEvent: (e: any) => void;
      timeoutMs?: number;
    },
  ) {
    this.peer = new PiRpcPeer({
      ...options,
      onEvent: (e) => this.event(e),
      onDisconnect: () => {
        this.uncertain = true;
        options.onEvent({
          type: 'Disconnected',
          runId: this.active?.runId,
          sessionId: this.sessionId,
        });
      },
    });
  }
  async open(input: {
    provider: string;
    modelId: string;
    thinkingLevel: string;
    sessionPath?: string;
    expectedSessionId?: string;
  }) {
    if (this.opening || this.sessionId || this.uncertain) throw Error('SESSION_STATE_INVALID');
    this.opening = true;
    try {
      if (input.sessionPath) {
        const switched = await this.peer.request('switch_session', {
          sessionPath: input.sessionPath,
        });
        if (switched?.cancelled !== false) throw Error('SESSION_SWITCH_REJECTED');
      }
      await this.peer.request('set_model', { provider: input.provider, modelId: input.modelId });
      await this.peer.request('set_thinking_level', { level: input.thinkingLevel });
      const state = await this.peer.request('get_state');
      if (
        typeof state?.sessionId !== 'string' ||
        !state.sessionId ||
        state.isStreaming !== false ||
        state.isCompacting !== false ||
        state.pendingMessageCount !== 0 ||
        state.model?.provider !== input.provider ||
        state.model?.id !== input.modelId ||
        state.thinkingLevel !== input.thinkingLevel ||
        (input.expectedSessionId && state.sessionId !== input.expectedSessionId)
      )
        throw Error('NATIVE_STATE_MISMATCH');
      this.sessionId = state.sessionId;
      return { sessionId: state.sessionId, sessionFile: state.sessionFile };
    } catch (e) {
      this.peer.disconnect('SESSION_OPEN_FAILED');
      throw e;
    } finally {
      this.opening = false;
    }
  }
  models() {
    return this.peer.request('get_available_models');
  }
  stats() {
    return this.peer.request('get_session_stats');
  }
  async start(input: { runId: string; text: string }) {
    if (!this.sessionId || this.active || this.uncertain) throw Error('NATIVE_QUEUE_FORBIDDEN');
    // Native slash commands may bypass normal prompting and execute extension commands.
    if (input.text.trimStart().startsWith('/')) throw Error('NATIVE_COMMAND_FORBIDDEN');
    this.active = { runId: input.runId, accepted: false, terminal: false };
    this.normalizer.start();
    try {
      await this.peer.request('prompt', { message: input.text });
      if (this.uncertain) throw Error('RPC_DISCONNECTED');
      this.active.accepted = true;
      this.options.onEvent({ type: 'RunAccepted', runId: input.runId, sessionId: this.sessionId });
      for (const e of this.early.splice(0)) this.event(e);
      return { state: 'accepted' as const };
    } catch (e) {
      this.peer.disconnect('PROMPT_UNCERTAIN');
      throw e;
    }
  }
  async cancel(): Promise<{ state: 'not-running' | 'unknown' | 'acknowledged' }> {
    if (this.uncertain) return { state: 'unknown' };
    if (!this.active || this.active.terminal) return { state: 'not-running' };
    if (!this.cancelPending)
      this.cancelPending = (async () => {
        try {
          await this.peer.request('clear_queue');
          await this.peer.request('abort');
          return { state: 'acknowledged' as const };
        } catch {
          this.peer.disconnect('CANCEL_UNCERTAIN');
          return { state: 'unknown' as const };
        }
      })();
    return this.cancelPending;
  }
  private event(e: any) {
    if (!this.active || this.active.terminal || this.uncertain) return; // no replay execution
    if (!this.active.accepted) {
      if (this.early.length >= 64) throw Error('EARLY_EVENT_LIMIT');
      this.early.push(e);
      return;
    }
    const settled = this.normalizer.accept(e);
    if (settled) {
      this.active.terminal = true;
      this.options.onEvent({ ...settled, runId: this.active.runId, sessionId: this.sessionId });
    } else if (
      e.type === 'message_update' &&
      e.assistantMessageEvent?.type === 'text_delta' &&
      typeof e.assistantMessageEvent.delta === 'string'
    ) {
      this.options.onEvent({
        type: 'TextDelta',
        text: e.assistantMessageEvent.delta,
        runId: this.active.runId,
      });
    }
  }
}
