import { expect, it } from 'vitest';
import {
  completionAllowed,
  type ExecutionExit,
} from '../../packages/core-service/execution-backend.ts';
it('父进程退出不可成为生产停止证明；Fixture 例外仅在显式隔离模式', () => {
  const exit: ExecutionExit = { code: 0, stop: { kind: 'fixture-parent-exit', epoch: 7 } };
  expect(completionAllowed(exit, 7, false)).toBe(false);
  expect(completionAllowed(exit, 7, true)).toBe(true);
});
it('UNKNOWN、旧 epoch 和空 containment 均不能释放资源', () => {
  expect(completionAllowed({ code: 0, stop: { kind: 'unknown', epoch: 7 } }, 7, true)).toBe(false);
  expect(
    completionAllowed(
      { code: 0, stop: { kind: 'supervisor-tree-empty', epoch: 6, containmentId: 'job-1' } },
      7,
      false,
    ),
  ).toBe(false);
  expect(
    completionAllowed(
      { code: 0, stop: { kind: 'supervisor-tree-empty', epoch: 7, containmentId: '' } },
      7,
      false,
    ),
  ).toBe(false);
  expect(
    completionAllowed(
      { code: 0, stop: { kind: 'supervisor-tree-empty', epoch: 7, containmentId: 'job-1' } },
      7,
      false,
    ),
  ).toBe(true);
});
