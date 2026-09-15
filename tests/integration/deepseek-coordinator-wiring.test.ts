import { expect, it } from 'vitest';
import { createFixture, request } from '../support.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';
import { DeepSeekContextCompressionBackend } from '../../packages/core-service/deepseek-context-compression.ts';

it('Core 协调器经真实 Backend/受信 Provider 接口压缩 Portable，权威状态不外发、cursor 不提前推进', async () => {
  const f = createFixture();
  try {
    const app = new ApplicationService(f.db, [f.dir]);
    f.db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values('rsess_role_b','role_b',0,'UNKNOWN',1)").run();
    for (let i = 0; i < 4; i++) app.contextStore.append({ roleId: 'role_b', sourceKind: 'synthetic', sourceId: 'entry-' + i,
      portableKind: 'USER_MESSAGE', content: 'Portable-fact-' + i + 'x'.repeat(40000) });
    const requests: any[] = [];
    const backend = new DeepSeekContextCompressionBackend({ id: 'deepseek.test', model: 'deepseek-test', allowedResolvedModels: ['deepseek-test'],
      contextWindowTokens: 1000000, maxOutputTokens: 3000, inputReserveTokens: 1000,
      policy: { origin: 'https://api.deepseek.com', path: '/chat/completions', models: ['deepseek-test'] } }, async () => 'synthetic-test-secret', () => {}, async r => {
      const wire = JSON.parse(r.body); requests.push(wire);
      const material = JSON.parse(wire.messages[1].content);
      const summary = { narrative: '保留四条 Portable 事实', decisions: [], constraints: [], failures: [], pending: [], conflicts: [], sources: material.sources };
      return { statusCode: 200, body: (async function* () { yield Buffer.from(JSON.stringify({ model: 'deepseek-test',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(summary) } }] })); })() };
    });
    const coordinator = new (ExecutionCoordinator as any)(app, { launch() { throw Error('not part of this test'); } },
      { compressionBackend: backend, compressionPolicy: { enabled: true, allowedBackendIds: [backend.id] } });
    f.core.send(f.core.management('role_a'), 'compression-task', request('role_b'));
    const dispatch = f.core.dispatch('role_b')!;
    // 仅构造离线迁移前提；不宣称公共 WS 或原生 Harness live 验收。
    f.db.prepare('update role_session_activations set operation_id=? where id=(select activation_id from runs where id=?)').run('compression-test', dispatch.id);
    const plan = await coordinator.buildContextPlan(dispatch, { model_json: JSON.stringify({ max_context_tokens: 20000 }) });
    expect(plan).not.toBeNull();
    expect(plan.compression.used).toBe(true);
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests)).not.toContain('authoritative_state');
    expect(plan.envelope.authoritative_state.task.id).toBe(dispatch.taskId);
    expect(plan.envelope.portable_context.entries[0].content.narrative).toContain('Portable');
    expect(app.contextStore.state('rsess_role_b').syncedThroughSeq).toBe(0);
  } finally { f.close(); } // 保留临时文件，不自动删除。
});
