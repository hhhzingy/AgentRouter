import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import { RoleContextStore } from '../../packages/core-service/role-context-store.ts';
import {
  ContextMigrationError,
  ContextMigrationService,
  deterministicPortableCompressionBackend,
} from '../../packages/core-service/context-migration.ts';

// 用户要求保留测试文件；每次使用新目录，不自动删除。

function fixture() {
  mkdirSync('.local/v11-context-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/v11-context-tests/migration-'));
  const db = openApplicationStore(dir);
  const management = new Management(db);
  const project = management.createProject('Context migration test', dir);
  const role = management.createRole({
    spaceId: project.space,
    name: 'migration-role',
    description: 'budget test',
    harness: 'pi',
    workspaceId: project.workspace,
  }).role;
  const sessionA = (db.prepare("select id from role_sessions where role_id=? and state='ACTIVE'").get(role) as { id: string }).id;
  const sessionB = 'rsess_context_migration_b';
  db.prepare('insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?)').run(sessionB, role, 2, 'B', 'ARCHIVED', 1, 2, 2);
  db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values(?,?,0,'UNKNOWN',?)").run(sessionB, role, 2);
  return { db, role, sessionA, sessionB, store: new RoleContextStore(db, () => 100), project };
}

it('new WS uses full visible context, references large entries, and keeps authoritative state outside compression', async () => {
  const f = fixture();
  try {
    f.store.appendConversation({
      roleId: f.role,
      sourceWorkSessionId: f.sessionA,
      sourceId: 'large-output',
      kind: 'TOOL_RESULT',
      title: 'large visible output',
      body: 'x'.repeat(70 * 1024),
      atMs: 1,
    });
    const service = new ContextMigrationService(f.db, f.store, () => 100);
    const generous = service.preflight({
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'full-fit',
      mode: 'FULL',
      budget: { maxContextTokens: 100_000, currentUsageTokens: 0, source: 'EXACT' },
    });
    expect(generous.recommendation).toBe('FIT');
    expect(generous.entries[0].transfer_mode).toBe('REFERENCE');
    const exact = JSON.parse(JSON.stringify(generous.authoritativeState));
    const fit = await service.build({
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'full-fit',
      mode: 'FULL',
      budget: { maxContextTokens: 100_000, currentUsageTokens: 0, source: 'EXACT' },
    });
    expect(fit.envelope.authoritative_state).toEqual(exact);
    expect(fit.compression.used).toBe(false);
    expect(fit.envelope.portable_context.entries[0].content).toMatchObject({
      type: 'portable-context-reference',
    });
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(0);
  } finally {
    f.db.close();
  }
});

it('over-budget full context blocks without an authorized backend and compresses only Portable Context when explicitly enabled', async () => {
  const f = fixture();
  try {
    f.store.appendConversation({
      roleId: f.role,
      sourceWorkSessionId: f.sessionA,
      sourceId: 'visible-1',
      kind: 'ASSISTANT_MESSAGE',
      title: 'visible',
      body: 'visible context '.repeat(2000),
      atMs: 1,
    });
    const service = new ContextMigrationService(f.db, f.store, () => 100);
    const initial = service.preflight({
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'full-compress',
      mode: 'FULL',
      budget: { maxContextTokens: 100_000, currentUsageTokens: 0, source: 'EXACT' },
    });
    // 保留最终 envelope/entry 元数据预算，仍远小于本测试 Portable 原文。
    const maxContextTokens = initial.budget.authoritativeTokens + initial.budget.reservedTokens + 1000;
    const input = {
      roleId: f.role,
      targetWorkSessionId: f.sessionB,
      operationId: 'full-compress',
      mode: 'FULL' as const,
      budget: { maxContextTokens, currentUsageTokens: 0, source: 'EXACT' as const },
    };
    expect(service.preflight(input).recommendation).toBe('COMPRESS');
    await expect(service.build(input)).rejects.toMatchObject({ code: 'CONTEXT_MIGRATION_TOO_LARGE' });
    expect(f.store.state(f.sessionB).syncedThroughSeq).toBe(0);
    let sawAuthoritative = false;
    const backend = {
      ...deterministicPortableCompressionBackend,
      async compress(value: Parameters<typeof deterministicPortableCompressionBackend.compress>[0]) {
        sawAuthoritative = Object.prototype.hasOwnProperty.call(value, 'authoritativeState');
        return deterministicPortableCompressionBackend.compress(value);
      },
    };
    const compressed = await service.build({
      ...input,
      compressionBackend: backend,
      compressionPolicy: { enabled: true, allowedBackendIds: [backend.id] },
    });
    expect(sawAuthoritative).toBe(false);
    expect(compressed.fidelity).toBe('COMPRESSED');
    expect(compressed.compression.used).toBe(true);
    expect(compressed.envelope.authoritative_state).toEqual(initial.authoritativeState);
    expect(compressed.envelope.portable_context.entries).toHaveLength(1);
    service.confirm(compressed, { marker: compressed.envelope.stable_marker });
    expect(f.store.state(f.sessionB)).toMatchObject({ syncedThroughSeq: 1, fidelity: 'COMPRESSED' });
  } finally {
    f.db.close();
  }
});
