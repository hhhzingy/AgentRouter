import type { Data } from '../../protocol/index.ts';
import { RouteError } from '../../protocol/index.ts';

const codexFailureCodes: Record<string, string> = {
  contextWindowExceeded: 'CODEX_CONTEXT_WINDOW_EXCEEDED',
  sessionBudgetExceeded: 'CODEX_SESSION_BUDGET_EXCEEDED',
  usageLimitExceeded: 'CODEX_USAGE_LIMIT_EXCEEDED',
  rateLimitExceeded: 'CODEX_RATE_LIMIT_EXCEEDED',
  serverOverloaded: 'CODEX_SERVER_OVERLOADED',
  cyberPolicy: 'CODEX_CYBER_POLICY',
  misalignmentPolicyViolation: 'CODEX_MISALIGNMENT_POLICY_VIOLATION',
  internalServerError: 'CODEX_INTERNAL_SERVER_ERROR',
  unauthorized: 'CODEX_UNAUTHORIZED',
  badRequest: 'CODEX_BAD_REQUEST',
  threadRollbackFailed: 'CODEX_THREAD_ROLLBACK_FAILED',
  sandboxError: 'CODEX_SANDBOX_ERROR',
  other: 'CODEX_OTHER',
  httpConnectionFailed: 'CODEX_HTTP_CONNECTION_FAILED',
  responseStreamConnectionFailed: 'CODEX_RESPONSE_STREAM_CONNECTION_FAILED',
  responseStreamDisconnected: 'CODEX_RESPONSE_STREAM_DISCONNECTED',
  responseTooManyFailedAttempts: 'CODEX_RESPONSE_TOO_MANY_FAILED_ATTEMPTS',
  activeTurnNotSteerable: 'CODEX_ACTIVE_TURN_NOT_STEERABLE',
};

/** Only preserve the official, bounded error discriminator. Never copy TurnError message/details. */
export function codexFailureCode(turn: Data): string | undefined {
  const info = turn?.error?.codexErrorInfo;
  if (typeof info === 'string') return codexFailureCodes[info];
  if (!info || typeof info !== 'object' || Array.isArray(info)) return undefined;
  const keys = Object.keys(info);
  return keys.length === 1 ? codexFailureCodes[keys[0]] : undefined;
}

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
    ...(outcome === 'failed' && codexFailureCode(event.params.turn)
      ? { diagnosticCode: codexFailureCode(event.params.turn) }
      : {}),
  };
}
