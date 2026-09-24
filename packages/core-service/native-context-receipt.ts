import { createHash } from 'node:crypto';

export function assertNativeContextReceipt(receipt: unknown, expected: {
  runId: string; workSessionId: string; activationId: string; activationEpoch: number;
  nativeSessionId: string; envelope: unknown;
}) {
  const r = receipt as Record<string, unknown> | null;
  const envelope = expected.envelope as { stable_marker?: unknown };
  if (!r || r.source !== 'native-turn-response' || r.accepted !== true
    || r.marker !== envelope.stable_marker
    || r.runId !== expected.runId || r.workSessionId !== expected.workSessionId
    || r.activationId !== expected.activationId || r.activationEpoch !== expected.activationEpoch
    || !expected.nativeSessionId || r.nativeSessionId !== expected.nativeSessionId
    || typeof r.nativeTurnId !== 'string' || !r.nativeTurnId
    || typeof r.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.promptHash)
    || r.envelopeHash !== createHash('sha256').update(JSON.stringify(expected.envelope)).digest('hex'))
    throw Error('CONTEXT_NATIVE_RECEIPT_MISMATCH');
}
