import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import { RoleContextStore } from '../../packages/core-service/role-context-store.ts';
import {
  ContextMigrationService,
  deterministicPortableCompressionBackend,
} from '../../packages/core-service/context-migration.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  mkdirSync('.local/v11-context-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/v11-context-tests/native-compaction-'));
  roots.push(dir);
  const db = openApplicationStore(dir);
  const management = new Management(db);
  const project = management.createProject('Native compaction test', dir);
  const role = management.createRole({
    spaceId: project.space,
    name: 'native-compaction-role',
    description: 'native compaction test',
    harness: 'pi',
    workspaceId: project.workspace,
  }).role;
  const sessionA = (db.prepare("select id from role_sessions where role_id=? and state='ACTIVE'").get(role) as { id: string }).id;
  const sessionB = 'rsess_native_compaction_b';
  db.prepare('insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?)').run(sessionB, role, 2, 'B', 'ARCHIVED', 1, 2, 2);
  db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values(?,?,0,'UNKNOWN',?)").run(sessionB, role, 2);
  return { db, role, sessionA, sessionB, store: new RoleContextStore(db, () => 100) };
}

it('uses native compaction first, rechecks the budget, and waits for a native receipt before advancing the cursor', async () => {
  const f = fixture();
  try {
    f.store.appendConversation({
      roleId: f.role,
      sourceWorkSessionId: f.sessionA,
      sourceId: 'visible-for-native-compaction',
      kind: 'ASSISTANT_MESSAGE',
      title: 'visible',
      body: 'visible context '.repeat(2000),
      atMs: 1,
    });
    const service = new ContextMigrationService(f.db, f.store, () => 100);
    // Z1 语义:target usage 必须来自驱动实测;缺失=UNKNOWN=preflight BLOCK,不得当 0。
    // 本用例模拟全新目标 WS,驱动上报实际 usage=0(EXACT)。
    const initial = service.preflight({
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'native-first',
      mode: 'FULL',
      budget: { maxContextTokens: 100_000, currentUsageTokens: 0, source: 'EXACT' },
    });
    const input = {
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'native-first',
      mode: 'FULL' as const,
      budget: {
        maxContextTokens: initial.budget.authoritativeTokens + initial.budget.reservedTokens + 160,
        currentUsageTokens: 0,
        source: 'EXACT' as const,
      },
    };
    expect(service.preflight(input).recommendation).toBe('COMPRESS');

    let nativeInput: import('../../packages/core-service/context-migration.ts').NativeCompactionBackendInput | undefined;
    let externalCalled = false;
    const native = {
      id: 'fixture.native-compaction',
      provider: 'fixture',
      model: 'native-test',
      async compact(value: import('../../packages/core-service/context-migration.ts').NativeCompactionBackendInput) {
        nativeInput = value;
        return { maxContextTokens: 100_000, currentUsageTokens: 0, source: 'EXACT' as const };
      },
    };
    const external = {
      ...deterministicPortableCompressionBackend,
      async compress(value: Parameters<typeof deterministicPortableCompressionBackend.compress>[0]) {
        externalCalled = true;
        return deterministicPortableCompressionBackend.compress(value);
      },
    };

    const plan = await service.build({
      ...input,
      nativeCompactionBackend: native,
      compressionBackend: external,
      compressionPolicy: { enabled: true, allowedBackendIds: [external.id] },
    });
    expect(nativeInput).toMatchObject({
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'native-first',
      mode: 'FULL',
    });
    expect(nativeInput).not.toHaveProperty('entries');
    expect(nativeInput).not.toHaveProperty('authoritativeState');
    expect(externalCalled).toBe(false);
    expect(plan.recommendation).toBe('FIT');
    expect(plan.fidelity).toBe('EXACT');
    expect(plan.compression.used).toBe(false);
    expect(plan.compression.nativeCompaction).toMatchObject({
      attempted: true,
      used: true,
      backendId: native.id,
    });
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(0);

    service.confirm(plan, { marker: plan.envelope.stable_marker });
    expect(f.store.state(f.sessionB)).toMatchObject({ syncedThroughSeq: 1, fidelity: 'EXACT' });
  } finally {
    f.db.close();
  }
});

