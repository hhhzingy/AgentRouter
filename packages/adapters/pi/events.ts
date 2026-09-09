import { RouteError, type Data } from '../../protocol/index.ts';
// The final message determines outcome; agent_end is never a scheduling barrier.
export class PiRunEvents {
  private outcome: 'succeeded' | 'failed' | 'cancelled' | null = null;
  private started = false;
  start() {
    if (this.started) throw new RouteError('NATIVE_QUEUE_FORBIDDEN');
    this.started = true;
    this.outcome = null;
  }
  accept(event: Data, replay = false): Data | null {
    if (replay) return null;
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const reason = event.message.stopReason;
      this.outcome =
        reason === 'error'
          ? 'failed'
          : reason === 'aborted'
            ? 'cancelled'
            : ['stop', 'toolUse'].includes(reason)
              ? 'succeeded'
              : null;
    }
    if (event.type !== 'agent_settled') return null;
    if (!this.started) return null;
    this.started = false;
    if (!this.outcome) throw new RouteError('PI_OUTCOME_UNVERIFIED', 'AMBIGUOUS');
    return {
      type: 'RunSettled',
      outcome: this.outcome,
      nativeEvidence: { source: 'agent_settled' },
    };
  }
}
