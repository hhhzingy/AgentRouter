import { it, expect, afterEach } from 'vitest';
import { createFixture, request, finish } from '../support.ts';
const active: ReturnType<typeof createFixture>[] = [];
function fixture() {
  const f = createFixture();
  active.push(f);
  return f;
}
afterEach(() => active.splice(0).forEach((f) => f.close()));
it('T019/T021/T022 静默成功、持久幂等、结果只到用户', () => {
  const f = fixture();
  const p = f.core.management('role_a');
  expect(f.core.send(p, 'op_1', request('role_b'))).toEqual({});
  expect(f.core.send(p, 'op_1', request('role_b'))).toEqual({});
  expect(() => f.core.send(p, 'op_1', { ...request('role_b'), summary: 'changed' })).toThrow(
    'OPERATION_CONFLICT',
  );
  expect(f.core.tasks()).toHaveLength(1);
  const run = f.dispatch('role_b')!;
  f.core.finish(run.principal, 'fin_1', finish());
  expect(f.core.inbox()).toHaveLength(0);
  f.core.settle(run.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  expect(f.core.inbox()).toHaveLength(1);
  expect(f.dispatch('role_a')).toBeNull();
});
it('T023/T024 显式交接必须经过收尾屏障', () => {
  const f = fixture();
  f.core.send(
    f.core.management('role_a'),
    'op',
    request('role_b', { mode: 'handoff', to: { type: 'role', id: 'role_c' }, instruction: '复核' }),
  );
  const b = f.dispatch('role_b')!;
  f.core.finish(b.principal, 'finish', { ...finish(), next_request: request('role_c') });
  expect(f.dispatch('role_c')).toBeNull();
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  const c = f.dispatch('role_c')!;
  expect(c).not.toBeNull();
  f.core.finish(c.principal, 'done', finish());
  f.core.settle(c.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  expect(f.core.inbox()).toHaveLength(1);
});
it('T030/T031/T032 关联结果先到后 wait 仍可续办，独立工作 FIFO', () => {
  const f = fixture();
  f.core.send(f.core.management('role_c'), 'root', request('role_a'));
  const a = f.dispatch('role_a')!;
  f.core.send(
    a.principal,
    'child',
    request('role_b', { mode: 'result', to: { type: 'role', id: 'role_a' } }),
  );
  f.core.send(f.core.management('role_c'), 'unrelated', request('role_a'));
  const b = f.dispatch('role_b')!;
  f.core.finish(b.principal, 'done', finish());
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  f.core.wait(a.principal, 'wait', { waiting_for: 'child_results', reason: '汇总' });
  expect(f.dispatch('role_a')).toBeNull();
  f.core.settle(a.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  const continuation = f.dispatch('role_a')!;
  expect(continuation.kind).toBe('CONTINUATION');
  expect(continuation.taskId).toBe(a.taskId);
});
it('T029/T027 通知不唤醒，原生结束不能代替 finish', () => {
  const f = fixture();
  f.core.send(f.core.management('role_a'), 'notice', {
    kind: 'notice',
    to: { type: 'role', id: 'role_b' },
    summary: '知悉',
    body: '无需行动',
    inputs: [],
  });
  expect(f.dispatch('role_b')).toBeNull();
  f.core.send(f.core.management('role_a'), 'task', request('role_b'));
  const b = f.dispatch('role_b')!;
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  expect(f.core.tasks()[0].state).toBe('NEEDS_ATTENTION');
  expect(f.dispatch('role_b')).toBeNull();
});
it('T071 错误空间、过期绑定和伪造身份拒绝', () => {
  const f = fixture();
  const p = f.core.management('role_a');
  expect(() => f.core.send({ ...p, epoch: 99 }, 'stale', request('role_b'))).toThrow(
    'STALE_IDENTITY',
  );
  expect(() => f.core.send(p, 'missing', request('role_missing'))).toThrow('INVALID_TARGET');
  expect(() => f.core.send(p, 'spoof', { ...request('role_b'), from: 'role_c' })).toThrow();
});
