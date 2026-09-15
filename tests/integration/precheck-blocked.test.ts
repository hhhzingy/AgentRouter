import { expect, it } from 'vitest';
import { createFixture, request } from '../support.ts';
import { blockBeforeLaunch } from '../../packages/core-service/precheck-blocked.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';

it('启动前预算阻止保留失败事实、释放租约，不产生 UNKNOWN', () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'task-precheck', request('role_b'));
    const dispatch = f.core.dispatch('role_b')!;
    expect(dispatch).toBeTruthy();
    blockBeforeLaunch(f.db, dispatch.id, 'CONTEXT_MIGRATION_TOO_LARGE', Date.now());
    expect(f.db.prepare('select state,exit_reason,accepted_at_ms from runs where id=?').get(dispatch.id)).toEqual({ state: 'FAILED', exit_reason: 'PRECHECK_BLOCKED', accepted_at_ms: null });
    expect(f.db.prepare('select count(*) n from resource_leases where run_id=?').get(dispatch.id)).toEqual({ n: 0 });
    expect(f.db.prepare('select active_run_id,blocked_reason from role_slots where role_id=?').get('role_b')).toEqual({ active_run_id: null, blocked_reason: 'precheck_blocked' });
    expect(f.db.prepare('select state from tasks where id=?').get(dispatch.taskId)).toEqual({ state: 'NEEDS_ATTENTION' });
    expect(f.db.prepare('select code from issues where run_id=?').get(dispatch.id)).toEqual({ code: 'PRECHECK_BLOCKED' });
  } finally { f.close(); }
});

it('已接受的 run 不能伪装为未启动预检失败', () => {
  const f = createFixture();
  try {
    f.core.send(f.core.management('role_a'), 'task-started', request('role_b'));
    const dispatch = f.dispatch('role_b')!;
    const before = f.db.prepare('select * from runs where id=?').get(dispatch.id);
    expect(() => blockBeforeLaunch(f.db, dispatch.id, 'CONTEXT_MIGRATION_TOO_LARGE', Date.now())).toThrow('PRECHECK_RUN_ALREADY_STARTED');
    expect(f.db.prepare('select * from runs where id=?').get(dispatch.id)).toEqual(before);
    expect(f.db.prepare('select count(*) n from resource_leases where run_id=?').get(dispatch.id)).toEqual({ n: 1 });
  } finally { f.close(); }
});

it('协调器预算构建拒绝时不调用 backend.launch，也不创建 UNKNOWN issue', async () => {
  const f = createFixture();
  try {
    const app = new ApplicationService(f.db, [f.dir]);
    let launches = 0;
    const coordinator = new ExecutionCoordinator(app, {
      launch: () => { launches++; throw Error('UNEXPECTED_LAUNCH'); },
      cancel: () => false, stop: async () => {},
    });
    f.core.send(f.core.management('role_a'), 'task-coordinator', request('role_b'));
    const dispatch = f.core.dispatch('role_b')!;
    (coordinator as any).buildContextPlan = async () => { throw Error('CONTEXT_MIGRATION_TOO_LARGE'); };
    await (coordinator as any).run(dispatch, app.one('select * from bindings where id=?', 'binding_b'), { project_id: 'project_test' }, {});
    expect(launches).toBe(0);
    expect(app.one('select state,exit_reason from runs where id=?', dispatch.id)).toEqual({ state: 'FAILED', exit_reason: 'PRECHECK_BLOCKED' });
    expect(app.one("select count(*) n from issues where code='EXECUTION_UNKNOWN'")).toEqual({ n: 0 });
  } finally { f.close(); }
});
