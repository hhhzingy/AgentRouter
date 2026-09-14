/** C1R1P2:合法 Harness 集合由宿主注入(默认冻结三家);注册表运行时判定。 */
let allowedHarnesses = ['codex', 'kimi_code', 'pi'];
export function setAllowedHarnesses(list: string[]) {
  allowedHarnesses = list;
}
function registeredHarnessList(): string[] {
  return allowedHarnesses;
}
import type Database from 'better-sqlite3';
import { realpathSync, statSync } from 'node:fs';
import { id, digest, RouteError, validatePolicy, type Data } from '../protocol/index.ts';
export class Management {
  constructor(readonly db: Database.Database) {}
  private row(sql: string, ...args: any[]) {
    return this.db.prepare(sql).get(...args) as Data | undefined;
  }
  private directory(input: string) {
    if (typeof input !== 'string' || !input || input.startsWith('\\\\'))
      throw new RouteError('LOCAL_DIRECTORY_REQUIRED');
    const real = realpathSync(input);
    if (!statSync(real).isDirectory()) throw new RouteError('DIRECTORY_REQUIRED');
    return { display: real, canonical: process.platform === 'win32' ? real.toLowerCase() : real };
  }
  createProject(name: string, path: string) {
    if (typeof name !== 'string' || !name.trim() || name.length > 160)
      throw new RouteError('INVALID_PROJECT_NAME');
    const root = this.directory(path),
      project = id('project'),
      space = id('space'),
      workspace = id('workspace');
    this.db.transaction(() => {
      this.db
        .prepare('insert into projects values(?,?,?,?,?,?)')
        .run(project, name, root.display, root.canonical, 'ACTIVE', Date.now());
      this.db
        .prepare('insert into spaces values(?,?,?,?,?)')
        .run(space, project, '默认协作空间', 'ACTIVE', Date.now());
      this.db
        .prepare('insert into workspaces values(?,?,?,?,?,?,?,?,?)')
        .run(workspace, project, null, root.display, root.canonical, 'MAIN', null, null, 'READY');
      this.db
        .prepare('insert into policies values(?,?,?,?,?,?,?)')
        .run(id('policy'), project, 1, 'agentrouter/1.0', '{}', digest({}), Date.now());
    })();
    return { project, space, workspace };
  }
  private stopped(project: string) {
    if (
      this.row(
        'select rs.role_id from role_slots rs join roles r on r.id=rs.role_id join spaces s on s.id=r.space_id where s.project_id=? and rs.active_run_id is not null',
        project,
      )
    )
      throw new RouteError('PROJECT_HAS_ACTIVE_RUN', 'CONFLICT');
  }
  relocateProject(project: string, path: string) {
    const root = this.directory(path);
    if (!this.row('select id from projects where id=?', project))
      throw new RouteError('INVALID_PROJECT');
    this.stopped(project);
    this.db.transaction(() => {
      this.db
        .prepare('update projects set root_path=?,canonical_root=? where id=?')
        .run(root.display, root.canonical, project);
      this.db
        .prepare(
          "update workspaces set display_path=?,canonical_path=?,status='READY' where project_id=? and kind='MAIN'",
        )
        .run(root.display, root.canonical, project);
    })();
  }
  archiveProject(project: string) {
    this.stopped(project);
    this.db.transaction(() => {
      this.db.prepare("update projects set status='ARCHIVED' where id=?").run(project);
      this.db
        .prepare("update spaces set status='PAUSED' where project_id=? and status='ACTIVE'")
        .run(project);
    })();
  }
  createSpace(project: string, name: string) {
    if (
      !this.row("select id from projects where id=? and status='ACTIVE'", project) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 160
    )
      throw new RouteError('INVALID_SPACE');
    const space = id('space');
    this.db
      .prepare('insert into spaces values(?,?,?,?,?)')
      .run(space, project, name, 'ACTIVE', Date.now());
    return space;
  }
  createRole(input: {
    spaceId: string;
    name: string;
    description: string;
    harness: string;
    workspaceId: string;
    model?: Data;
  }) {
    if (
      !(registeredHarnessList().includes(input.harness)) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 160 ||
      typeof input.description !== 'string' ||
      input.description.length > 8192
    )
      throw new RouteError('INVALID_ROLE');
    const space = this.row('select * from spaces where id=?', input.spaceId),
      workspace = this.row('select * from workspaces where id=?', input.workspaceId);
    if (!space || !workspace || space.project_id !== workspace.project_id)
      throw new RouteError('WORKSPACE_SCOPE', 'AUTHORIZATION');
    const role = id('role'),
      binding = id('binding');
    this.db.transaction(() => {
      this.db
        .prepare('insert into roles values(?,?,?,?,?,?)')
        .run(role, input.spaceId, input.name, input.description, 'ACTIVE', Date.now());
      // 每个新角色即拥有初始工作会话（迁移005只为存量角色播种）。
      this.db
        .prepare("insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values('rsess_' || ?, ?, 1, '初始会话', 'ACTIVE', 1, ?, ?)")
        .run(role, role, Date.now(), Date.now());
      this.db
        .prepare('insert into bindings values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          binding,
          role,
          input.harness,
          input.workspaceId,
          null,
          null,
          JSON.stringify(input.model ?? {}),
          JSON.stringify({
            status: 'unverified',
            toolBridge: 'unverified',
            settledSignal: 'unverified',
          }),
          null,
          1,
          1,
          null,
          'NEW',
          Date.now(),
        );
      this.db.prepare('insert into role_slots(role_id) values(?)').run(role);
    })();
    return { role, binding };
  }
  renameRole(role: string, name: string) {
    if (typeof name !== 'string' || !name.trim() || name.length > 160)
      throw new RouteError('INVALID_ROLE_NAME');
    this.db.prepare('update roles set name=? where id=?').run(name, role);
  }
  setRoleStatus(role: string, status: string) {
    if (!['ACTIVE', 'PAUSED', 'DISABLED', 'ARCHIVED'].includes(status))
      throw new RouteError('INVALID_ROLE_STATUS');
    if (
      ['DISABLED', 'ARCHIVED'].includes(status) &&
      this.row('select role_id from role_slots where role_id=? and active_run_id is not null', role)
    )
      throw new RouteError('ROLE_HAS_ACTIVE_RUN', 'CONFLICT');
    this.db.prepare('update roles set status=? where id=?').run(status, role);
  }
  /** 显式降级登记(Kimi 配额等→指定 harness)。仅策略声明,不自动改写任务或绑定。 */
  setProfileFallback(role: string, fallback: unknown) {
    if (!this.row('select role_id from execution_profiles where role_id=?', role))
      throw new RouteError('INVALID_ROLE');
    if (fallback === null || fallback === undefined) {
      this.db.prepare('update execution_profiles set fallback_json=null where role_id=?').run(role);
      return;
    }
    const f = fallback as { harness?: unknown; reason_codes?: unknown };
    if (
      typeof f !== 'object' ||
      typeof f.harness !== 'string' ||
      !/^[a-z][a-z0-9_]{1,40}$/.test(f.harness) ||
      !Array.isArray(f.reason_codes) ||
      !f.reason_codes.length ||
      !f.reason_codes.every((c) => typeof c === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(c)) ||
      Object.keys(f).some((k) => !['harness', 'reason_codes'].includes(k))
    )
      throw new RouteError('INVALID_FALLBACK_CONFIG');
    this.db
      .prepare('update execution_profiles set fallback_json=? where role_id=?')
      .run(JSON.stringify({ harness: f.harness, reason_codes: f.reason_codes }), role);
  }
  publishPolicy(project: string, content: Data) {
    validatePolicy(content);
    return this.db.transaction(() => {
      const revision =
        (this.row('select max(revision) as r from policies where project_id=?', project)?.r ?? 0) +
        1;
      const policy = id('policy');
      this.db
        .prepare('insert into policies values(?,?,?,?,?,?,?)')
        .run(
          policy,
          project,
          revision,
          'agentrouter/1.0',
          JSON.stringify(content),
          digest(content),
          Date.now(),
        );
      return { policy, revision };
    })();
  }
}
