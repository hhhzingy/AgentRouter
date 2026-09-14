import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { realpathSync, statSync, existsSync } from 'node:fs';
import { isAbsolute, relative, sep, dirname, basename, join } from 'node:path';

export interface NativeSessionScope {
  bindingId: string;
  epoch: number;
  sessionHome: string;
  /** WorkSession 维度；缺省仅为 V1.0 binding 兼容入口。 */
  roleSessionId?: string;
  /** 每次恢复/运行的短期激活身份，不等同于 roleSessionId。 */
  activationId?: string;
  activationEpoch?: number;
}
export interface NativeSessionGuard extends NativeSessionScope {
  key: string;
  isCurrent: () => boolean;
}
export interface NativeSessionReference {
  id: string;
  path?: string;
}

/** Trusted host storage only; never accept session references from model or Route payloads. */
export class NativeSessionStore {
  constructor(private db: Database.Database) {}

  private binding(scope: NativeSessionScope) {
    const b = this.db
      .prepare('select * from bindings where id=? and epoch=? and is_current=1')
      .get(scope.bindingId, scope.epoch) as any;
    if (!b) throw Error('SESSION_BINDING_REVOKED');
    return b;
  }

  private activation(scope: NativeSessionScope, binding: any) {
    if (!scope.roleSessionId || !scope.activationId) return;
    const a = this.db
      .prepare(
        "select id,role_id,role_session_id,binding_id,binding_epoch,activation_epoch,state from role_session_activations where id=?",
      )
      .get(scope.activationId) as any;
    if (
      !a ||
      a.state !== 'ACTIVE' ||
      a.role_id !== binding.role_id ||
      a.role_session_id !== scope.roleSessionId ||
      a.binding_id !== scope.bindingId ||
      a.binding_epoch !== scope.epoch ||
      (scope.activationEpoch !== undefined && a.activation_epoch !== scope.activationEpoch)
    )
      throw Error('SESSION_ACTIVATION_REVOKED');
  }

  private reference(
    scope: NativeSessionScope,
    harness: string,
    input: NativeSessionReference,
    pending = false,
  ) {
    if (
      !input ||
      typeof input.id !== 'string' ||
      !input.id ||
      input.id.length > 512 ||
      /[\x00-\x1f\x7f]/.test(input.id) ||
      Object.keys(input).some((k) => !['id', 'path'].includes(k))
    )
      throw Error('SESSION_REFERENCE_INVALID');
    const ref: NativeSessionReference = { id: input.id };
    if (harness === 'pi' || input.path !== undefined) {
      if (
        typeof input.path !== 'string' ||
        !isAbsolute(input.path) ||
        !isAbsolute(scope.sessionHome)
      )
        throw Error('SESSION_PATH_INVALID');
      const home = realpathSync(scope.sessionHome);
      let path: string;
      if (pending && harness === 'pi' && !existsSync(input.path)) {
        // pi reserves its session filename before the first prompt creates it. Persist that
        // reservation before dispatch; recovery still requires the actual native file.
        let ancestor = input.path;
        const tail: string[] = [];
        while (!existsSync(ancestor)) {
          tail.unshift(basename(ancestor));
          const parent = dirname(ancestor);
          if (parent === ancestor) throw Error('SESSION_PATH_INVALID');
          ancestor = parent;
        }
        path = join(realpathSync(ancestor), ...tail);
      } else path = realpathSync(input.path);
      const child = relative(home, path);
      if (
        !child ||
        child === '..' ||
        child.startsWith('..' + sep) ||
        isAbsolute(child) ||
        child.includes(':') ||
        (existsSync(path) ? !statSync(path).isFile() : !pending || harness !== 'pi')
      )
        throw Error('SESSION_PATH_OUTSIDE_HOME');
      ref.path = path;
    }
    return ref;
  }

  private isInitial(roleId: string, roleSessionId: string) {
    const initial = this.db
      .prepare('select id from role_sessions where role_id=? order by seq limit 1')
      .get(roleId) as { id: string } | undefined;
    return initial?.id === roleSessionId;
  }

  private workSession(scope: NativeSessionScope, binding: any) {
    if (!scope.roleSessionId) return undefined;
    const rs = this.db
      .prepare(
        'select id,harness,driver_id,workspace_affinity_json,native_session_ref from role_sessions where id=? and role_id=?',
      )
      .get(scope.roleSessionId, binding.role_id) as any;
    if (!rs) throw Error('ROLE_SESSION_NOT_FOUND');
    if (
      (rs.harness && rs.harness !== binding.harness) ||
      (rs.driver_id && rs.driver_id !== binding.harness)
    )
      throw Error('SESSION_WORK_SESSION_BINDING_MISMATCH');
    if (rs.workspace_affinity_json) {
      let affinity: unknown;
      try {
        affinity = JSON.parse(rs.workspace_affinity_json);
      } catch {
        throw Error('SESSION_WORKSPACE_AFFINITY_INVALID');
      }
      if (!affinity || typeof affinity !== 'object' || Array.isArray(affinity))
        throw Error('SESSION_WORKSPACE_AFFINITY_INVALID');
      const workspaceId = (affinity as Record<string, unknown>).workspace_id;
      if (workspaceId !== undefined && workspaceId !== null && workspaceId !== binding.workspace_id)
        throw Error('SESSION_WORKSPACE_AFFINITY_MISMATCH');
    }
    return rs;
  }

  load(scope: NativeSessionScope): NativeSessionReference | undefined {
    const b = this.binding(scope);
    if (scope.roleSessionId) {
      this.activation(scope, b);
      const rs = this.workSession(scope, b)!;
      if (rs.native_session_ref)
        return this.reference(scope, b.harness, JSON.parse(rs.native_session_ref));
      // 仅初始会话兼容 bootstrap 创建的 binding 级会话；新 WorkSession 不继承隐藏 native 上下文。
      if (!this.isInitial(b.role_id, scope.roleSessionId)) return undefined;
    }
    const row = this.db
      .prepare('select session_ref from native_sessions where binding_id=? and epoch=?')
      .get(scope.bindingId, scope.epoch) as any;
    if (!row) return undefined;
    if (b.native_session_ref !== row.session_ref) throw Error('SESSION_REFERENCE_DIVERGED');
    return this.reference(scope, b.harness, JSON.parse(row.session_ref));
  }

  save(scope: NativeSessionGuard, input: NativeSessionReference) {
    this.db
      .transaction(() => {
        if (!scope.isCurrent()) throw Error('SESSION_SAVE_REVOKED');
        const b = this.binding(scope);
        this.activation(scope, b);
        const workSession = this.workSession(scope, b);
        const liveRun = this.db
          .prepare(
            "select id,role_session_id,activation_id from runs where id=? and binding_id=? and binding_epoch=? and state in ('STARTING','RUNNING','WAITING_APPROVAL')",
          )
          .get(scope.key, scope.bindingId, scope.epoch) as any;
        const liveInit = this.db
          .prepare(
            "select id from initialization_attempts where id=? and role_id=? and epoch=? and state in ('STARTING','RUNNING')",
          )
          .get(scope.key, b.role_id, scope.epoch);
        if (!liveRun && !liveInit) throw Error('SESSION_EXECUTION_REVOKED');
        if (
          scope.roleSessionId &&
          liveRun &&
          (liveRun.role_session_id !== scope.roleSessionId ||
            (scope.activationId !== undefined && liveRun.activation_id !== scope.activationId))
        )
          throw Error('SESSION_ACTIVATION_REVOKED');
        const ref = this.reference(scope, b.harness, input, !!liveInit);
        if (!scope.isCurrent()) throw Error('SESSION_SAVE_REVOKED');
        const json = JSON.stringify(ref);
        const hash = createHash('sha256').update(json).digest('hex');

        if (scope.roleSessionId) {
          const rs = workSession!;
          if (!rs) throw Error('ROLE_SESSION_NOT_FOUND');
          if (rs.native_session_ref && rs.native_session_ref !== json)
            throw Error('SESSION_ROLE_SESSION_REFERENCE_DIVERGED');
          const rsUpdated = this.db
            .prepare(
              'update role_sessions set native_session_ref=?,native_session_ref_hash=?,native_session_bound_at_ms=? where id=? and role_id=? and (native_session_ref is null or native_session_ref=?)',
            )
            .run(json, hash, Date.now(), scope.roleSessionId, b.role_id, json);
          if (rsUpdated.changes !== 1) throw Error('SESSION_ROLE_SESSION_REFERENCE_DIVERGED');

          // 仅 bootstrap 初始会话保留 binding/native_sessions 镜像；后续 WorkSession 不得覆盖它。
          if (!this.isInitial(b.role_id, scope.roleSessionId)) {
            if (!scope.isCurrent()) throw Error('SESSION_SAVE_REVOKED');
            return;
          }
        }

        this.db
          .prepare(
            'insert into native_sessions values(?,?,?,?) on conflict(binding_id,epoch) do update set session_ref=excluded.session_ref,updated_at_ms=excluded.updated_at_ms',
          )
          .run(scope.bindingId, scope.epoch, json, Date.now());
        const updated = this.db
          .prepare(
            'update bindings set native_session_ref=? where id=? and epoch=? and is_current=1',
          )
          .run(json, scope.bindingId, scope.epoch);
        if (updated.changes !== 1 || !scope.isCurrent()) throw Error('SESSION_SAVE_REVOKED');
      })
      .immediate();
  }
}
