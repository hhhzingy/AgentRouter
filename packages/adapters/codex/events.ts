import type { Data } from '../../protocol/index.ts';
import { RouteError } from '../../protocol/index.ts';
export function codexSettled(
  event: Data,
  threadId: string,
  turnId: string,
  replay = false,
): Data | null {
  if (replay || event.method !== 'turn/completed') return null;
  if (event.params?.threadId !== threadId || event.params?.turn?.id !== turnId)
    throw new RouteError('NATIVE_IDENTITY_MISMATCH', 'AUTHORIZATION');
  const outcome = ({ completed: 'succeeded', failed: 'failed', interrupted: 'cancelled' } as Data)[
    event.params.turn.status
  ];
  if (!outcome) throw new RouteError('CODEX_OUTCOME_UNVERIFIED', 'AMBIGUOUS');
  return {
    type: 'RunSettled',
    outcome,
    nativeEvidence: { threadId, turnId, status: event.params.turn.status },
  };
}
