import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

/** 只能在 backend.launch 之前调用；拒绝已被原生接受的 run。 */
export function blockBeforeLaunch(db: Database.Database, runId: string, reason: string, now: number) {
  db.transaction(() => {
    const run = db.prepare('select * from runs where id=?').get(runId) as any;
    if (!run || run.state !== 'STARTING' || run.accepted_at_ms !== null || run.native_run_ref !== null)
      throw Error('PRECHECK_RUN_ALREADY_STARTED');
    const code = /^[A-Z][A-Z0-9_]{1,95}$/.test(reason) ? reason : 'CONTEXT_MIGRATION_FAILED';
    db.prepare("update runs set state='FAILED',settled_at_ms=?,exit_reason='PRECHECK_BLOCKED' where id=?").run(now, runId);
    db.prepare("update tasks set state='NEEDS_ATTENTION',updated_at_ms=? where id=?").run(now, run.task_id);
    db.prepare('delete from resource_leases where run_id=?').run(runId);
    db.prepare("update role_slots set active_run_id=null,blocked_reason='precheck_blocked' where role_id=? and active_run_id=?").run(run.role_id, runId);
    db.prepare("insert into issues(id,role_id,task_id,run_id,code,detail_json,state,created_at_ms) values(?,?,?,?,'PRECHECK_BLOCKED',?,'OPEN',?)")
      .run('issue_' + randomUUID(), run.role_id, run.task_id, runId, JSON.stringify({ reason: code, native_started: false }), now);
  }).immediate();
}
