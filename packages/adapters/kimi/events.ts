import { RouteError, type Data } from '../../protocol/index.ts';
export function kimiSettled(response: Data, protocolVersion: number, replay = false): Data | null {
  if (protocolVersion !== 1) throw new RouteError('ACP_VERSION_UNVERIFIED', 'UNAVAILABLE');
  if (replay) return null;
  const reason = response.result?.stopReason;
  const outcome =
    reason === 'end_turn'
      ? 'succeeded'
      : reason === 'cancelled'
        ? 'cancelled'
        : ['max_tokens', 'max_turn_requests', 'refusal'].includes(reason)
          ? 'failed'
          : null;
  if (!outcome) throw new RouteError('ACP_OUTCOME_UNVERIFIED', 'AMBIGUOUS');
  return { type: 'RunSettled', outcome, nativeEvidence: { protocolVersion, stopReason: reason } };
}
