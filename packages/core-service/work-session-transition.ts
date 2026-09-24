import { randomUUID } from 'node:crypto';
import type { ApplicationService } from './application.ts';
import { NativeExecutionRegistry, type NativeBindingConfig } from './native-registry.ts';
import { registerTrustedRole, type TrustedNativeProfile } from './trusted-native-registration.ts';

/** 仅宿主注入。Client 只能指定 Harness/WS，不能提供 executable、账户或 sessionHome。 */
export function transitionWorkSessionBinding(
  app: ApplicationService,
  registry: NativeExecutionRegistry,
  profiles: readonly TrustedNativeProfile[],
  roleId: string,
  harness: string,
  sessionId?: string,
) {
  if (!app.db.inTransaction) throw Error('WORK_SESSION_TRANSACTION_REQUIRED');
  const current = app.one('select * from bindings where role_id=? and is_current=1', roleId);
  if (!current) throw Error('ROLE_BINDING_NOT_FOUND');
  const target = sessionId ? app.one('select * from role_sessions where id=? and role_id=?', sessionId, roleId) : undefined;
  if (sessionId && !target) throw Error('ROLE_SESSION_NOT_FOUND');
  if (target && (target.harness !== harness || target.driver_id !== harness)) throw Error('ROLE_SESSION_TARGET_HARNESS_MISMATCH');
  if (target && JSON.parse(target.workspace_affinity_json ?? '{}').workspace_id !== current.workspace_id) throw Error('ROLE_SESSION_WORKSPACE_MISMATCH');

  // 恢复已有 native session 必须使用其原可信 profile/home，不能仅凭 Harness 同名选账户。
  const registration = target ? app.one(
    'select n.config_json from role_session_activations a join native_binding_configs n on n.binding_id=a.binding_id and n.epoch=a.binding_epoch where a.role_session_id=? order by a.activation_epoch desc limit 1',
    target.id,
  ) : undefined;
  const previous = registration ? JSON.parse(registration.config_json) as NativeBindingConfig : undefined;
  if (target?.native_session_ref && !previous) throw Error('WORK_SESSION_PROFILE_UNVERIFIED');
  const candidates = profiles.filter(p => p.harness === harness && (!previous || (
    p.id === previous.profileRef && p.sessionHome === previous.sessionHome && p.providerId === previous.providerId
    && p.modelId === previous.modelId && p.effort === previous.effort
  )));
  if (!candidates.length) throw Error('ROLE_SESSION_TARGET_HARNESS_UNAVAILABLE');
  if (candidates.length !== 1) throw Error('NATIVE_PROFILE_AMBIGUOUS');
  const profile = candidates[0];
  const charter = app.one('select * from role_charters where role_id=? order by revision desc limit 1', roleId);
  if (!charter) throw Error('NATIVE_ROLE_INCOMPLETE');
  const epoch = Number(app.one('select max(epoch) n from bindings where role_id=?', roleId).n) + 1;
  const bindingId = 'binding_' + randomUUID();
  const model = { harness, provider_profile_id: profile.providerId, model_id: profile.modelId, reasoning_effort: profile.effort, selection_source: 'runtime' };
  app.db.prepare('update bindings set is_current=0 where id=?').run(current.id);
  app.db.prepare('insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,last_synced_policy_id,continuity_mode,created_at_ms) values(?,?,?,?,?,?,?,1,?,?,?)')
    .run(bindingId, roleId, harness, current.workspace_id, JSON.stringify(model), '{}', epoch, null, 'NEW', app.clock());
  const spec = { ...JSON.parse(charter.spec_json), runtime: model, workspace_ref: current.workspace_id };
  app.publish(roleId, spec, JSON.parse(charter.permissions_json));
  if (!registerTrustedRole(app, registry, roleId, [profile])) throw Error('NATIVE_CONFIG_UNAVAILABLE');
  return app.one('select * from bindings where id=?', bindingId);
}
