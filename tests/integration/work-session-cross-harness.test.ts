import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { Management } from '../../packages/runtime/management.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
import { NativeExecutionRegistry } from '../../packages/core-service/native-registry.ts';
import { registerTrustedRole, type TrustedNativeProfile } from '../../packages/core-service/trusted-native-registration.ts';
import { transitionWorkSessionBinding } from '../../packages/core-service/work-session-transition.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import { validateDefinition } from '../../packages/client-contract/c1r1p1/index.ts';
import { NativeSessionStore } from '../../packages/core-service/native-session-store.ts';

it('W02 公共会话接口 A→B(跨Harness)→C 保留 WS 身份与 fresh activation；切回历史被拒绝；提交失败整体回滚', async () => {
  mkdirSync('.local/l1-cross-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/l1-cross-tests/case-'));
  const db = openApplicationStore(dir);
  try {
    const management = new Management(db);
    const project = management.createProject('跨 Harness 回归', dir);
    const profiles: TrustedNativeProfile[] = (['codex', 'kimi_code'] as const).map(harness => ({
      id: 'test_' + harness, harness, executable: process.execPath,
      executableSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
      version: 'test', providerId: 'provider_' + harness, modelId: 'model', effort: 'high', sessionHome: resolve(dir, harness),
    }));
    const runtime = { harness: 'codex', provider_profile_id: profiles[0].providerId, model_id: 'model', reasoning_effort: 'high' };
    const role = management.createRole({ spaceId: project.space, name: 'role', description: '', harness: 'codex', workspaceId: project.workspace, model: runtime });
    const app = new ApplicationService(db, [dir]);
    app.roleSession = new RoleSessionExtension(db);
    app.publish(role.role, { ...structuredClone(seed.roles[0]), workspace_ref: project.workspace, runtime } as any);
    const registry = new NativeExecutionRegistry(db);
    registerTrustedRole(app, registry, role.role, profiles);
    (app as any).roleSessionTransition = (r: string, h: string, s?: string) => transitionWorkSessionBinding(app, registry, profiles, r, h, s);
    const c = app.open('test');
    await app.handle(c, { v: 1, id: 'init', method: 'system.initialize', params: { client_protocol: 'agentrouter-client/1', client_version: '1.0.0-dev.0', client_id: 'test', requested_mode: 'controller', contract_revision: 'C1R1P1' } });
    const lease = await app.handle(c, { v: 1, id: 'lease', method: 'control.acquire', params: {}, client_id: 'test', operation_id: 'lease', expected_revision: app.revision, scope: {} }) as any;
    let n = 0;
    const command = async (method: string, params: Record<string, unknown>) => {
      const pf = await app.handle(c, { v: 1, id: 'pf', method: 'roleSession.preflight', params: { role_id: role.role, ...(params.session_id ? { session_id: params.session_id } : { target_harness: params.target_harness }) } }) as any;
      const key = 'op' + ++n;
      return app.handle(c, { v: 1, id: key, method, params: { role_id: role.role, ...params }, client_id: 'test', lease_id: lease.result.leaseId, request_key: key, operation_id: key, expected_revision: app.revision, preflight_hash: pf.result.preflight_hash }) as Promise<any>;
    };
    const original = app.one('select * from role_sessions where role_id=?', role.role);
    // 合成原生引用，不启动真实 Harness；恢复通过生产 NativeSessionStore 验证。
    db.prepare('update role_sessions set native_session_ref=? where id=?').run(JSON.stringify({ id: 'native-original' }), original.id);
    const before = app.one('select * from bindings where is_current=1');
    app.failNextCommit = true;
    expect(await command('roleSession.create', { name: 'B', target_harness: 'kimi_code' })).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(app.one('select * from bindings where is_current=1')).toEqual(before);
    expect(app.one('select count(*) n from native_binding_configs')).toEqual({ n: 1 });
    const b = await command('roleSession.create', { name: 'B', target_harness: 'kimi_code' });
    expect(b.error).toBeUndefined();
    expect(b.result.session.harness).toBe('kimi_code');
    validateDefinition('PlanModelSelection', JSON.parse(app.one('select model_json from bindings where is_current=1').model_json));
    // W02 新语义:切回 ARCHIVED 的原始会话被显式拒绝,历史永久只读
    const back = await command('roleSession.switch', { session_id: original.id });
    expect(back.error?.code).toBe('ROLE_SESSION_REACTIVATION_REMOVED');
    // 继续前进:新建 C(同 Harness)
    const cs = await command('roleSession.create', { name: 'C' });
    expect(cs.error).toBeUndefined();
    expect(app.one('select binding_id from role_sessions where id=?', original.id).binding_id).toBe(original.binding_id);
    expect(app.all('select activation_epoch from role_session_activations order by activation_epoch')).toEqual([{ activation_epoch: 1 }, { activation_epoch: 2 }, { activation_epoch: 3 }]);
    expect(app.one('select count(*) n from bindings where is_current=1')).toEqual({ n: 1 });
    expect(app.one('select count(*) n from native_binding_configs')).toEqual({ n: 2 });
    expect(app.one('select count(*) n from role_sessions')).toEqual({ n: 3 });
    // 原始会话历史只读:native ref 原样保留;C 尚无原生引用(load 为空,不伪造),激活已不属于 A
    const active = app.one("select * from role_session_activations where state='ACTIVE'");
    expect(active.role_session_id).not.toBe(original.id);
    expect(new NativeSessionStore(db).load({ bindingId: active.binding_id, epoch: active.binding_epoch, roleSessionId: active.role_session_id, activationId: active.id, activationEpoch: active.activation_epoch, sessionHome: profiles[0].sessionHome })).toBeUndefined();
    expect(JSON.parse(String(app.one('select native_session_ref from role_sessions where id=?', original.id).native_session_ref))).toEqual({ id: 'native-original' });
  } finally { db.close(); }
});
