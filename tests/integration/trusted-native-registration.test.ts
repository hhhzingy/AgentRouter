import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { Management } from '../../packages/runtime/management.ts';
import { NativeExecutionRegistry } from '../../packages/core-service/native-registry.ts';
import {
  registerTrustedRole,
  type TrustedNativeProfile,
} from '../../packages/core-service/trusted-native-registration.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  mkdirSync('.local/trusted-registration-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/trusted-registration-tests/case-'));
  const db = openApplicationStore(dir);
  cleanups.push(() => {
    db.close();
    rmSync(dir, { recursive: true });
  });
  const app = new ApplicationService(db, [dir], false);
  const registry = new NativeExecutionRegistry(db);
  const management = new Management(db);
  const project = management.createProject('registration test', dir);
  const executable = resolve(dir, 'fake.bin');
  writeFileSync(executable, 'not a real harness');
  const profile: TrustedNativeProfile = {
    id: 'test_profile',
    harness: 'pi',
    executable,
    executableSha256: createHash('sha256').update('not a real harness').digest('hex'),
    version: 'test',
    providerId: 'deepseek',
    modelId: 'deepseek-v4-flash',
    effort: 'off',
    sessionHome: resolve(dir, 'managed-home'),
  };
  function role() {
    const r = management.createRole({
      spaceId: project.space,
      name: 'test role',
      description: 'test',
      harness: 'pi',
      workspaceId: project.workspace,
    });
    db.prepare('update bindings set model_json=? where id=?').run(
      JSON.stringify({
        provider_profile_id: profile.providerId,
        model_id: profile.modelId,
        reasoning_effort: profile.effort,
      }),
      r.binding,
    );
    db.prepare('insert into role_charters values(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      'charter_' + r.role,
      r.role,
      project.project,
      project.space,
      1,
      'charter-hash',
      1,
      1,
      project.workspace,
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
    return r;
  }
  return { db, dir, app, registry, profile, role };
}
it('registers the exact profile in the application database without certifying live support', () => {
  const f = fixture(),
    r = f.role();
  expect(registerTrustedRole(f.app, f.registry, r.role, [f.profile])).toBe(true);
  expect(f.app.one('select account_id,auth_unit_id from bindings where id=?', r.binding)).toEqual({
    account_id: 'test_profile',
    auth_unit_id: 'native_test_profile',
  });
  const stored = f.app.one('select * from native_binding_configs where binding_id=?', r.binding);
  expect(JSON.parse(stored.config_json)).toMatchObject({
    profileRef: f.profile.id,
    modelId: f.profile.modelId,
    workspace: process.platform === 'win32' ? f.dir.toLowerCase() : f.dir,
    executableSha256: f.profile.executableSha256,
  });
  expect(stored.config_hash).toBe(createHash('sha256').update(stored.config_json).digest('hex'));
  expect(f.registry.authorized(r.binding)).toBe(false);
  expect(
    JSON.parse(
      f.app.one('select capability_json from bindings where id=?', r.binding).capability_json,
    ).status,
  ).toBe('unverified');
});
it('does not register a partial model match and rejects ambiguous profiles', () => {
  const f = fixture(),
    r = f.role();
  for (const change of [
    { providerId: 'other' },
    { modelId: 'other' },
    { effort: 'low' },
    { harness: 'codex' as const },
  ]) {
    expect(registerTrustedRole(f.app, f.registry, r.role, [{ ...f.profile, ...change }])).toBe(
      false,
    );
  }
  expect(f.app.one('select count(*) n from account_profiles').n).toBe(0);
  expect(f.app.one('select account_id from bindings where id=?', r.binding).account_id).toBeNull();
  expect(() =>
    registerTrustedRole(f.app, f.registry, r.role, [f.profile, { ...f.profile, id: 'second' }]),
  ).toThrow('NATIVE_PROFILE_AMBIGUOUS');
});
it('never changes a role already bound to another account', () => {
  const f = fixture(),
    r = f.role();
  f.db
    .prepare(
      "insert into account_profiles values('other','pi','other',null,'OTHER',null,null,'READY')",
    )
    .run();
  f.db.prepare("insert into auth_units values('other_unit','pi','other',?,1,'READY')").run(f.dir);
  f.db
    .prepare("update bindings set account_id='other',auth_unit_id='other_unit' where id=?")
    .run(r.binding);
  expect(() => registerTrustedRole(f.app, f.registry, r.role, [f.profile])).toThrow(
    'NATIVE_ACCOUNT_CHANGE_REQUIRES_SWITCH',
  );
  expect(f.app.one('select account_id,auth_unit_id from bindings where id=?', r.binding)).toEqual({
    account_id: 'other',
    auth_unit_id: 'other_unit',
  });
  expect(f.app.one('select count(*) n from native_binding_configs').n).toBe(0);
});
it('reuses one auth unit for roles using the same profile and rejects mutation of locked parameters', () => {
  const f = fixture(),
    first = f.role(),
    second = f.role();
  for (const r of [first, second, first])
    expect(registerTrustedRole(f.app, f.registry, r.role, [f.profile])).toBe(true);
  expect(f.app.one('select count(*) n from auth_units').n).toBe(1);
  expect(f.app.one('select count(*) n from native_binding_configs').n).toBe(2);
  const before = f.app.one(
    'select config_hash from native_binding_configs where binding_id=?',
    first.binding,
  ).config_hash;
  expect(() =>
    registerTrustedRole(f.app, f.registry, first.role, [{ ...f.profile, version: 'changed' }]),
  ).toThrow('NATIVE_CONFIG_REQUIRES_NEW_BINDING');
  expect(
    f.app.one('select config_hash from native_binding_configs where binding_id=?', first.binding)
      .config_hash,
  ).toBe(before);
});
it('rejects an executable hash mismatch atomically and refuses a changed workspace binding', () => {
  const f = fixture(),
    r = f.role();
  expect(() =>
    registerTrustedRole(f.app, f.registry, r.role, [
      { ...f.profile, executableSha256: '0'.repeat(64) },
    ]),
  ).toThrow('NATIVE_BINARY_MISMATCH');
  expect(f.app.one('select count(*) n from account_profiles').n).toBe(0);
  expect(f.app.one('select account_id from bindings where id=?', r.binding).account_id).toBeNull();
  registerTrustedRole(f.app, f.registry, r.role, [f.profile]);
  const config = JSON.parse(
    f.app.one('select config_json from native_binding_configs where binding_id=?', r.binding)
      .config_json,
  );
  const other = resolve(f.dir, 'other-workspace');
  mkdirSync(other);
  expect(() => f.registry.register(r.binding, 1, { ...config, workspace: other })).toThrow(
    'NATIVE_BINDING_MISMATCH',
  );
  f.db
    .prepare(
      'update workspaces set canonical_path=? where id=(select workspace_id from bindings where id=?)',
    )
    .run(other, r.binding);
  expect(() => f.registry.resolve(r.binding, 1)).toThrow('NATIVE_BINDING_MISMATCH');
  expect(() => registerTrustedRole(f.app, f.registry, r.role, [f.profile])).toThrow(
    'NATIVE_CONFIG_REQUIRES_NEW_BINDING',
  );
});
