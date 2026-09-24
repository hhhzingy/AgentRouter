import { expect, it } from 'vitest';
import { retryMissingBootstrapAck } from '../../packages/core-service/execution-coordinator.ts';

const eligible = {
  native: true, stopped: true, broken: false, exitCode: 0,
  terminal: true, delivered: false, currentEpoch: true,
  diagnostic: 'BOOTSTRAP_ACK_MISSING', otherDiagnostic: false, attempts: 1,
};

it('只允许首次、已证明原生停止的精确 ACK 缺失重试', () => {
  expect(retryMissingBootstrapAck(eligible)).toBe(true);
  for (const changed of [
    { native: false }, { stopped: false }, { broken: true },
    { exitCode: null }, { exitCode: 1 }, { terminal: false },
    { delivered: true }, { currentEpoch: false }, { attempts: 2 }, { otherDiagnostic: true },
    ...['BOOTSTRAP_TIMEOUT', 'NATIVE_DISCONNECTED', 'SECURITY_DENIED', 'PROVIDER_ERROR',
      'BOOTSTRAP_STOP_UNPROVEN', 'BOOTSTRAP_ACK_MISSING '].map((diagnostic) => ({ diagnostic })),
  ]) expect(retryMissingBootstrapAck({ ...eligible, ...changed })).toBe(false);
});
