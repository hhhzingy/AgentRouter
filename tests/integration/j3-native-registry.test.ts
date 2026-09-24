import { it, expect } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { openStore } from '../../packages/storage/index.ts';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import {
  NativeExecutionRegistry,
  NativeBackend,
  type NativeBindingConfig,
} from '../../packages/core-service/native-registry.ts';
const hash = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
function directory() {
  mkdirSync('.local/j3-native-tests', { recursive: true });
  return mkdtempSync(resolve('.local/j3-native-tests/case-'));
}
function v2() {
  const dir = directory(),
    db = openStore(resolve(dir, 'router.db'));
  const sql = readFileSync('packages/storage/migrations/002-w11-application.sql', 'utf8');
  db.exec(sql);
  db.prepare('insert into schema_migrations values(2,?,?)').run(Date.now(), hash(sql));
  // 当前 management 代码假设 v5 schema；为旧库补 role_sessions 以便创建角色。
  db.exec(
    "create table if not exists role_sessions(id text primary key, role_id text not null references roles(id), seq integer not null, name text not null, state text not null default 'ACTIVE', binding_id text, binding_epoch integer, native_session_ref text, generation integer not null default 1, created_at_ms integer not null, activated_at_ms integer not null);",
  );
  const m = new Management(db),
    p = m.createProject('legacy', dir),
    r = m.createRole({
      spaceId: p.space,
      name: 'role',
      description: 'dummy',
      harness: 'pi',
      workspaceId: p.workspace,
    });
  db.prepare('insert into role_charters values(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'charter',
    r.role,
    p.project,
    p.space,
    1,
    'hash',
    1,
    1,
    p.workspace,
    '{}',
    '{}',
    '[]',
    1,
  );
  db.prepare(
    "insert into bootstrap_deliveries values('delivery',?,'charter',1,1,'DELIVERING',null,1)",
  ).run(r.role);
  db.prepare(
    "insert into initialization_attempts values('attempt','delivery',?,1,'hash','RUNNING','SIMULATED',null,1,null)",
  ).run(r.role);
  db.prepare("insert into initialization_leases values('resource','attempt',1,'HELD')").run();
  db.prepare(
    "insert into runs values('old_run',?,?,null,null,'MANAGEMENT',1,null,'{}','SUCCEEDED',1,2,null,1)",
  ).run(r.role, r.binding);
  db.prepare("insert into run_sources values('old_run','SIMULATED','charter',null,1,1)").run();
  db.prepare("insert into execution_profiles values(?,'SIMULATED','{}',1)").run(r.role);
  // v2-era 库不得携带 v5 对象；005 会重建 role_sessions 并从 roles 回填。
  db.exec('DROP TABLE role_sessions');
  db.close();
  return { dir, p, r };
}
it('v2→v3 preserves bootstrap leases/config rows, backup and FK; reopen is idempotent', () => {
  const f = v2();
  let db = openApplicationStore(f.dir);
  expect(db.prepare('select * from initialization_leases').all()).toHaveLength(1);
  expect(
    db.prepare('select source,native_terminal,resources_stopped from run_sources').get(),
  ).toEqual({ source: 'SIMULATED', native_terminal: 1, resources_stopped: 1 });
  expect(db.prepare('select source from initialization_attempts').get()).toEqual({
    source: 'SIMULATED',
  });
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(db.pragma('foreign_key_check')).toEqual([]);
  db.prepare("update execution_profiles set source='NATIVE' where role_id=?").run(f.r.role);
  db.close();
  const backups = readdirSync(resolve(f.dir, 'backups'));
  expect(backups.length).toBeGreaterThanOrEqual(1);
  const old = new Database(
    resolve(f.dir, 'backups', backups.find((name) => name.startsWith('before-v3-')) ?? backups[0]),
    { readonly: true },
  );
  expect(old.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 2 });
  old.close();
  db = openApplicationStore(f.dir);
  expect(db.prepare('select source from execution_profiles').get()).toEqual({ source: 'NATIVE' });
  db.close();
});
it('v3 migration FK failure rolls back table replacement and version record', () => {
  const f = v2(),
    migrations = resolve(f.dir, 'migrations');
  mkdirSync(migrations);
  for (const n of readdirSync('packages/storage/migrations')
    .filter((x) => x.endsWith('.sql'))
    .sort())
    copyFileSync('packages/storage/migrations/' + n, resolve(migrations, n));
  const path = resolve(migrations, '003-native-execution.sql');
  writeFileSync(
    path,
    readFileSync(path, 'utf8') +
      "\nINSERT INTO initialization_leases VALUES('bad','missing',1,'HELD');\n",
  );
  expect(() => openApplicationStore(f.dir, pathToFileURL(migrations + '/'))).toThrow(
    'MIGRATION_FOREIGN_KEY_FAILURE',
  );
  const db = new Database(resolve(f.dir, 'router.db'));
  expect(db.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 2 });
  expect(db.prepare('select * from initialization_leases').all()).toHaveLength(1);
  expect(db.pragma('foreign_key_check')).toEqual([]);
  db.close();
});
it('Native registry never promotes certification and rejects unsafe, stale or mutated executables', () => {
  const dir = directory(),
    db = openApplicationStore(dir),
    m = new Management(db),
    p = m.createProject('native', dir),
    r = m.createRole({
      spaceId: p.space,
      name: 'role',
      description: 'dummy',
      harness: 'pi',
      workspaceId: p.workspace,
    });
  const executable = resolve(dir, 'dummy.bin');
  writeFileSync(executable, 'not executable');
  const config: NativeBindingConfig = {
    harness: 'pi',
    executable,
    executableSha256: hash(readFileSync(executable)),
    version: 'test',
    profileRef: 'dummy',
    providerId: 'mock',
    modelId: 'dummy',
    effort: 'off',
    workspace: dir,
    sessionHome: resolve(dir, 'session'),
    charterHash: 'charter-hash',
  };
  mkdirSync(config.sessionHome);
  db.prepare(
    "insert into account_profiles values('dummy','pi','dummy',null,'OTHER',null,null,'READY')",
  ).run();
  db.prepare("insert into auth_units values('auth','pi','dummy',?,1,'READY')").run(
    config.sessionHome,
  );
  db.prepare(
    "update bindings set account_id='dummy',auth_unit_id='auth',model_json=? where id=?",
  ).run(
    JSON.stringify({ provider_profile_id: 'mock', model_id: 'dummy', reasoning_effort: 'off' }),
    r.binding,
  );
  db.prepare('insert into role_charters values(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'charter',
    r.role,
    p.project,
    p.space,
    1,
    config.charterHash,
    1,
    1,
    p.workspace,
    '{}',
    JSON.stringify({
      workspace_access: 'read_only',
      allowed_paths: [],
      tool_profiles: [],
      network_profile: 'none',
    }),
    '[]',
    1,
  );
  const registry = new NativeExecutionRegistry(db);
  registry.register(r.binding, 1, config);
  expect(() => registry.register(r.binding, 1, { ...config, modelId: 'other' })).toThrow(
    'NATIVE_MODEL_BINDING_MISMATCH',
  );
  expect(() => registry.register(r.binding, 1, { ...config, profileRef: 'other' })).toThrow(
    'NATIVE_BINDING_MISMATCH',
  );
  expect(registry.anyCancel()).toBe(false);
  expect(registry.authorized(r.binding)).toBe(false);
  expect(() => registry.resolve(r.binding, 1)).toThrow('NATIVE_RUNTIME_NOT_IMPLEMENTED');
  const caps = JSON.parse(
    (db.prepare('select capability_json from bindings where id=?').get(r.binding) as any)
      .capability_json,
  );
  expect(caps.status).toBe('unverified');
  let launches = 0;
  const backend = {
    launch() {
      launches++;
      return {};
    },
    cancel() {
      return false;
    },
    async stop() {},
  };
  let authorized = false;
  registry.attach('pi', { backend, authorize: () => authorized, authorizeTool: () => true });
  expect(() =>
    new NativeBackend(registry).launch(
      'run',
      { epoch: 1, bindingId: r.binding },
      () => {},
      () => {},
    ),
  ).toThrow('NATIVE_SECURITY_NOT_VERIFIED');
  expect(launches).toBe(0);
  expect(registry.toolAuthorized(r.binding, 1, 'route_send')).toBe(false);
  authorized = true;
  expect(registry.authorized(r.binding)).toBe(true);
  expect(registry.toolAuthorized(r.binding, 1, 'route_send')).toBe(false);
  expect(registry.anyCancel()).toBe(false);
  db.prepare("insert into auth_units values('duplicate_auth','pi','dummy',?,1,'READY')").run(
    config.sessionHome,
  );
  expect(registry.authorized(r.binding)).toBe(false);
  db.prepare("delete from auth_units where id='duplicate_auth'").run();
  expect(() => registry.register(r.binding, 1, { ...config, version: 'changed' })).toThrow(
    'NATIVE_CONFIG_REQUIRES_NEW_BINDING',
  );
  db.prepare("update role_charters set hash='new-hash' where id='charter'").run();
  expect(registry.authorized(r.binding)).toBe(false);
  db.prepare('update role_charters set hash=? where id=?').run(config.charterHash, 'charter');
  expect(() => registry.resolve(r.binding, 2)).toThrow('NATIVE_CONFIG_UNAVAILABLE');
  writeFileSync(executable, 'changed');
  expect(() => registry.resolve(r.binding, 1)).toThrow('NATIVE_BINARY_MISMATCH');
  db.close();
});

it('NativeBackend preserves backend cleanup after launch throws with possible side effects', async () => {
  let stops = 0;
  const processBackend = {
    launch() {
      throw Error('AFTER_SPAWN');
    },
    cancel() {
      return false;
    },
    async stop() {
      stops++;
    },
  };
  const registry = {
    resolve: () => ({ config: {}, permissions: {}, backend: processBackend }),
  } as unknown as NativeExecutionRegistry;
  const backend = new NativeBackend(registry);
  expect(() =>
    backend.launch(
      'run',
      { epoch: 1, bindingId: 'binding' },
      () => {},
      () => {},
    ),
  ).toThrow('AFTER_SPAWN');
  await backend.stop();
  expect(stops).toBe(1);
});
