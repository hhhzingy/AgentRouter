import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ApplicationService } from './application.ts';
import { NativeExecutionRegistry, type NativeBindingConfig } from './native-registry.ts';

/** Installed by the local owner at startup; never populated from model or Client API payloads. */
export interface TrustedNativeProfile {
  id: string;
  harness: NativeBindingConfig['harness'];
  executable: string;
  executableSha256: string;
  version: string;
  providerId: string;
  modelId: string;
  effort: string;
  sessionHome: string;
}

/** Same database and same binding. This registers configuration, not LIVE_TESTED certification. */
export function registerTrustedRole(
  app: ApplicationService,
  registry: NativeExecutionRegistry,
  roleId: string,
  profiles: readonly TrustedNativeProfile[],
) {
  const binding = app.one('select * from bindings where role_id=? and is_current=1', roleId);
  if (!binding) throw Error('NATIVE_ROLE_NOT_FOUND');
  const model = JSON.parse(binding.model_json);
  const matches = profiles.filter(
    (p) =>
      p.harness === binding.harness &&
      p.providerId === model.provider_profile_id &&
      p.modelId === model.model_id &&
      p.effort === model.reasoning_effort,
  );
  if (matches.length === 0) return false;
  if (matches.length !== 1) throw Error('NATIVE_PROFILE_AMBIGUOUS');
  const p = matches[0];
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(p.id)) throw Error('NATIVE_PROFILE_INVALID');
  const unit = 'native_' + p.id;
  const prior = app.one('select * from account_profiles where id=?', p.id);
  if (prior && (prior.harness !== p.harness || prior.profile_home !== p.sessionHome))
    throw Error('NATIVE_PROFILE_CONFLICT');
  if (binding.account_id && (binding.account_id !== p.id || binding.auth_unit_id !== unit))
    throw Error('NATIVE_ACCOUNT_CHANGE_REQUIRES_SWITCH');
  const charter = app.one(
    'select * from role_charters where role_id=? order by revision desc limit 1',
    roleId,
  );
  const workspace = app.one(
    'select canonical_path from workspaces where id=?',
    binding.workspace_id,
  );
  if (!charter || !workspace) throw Error('NATIVE_ROLE_INCOMPLETE');
  // No authentication material is copied here. Directories are owned runtime state.
  mkdirSync(p.sessionHome, { recursive: true });
  for (const name of ['tmp', 'bin']) mkdirSync(join(p.sessionHome, name), { recursive: true });
  app.db
    .transaction(() => {
      app.db
        .prepare(
          "insert into account_profiles values(?,?,?,null,'OTHER',null,?,'READY') on conflict(id) do nothing",
        )
        .run(p.id, p.harness, p.id, p.sessionHome);
      const existingUnit = app.one('select * from auth_units where id=?', unit);
      if (
        existingUnit &&
        (existingUnit.active_account_id !== p.id ||
          existingUnit.runtime_home !== p.sessionHome ||
          existingUnit.state !== 'READY')
      )
        throw Error('NATIVE_AUTH_UNIT_CONFLICT');
      app.db
        .prepare("insert into auth_units values(?,?,?,?,1,'READY') on conflict(id) do nothing")
        .run(unit, p.harness, p.id, p.sessionHome);
      app.db
        .prepare(
          'update bindings set account_id=?,auth_unit_id=? where id=? and account_id is null',
        )
        .run(p.id, unit, binding.id);
      registry.register(binding.id, binding.epoch, {
        harness: p.harness,
        executable: p.executable,
        executableSha256: p.executableSha256,
        version: p.version,
        profileRef: p.id,
        providerId: p.providerId,
        modelId: p.modelId,
        effort: p.effort,
        workspace: workspace.canonical_path,
        sessionHome: p.sessionHome,
        charterHash: charter.hash,
      });
    })
    .immediate();
  return true;
}
