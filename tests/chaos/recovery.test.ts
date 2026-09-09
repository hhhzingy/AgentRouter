import { it, expect } from 'vitest';
import { createFixture, request, finish } from '../support.ts';
it('T020 提交中故障回滚全部业务记录', () => {
  const f = createFixture();
  try {
    f.core.fault = () => {
      throw Error('injected');
    };
    expect(() => f.core.send(f.core.management('role_a'), 'op', request('role_b'))).toThrow(
      'STORE_UNAVAILABLE',
    );
    expect(f.core.tasks()).toHaveLength(0);
    expect(f.db.prepare('select count(*) as n from operations').get()).toEqual({ n: 0 });
  } finally {
    f.close();
  }
});
it('T025/T064 重启保留 HELD 结果并隔离未知执行，不自动重跑', () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'op', request('role_b'));
    const b = f.dispatch('role_b')!;
    f.core.finish(b.principal, 'finish', finish());
    f.reopen();
    f.core.recover();
    expect(f.core.inbox()).toHaveLength(0);
    expect(f.core.tasks()[0].state).toBe('NEEDS_ATTENTION');
    expect(f.dispatch('role_b')).toBeNull();
    expect(f.db.prepare('select state from outbox where after_run_id is not null').get()).toEqual({
      state: 'HELD',
    });
  } finally {
    f.close();
  }
});
it('T065 重复收尾只发布一次，旧代次不能释放', () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'op', request('role_b'));
    const b = f.dispatch('role_b')!;
    f.core.finish(b.principal, 'finish', finish());
    expect(() =>
      f.core.settle(b.id, 9, 'succeeded', { native: true, resourcesStopped: true }),
    ).toThrow('STALE_IDENTITY');
    f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
    f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
    expect(f.core.inbox()).toHaveLength(1);
  } finally {
    f.close();
  }
});
