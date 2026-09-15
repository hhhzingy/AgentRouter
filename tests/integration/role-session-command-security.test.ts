import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { Management } from '../../packages/runtime/management.ts';

const close: (() => void)[] = [];
afterEach(() => {
  for (const fn of close.splice(0)) fn();
});
async function fixture() {
  mkdirSync('.local/l1-role-session-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/l1-role-session-tests/security-'));
  const db = openApplicationStore(dir);
  close.push(() => db.close());
  const management = new Management(db);
  const project = management.createProject('L1 security', dir);
  const role = management.createRole({
    spaceId: project.space,
    name: '安全测试',
    description: '',
    harness: 'pi',
    workspaceId: project.workspace,
  });
  const app = new ApplicationService(db, [dir]);
  app.roleSession = new RoleSessionExtension(db);
  const connection = app.open('human');
  const initialize = (id: string, client = 'client') =>
    app.handle(id, {
      v: 1,
      id: 'init',
      method: 'system.initialize',
      params: {
        client_protocol: 'agentrouter-client/1',
        client_version: '1.0.0-dev.0',
        client_id: client,
        requested_mode: 'controller',
        contract_revision: 'C1R1P1',
      },
    });
  await initialize(connection);
  const lease = (await app.handle(connection, {
    v: 1,
    id: 'lease',
    method: 'control.acquire',
    params: {},
    client_id: 'client',
    operation_id: 'lease',
    expected_revision: app.revision,
    scope: {},
  })) as any;
  const preflight = (await app.handle(connection, {
    v: 1,
    id: 'pf',
    method: 'roleSession.preflight',
    params: { role_id: role.role },
  })) as any;
  const command = {
    v: 1,
    id: 'create',
    method: 'roleSession.create',
    params: { role_id: role.role, name: 'B' },
    client_id: 'client',
    lease_id: lease.result.leaseId,
    request_key: 'key',
    operation_id: 'operation',
    expected_revision: app.revision,
    preflight_hash: preflight.result.preflight_hash,
  };
  return { db, app, connection, command, role, initialize };
}

it('提交故障整体回滚 WorkSession、activation、revision 与命令账本；原请求可以重试', async () => {
  const f = await fixture();
  const revision = f.app.revision;
  f.app.failNextCommit = true;
  expect(await f.app.handle(f.connection, f.command)).toMatchObject({
    error: { code: 'INTERNAL_ERROR' },
  });
  expect(f.app.revision).toBe(revision);
  expect(f.db.prepare('select count(*) n from role_sessions').get()).toEqual({ n: 1 });
  expect(f.db.prepare('select count(*) n from role_session_activations').get()).toEqual({ n: 1 });
  expect(
    f.db
      .prepare("select count(*) n from command_ledger where operation_id like 'roleSession:%'")
      .get(),
  ).toEqual({ n: 0 });
  const first = (await f.app.handle(f.connection, f.command)) as any;
  expect(first.error).toBeUndefined();
  f.app.roleSession = new RoleSessionExtension(f.db);
  expect(await f.app.handle(f.connection, { ...f.command, id: 'retry' })).toMatchObject({
    result: first.result,
  });
  expect(f.app.revision).toBe(revision + 1);
});

it('缓存命中前检查租约、连接授权、client 与 project 范围', async () => {
  const f = await fixture();
  expect(await f.app.handle(f.connection, f.command)).toHaveProperty('result');
  expect(await f.app.handle(f.connection, { ...f.command, lease_id: 'wrong' })).toMatchObject({
    error: { code: 'CONTROL_LEASE_REQUIRED' },
  });
  expect(await f.app.handle(f.connection, { ...f.command, client_id: 'other' })).toMatchObject({
    error: { code: 'CONTROL_LEASE_REQUIRED' },
  });
  const denied = f.app.open('human', false);
  await f.initialize(denied);
  expect(await f.app.handle(denied, f.command)).toMatchObject({ error: { code: 'SCOPE_DENIED' } });
  const scoped = f.app.open('human', true, new Set());
  await f.initialize(scoped);
  expect(await f.app.handle(scoped, f.command)).toMatchObject({ error: { code: 'SCOPE_DENIED' } });
  expect(f.db.prepare('select count(*) n from role_sessions').get()).toEqual({ n: 2 });
});

it('相同 request key 修改载荷产生冲突；不同 client 不读取另一 client 的缓存', async () => {
  const f = await fixture();
  expect(await f.app.handle(f.connection, f.command)).toHaveProperty('result');
  expect(
    await f.app.handle(f.connection, {
      ...f.command,
      params: { ...f.command.params, name: 'changed' },
    }),
  ).toMatchObject({ error: { code: 'OPERATION_CONFLICT' } });
  const reply = new RoleSessionExtension(f.db).handle(
    { ...f.command, client_id: 'other' },
    {
      principal: 'human',
      clientId: 'other',
      mode: 'controller',
      assertControllerLease: () => {},
      assertRevision: () => {
        throw Error('REVISION_MISMATCH');
      },
    },
  );
  expect(reply).toMatchObject({ error: { code: 'REVISION_MISMATCH' } });
});
