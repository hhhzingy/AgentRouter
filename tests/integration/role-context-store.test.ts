import { expect, it, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import { RoleContextStore } from '../../packages/core-service/role-context-store.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  mkdirSync('.local/v11-context-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/v11-context-tests/case-'));
  roots.push(dir);
  const db = openApplicationStore(dir);
  const management = new Management(db);
  const project = management.createProject('Context index test', dir);
  const role = management.createRole({
    spaceId: project.space,
    name: 'continuity-role',
    description: 'visible context test',
    harness: 'pi',
    workspaceId: project.workspace,
  });
  const sessionA = (db.prepare("select id from role_sessions where role_id=? and state='ACTIVE'").get(role.role) as { id: string }).id;
  const sessionB = 'rsess_context_b';
  db.prepare('insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?)').run(sessionB, role.role, 2, 'B', 'ARCHIVED', 1, 2, 2);
  db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values(?,?,0,'UNKNOWN',?)").run(sessionB, role.role, 2);
  return { db, role: role.role, sessionA, sessionB, store: new RoleContextStore(db, () => 100) };
}

it('append-only index 去重、Delta 排除 target WS，且 cursor 只在 receipt 后推进', () => {
  const f = fixture();
  try {
    f.store.appendConversation({ roleId: f.role, sourceWorkSessionId: f.sessionA, sourceId: 'a-1', kind: 'ASSISTANT_MESSAGE', title: '一', body: 'visible-1', atMs: 1 });
    const duplicate = f.store.appendConversation({ roleId: f.role, sourceWorkSessionId: f.sessionA, sourceId: 'a-1', kind: 'ASSISTANT_MESSAGE', title: '一', body: 'visible-1', atMs: 1 });
    expect(duplicate.inserted).toBe(false);
    f.store.appendConversation({ roleId: f.role, sourceWorkSessionId: f.sessionA, sourceId: 'a-2', kind: 'ROUTE_RESULT', title: '二', body: 'visible-2', atMs: 2 });
    f.store.appendConversation({ roleId: f.role, sourceWorkSessionId: f.sessionB, sourceId: 'b-1', kind: 'ASSISTANT_MESSAGE', title: '目标已有', body: 'already native', atMs: 3 });
    const plan = f.store.planDelta(f.role, f.sessionB, 'op-delta-1');
    expect(plan).toMatchObject({ fromSeq: 0, throughSeq: 3, mode: 'DELTA' });
    expect(plan.entries.map((entry) => entry.sourceId)).toEqual(['a-1', 'a-2']);
    const prepared = f.store.prepare(plan);
    expect(prepared.state).toBe('PREPARED');
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(0);
    expect(() => f.store.confirm(plan.operationId, { marker: 'wrong-marker' })).toThrow('CONTEXT_SYNC_MARKER_MISMATCH');
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(0);
    f.store.confirm(plan.operationId, { marker: plan.stableMarker });
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(3);
    expect(f.store.planDelta(f.role, f.sessionB, 'op-delta-2').entries).toEqual([]);
  } finally {
    f.db.close();
  }
});

it('stable marker reconcile 可确认 pending sync，不接受自然语言 ACK 或敏感字段', () => {
  const f = fixture();
  try {
    f.store.appendConversation({ roleId: f.role, sourceWorkSessionId: f.sessionA, sourceId: 'a-3', kind: 'NOTICE', title: '通知', body: 'visible', atMs: 1 });
    const plan = f.store.planDelta(f.role, f.sessionB, 'op-marker');
    f.store.prepare(plan);
    expect(f.store.reconcile(plan.operationId, ['收到上下文'])).toMatchObject({ state: 'PREPARED' });
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(0);
    expect(f.store.reconcile(plan.operationId, [plan.stableMarker])).toMatchObject({ state: 'CONFIRMED' });
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(1);
    expect(() => f.store.append({ roleId: f.role, sourceWorkSessionId: f.sessionA, sourceKind: 'test', sourceId: 'bad', portableKind: 'NOTICE', content: { secret: 'must-not-persist' } })).toThrow('PORTABLE_CONTEXT_FORBIDDEN_FIELD');
  } finally {
    f.db.close();
  }
});
