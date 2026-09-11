import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type Database from 'better-sqlite3';
import type { ExecutionBackend } from './execution-backend.ts';
export type NativeHarness = 'codex' | 'kimi_code' | 'pi';
/** Trusted configuration references only; credentials and arbitrary launch arguments are forbidden. */
export interface NativeBindingConfig {
  harness: NativeHarness;
  executable: string;
  executableSha256: string;
  version: string;
  profileRef: string;
  providerId: string;
  modelId: string;
  effort: string;
  workspace: string;
  sessionHome: string;
  charterHash: string;
}
export interface NativeRuntimePort {
  backend: ExecutionBackend;
  cancelSupported?: boolean;
  authorizeTool?: (
    config: Readonly<NativeBindingConfig>,
    bindingId: string,
    epoch: number,
    tool: string,
  ) => boolean;
  /** Must verify OS isolation and approved authentication boundary for this exact config. */
  authorize: (config: Readonly<NativeBindingConfig>, bindingId: string, epoch: number) => boolean;
}
const keys = [
  'harness',
  'executable',
  'executableSha256',
  'version',
  'profileRef',
  'providerId',
  'modelId',
  'effort',
  'workspace',
  'sessionHome',
  'charterHash',
];
const canonical = (path: string) => {
  const actual = realpathSync(path);
  return process.platform === 'win32' ? actual.toLowerCase() : actual;
};
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class NativeExecutionRegistry {
  private ports = new Map<NativeHarness, NativeRuntimePort>();
  constructor(readonly db: Database.Database) {}
  attach(harness: NativeHarness, port: NativeRuntimePort) {
    if (this.ports.has(harness)) throw Error('NATIVE_PORT_ALREADY_REGISTERED');
    this.ports.set(harness, port);
  }
  private bindingConfig(bindingId: string, epoch: number, input: Readonly<NativeBindingConfig>) {
    const b = this.db
      .prepare(
        'select b.*,w.canonical_path,a.status account_state,u.state auth_state,u.active_account_id,u.runtime_home,u.max_active_runs from bindings b join workspaces w on w.id=b.workspace_id join account_profiles a on a.id=b.account_id join auth_units u on u.id=b.auth_unit_id where b.id=? and b.is_current=1',
      )
      .get(bindingId) as any;
    if (
      !b ||
      b.epoch !== epoch ||
      b.harness !== input.harness ||
      b.account_id !== input.profileRef ||
      b.active_account_id !== b.account_id ||
      b.account_state !== 'READY' ||
      b.auth_state !== 'READY' ||
      b.max_active_runs !== 1 ||
      canonical(b.runtime_home) !== canonical(input.sessionHome) ||
      canonical(b.canonical_path) !== canonical(input.workspace)
    )
      throw Error('NATIVE_BINDING_MISMATCH');
    if (
      this.db
        .prepare('select id from auth_units where active_account_id=? and id<>?')
        .get(b.account_id, b.auth_unit_id)
    )
      throw Error('NATIVE_AUTH_UNIT_CONFLICT');
    const model = JSON.parse(b.model_json);
    if (
      model.provider_profile_id !== input.providerId ||
      model.model_id !== input.modelId ||
      model.reasoning_effort !== input.effort
    )
      throw Error('NATIVE_MODEL_BINDING_MISMATCH');
    const charter = this.db
      .prepare('select * from role_charters where role_id=? order by revision desc limit 1')
      .get(b.role_id) as any;
    if (!charter || charter.hash !== input.charterHash || charter.binding_epoch !== epoch)
      throw Error('NATIVE_CHARTER_MISMATCH');
    const permissions = JSON.parse(charter.permissions_json);
    if (
      !['read_only', 'read_write'].includes(permissions.workspace_access) ||
      !Array.isArray(permissions.tool_profiles) ||
      !Array.isArray(permissions.allowed_paths)
    )
      throw Error('NATIVE_PERMISSIONS_INVALID');
    return { binding: b, permissions };
  }
  /** Called only by the trusted local controller, never from model/Route payload. */
  register(bindingId: string, epoch: number, input: NativeBindingConfig) {
    if (
      !input ||
      Object.keys(input).some((k) => !keys.includes(k)) ||
      keys.some((k) => typeof (input as any)[k] !== 'string' || !(input as any)[k])
    )
      throw Error('NATIVE_CONFIG_INVALID');
    if (
      !['codex', 'kimi_code', 'pi'].includes(input.harness) ||
      !/^[a-f0-9]{64}$/.test(input.executableSha256) ||
      !/^[A-Za-z0-9_-]{1,96}$/.test(input.profileRef)
    )
      throw Error('NATIVE_CONFIG_INVALID');
    for (const p of [input.executable, input.workspace, input.sessionHome])
      if (!isAbsolute(p)) throw Error('NATIVE_PATH_NOT_ABSOLUTE');
    const { binding } = this.bindingConfig(bindingId, epoch, input);
    if (hash(readFileSync(input.executable)) !== input.executableSha256)
      throw Error('NATIVE_BINARY_MISMATCH');
    const config = Object.fromEntries(keys.map((k) => [k, (input as any)[k]]));
    const json = JSON.stringify(config);
    this.db
      .transaction(() => {
        const prior = this.db
          .prepare('select config_hash from native_binding_configs where binding_id=?')
          .get(bindingId) as any;
        if (prior && prior.config_hash !== hash(json))
          throw Error('NATIVE_CONFIG_REQUIRES_NEW_BINDING');
        if (
          this.db
            .prepare(
              "select id from runs where binding_id=? and state not in ('SUCCEEDED','FAILED','CANCELLED')",
            )
            .get(bindingId)
        )
          throw Error('NATIVE_BINDING_NOT_QUIESCENT');
        if (
          this.db
            .prepare(
              "select id from initialization_attempts where role_id=? and state in ('STARTING','RUNNING','UNKNOWN')",
            )
            .get(binding.role_id)
        )
          throw Error('NATIVE_BINDING_NOT_QUIESCENT');
        this.db
          .prepare(
            'insert into native_binding_configs values(?,?,?,?,?,?) on conflict(binding_id) do update set epoch=excluded.epoch,harness=excluded.harness,config_json=excluded.config_json,config_hash=excluded.config_hash,registered_at_ms=excluded.registered_at_ms',
          )
          .run(bindingId, epoch, input.harness, json, hash(json), Date.now());
        this.db
          .prepare(
            "insert into execution_profiles values(?,'NATIVE','{}',1) on conflict(role_id) do update set source='NATIVE',scenario_json='{}',verified=1",
          )
          .run(binding.role_id);
      })
      .immediate();
    // 'verified' here means config validation, never LIVE_TESTED certification.
  }
  resolve(bindingId: string, epoch: number) {
    const row = this.db
      .prepare(
        'select n.* from native_binding_configs n join bindings b on b.id=n.binding_id where n.binding_id=? and n.epoch=? and b.epoch=n.epoch and b.is_current=1',
      )
      .get(bindingId, epoch) as any;
    if (!row || hash(row.config_json) !== row.config_hash) throw Error('NATIVE_CONFIG_UNAVAILABLE');
    const config = Object.freeze(JSON.parse(row.config_json)) as Readonly<NativeBindingConfig>;
    if (hash(readFileSync(config.executable)) !== config.executableSha256)
      throw Error('NATIVE_BINARY_MISMATCH');
    const { permissions } = this.bindingConfig(bindingId, epoch, config);
    const port = this.ports.get(config.harness);
    if (!port) throw Error('NATIVE_RUNTIME_NOT_IMPLEMENTED');
    if (!port.authorize(config, bindingId, epoch)) throw Error('NATIVE_SECURITY_NOT_VERIFIED');
    return { config, backend: port.backend, port, permissions };
  }
  toolAuthorized(bindingId: string, epoch: number, tool: string) {
    try {
      const { config, port, permissions } = this.resolve(bindingId, epoch);
      return (
        permissions.tool_profiles.includes(tool) &&
        port.authorizeTool?.(config, bindingId, epoch, tool) === true
      );
    } catch {
      return false;
    }
  }
  canCancel(bindingId: string) {
    // Cancellation concerns owned execution, even if its account has expired or been paused.
    const row=this.db.prepare('select harness from native_binding_configs where binding_id=?').get(bindingId) as any;
    return !!row && this.ports.get(row.harness)?.cancelSupported===true;
  }
  anyCancel() {
    return (this.db.prepare('select binding_id from native_binding_configs').all() as any[]).some(
      (r) => this.canCancel(r.binding_id),
    );
  }
  authorized(bindingId: string) {
    const binding = this.db
      .prepare('select epoch from bindings where id=? and is_current=1')
      .get(bindingId) as any;
    if (!binding) return false;
    try {
      this.resolve(bindingId, binding.epoch);
      return true;
    } catch {
      return false;
    }
  }
}
/** Production dispatch, never falls back to Fixture. Ports are installed by trusted platform code. */
export class NativeBackend implements ExecutionBackend {
  private active = new Map<string, { backend: ExecutionBackend; epoch: number }>();
  constructor(readonly registry: NativeExecutionRegistry) {}
  launch: ExecutionBackend['launch'] = (key, packet, frame, exit, broken) => {
    if (this.active.has(key) || typeof packet.bindingId !== 'string')
      throw Error('NATIVE_LAUNCH_INVALID');
    const { config, backend, permissions } = this.registry.resolve(packet.bindingId, packet.epoch);
    this.active.set(key, { backend, epoch: packet.epoch });
    try {
      return backend.launch(
        key,
        { ...packet, config, effectivePermissions: permissions },
        frame,
        (result) => {
          this.active.delete(key);
          exit(result);
        },
        broken,
      );
    } catch (e) {
      throw e;
    } // Retain ownership: a throwing launch may already have created a process.
  };
  cancel(key: string, epoch: number) {
    const r = this.active.get(key);
    return !!r && r.epoch === epoch && r.backend.cancel(key, epoch);
  }
  async stop() {
    await Promise.all(
      [...new Set([...this.active.values()].map((x) => x.backend))].map((b) => b.stop()),
    );
  }
}
