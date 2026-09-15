import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture, request } from '../support.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';
import { ContextMigrationService } from '../../packages/core-service/context-migration.ts';
import { DeepSeekContextCompressionBackend } from '../../packages/core-service/deepseek-context-compression.ts';

it.skipIf(process.env.AGENTROUTER_V11_DEEPSEEK_LIVE !== '1')('真实 DeepSeek 经 Core 压缩合成 Portable，关闭 thinking，不启动原生会话', async () => {
  const f = createFixture();
  const attempts: unknown[] = [];
  try {
    const app = new ApplicationService(f.db, [f.dir]);
    f.db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values('rsess_role_b','role_b',0,'UNKNOWN',1)").run();
    const facts = [
      'CANARY-A1: 保留 API v2；不得修改 legacy 目录。',
      'CANARY-B2: timeout 从 10 秒批准改成 30 秒，10 秒已失效。',
      'CANARY-C3: 缓存方案第一次失败，原因是过期键；下一步验证失效处理。',
      'CANARY-D4: 测试产物必须包含 build-id，禁止改变权限。',
    ];
    facts.forEach((fact, i) => app.contextStore.append({ roleId: 'role_b', sourceKind: 'synthetic-live-smoke',
      sourceId: 'fact-' + i, portableKind: 'USER_MESSAGE', content: { fact, observations: Array.from({ length: 70 }, (_, n) => ({ observation: n, text: fact })) } }));
    const model = 'deepseek-flash'; // 已在本机 /models 探测；不是旧 seed 推断。
    const backend = new DeepSeekContextCompressionBackend({ id: 'deepseek.live-smoke', model, allowedResolvedModels: [model],
      contextWindowTokens: 1000000, maxOutputTokens: 2048, inputReserveTokens: 4096, thinking: 'disabled',
      policy: { origin: 'https://api.deepseek.com', path: '/chat/completions', models: [model], timeoutMs: 60000 } }, async () => {
      const text = readFileSync('E:/AgentRouter/账号信息/通用API/Deepseek.txt', 'utf8');
      const keys = [...new Set(text.match(/sk-[A-Za-z0-9_-]{16,}/g) ?? [])];
      if (keys.length !== 1 || !text.includes('https://api.deepseek.com')) throw Error('AUTHORIZED_CREDENTIAL_INVALID');
      return keys[0];
    }, a => {
      attempts.push(a);
      f.db.prepare('insert into application_audit(project_id,actor,kind,detail_json,at_ms) values(?,?,?,?,?)')
        .run('project_test', 'live-compression-test', 'ContextCompressionProviderAttempt', JSON.stringify(a), Date.now());
    });
    const coordinator = new ExecutionCoordinator(app, { launch() { throw Error('NATIVE_LAUNCH_FORBIDDEN'); }, cancel: () => false, stop: async () => {} },
      { compressionBackend: backend, compressionPolicy: { enabled: true, allowedBackendIds: [backend.id] } });
    f.core.send(f.core.management('role_a'), 'live-compression-task', request('role_b'));
    const dispatch = f.core.dispatch('role_b')!;
    f.db.prepare('update role_session_activations set operation_id=? where id=(select activation_id from runs where id=?)').run('live-compression-test', dispatch.id);
    const preflight = new ContextMigrationService(f.db, app.contextStore).preflight({ roleId: 'role_b', targetWorkSessionId: 'rsess_role_b',
      mode: 'FULL', taskId: dispatch.taskId, runId: dispatch.id, budget: { maxContextTokens: 1000000, currentUsageTokens: 0 } });
    const maxContextTokens = preflight.budget.authoritativeTokens + preflight.budget.reservedTokens + 4000;
    const plan = await (coordinator as any).buildContextPlan(dispatch, { model_json: JSON.stringify({ max_context_tokens: maxContextTokens }) });
    expect(plan.compression.used).toBe(true);
    const text = JSON.stringify(plan.envelope.portable_context.entries[0].content);
    for (const id of ['CANARY-A1', 'CANARY-B2', 'CANARY-C3', 'CANARY-D4']) expect(text.includes(id)).toBe(true);
    expect(plan.envelope.authoritative_state).toEqual(preflight.authoritativeState);
    expect(app.contextStore.state('rsess_role_b').syncedThroughSeq).toBe(0);
    console.log(JSON.stringify({ kind: 'V11_DEEPSEEK_CORE_SMOKE', status: 'PASS', mode: 'REAL_CORE_FIXTURE_LIVE_PROVIDER',
      attempts, summaryHash: createHash('sha256').update(text).digest('hex'), finalEnvelopeBytes: Buffer.byteLength(JSON.stringify(plan.envelope)),
      sourceEstimateTokens: preflight.budget.portableTokens, sourceEstimateMethod: 'LEGACY_BYTES_DIV_4_NOT_EXACT',
      capacityEvidence: 'OFFICIAL_DOCUMENTATION_NOT_BOUNDARY_PROBED', nativeTargetExecuted: false }));
  } catch (e) {
    console.log(JSON.stringify({ kind: 'V11_DEEPSEEK_CORE_SMOKE', status: 'FAIL', attempts }));
    throw e;
  } finally { f.close(); } // 保留测试 DB，无文件删除。
}, 70000);
