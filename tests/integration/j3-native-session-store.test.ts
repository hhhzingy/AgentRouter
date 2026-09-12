import { it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import { NativeSessionStore } from '../../packages/core-service/native-session-store.ts';
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const root = resolve('.local/j3-session-tests');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(resolve(root, 'case-')),
    home = resolve(dir, 'sessions');
  mkdirSync(home);
  const path = resolve(home, 'session.jsonl');
  writeFileSync(path, 'public test data');
  const db = openApplicationStore(dir),
    m = new Management(db),
    p = m.createProject('session test', dir),
    r = m.createRole({
      spaceId: p.space,
      name: 'r',
      description: 'test',
      harness: 'pi',
      workspaceId: p.workspace,
    });
  db.prepare(
    "insert into runs(id,role_id,binding_id,task_id,chain_id,kind,binding_epoch,native_run_ref,request_snapshot_json,state,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms,role_session_id) values('run',?,?,null,null,'MANAGEMENT',1,null,'{}','STARTING',null,null,null,1,null)",
  ).run(r.role, r.binding);
  cleanups.push(() => {
    db.close();
    const target = realpathSync(dir);
    if (
      !target.startsWith(realpathSync(root) + '\\') &&
      !target.startsWith(realpathSync(root) + '/')
    )
      throw Error('UNSAFE_CLEANUP');
    rmSync(target, { recursive: true });
  });
  const store = new NativeSessionStore(db),
    scope = {
      bindingId: r.binding,
      epoch: 1,
      key: 'run',
      sessionHome: home,
      isCurrent: () => true,
    };
  return { db, store, scope, path, dir, r, p };
}
it('persists native session and binding reference atomically without changing continuity', () => {
  const f = fixture();
  f.store.save(f.scope, { id: 'native-id', path: f.path });
  expect(f.store.load(f.scope)).toEqual({ id: 'native-id', path: realpathSync(f.path) });
  const b = f.db
    .prepare('select native_session_ref,continuity_mode from bindings where id=?')
    .get(f.r.binding) as any;
  expect(JSON.parse(b.native_session_ref).id).toBe('native-id');
  expect(b.continuity_mode).toBe('NEW');
});
it('old epoch, unknown execution, and stopped predicate cannot save', () => {
  const f = fixture();
  for (const scope of [
    { ...f.scope, epoch: 2 },
    { ...f.scope, key: 'missing' },
    { ...f.scope, isCurrent: () => false },
  ])
    expect(() => f.store.save(scope, { id: 'n', path: f.path })).toThrow();
  f.db.prepare("update runs set state='UNKNOWN' where id='run'").run();
  expect(() => f.store.save(f.scope, { id: 'n', path: f.path })).toThrow(
    'SESSION_EXECUTION_REVOKED',
  );
  expect(f.db.prepare('select * from native_sessions').all()).toEqual([]);
});
it('revocation immediately before commit rolls back both session and binding', () => {
  const f = fixture();
  let checks = 0;
  expect(() =>
    f.store.save({ ...f.scope, isCurrent: () => ++checks < 3 }, { id: 'n', path: f.path }),
  ).toThrow('SESSION_SAVE_REVOKED');
  expect(f.db.prepare('select * from native_sessions').all()).toEqual([]);
  expect(
    (f.db.prepare('select native_session_ref from bindings where id=?').get(f.r.binding) as any)
      .native_session_ref,
  ).toBeNull();
});
it('pi requires existing file confined to authorized session home', () => {
  const f = fixture();
  const outside = resolve(f.dir, 'outside.jsonl');
  writeFileSync(outside, 'public');
  for (const path of [
    undefined,
    outside,
    resolve(f.scope.sessionHome, 'missing'),
    f.scope.sessionHome,
  ])
    expect(() => f.store.save(f.scope, { id: 'n', path })).toThrow();
});
it('bootstrap session save validates role and epoch, and load detects inconsistent copies', () => {
  const f = fixture();
  f.db
    .prepare('insert into role_charters values(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      'charter',
      f.r.role,
      f.p.project,
      f.p.space,
      1,
      'hash',
      1,
      1,
      f.p.workspace,
      '{}',
      '{}',
      '[]',
      1,
    );
  f.db
    .prepare(
      "insert into bootstrap_deliveries values('delivery',?,'charter',1,1,'DELIVERING',null,1)",
    )
    .run(f.r.role);
  f.db
    .prepare(
      "insert into initialization_attempts values('init','delivery',?,1,'hash','RUNNING','NATIVE',null,1,null)",
    )
    .run(f.r.role);
  const reserved = resolve(f.scope.sessionHome, 'reserved.jsonl');
  f.store.save({ ...f.scope, key: 'init' }, { id: 'n', path: reserved });
  expect(() => f.store.load(f.scope)).toThrow();
  expect(() =>
    f.store.save(
      { ...f.scope, key: 'init' },
      { id: 'n', path: resolve(f.dir, 'outside-missing.jsonl') },
    ),
  ).toThrow('SESSION_PATH_OUTSIDE_HOME');
  writeFileSync(reserved, 'native session materialized');
  expect(f.store.load(f.scope)).toEqual({ id: 'n', path: realpathSync(reserved) });
  f.store.save({ ...f.scope, key: 'init' }, { id: 'n', path: f.path });
  f.db.prepare("update bindings set native_session_ref='different' where id=?").run(f.r.binding);
  expect(() => f.store.load(f.scope)).toThrow('SESSION_REFERENCE_DIVERGED');
});
