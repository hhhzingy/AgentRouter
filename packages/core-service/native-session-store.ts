import type Database from 'better-sqlite3';
import { realpathSync, statSync, existsSync } from 'node:fs';
import { isAbsolute, relative, sep, dirname, basename, join } from 'node:path';
export interface NativeSessionScope {
  bindingId: string;
  epoch: number;
  sessionHome: string;
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
  load(scope: NativeSessionScope): NativeSessionReference | undefined {
    const b = this.binding(scope);
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
        const liveRun = this.db
          .prepare(
            "select id from runs where id=? and binding_id=? and binding_epoch=? and state in ('STARTING','RUNNING','WAITING_APPROVAL')",
          )
          .get(scope.key, scope.bindingId, scope.epoch);
        const liveInit = this.db
          .prepare(
            "select id from initialization_attempts where id=? and role_id=? and epoch=? and state in ('STARTING','RUNNING')",
          )
          .get(scope.key, b.role_id, scope.epoch);
        if (!liveRun && !liveInit) throw Error('SESSION_EXECUTION_REVOKED');
        const ref = this.reference(scope, b.harness, input, !!liveInit);
        if (!scope.isCurrent()) throw Error('SESSION_SAVE_REVOKED');
        const json = JSON.stringify(ref);
        this.db
          .prepare(
            'insert into native_sessions values(?,?,?,?) on conflict(binding_id,epoch) do update set session_ref=excluded.session_ref,updated_at_ms=excluded.updated_at_ms',
          )
          .run(scope.bindingId, scope.epoch, json, Date.now());
        // 会话镜像：原生引用同时记录到产生它的 RoleSession（仅运行级保存；初始化无会话归属）。
        this.db
          .prepare('update role_sessions set native_session_ref=? where id=(select role_session_id from runs where id=?)')
          .run(json, scope.key);
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
