import { it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import { NativeSessionStore } from '../../packages/core-service/native-session-store.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture() {
  const root = resolve('.local/j3-session-tests');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(resolve(root, 'ab-')),
    home = resolve(dir, 'sessions');
  mkdirSync(home);
  const path = resolve(home, 'session.jsonl');
  writeFileSync(path, 'public test data');
  const db = openApplicationStore(dir),
    m = new Management(db),
    p = m.createProject('A/B 隔离测试', dir),
    r = m.createRole({
      spaceId: p.space,
      name: 'r',
      description: 'test',
      harness: 'pi',
      workspaceId: p.workspace,
    });
  const run = (id: string, roleSessionId: string | null) =>
    db.prepare(
      "insert into runs(id,role_id,binding_id,task_id,chain_id,kind,binding_epoch,native_run_ref,request_snapshot_json,state,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms,role_session_id) values(?,?,?,null,null,'MANAGEMENT',1,null,'{}','STARTING',null,null,null,1,?)",
    ).run(id, r.role, r.binding, roleSessionId);
  const sessionA = (db.prepare('select id from role_sessions where role_id=? order by seq limit 1').get(r.role) as { id: string }).id;
  run('runA', sessionA);
  const ext = new RoleSessionExtension(db);
  const store = new NativeSessionStore(db);
  const scope = (key: string, roleSessionId?: string) => ({
    bindingId: r.binding,
    epoch: 1,
    key,
    sessionHome: home,
    isCurrent: () => true,
    ...(roleSessionId ? { roleSessionId } : {}),
  });
  cleanups.push(() => {
    db.close();
    const target = realpathSync(dir);
    if (!target.startsWith(realpathSync(root))) throw Error('UNSAFE_CLEANUP');
    rmSync(target, { recursive: true });
  });
  return { db, store, ext, scope, path, dir, r, p, sessionA };
}

function call(
  ext: RoleSessionExtension,
  method: string,
  roleId: string,
  params: Record<string, unknown>,
  id: string,
) {
  const context = { principal: 'h', mode: 'controller', assertControllerLease: () => {} };
  const mutation = method === 'roleSession.create' || method === 'roleSession.switch';
  const mutationParams = { role_id: roleId, ...params };
  const preflight = mutation
    ? (ext.handle(
        {
          v: 1,
          id: id + '-preflight',
          method: 'roleSession.preflight',
          params: {
            role_id: roleId,
            ...(typeof params.session_id === 'string' ? { session_id: params.session_id } : {}),
            ...(typeof params.target_harness === 'string' ? { target_harness: params.target_harness } : {}),
          },
        } as never,
        context as never,
      ) as { result?: { preflight_hash?: string } })
    : undefined;
  return ext.handle(
    {
      v: 1,
      id,
      method,
      params: mutationParams,
      client_id: 't',
      lease_id: 'x',
      ...(mutation
        ? {
            request_key: 'test_' + id,
            operation_id: id,
            expected_revision: 0,
            preflight_hash: preflight?.result?.preflight_hash,
          }
        : {}),
    } as never,
    context as never,
  ) as { result?: any; error?: { code?: string } };
}

it('原生会话引用按 WorkSession 键控；新 WorkSession 不覆盖旧 binding 快照', () => {
  const f = fixture();
  const { db, store, ext, scope, path, r, sessionA } = f;
  store.save(scope('runA', sessionA), { id: 'native-a', path });
  db.prepare("update runs set state='SUCCEEDED' where id='runA'").run();

  const created = call(ext, 'roleSession.create', r.role, { name: 'B方向' }, 'create-b');
  expect(created.error).toBeUndefined();
  const sessionB = created.result.session.id as string;
  db.prepare(
    "insert into runs(id,role_id,binding_id,task_id,chain_id,kind,binding_epoch,native_run_ref,request_snapshot_json,state,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms,role_session_id) values('runB',?,?,null,null,'MANAGEMENT',1,null,'{}','STARTING',null,null,null,1,?)",
  ).run(r.role, r.binding, sessionB);
  store.save(scope('runB', sessionB), { id: 'native-b', path });
  db.prepare("update runs set state='SUCCEEDED' where id='runB'").run();

  expect(store.load(scope('runA', sessionA))!.id).toBe('native-a');
  expect(store.load(scope('runB', sessionB))!.id).toBe('native-b');
  expect(
    (db.prepare('select native_session_ref from role_sessions where id=?').get(sessionA) as any).native_session_ref,
  ).toContain('native-a');
  expect(
    (db.prepare('select native_session_ref from role_sessions where id=?').get(sessionB) as any).native_session_ref,
  ).toContain('native-b');
  expect(
    (db.prepare('select native_session_ref from bindings where id=?').get(r.binding) as any).native_session_ref,
  ).toContain('native-a');

  const createdC = call(ext, 'roleSession.create', r.role, { name: 'C方向' }, 'create-c');
  expect(createdC.error).toBeUndefined();
  const sessionC = createdC.result.session.id as string;
  expect(store.load(scope('runC', sessionC))).toBeUndefined();
  expect(store.load(scope('runA', sessionA))!.id).toBe('native-a');
});

it('切换只生成 fresh activation epoch；V1.0 handoff 数据保持审计只读', () => {
  const f = fixture();
  const { db, ext, r, sessionA } = f;
  db.prepare("update runs set state='SUCCEEDED' where id='runA'").run();
  const legacy = JSON.stringify({ legacy: true });
  db.prepare(
    "insert into role_session_handoffs(id,role_id,from_session_id,to_session_id,package_json,package_hash,state,created_at_ms) values('legacy-handoff',?,?,?,?,?,'PENDING',1)",
  ).run(r.role, sessionA, sessionA, legacy, 'legacy-hash');

  const b = call(ext, 'roleSession.create', r.role, { name: 'B方向' }, 'create-b');
  const sessionB = b.result.session.id as string;
  const back = call(ext, 'roleSession.switch', r.role, { session_id: sessionA }, 'switch-a');
  expect(back.error).toBeUndefined();
  const c = call(ext, 'roleSession.create', r.role, { name: 'C方向' }, 'create-c');
  expect(c.error).toBeUndefined();

  const handoff = db.prepare('select * from role_session_handoffs where id=?').get('legacy-handoff') as any;
  expect(handoff.state).toBe('PENDING');
  expect(handoff.package_hash).toBe('legacy-hash');
  expect(db.prepare('select count(*) as n from role_session_handoffs').get()).toMatchObject({ n: 1 });

  const activations = db
    .prepare('select role_session_id,state,activation_epoch,operation_id from role_session_activations where role_id=? order by activation_epoch')
    .all(r.role) as any[];
  expect(activations.map((a) => [a.role_session_id, a.state])).toEqual([
    [sessionA, 'ENDED'],
    [sessionB, 'ENDED'],
    [sessionA, 'ENDED'],
    [c.result.session.id, 'ACTIVE'],
  ]);
  expect(activations.map((a) => a.activation_epoch)).toEqual([1, 2, 3, 4]);
  expect(activations.map((a) => a.operation_id)).toEqual(['role-create', 'create-b', 'switch-a', 'create-c']);
});

it('有活动 native run 时禁止切换 WorkSession', () => {
  const f = fixture();
  const result = call(f.ext, 'roleSession.create', f.r.role, { name: 'B方向' }, 'create-b');
  expect(result.result).toBeUndefined();
  expect(result.error?.code ?? '').toContain('ROLE_SESSION_SWITCH_BLOCKED');
});
