import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { assertNativeContextReceipt } from '../../packages/core-service/native-context-receipt.ts';
const expected = { runId: 'run', workSessionId: 'ws', activationId: 'activation', activationEpoch: 2, nativeSessionId: 'native', envelope: { stable_marker: 'marker', portable_context: { entries: ['payload'] } } };
const receipt = { ...expected, source: 'native-turn-response', accepted: true, marker: 'marker', nativeTurnId: 'turn', promptHash: 'a'.repeat(64), envelopeHash: createHash('sha256').update(JSON.stringify(expected.envelope)).digest('hex') };
it('接受绑定到当前原生会话、激活和 envelope 的结构化 receipt', () => {
  expect(() => assertNativeContextReceipt(receipt, expected)).not.toThrow();
});
it.each(['runId', 'workSessionId', 'activationId', 'activationEpoch', 'nativeSessionId', 'marker', 'envelopeHash', 'promptHash', 'source', 'accepted', 'nativeTurnId'])('拒绝错配或缺失 %s', (key) => {
  expect(() => assertNativeContextReceipt({ ...receipt, [key]: null }, expected)).toThrow('CONTEXT_NATIVE_RECEIPT_MISMATCH');
});
it('拒绝相同 marker 搭配不同实际 envelope', () => {
  expect(() => assertNativeContextReceipt(receipt, { ...expected, envelope: { ...expected.envelope, portable_context: { entries: ['different'] } } })).toThrow('CONTEXT_NATIVE_RECEIPT_MISMATCH');
});
