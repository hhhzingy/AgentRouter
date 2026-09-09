import { it, expect } from 'vitest';
import { createFixture, request, finish } from '../support.ts';
it('T057/T059 限流保存请求并允许最后结果入库', () => {
  let time = 100000;
  const f = createFixture(() => time);
  try {
    for (let i = 0; i < 5; i++) {
      f.core.send(f.core.management('role_a'), 'op' + i, request('role_b'));
      const b = f.dispatch('role_b')!;
      f.core.finish(b.principal, 'done', finish());
      f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
    }
    f.core.send(f.core.management('role_a'), 'six', request('role_b'));
    expect(f.dispatch('role_b')).toBeNull();
    expect(f.core.tasks()).toHaveLength(6);
    time += 60001;
    expect(f.dispatch('role_b')).not.toBeNull();
  } finally {
    f.close();
  }
});
it('T058 重启不清预算，时钟回拨保守阻断', () => {
  let time = 100000;
  const f = createFixture(() => time);
  try {
    f.core.send(f.core.management('role_a'), 'op', request('role_b'));
    const b = f.dispatch('role_b')!;
    f.core.finish(b.principal, 'done', finish());
    f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
    f.reopen();
    time -= 1;
    f.core.send(f.core.management('role_a'), 'new', request('role_b'));
    expect(f.dispatch('role_b')).toBeNull();
  } finally {
    f.close();
  }
});
it('T036 同物理工作区互斥', () => {
  const f = createFixture();
  try {
    f.db.prepare("update workspaces set canonical_path='shared'").run();
    f.core.send(f.core.management('role_a'), 'b', request('role_b'));
    f.core.send(f.core.management('role_a'), 'c', request('role_c'));
    expect(f.dispatch('role_b')).not.toBeNull();
    expect(f.dispatch('role_c')).toBeNull();
  } finally {
    f.close();
  }
});
it('T061 暂停后的结果入库不启动下一接力', () => {
  const f = createFixture();
  try {
    f.core.send(
      f.core.management('role_a'),
      'b',
      request('role_b', {
        mode: 'handoff',
        to: { type: 'role', id: 'role_c' },
        instruction: '复核',
      }),
    );
    const b = f.dispatch('role_b')!;
    f.core.pause('role_c');
    f.core.finish(b.principal, 'done', { ...finish(), next_request: request('role_c') });
    f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
    expect(f.dispatch('role_c')).toBeNull();
  } finally {
    f.close();
  }
});
