import { it, expect } from 'vitest';
import { createFixture, request } from '../support.ts';
import { classifySqlite } from '../../packages/storage/compatibility.ts';
import { inspectStore } from '../../packages/storage/index.ts';
import { resolve } from 'node:path';
it('G10-07 context 每段只披露指定键，默认身份，规则版本固定', () => {
  const f = createFixture();
  try {
    const p = f.core.management('role_a');
    expect(Object.keys(f.core.context(p))).toEqual(['identity']);
    for (const s of ['roles', 'task', 'child_results', 'policy', 'notices'])
      expect(Object.keys(f.core.context(p, { section: s }))).toEqual([s]);
    expect(f.core.context(p, { section: 'policy' }).policy).toMatchObject({
      id: 'policy_test',
      revision: 1,
      rules: {},
    });
    expect(() => f.core.context(p, { section: 'invalid' })).toThrow('INVALID_CONTEXT_QUERY');
    expect(() => f.core.context({ ...p, epoch: 2 })).toThrow('STALE_IDENTITY');
  } finally {
    f.close();
  }
});
it('G10-08 notice 重启后目标可见、分页且不唤醒，无回执或新任务', () => {
  const f = createFixture();
  try {
    const p = f.core.management('role_a');
    for (let i = 0; i < 3; i++)
      expect(
        f.core.send(p, 'op_notice_' + i, {
          kind: 'notice',
          to: { type: 'role', id: 'role_b' },
          summary: '通知' + i,
          body: '无需行动',
          inputs: [],
        }),
      ).toEqual({});
    f.reopen();
    expect(f.dispatch('role_b')).toBeNull();
    expect(f.core.tasks()).toHaveLength(0);
    expect(f.db.prepare('select * from outbox').all()).toHaveLength(0);
    expect(f.core.notices(f.core.management('role_c')).items).toHaveLength(0);
    const page = f.core.notices(f.core.management('role_b'), 0, 2);
    expect(page.items).toHaveLength(2);
    expect(page.has_more).toBe(true);
    expect(f.core.notices(f.core.management('role_b'), page.next_cursor).items).toHaveLength(1);
    f.core.send(f.core.management('role_c'), 'op_task', request('role_b'));
    const run = f.dispatch('role_b')!;
    expect(f.core.context(run.principal, { section: 'notices' })).toMatchObject({
      notices: {
        items: expect.arrayContaining([
          expect.objectContaining({ notice: expect.objectContaining({ summary: '通知0' }) }),
        ]),
      },
    });
  } finally {
    f.close();
  }
});
it('G10-09 安全下限、未知诊断与可扩展验证范围；实际 SQLite 只读诊断', () => {
  expect(classifySqlite('3.53.3')).toBe('UNSAFE');
  expect(classifySqlite('3.53.4')).toBe('VERIFIED');
  expect(classifySqlite('3.53.5')).toBe('DIAGNOSTIC_ONLY');
  expect(classifySqlite('invalid')).toBe('UNSAFE');
  expect(classifySqlite('3.53.5', [{ min: '3.53.4', maxExclusive: '3.54.0' }])).toBe('VERIFIED');
  const f = createFixture();
  try {
    expect(inspectStore(resolve(f.dir, 'router.db'))).toMatchObject({
      compatibility: 'VERIFIED',
      integrity: 'ok',
    });
  } finally {
    f.close();
  }
});
it('W10 AuthUnit 配置并发大于1明确阻断，不假装支持计数租约', () => {
  const f = createFixture();
  try {
    f.db.exec(
      "insert into auth_units values('auth_test','pi',null,'isolated',2,'READY');update bindings set auth_unit_id='auth_test' where id='binding_b'",
    );
    f.core.send(f.core.management('role_a'), 'op_task', request('role_b'));
    expect(f.dispatch('role_b')).toBeNull();
    expect(f.core.snapshot().roles.find((r) => r.id === 'role_b')?.blocked_reason).toBe(
      'auth_concurrency_unsupported',
    );
  } finally {
    f.close();
  }
});
