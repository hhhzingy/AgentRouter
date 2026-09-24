import { expect, it } from 'vitest';
import { createFixture } from '../support.ts';
import { RoleContextStore } from '../../packages/core-service/role-context-store.ts';
import { ContextMigrationService } from '../../packages/core-service/context-migration.ts';

function fixture() {
  const f = createFixture();
  f.db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values('rsess_role_b','role_b',0,'UNKNOWN',1)").run();
  const store = new RoleContextStore(f.db);
  const service = new ContextMigrationService(f.db, store);
  const input = { roleId: 'role_b', targetWorkSessionId: 'rsess_role_b', operationId: 'compression-boundary', mode: 'FULL' as const,
    budget: { maxContextTokens: 1000000, currentUsageTokens: 0 } };
  return { ...f, store, service, input };
}
it('最终 envelope 元数据开销必须计入预算，失败不创建 PREPARED receipt', async () => {
  const f = fixture();
  try {
    const p = f.service.preflight(f.input);
    f.input.budget.maxContextTokens = p.budget.requiredTokens + p.budget.reservedTokens;
    expect(f.service.preflight(f.input).recommendation).toBe('FIT');
    await expect(f.service.build(f.input)).rejects.toMatchObject({ code: 'CONTEXT_MIGRATION_TOO_LARGE' });
    expect(f.db.prepare('select count(*) n from role_context_sync_receipts').get()).toEqual({ n: 0 });
  } finally { f.close(); }
});
it('大条目引用化后不重新塞原文给压缩器，Core 拒绝错误覆盖范围', async () => {
  const f = fixture();
  try {
    f.store.append({ roleId: 'role_b', sourceKind: 'synthetic', sourceId: 'large', portableKind: 'USER_MESSAGE', content: 'x'.repeat(90000) });
    f.store.append({ roleId: 'role_b', sourceKind: 'synthetic', sourceId: 'small', portableKind: 'USER_MESSAGE', content: 'y'.repeat(12000) });
    const p = f.service.preflight(f.input);
    f.input.budget.maxContextTokens = p.budget.authoritativeTokens + p.budget.reservedTokens + 1000;
    let received: any;
    const backend = { id: 'test', provider: 'test', model: 'test', async compress(input: any) {
      received = input;
      return { summary: { narrative: 'test' }, coveredFromSeq: 1, coveredThroughSeq: 1 };
    } };
    await expect(f.service.build({ ...f.input, compressionBackend: backend, compressionPolicy: { enabled: true } }))
      .rejects.toMatchObject({ code: 'CONTEXT_COMPRESSION_FAILED' });
    expect(received.entries[0].content.type).toBe('portable-context-reference');
    expect(JSON.stringify(received)).not.toContain('x'.repeat(90000));
    expect(received.entries).toHaveLength(2);
    expect(f.db.prepare('select count(*) n from role_context_sync_receipts').get()).toEqual({ n: 0 });
  } finally { f.close(); }
});
