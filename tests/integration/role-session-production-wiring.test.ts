import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { Management } from '../../packages/runtime/management.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture() {
  mkdirSync('.local/l1-role-session-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/l1-role-session-tests/case-'));
  const db = openApplicationStore(dir);
  const management = new Management(db);
  const project = management.createProject('L1 RoleSession production wiring', dir);
  const role = management.createRole({
    spaceId: project.space,
    name: '生产接线角色',
    description: '测试持久幂等与跨连接鉴权',
    harness: 'pi',
    workspaceId: project.workspace,
  });
  cleanups.push(() => db.close());
  return { dir, db, project, role };
}

function frame(roleId: string, requestId: string, operationId = 'op-l1', requestKey = 'rk-l1') {
  return {
    v: 1,
    id: requestId,
    method: 'roleSession.create',
    params: { role_id: roleId, name: '可重放会话' },
    client_id: 'client-l1',
    lease_id: 'lease-l1',
    request_key: requestKey,
    operation_id: operationId,
    expected_revision: 1,
    preflight_hash: '0'.repeat(64),
  };
}

it('RoleSession mutation requires request metadata instead of falling back to an unprotected write', () => {
  const f = fixture();
  const ext = new RoleSessionExtension(f.db);
  const reply = ext.handle(
    {
      v: 1,
      id: 'missing-metadata',
      method: 'roleSession.create',
      params: { role_id: f.role.role, name: '不能绕过保护' },
      client_id: 'client-l1',
      lease_id: 'lease-l1',
    },
    {
      principal: 'human-l1',
      clientId: 'client-l1',
      mode: 'controller',
      assertControllerLease: () => {},
    },
  ) as { error?: { code?: string } };
  expect(reply.error?.code).toBe('REQUEST_KEY_AND_REVISION_REQUIRED');
});

it('RoleSession command is durable across extension restart and cannot replay through an unauthorized cache hit', () => {
  const f = fixture();
  const ext = new RoleSessionExtension(f.db);
  const preflight = ext.handle(
    { v: 1, id: 'preflight', method: 'roleSession.preflight', params: { role_id: f.role.role } },
    {
      principal: 'human-l1',
      clientId: 'client-l1',
      mode: 'controller',
      assertControllerLease: () => {},
    },
  ) as { result: { preflight_hash: string } };
  const command = {
    ...frame(f.role.role, 'first'),
    preflight_hash: preflight.result.preflight_hash,
  };
  const first = ext.handle(command, {
    principal: 'human-l1',
    clientId: 'client-l1',
    mode: 'controller',
    assertControllerLease: () => {},
    assertRevision: (revision) => {
      if (revision !== 1) throw Error('REVISION_MISMATCH');
    },
  }) as { result?: { session?: { id?: string } }; error?: { code?: string } };
  expect(first.error).toBeUndefined();
  const sessionId = first.result?.session?.id;
  expect(sessionId).toBeTruthy();

  const replay = new RoleSessionExtension(f.db).handle(
    { ...command, id: 'replay' },
    {
      principal: 'human-l1',
      clientId: 'client-l1',
      mode: 'controller',
      assertControllerLease: () => {},
      assertRevision: (revision) => {
        if (revision !== 2) throw Error('REVISION_MISMATCH');
      },
    },
  ) as { result?: { session?: { id?: string } }; error?: { code?: string } };
  expect(replay.error).toBeUndefined();
  expect(replay.result?.session?.id).toBe(sessionId);
  expect(
    f.db.prepare('select count(*) as n from role_sessions where role_id=?').get(f.role.role),
  ).toEqual({ n: 2 });

  const unauthorized = ext.handle(
    { ...command, id: 'unauthorized-replay' },
    {
      principal: 'human-l1',
      clientId: 'client-l1',
      mode: 'observer',
      assertControllerLease: () => {
        throw Error('CONTROL_LEASE_REQUIRED');
      },
    },
  ) as { error?: { code?: string } };
  expect(unauthorized.error?.code).toBe('CONTROL_LEASE_REQUIRED');
});

it('ApplicationService does not dispatch RoleSession before an initialized authorized connection', async () => {
  const f = fixture();
  const app = new ApplicationService(f.db, [f.dir], false);
  app.roleSession = new RoleSessionExtension(f.db);
  const connection = app.open('unauthorized-l1', false);
  const reply = (await app.handle(connection, {
    v: 1,
    id: 'pre-init',
    method: 'roleSession.list',
    params: { role_id: f.role.role },
  })) as { error?: { code?: string } };
  expect(reply.error?.code).toBe('NOT_INITIALIZED');
});
