import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { realpathSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import type Database from 'better-sqlite3';
import { inspectArtifact } from './artifacts.ts';
import { Core } from '../runtime/core.ts';
import { Management } from '../runtime/management.ts';
import { RouteError } from '../protocol/index.ts';
import {
  C1R1Error,
  digest,
  canonical,
  methodMetadata,
  validateRequest,
  validateDefinition,
  validateResponse,
  projectResult,
  type Method,
  type Event,
  type RevisionName,
  type Scope,
} from '../client-contract/c1r1p1/index.ts';
import c1 from '../../contracts/client-api.c1.schema.json' with { type: 'json' };
import { validateRequestP2 } from '../client-contract/c1r1p2.ts';
import { validatePlanShapeP2 } from '../client-contract/c1r1p2.ts';
import { validatePlanShape } from '../client-contract/c1r1/index.ts';
import r1 from '../../contracts/client-api.c1r1.schema.json' with { type: 'json' };
import { Plans } from './plans.ts';
import { RoleContextStore } from './role-context-store.ts';
const uid = (p: string) => p + '_' + randomUUID();
const methods: Method[] = [
  'system.initialize',
  'system.ping',
  'system.snapshot',
  'events.catchup',
  'control.acquire',
  'control.renew',
  'control.release',
  'filesystem.listRoots',
  'filesystem.listDirectory',
  'filesystem.validateProjectRoot',
  'project.create',
  'project.list',
  'project.get',
  'project.archive',
  'space.list',
  'space.get',
  'role.list',
  'role.get',
  'role.rename',
  'role.updateStatus',
  'binding.getCurrent',
  'binding.listHistory',
  'workspace.list',
  'workspace.get',
  'model.list',
  'model.get',
  'model.refresh',
  'provider.listProfiles',
  'role.createFromSpec',
  'rolePlan.validate',
  'rolePlan.apply',
  'rolePlan.list',
  'rolePlan.get',
  'roleCharter.get',
  'roleCharter.listHistory',
  'roleCharter.update',
  'task.createFromUser',
  'task.submitFromUser',
  'task.list',
  'task.get',
  'task.suspend',
  'task.resume',
  'task.cancel',
  'conversation.read',
  'conversation.sendUserInput',
  'run.list',
  'run.get',
  'run.cancel',
  'issue.list',
  'approval.list',
  'inbox.list',
  'artifact.list',
  'artifact.get',
  'artifact.download',
  'artifact.verify',
  'result.accept',
  'result.reject',
  'runtime.pauseDispatch',
  'runtime.resumeDispatch',
  'runtime.drain',
  'runtime.getActiveWork',
  'runtime.shutdownCore',
  'harness.list',
];
type Connection = {
  principal: string;
  authorized: boolean;
  clientId?: string;
  mode?: string;
  revision: RevisionName | 'C1R1P2';
  initialized: boolean;
  lastCursor?: number;
  allowedProjects?: Set<string>;
  handler?: (event: Event) => void;
};
export class ApplicationService extends Plans {
  readonly instanceId: string;
  readonly core: Core;
  private connections = new Map<string, Connection>();
  private lease: { id: string; connection: string; expires: number; generation: number } | null =
    null;
  private leaseGeneration = 0;
  private controlLedger = new Map<string, { hash: string; result: unknown }>();
  private grants = new Map<string, { connection: string; path: string }>();
  onChanged?: () => void;
  externalApi?: import('./external-api-extension.ts').ExternalApiExtension;
  roleSession?: import('./role-session-extension.ts').RoleSessionExtension;
  readonly contextStore: RoleContextStore;
  participant?: import('./participant-extension.ts').ParticipantExtension;
  /** C1R1P2:已注册 Harness 列表(由宿主注入 DriverRegistry 视图)。 */
  registeredHarnesses?: () => string[];
  nativeAuthorization?: (bindingId: string) => boolean;
  nativeCancelAvailable?: (bindingId?:string)=>boolean;
  nativeToolAuthorization?: (bindingId:string,epoch:number,tool:string)=>boolean;
  onShutdown?: () => void;
  failNextCommit = false;
  constructor(
    db: Database.Database,
    readonly roots: string[],
    readonly fixtureMode = false,
    clock = () => Date.now(),
  ) {
    super(db, clock);
    this.contextStore = new RoleContextStore(db, clock);
    this.instanceId =
      this.one("select value from app_meta where key='dataset_id'").value + '_' + randomUUID();
    this.core = new Core(db, clock, {
      fixtureAuthorization: (binding) =>
        this.fixtureMode &&
        !!this.one(
          "select e.role_id from execution_profiles e join bindings b on b.role_id=e.role_id where b.id=? and e.verified=1 and e.source='SIMULATED'",
          binding,
        ),
      nativeAuthorization: (binding) => !this.fixtureMode && !!this.nativeAuthorization?.(binding),
      beforeDispatch: (role) => this.dispatchBlocker(role),
      kindForTask: (task) =>
        this.one('select result_id from result_handlings where task_id=?', task)
          ? 'RESULT_HANDLING'
          : 'TASK',
    });
    db.transaction(() => {
      this.core.recover();
      this.db
        .prepare(
          "update initialization_leases set state='QUARANTINED' where attempt_id in (select id from initialization_attempts where state in ('STARTING','RUNNING'))",
        )
        .run();
      this.db
        .prepare(
          "update bootstrap_deliveries set state='FAILED',reason='EXECUTION_UNKNOWN' where id in (select delivery_id from initialization_attempts where state in ('STARTING','RUNNING'))",
        )
        .run();
      this.db
        .prepare(
          "update initialization_attempts set state='UNKNOWN' where state in ('STARTING','RUNNING')",
        )
        .run();
      this.event(undefined, 'CoreBoot', this.instanceId);
    }).immediate();
  }
  dispatchBlocker(role: string) {
    if (this.one("select value from app_meta where key='dispatch_paused'").value === 'true')
      return 'global_paused';
    const b = this.one('select * from bindings where role_id=? and is_current=1', role);
    const delivery = this.one(
      'select d.state from bootstrap_deliveries d join role_charters c on c.id=d.charter_id where c.role_id=? and d.epoch=? order by c.revision desc limit 1',
      role,
      b?.epoch,
    );
    if (delivery?.state !== 'DELIVERED') return 'bootstrap_required';
    const ws = this.one('select canonical_path from workspaces where id=?', b.workspace_id);
    if (
      this.one(
        'select resource_key from initialization_leases where resource_key=?',
        'workspace:' + ws.canonical_path,
      ) ||
      this.one(
        "select id from initialization_attempts where role_id=? and state in ('STARTING','RUNNING','UNKNOWN')",
        role,
      )
    )
      return 'initialization_resource_locked';
    return null;
  }
  open(principal = 'human_local', authorized = true, allowedProjects?: Set<string>) {
    const id = uid('connection');
    this.connections.set(id, {
      principal,
      authorized,
      revision: 'C1',
      initialized: false,
      allowedProjects,
    });
    return id;
  }
  disconnect(id: string) {
    this.connections.delete(id);
    for (const key of this.controlLedger.keys())
      if (key.startsWith(id + ':')) this.controlLedger.delete(key);
    if (this.lease?.connection === id) this.lease = null;
    for (const [key, g] of this.grants) if (g.connection === id) this.grants.delete(key);
  }
  private participantAttachments = new Map<
    string,
    { connectionId: string; generation: number; grantId: string }
  >();
  /** 聊天级挂接授权(F-03):grant 由管理面签发(全局控制器租约);同角色新签发自动撤销旧 grant,
   * 旧聊天的在途写与再挂接被服务端拒绝,与进程连接生命周期无关。token 只存哈希。 */
  private sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
  participantGrantIssue(connectionId: string, roleId: string, leaseId: string) {
    this.checkLease(connectionId, leaseId); // 管理面凭据:全局控制器租约
    const role = this.roleScope(roleId);
    const grantId = uid('pgrant');
    const token = randomBytes(24).toString('hex');
    return this.db
      .transaction(() => {
        const revokedPrior = this.db
          .prepare("update participant_grants set state='REVOKED', revoked_at_ms=? where role_id=? and state='ACTIVE'")
          .run(this.clock(), roleId).changes;
        const generation =
          (this.db
            .prepare('select coalesce(max(generation),0) g from participant_grants where role_id=?')
            .get(roleId) as { g: number }).g + 1;
        this.db
          .prepare(
            'insert into participant_grants(id,role_id,token_hash,state,generation,created_at_ms) values(?,?,?,?,?,?)',
          )
          .run(grantId, roleId, this.sha256(token), 'ACTIVE', generation, this.clock());
        return { grant_id: grantId, token, role_id: roleId, generation, revoked_previous: revokedPrior > 0 };
      })
      .immediate();
  }
  participantGrantRevoke(connectionId: string, grantId: string, leaseId: string) {
    this.checkLease(connectionId, leaseId);
    this.db
      .transaction(() => {
        const g = this.db.prepare('select id from participant_grants where id=?').get(grantId);
        if (!g) throw Error('PARTICIPANT_GRANT_NOT_FOUND');
        this.db
          .prepare("update participant_grants set state='REVOKED', revoked_at_ms=? where id=?")
          .run(this.clock(), grantId);
        for (const [roleId, a] of this.participantAttachments)
          if (a.grantId === grantId) this.participantAttachments.delete(roleId);
      })
      .immediate();
    return { grant_id: grantId, state: 'REVOKED' };
  }
  participantGrantList(connectionId: string, roleId: string, leaseId: string) {
    this.checkLease(connectionId, leaseId);
    this.roleScope(roleId);
    const rows = this.db
      .prepare(
        'select id,role_id,state,generation,created_at_ms,revoked_at_ms from participant_grants where role_id=? order by generation',
      )
      .all(roleId) as Record<string, unknown>[];
    return { grants: rows };
  }
  participantAttach(
    connectionId: string,
    roleId: string,
    grantId: string,
    grantToken: string,
  ) {
    const c = this.connection(connectionId);
    if (!c.authorized) throw new C1R1Error('SCOPE_DENIED');
    const role = this.roleScope(roleId);
    if (!grantId || typeof grantToken !== 'string' || !grantToken)
      throw Error('PARTICIPANT_GRANT_REVOKED');
    const g = this.db.prepare('select * from participant_grants where id=?').get(grantId) as
      | { role_id: string; token_hash: string; state: string; generation: number }
      | undefined;
    if (!g || g.role_id !== roleId) throw Error('PARTICIPANT_GRANT_NOT_FOUND');
    if (g.state !== 'ACTIVE' || this.sha256(grantToken) !== g.token_hash)
      throw Error('PARTICIPANT_GRANT_REVOKED');
    const prev = this.participantAttachments.get(roleId);
    if (prev && prev.connectionId === connectionId && prev.grantId === grantId)
      return {
        role_id: roleId,
        generation: prev.generation,
        project_id: role.project_id,
        space_id: role.space_id,
      }; // 同连接同 grant 幂等
    this.participantAttachments.set(roleId, { connectionId, generation: g.generation, grantId });
    return {
      role_id: roleId,
      generation: g.generation,
      project_id: role.project_id,
      space_id: role.space_id,
    };
  }
  participantValid(connectionId: string, roleId: string): boolean {
    const a = this.participantAttachments.get(roleId);
    if (!a || a.connectionId !== connectionId) return false;
    const g = this.db.prepare('select state from participant_grants where id=?').get(a.grantId) as
      | { state: string }
      | undefined;
    return !!g && g.state === 'ACTIVE';
  }
  subscribe(id: string, handler: (e: Event) => void) {
    const c = this.connection(id);
    c.lastCursor = this.cursor;
    c.handler = handler;
    return () => {
      c.handler = undefined;
    };
  }
  private connection(id: string) {
    const c = this.connections.get(id);
    if (!c) throw new C1R1Error('CONNECTION_LOST');
    return c;
  }
  private capabilities(c: Connection) {
    return {
      methods: methods.filter(
        (m) =>
          (c.revision === 'C1R1P1' ||
            c.revision === 'C1R1P2' ||
            (c.revision === 'C1R1' ? m in r1['x-methods'] : m in c1['x-methods'])) &&
          (c.revision === 'C1R1P1' || m !== 'provider.listProfiles') &&
          (m !== 'run.cancel' || this.fixtureMode || this.nativeCancelAvailable?.()===true),
      ),
      remote_filesystem: false,
      event_stream: true,
      controller_lease: true,
      auth_unit_max_active_runs: 1,
      reference_types: { artifact: true, external: true, git: false, live: false },
      output_types: ['artifact'],
      harnesses: {
        codex: { status: 'PROBED', create_session: false, cancel: false },
        kimi_code: { status: 'PROBED', create_session: false, cancel: false },
        pi: { status: 'PROBED', create_session: false, cancel: false },
      },
      mock: false,
      role_plans: true,
      role_charters: true,
      space_reconfiguration: false,
      model_catalog: true,
      workspaces: true,
    };
  }
  private authorize(c: Connection, scope: Scope) {
    if (scope.project_id) {
      if (c.allowedProjects && !c.allowedProjects.has(scope.project_id))
        throw new C1R1Error('SCOPE_DENIED');
      if (!this.one('select id from projects where id=?', scope.project_id))
        throw new C1R1Error('SCOPE_DENIED');
    }
    if (
      scope.space_id &&
      !this.one(
        'select id from spaces where id=? and project_id=?',
        scope.space_id,
        scope.project_id,
      )
    )
      throw new C1R1Error('SCOPE_DENIED');
  }
  event(project: string | undefined, kind: string, entity: string) {
    const event: Event = {
      v: 1,
      event: 'project.changed',
      cursor: 1,
      occurred_at_ms: this.clock(),
      payload: {
        entity_id: entity,
        revision: this.revision,
        scope: project ? { project_id: project } : {},
      },
    };
    const row = this.db
      .prepare(
        'insert into client_events(project_id,revision,kind,payload_json,at_ms) values(?,?,?,?,?)',
      )
      .run(project ?? null, this.revision, kind, JSON.stringify(event.payload), this.clock());
    event.cursor = Number(row.lastInsertRowid);
    return event;
  }
  notify() {
    for (const c of this.connections.values())
      if (c.handler) {
        for (const row of this.all(
          'select * from client_events where cursor>? order by cursor',
          c.lastCursor ?? 0,
        )) {
          c.lastCursor = row.cursor;
          if (!row.project_id || !c.allowedProjects || c.allowedProjects.has(row.project_id))
            try {
              c.handler(this.eventView(row));
            } catch {}
        }
      }
    this.onChanged?.();
  }
  eventView(row: any): Event {
    return {
      v: 1,
      event: 'project.changed',
      cursor: row.cursor,
      occurred_at_ms: row.at_ms,
      payload: JSON.parse(row.payload_json),
    };
  }
  private next() {
    const rev = this.revision + 1;
    this.db.prepare("update app_meta set value=? where key='revision'").run(String(rev));
    return rev;
  }
  async handle(id: string, raw: unknown): Promise<unknown> {
    const c = this.connection(id);
    if (
      this.externalApi &&
      typeof (raw as { method?: unknown })?.method === 'string' &&
      String((raw as { method?: unknown }).method).startsWith('externalApi.')
    )
      return this.externalApi.handle(raw, {
        principal: c.principal,
        ...(c.clientId ? { clientId: c.clientId } : {}),
        ...(c.mode ? { mode: c.mode } : {}),
        assertControllerLease: (leaseId: string) => this.checkLease(id, leaseId),
      });
    if (
      this.roleSession &&
      typeof (raw as { method?: unknown })?.method === 'string' &&
      String((raw as { method?: unknown }).method).startsWith('roleSession.')
    ) {
      const method = String((raw as { method?: unknown }).method);
      const mutation = method === 'roleSession.create' || method === 'roleSession.switch';
      if (!c.initialized || !c.authorized) return {
        v: 1, id: (raw as { id?: unknown }).id,
        error: { code: !c.initialized ? 'NOT_INITIALIZED' : 'SCOPE_DENIED' },
      };
      let committed = false;
      const reply = this.roleSession.handle(raw, {
        principal: c.principal,
        assertRoleAccess: (roleId, clientId) => {
          if (mutation && clientId !== c.clientId) throw Error('CONTROL_LEASE_REQUIRED');
          const role = this.one('select r.id,r.space_id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?', roleId);
          if (!role) throw Error('ROLE_NOT_FOUND');
          this.authorize(c, { project_id: role.project_id, space_id: role.space_id });
        },
        ...(c.clientId ? { clientId: c.clientId } : {}),
        ...(c.mode ? { mode: c.mode } : {}),
        assertControllerLease: (leaseId: string) => this.checkLease(id, leaseId),
        assertRevision: (expectedRevision: number) => {
          if (this.revision !== expectedRevision) throw Error('REVISION_MISMATCH');
        },
        commitRevision: () => {
          this.next();
          if (this.failNextCommit) {
            this.failNextCommit = false;
            throw Error('INTERNAL_ERROR');
          }
          committed = true;
        },
      });
      if (committed && !('error' in (reply as object))) this.onChanged?.();
      return reply;
    }
    if (
      this.participant &&
      typeof (raw as { method?: unknown })?.method === 'string' &&
      String((raw as { method?: unknown }).method).startsWith('participant.')
    ) {
      const method = String((raw as { method?: unknown }).method);
      const params = ((raw as { params?: unknown }).params ?? {}) as Record<string, unknown>;
      const frameId = String((raw as { id?: unknown }).id ?? '');
      // 扩展分支的错误必须转 wire 帧;抛出会令 w11-main 销毁整条 socket(F-02)
      const wireError = (code: string) => ({ v: 1, id: frameId, error: { code } });
      const leaseId = String(
        (raw as { lease_id?: unknown }).lease_id ?? params.lease_id ?? '',
      );
      try {
        const reply = (result: unknown) => ({ v: 1, id: frameId, result });
        const roleId = String(params.role_id ?? '');
        if (method === 'participant.grant.issue') {
          if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(roleId))
            throw Error('INVALID_PARAMS');
          return Promise.resolve(reply(this.participantGrantIssue(id, roleId, leaseId)));
        }
        if (method === 'participant.grant.revoke') {
          const grantId = String(params.grant_id ?? '');
          if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(grantId))
            throw Error('INVALID_PARAMS');
          return Promise.resolve(reply(this.participantGrantRevoke(id, grantId, leaseId)));
        }
        if (method === 'participant.grant.list') {
          if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(roleId))
            throw Error('INVALID_PARAMS');
          return Promise.resolve(reply(this.participantGrantList(id, roleId, leaseId)));
        }
        if (method === 'participant.attach') {
          if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(roleId))
            throw Error('INVALID_PARAMS');
          return Promise.resolve(
            reply(
              this.participantAttach(
                id,
                roleId,
                String(params.grant_id ?? ''),
                typeof params.grant_token === 'string' ? params.grant_token : '',
              ),
            ),
          );
        }
        return this.participant.handle(raw, {
          principal: c.principal,
          ...(c.clientId ? { clientId: c.clientId } : {}),
          ...(c.mode ? { mode: c.mode } : {}),
          assertParticipantAttachment: (targetRole: string) => {
            if (!this.participantValid(id, targetRole))
              throw Error('PARTICIPANT_GENERATION_STALE');
          },
        });
      } catch (error) {
        // 扩展分支错误转 wire 帧;抛出会令 w11-main 销毁整条 socket(F-02)
        if (error instanceof C1R1Error) throw error;
        const message = (error as Error).message;
        return {
          v: 1,
          id: frameId,
          error: {
            code: /^[A-Z][A-Z0-9_]{1,79}$/.test(message) ? message : 'PARTICIPANT_REQUEST_FAILED',
          },
        };
      }
    }
    if (
      typeof (raw as { method?: unknown })?.method === 'string' &&
      (raw as { method?: unknown }).method === 'contract.upgrade'
    ) {
      if (!c.initialized || !c.authorized) throw new C1R1Error('NOT_INITIALIZED');
      if (c.mode !== 'controller') throw new C1R1Error('SCOPE_DENIED');
      const revision = (raw as { params?: { revision?: unknown } }).params?.revision;
      if (revision !== 'C1R1P2') throw new C1R1Error('INVALID_PARAMS');
      c.revision = 'C1R1P2';
      return {
        v: 1,
        id: (raw as { id?: unknown }).id,
        result: {
          revision: 'C1R1P2',
          harnesses: this.registeredHarnesses ? this.registeredHarnesses() : [],
        },
      };
    }
    const request: any =
      c.revision === 'C1R1P2'
        ? validateRequestP2(raw)
        : validateRequest(raw);
    try {
      let result: unknown;
      const r = request as any;
      if (r.method === 'system.initialize') {
        if (c.initialized) throw new C1R1Error('ALREADY_INITIALIZED');
        c.initialized = true;
        c.clientId = r.params.client_id;
        c.mode = r.params.requested_mode;
        c.revision = r.params.contract_revision ?? 'C1';
        result = {
          serverInstanceId: this.instanceId,
          serverVersion: '1.0.0-dev.0',
          protocol: 'agentrouter-client/1',
          schemaVersion: c.revision === 'C1R1P1' ? 3 : c.revision === 'C1R1' ? 2 : 1,
          contractRevision: c.revision,
          platform: process.platform,
          connectionState: 'CONNECTED_OBSERVER',
          eventCursor: this.cursor,
          capabilities: this.capabilities(c),
          health: 'OK',
          upgradeRequired: false,
          lease: null,
        };
      } else {
        if (!c.initialized) throw new C1R1Error('NOT_INITIALIZED');
        if (c.revision !== 'C1R1P2') validateDefinition('Request', r, c.revision);
        if (!this.capabilities(c).methods.includes(r.method))
          throw new C1R1Error('CAPABILITY_UNAVAILABLE');
        result = methodMetadata[r.method as Method].mutation
          ? this.mutate(id, c, r)
          : this.read(id, c, r.method, r.params);
      }
      if (c.revision === 'C1R1P2') {
        // P2 响应不投影到冻结枚举(动态 harness),按 C1R1P1 结构原样返回
      } else {
        // 旧协议连接的投影裁剪必须先于冻结校验:动态 harness 角色及其运行不进入旧客户端视图
        const dynamicRoles = new Set(
          this.all(
            "select role_id from bindings where harness not in ('codex','kimi_code','pi')",
          ).map((row) => (row as { role_id: string }).role_id),
        );
        if (dynamicRoles.size && result && typeof result === 'object') {
          const res = result as Record<string, unknown>;
          const byRole = (v: { id?: string; roleId?: string }) =>
            !dynamicRoles.has(String(v.roleId ?? v.id));
          if (r.method === 'system.snapshot') {
            if (Array.isArray(res.roles)) res.roles = (res.roles as never[]).filter(byRole);
            if (Array.isArray(res.runs)) res.runs = (res.runs as never[]).filter(byRole);
          }
          if (r.method === 'role.list' && Array.isArray(res.items))
            res.items = (res.items as never[]).filter(byRole);
          if (r.method === 'run.list' && Array.isArray(res.items))
            res.items = (res.items as never[]).filter(byRole);
        }
        result = projectResult(c.revision, r.method, result);
      }
      return { v: 1, id: r.id, result };
    } catch (error) {
      let e =
        error instanceof C1R1Error
          ? error
          : error instanceof RouteError
            ? new C1R1Error(
                (['CROSS_SPACE_DENIED', 'OPERATION_CONFLICT', 'SCOPE_DENIED'].includes(error.code)
                  ? error.code
                  : 'INVALID_PARAMS') as 'INVALID_PARAMS',
              )
            : new C1R1Error('INTERNAL_ERROR', 'INTERNAL');
      const wire = e.wire();
      if (c.revision === 'C1' && !c1.$defs.ErrorCode.enum.includes(wire.code as any)) {
        wire.code = 'CAPABILITY_UNAVAILABLE';
        wire.category = 'UNAVAILABLE';
      }
      return { v: 1, id: request.id, error: wire };
    }
  }
  private mutate(id: string, c: Connection, r: any): unknown {
    if (!c.authorized || c.mode !== 'controller' || c.clientId !== r.client_id)
      throw new C1R1Error('CONTROL_LEASE_REQUIRED');
    this.authorize(c, r.scope);
    if (r.method.startsWith('control.')) {
      const key = id + ':' + r.operation_id,
        hash = digest({
          method: r.method,
          params: r.params,
          scope: r.scope,
          expected_revision: r.expected_revision,
        }),
        old = this.controlLedger.get(key);
      if (old) {
        if (old.hash !== hash) throw new C1R1Error('OPERATION_CONFLICT');
        if (r.method !== 'control.release')
          this.checkLease(id, (old.result as { leaseId: string }).leaseId);
        return old.result;
      }
      if (r.expected_revision !== this.revision) throw new C1R1Error('REVISION_CONFLICT');
      let result: unknown;
      if (r.method === 'control.acquire') {
        if (this.lease && this.lease.expires > this.clock())
          throw new C1R1Error('CONTROL_LEASE_BUSY');
        this.lease = {
          id: uid('lease'),
          connection: id,
          expires: this.clock() + 30000,
          generation: ++this.leaseGeneration,
        };
      } else {
        this.checkLease(id, r.params.lease_id);
        if (r.method === 'control.release') {
          this.lease = null;
          result = {};
        } else this.lease!.expires = this.clock() + 30000;
      }
      result ??= {
        leaseId: this.lease!.id,
        clientId: c.clientId,
        expiresAtMs: this.lease!.expires,
        generation: this.lease!.generation,
      };
      this.controlLedger.set(key, { hash, result });
      return result;
    }

    // Participant attachment 旁路:仅限 conversation.sendUserInput 且本连接持有该角色的当前 generation。
    if (
      !(
        r.method === 'conversation.sendUserInput' &&
        this.participantValid(id, String(r.params?.role_id ?? ''))
      )
    )
      this.checkLease(id, r.lease_id);
    const hash = digest({
      method: r.method,
      params: r.params,
      scope: r.scope,
      expected_revision: r.expected_revision,
    });
    let replay = false;
    const result = this.db
      .transaction(() => {
        const old = this.one(
          'select * from command_ledger where principal=? and client_id=? and operation_id=?',
          c.principal,
          c.clientId,
          r.operation_id,
        );
        if (old) {
          if (old.request_hash !== hash) throw new C1R1Error('OPERATION_CONFLICT');
          replay = true;
          return JSON.parse(old.response_json);
        }
        if (r.expected_revision !== this.revision) throw new C1R1Error('REVISION_CONFLICT');
        this.next();
        const result = this.write(id, c, r.method, r.params, r.scope, r.operation_id);
        // C1R1P2 响应含动态 HarnessId,不走冻结响应校验(注册表为权威)
        if (c.revision !== 'C1R1P2') validateResponse(r.method, result);
        if (this.failNextCommit) {
          this.failNextCommit = false;
          throw new C1R1Error('INTERNAL_ERROR');
        }
        this.db
          .prepare('insert into command_ledger values(?,?,?,?,?,?)')
          .run(c.principal, c.clientId, r.operation_id, hash, JSON.stringify(result), this.clock());
        const entity =
          (result as { id?: string; entityId?: string })?.id ??
          (result as { entityId?: string })?.entityId ??
          'runtime_local';
        this.db
          .prepare(
            'insert into entity_revisions values(?,?,?) on conflict(entity_id) do update set revision=excluded.revision,updated_at_ms=excluded.updated_at_ms',
          )
          .run(entity, this.revision, this.clock());
        const project = r.scope.project_id ?? (r.method === 'project.create' ? entity : undefined);
        this.db
          .prepare(
            'insert into application_audit(project_id,actor,kind,detail_json,at_ms) values(?,?,?,?,?)',
          )
          .run(project ?? null, c.principal, r.method, JSON.stringify({origin:c.clientId?.startsWith('mcp_')?'MCP':'CLIENT',client_id:c.clientId,operation_id:r.operation_id}), this.clock());
        this.event(project, r.method, entity);
        return result;
      })
      .immediate();
    if (!replay) {
      this.notify();
      if (r.method === 'runtime.shutdownCore') setImmediate(() => this.onShutdown?.());
    }
    return result;
  }
  private checkLease(id: string, lease: string) {
    if (!this.lease || this.lease.expires <= this.clock())
      throw new C1R1Error('CONTROL_LEASE_EXPIRED');
    if (this.lease.connection !== id || this.lease.id !== lease)
      throw new C1R1Error('CONTROL_LEASE_REQUIRED');
  }
  desktopContext(connection: string) {
    const c=this.connection(connection);
    if(!c.authorized || !c.initialized) throw new C1R1Error('SCOPE_DENIED');
    return {dataId:this.one("select value from app_meta where key='dataset_id'").value as string,clientId:c.clientId!,serverInstanceId:this.instanceId};
  }
  /** 仅认证的本机 Main 原生选目录后调用，不在 Renderer Client API 方法表。 */
  grantSelectedDirectory(connection: string, path: string) {
    const c = this.connection(connection);
    if (!c.authorized || c.mode !== 'controller') throw new C1R1Error('SCOPE_DENIED');
    this.checkLease(connection, this.lease?.id ?? '');
    if (path.startsWith('\\\\')) throw new C1R1Error('SCOPE_DENIED');
    const real = realpathSync(path);
    if (!statSync(real).isDirectory()) throw new C1R1Error('SCOPE_DENIED');
    if (!this.roots.includes(real)) this.roots.push(real);
    return this.grant(connection, real);
  }
  private grant(connection: string, path: string) {
    const real = realpathSync(path);
    if (
      !statSync(real).isDirectory() ||
      !this.roots.some((root) => {
        const rel = relative(realpathSync(root), real);
        return !rel.startsWith('..') && !isAbsolute(rel);
      })
    )
      throw new C1R1Error('SCOPE_DENIED');
    const handle = uid('path');
    this.grants.set(handle, { connection, path: real });
    return {
      name: real.split(/[\\/]/).at(-1) || real,
      displayPath: real,
      kind: 'DIRECTORY',
      readable: true,
      selectableAsProjectRoot: true,
      pathHandle: handle,
    };
  }
  private path(connection: string, handle: string) {
    const g = this.grants.get(handle);
    if (!g || g.connection !== connection) throw new C1R1Error('SCOPE_DENIED');
    return g.path;
  }
  private page(items: any[], p: any = {}) {
    let start = 0;
    if (p.after_id) {
      const i = items.findIndex((x) => x.id === p.after_id);
      if (i < 0) throw new C1R1Error('CURSOR_INVALID');
      start = i + 1;
    }
    const selected = items.slice(start, start + (p.limit ?? 100));
    return {
      items: selected,
      next_id: selected.at(-1)?.id ?? null,
      has_more: start + selected.length < items.length,
    };
  }
  private read(id: string, c: Connection, m: Method, p: any): unknown {
    this.authorize(c, p.scope ?? (p.project_id ? { project_id: p.project_id } : {}));
    if (m === 'system.ping') return {};
    if (m === 'harness.list') return this.capabilities(c);
    if (m === 'filesystem.listRoots')
      return {
        items: this.roots.map((root) => this.grant(id, root)),
        next_id: null,
        has_more: false,
      };
    if (m === 'filesystem.validateProjectRoot')
      return {
        items: [this.grant(id, this.path(id, p.path_handle))],
        next_id: null,
        has_more: false,
      };
    if (m === 'filesystem.listDirectory') {
      const root = this.path(id, p.path_handle);
      const entries = readdirSync(root, { withFileTypes: true })
        .filter(
          (d) =>
            d.isDirectory() &&
            !d.isSymbolicLink() &&
            !d.name.startsWith('.') &&
            d.name !== 'node_modules',
        )
        .slice(0, 100);
      return {
        items: entries.map((d) => this.grant(id, resolve(root, d.name))),
        next_id: null,
        has_more: false,
      };
    }
    if (m === 'events.catchup') {
      if (p.server_instance_id !== this.instanceId) throw new C1R1Error('CURSOR_EXPIRED');
      if (p.after_cursor > this.cursor) throw new C1R1Error('CURSOR_INVALID');
      const rows = this.all(
        'select * from client_events where cursor>? order by cursor limit ?',
        p.after_cursor,
        (p.limit ?? 100) + 1,
      );
      const events = rows
        .slice(0, p.limit ?? 100)
        .filter(
          (row) => !row.project_id || !c.allowedProjects || c.allowedProjects.has(row.project_id),
        )
        .map((row) => this.eventView(row));
      return {
        events,
        next_cursor: rows.slice(0, p.limit ?? 100).at(-1)?.cursor ?? p.after_cursor,
        has_more: rows.length > (p.limit ?? 100),
        server_instance_id: this.instanceId,
      };
    }
    if (m === 'rolePlan.validate') {
      this.authorize(c, { project_id: p.plan.project_id });
      const v = this.validate(
        p.plan,
        c.revision === 'C1R1P2' ? validatePlanShapeP2 : validatePlanShape,
      );
      if (
        v.valid &&
        c.revision === 'C1R1P2' &&
        this.registeredHarnesses &&
        'roles' in p.plan &&
        Array.isArray((p.plan as { roles?: { runtime?: { harness?: string } }[] }).roles)
      ) {
        const allowed = this.registeredHarnesses();
        for (const r of (p.plan as { roles: { role_key: string; runtime: { harness: string } }[] }).roles)
          if (!allowed.includes(r.runtime.harness))
            return {
              valid: false,
              planHash: v.planHash,
              errors: [{ code: 'UNSUPPORTED_HARNESS', field: r.role_key }],
              warnings: v.warnings,
              requiredConfirmations: v.requiredConfirmations,
            } as typeof v;
      }
      return v;
    }
    if (m === 'rolePlan.list')
      return this.page(
        this.all('select * from role_plans where project_id=? order by rowid', p.project_id).map(
          (row) => this.plan(row),
        ),
        p,
      );
    if (m === 'rolePlan.get') {
      const row = this.one(
        'select * from role_plans where id=? and project_id=?',
        p.id,
        p.project_id,
      );
      if (!row) throw new C1R1Error('NOT_FOUND');
      return this.plan(row);
    }
    if (m === 'roleCharter.get' || m === 'roleCharter.listHistory') {
      this.assertRole(p.role_id, { project_id: p.project_id });
      const rows = this.all(
        'select * from role_charters where role_id=? order by revision',
        p.role_id,
      );
      if (m === 'roleCharter.listHistory')
        return this.page(
          rows.map((row) => this.charter(row)),
          p,
        );
      if (!rows.length) throw new C1R1Error('NOT_FOUND');
      return this.charter(rows.at(-1));
    }
    if (m.startsWith('artifact.')) {
      if (m === 'artifact.list')
        return this.page(
          this.all('select * from artifacts order by created_at_ms,id')
            .filter((row) => this.matches(c, p.scope ?? {}, row.project_id))
            .map((row) => inspectArtifact(this.db.name, row, this.rev(row.id)).view),
          p,
        );
      const row = this.one('select * from artifacts where id=?', p.id);
      if (!row) throw new C1R1Error('NOT_FOUND');
      this.authorize(c, { project_id: row.project_id });
      if (!this.matches(c, p.scope ?? {}, row.project_id)) throw new C1R1Error('SCOPE_DENIED');
      const value = inspectArtifact(this.db.name, row, this.rev(row.id));
      if (m === 'artifact.download') {
        if (value.view.state !== 'AVAILABLE' || !value.bytes)
          throw new C1R1Error('CAPABILITY_UNAVAILABLE');
        const offset = p.offset_bytes ?? 0;
        if (offset > value.bytes.length) throw new C1R1Error('INVALID_PARAMS');
        const bytes = value.bytes.subarray(
          offset,
          offset + Math.min(p.limit_bytes ?? 65536, 65536),
        );
        return {
          artifactId: row.id,
          offset,
          byteSize: bytes.length,
          encoding: 'base64',
          content: bytes.toString('base64'),
          hasMore: offset + bytes.length < value.bytes.length,
        };
      }
      return value.view;
    }
    if (m === 'conversation.read') return this.conversation(c, p);
    const snapshot = this.snapshot();
    if (m === 'system.snapshot' || m === 'runtime.getActiveWork') {
      if (c.allowedProjects) {
        snapshot.projects = snapshot.projects.filter((x) => c.allowedProjects!.has(x.id));
        snapshot.spaces = snapshot.spaces.filter((x) => c.allowedProjects!.has(x.projectId));
        snapshot.roles = snapshot.roles.filter((x) =>
          snapshot.spaces.some((g) => g.id === x.spaceId),
        );
        snapshot.tasks = snapshot.tasks.filter((x) =>
          snapshot.spaces.some((g) => g.id === x.spaceId),
        );
        snapshot.runs = snapshot.runs.filter((x) => snapshot.roles.some((r) => r.id === x.roleId));
        snapshot.results = snapshot.results.filter((x) =>
          snapshot.tasks.some((t) => t.id === x.taskId),
        );
        snapshot.issues = snapshot.issues.filter(
          (x) => x.projectId && c.allowedProjects!.has(x.projectId),
        );
        snapshot.approvals = snapshot.approvals.filter((x) =>
          snapshot.runs.some((r) => r.id === x.runId),
        );
        snapshot.workspaces = snapshot.workspaces?.filter((x) =>
          c.allowedProjects!.has(x.projectId),
        );
      }
      return snapshot;
    }
    if (m === 'model.list')
      return this.page(
        snapshot.modelCatalog!.filter(
          (x) =>
            (!p.harness || x.harness === p.harness) &&
            (!p.provider_profile_id || x.provider_profile_id === p.provider_profile_id),
        ),
        p,
      );
    if (m === 'model.get') {
      const model = snapshot.modelCatalog!.find(
        (x) => x.provider_profile_id === p.provider_profile_id && x.model_id === p.model_id,
      );
      if (!model) throw new C1R1Error('NOT_FOUND');
      return model;
    }
    if (m === 'provider.listProfiles')
      return this.page(
        [...new Set(snapshot.modelCatalog!.map((x) => x.provider_profile_id))].map((id) => {
          const model = snapshot.modelCatalog!.find((x) => x.provider_profile_id === id)!;
          return {
            id,
            providerId: model.provider_id,
            label: model.provider_id,
            harness: model.harness,
            status: 'UNVERIFIED',
            mock: false,
          };
        }),
      );
    if (m.startsWith('binding.')) {
      const rows = this.all(
        'select b.*,w.display_path from bindings b join workspaces w on w.id=b.workspace_id order by b.created_at_ms,b.id',
      ).filter((b) =>
        this.matches(
          c,
          p.scope ?? {},
          this.roleScope(b.role_id).project_id,
          this.roleScope(b.role_id).space_id,
        ),
      );
      const items = rows.map((b) => ({
        id: b.id,
        roleId: b.role_id,
        harness: b.harness,
        epoch: b.epoch,
        workspaceLabel: b.display_path,
        current: !!b.is_current,
        revision: this.rev(b.id),
        modelSelection: JSON.parse(b.model_json),
        nativeCapability: { resumeWithTransition: false, bootstrapMode: 'FIRST_USER_INPUT' },
      }));
      if (m === 'binding.listHistory') return this.page(items, p);
      const row = items.find((b) => b.roleId === p.id && b.current);
      if (!row) throw new C1R1Error('NOT_FOUND');
      return row;
    }
    const collections: Record<string, any[]> = {
      project: snapshot.projects,
      space: snapshot.spaces,
      role: snapshot.roles,
      workspace: snapshot.workspaces!,
      task: snapshot.tasks,
      run: snapshot.runs,
      inbox: snapshot.results,
      issue: snapshot.issues,
      approval: snapshot.approvals,
    };
    let rows = collections[m.split('.')[0]];
    if (rows) {
      rows = rows.filter((row) => {
        const role = row.roleId ? this.roleScope(row.roleId) : null,
          task = row.taskId ? this.one('select * from tasks where id=?', row.taskId) : null;
        const space =
          row.spaceId ??
          role?.space_id ??
          task?.space_id ??
          (row.runId
            ? this.one(
                'select r.space_id from runs run join roles r on r.id=run.role_id where run.id=?',
                row.runId,
              )?.space_id
            : undefined);
        const project =
          row.projectId ??
          (m.startsWith('project.')
            ? row.id
            : this.one('select project_id from spaces where id=?', space ?? '')?.project_id);
        return this.matches(
          c,
          p.scope ?? (p.project_id ? { project_id: p.project_id } : {}),
          project,
          space,
        );
      });
      if (m.endsWith('.get')) {
        const row = rows.find((row) => row.id === p.id);
        if (!row) throw new C1R1Error('NOT_FOUND');
        return row;
      }
      return this.page(rows, p);
    }
    throw new C1R1Error('CAPABILITY_UNAVAILABLE');
  }
  private matches(c: Connection, scope: Scope, project?: string, space?: string) {
    return (
      (!c.allowedProjects || (!!project && c.allowedProjects.has(project))) &&
      (!scope.project_id || scope.project_id === project) &&
      (!scope.space_id || scope.space_id === space)
    );
  }
  assertRole(id: string, scope: Scope) {
    const r = this.roleScope(id);
    if (r.project_id !== scope.project_id || (scope.space_id && scope.space_id !== r.space_id))
      throw new C1R1Error('SCOPE_DENIED');
    return r;
  }
  private conversation(c: Connection, p: any) {
    if (p.role_id) {
      const r = this.roleScope(p.role_id);
      this.authorize(c, { project_id: r.project_id, space_id: r.space_id });
      if (!this.matches(c, p.scope ?? {}, r.project_id, r.space_id))
        throw new C1R1Error('SCOPE_DENIED');
    }
    const where: string[] = [],
      args: unknown[] = [];
    for (const [column, value] of Object.entries({
      project_id: p.scope?.project_id,
      space_id: p.scope?.space_id,
      role_id: p.role_id,
      task_id: p.task_id,
      run_id: p.run_id,
    }))
      if (value) {
        where.push(column + '=?');
        args.push(value);
      }
    if (c.allowedProjects) {
      where.push('project_id in (' + [...c.allowedProjects].map(() => '?').join(',') + ')');
      args.push(...c.allowedProjects);
    }
    const filter = where.length ? ' where ' + where.join(' and ') : '';
    if (p.after_id) {
      const last = this.one(
        'select seq from conversation_items' + filter + (filter ? ' and ' : ' where ') + 'id=?',
        ...args,
        p.after_id,
      );
      if (!last) throw new C1R1Error('CURSOR_INVALID');
      where.push('seq>?');
      args.push(last.seq);
    }
    const selected = this.all(
      'select * from conversation_items' +
        (where.length ? ' where ' + where.join(' and ') : '') +
        ' order by seq limit ?',
      ...args,
      (p.limit ?? 100) + 1,
    );
    const rows = selected.slice(0, p.limit ?? 100).map((row) => ({
      id: row.id,
      cursor: row.seq,
      kind: row.kind,
      ...(row.role_id ? { roleId: row.role_id } : {}),
      ...(row.task_id ? { taskId: row.task_id } : {}),
      ...(row.run_id ? { runId: row.run_id } : {}),
      occurredAtMs: row.at_ms,
      ...(row.title ? { title: row.title } : {}),
      ...(row.body ? { body: row.body.slice(0, 4096) } : {}),
      ...(row.state ? { state: row.state } : {}),
      replay: false,
      sensitive: false,
    }));
    return {
      items: rows,
      next_id: rows.at(-1)?.id ?? null,
      has_more: selected.length > (p.limit ?? 100),
    };
  }
  private write(
    id: string,
    c: Connection,
    m: Method,
    p: any,
    scope: Scope,
    operation: string,
  ): unknown {
    if (m === 'project.create') {
      const root = this.path(id, p.path_handle);
      if (!p.name.trim() || p.name.length > 160) throw new C1R1Error('INVALID_PARAMS');
      const project = uid('project'),
        workspace = uid('workspace');
      this.db
        .prepare('insert into projects values(?,?,?,?,?,?)')
        .run(
          project,
          p.name,
          root,
          process.platform === 'win32' ? root.toLowerCase() : root,
          'ACTIVE',
          this.clock(),
        );
      this.db
        .prepare('insert into workspaces values(?,?,?,?,?,?,?,?,?)')
        .run(
          workspace,
          project,
          null,
          root,
          process.platform === 'win32' ? root.toLowerCase() : root,
          'MAIN',
          null,
          null,
          'READY',
        );
      this.db
        .prepare('insert into policies values(?,?,?,?,?,?,?)')
        .run(uid('policy'), project, 1, 'agentrouter/1.0', '{}', digest({}), this.clock());
      return this.snapshot().projects.find((x) => x.id === project);
    }
    if(m==='role.createFromSpec')return this.createRoleFromSpec(p,scope.project_id!,scope.space_id!);
    if (m === 'rolePlan.apply') {
      if (
        c.revision === 'C1R1P2' &&
        this.registeredHarnesses &&
        Array.isArray(p.plan?.roles) &&
        !p.plan.roles.every((r: { runtime: { harness: string } }) =>
          this.registeredHarnesses!().includes(r.runtime.harness),
        )
      )
        throw new C1R1Error('CAPABILITY_UNAVAILABLE');
      return this.apply(
        p,
        scope.project_id!,
        c.principal,
        c.revision === 'C1R1P2' ? validatePlanShapeP2 : validatePlanShape,
      );
    }
    if (m === 'project.archive') {
      if (p.id !== scope.project_id) throw new C1R1Error('SCOPE_DENIED');
      if (
        this.one(
          "select a.id from initialization_attempts a join roles r on r.id=a.role_id join spaces s on s.id=r.space_id where s.project_id=? and a.state in ('STARTING','RUNNING','UNKNOWN')",
          p.id,
        )
      )
        throw new C1R1Error('RECONFIGURATION_BLOCKED');
      new Management(this.db).archiveProject(p.id);
      return { entityId: p.id, revision: this.revision };
    }
    if (m === 'role.rename' || m === 'role.updateStatus') {
      this.assertRole(p.id, scope);
      if (m === 'role.rename') new Management(this.db).renameRole(p.id, p.name);
      else {
        if (
          ['DISABLED', 'ARCHIVED'].includes(p.status) &&
          this.one(
            "select id from initialization_attempts where role_id=? and state in ('STARTING','RUNNING','UNKNOWN')",
            p.id,
          )
        )
          throw new C1R1Error('RECONFIGURATION_BLOCKED');
        new Management(this.db).setRoleStatus(p.id, p.status);
      }
      return { entityId: p.id, revision: this.revision };
    }
    if (m === 'roleCharter.update') {
      const r = this.assertRole(p.role_id, scope);
      if (
        this.one(
          'select active_run_id from role_slots where role_id=? and active_run_id is not null',
          p.role_id,
        ) ||
        this.one(
          "select id from initialization_attempts where role_id=? and state in ('STARTING','RUNNING','UNKNOWN')",
          p.role_id,
        )
      )
        throw new C1R1Error('RECONFIGURATION_BLOCKED');
      const prior = this.one(
          'select * from role_charters where role_id=? order by revision desc limit 1',
          r.id,
        ),
        spec = JSON.parse(prior.spec_json);
      if (p.spec.role_key !== spec.role_key || p.spec.group_key !== spec.group_key)
        throw new C1R1Error('PLAN_INVALID');
      const group = this.one(
        'select * from space_rules where space_id=? order by revision desc limit 1',
        r.space_id,
      );
      const plan = {
        schema_version: 'agentrouter-role-plan/1',
        project_id: r.project_id,
        title: '章程变更',
        source: 'human',
        goals: ['用户审查'],
        non_goals: [],
        assumptions: [],
        groups: [
          {
            group_key: group.group_key,
            display_name: '组',
            purpose: group.purpose,
            communication_boundary: 'within_group_only',
            workspace_strategy: 'custom',
            rules: JSON.parse(group.rules_json),
          },
        ],
        roles: [
          ...this.all(
            'select * from role_charters c where space_id=? and role_id<>? and revision=(select max(revision) from role_charters c2 where c2.role_id=c.role_id)',
            r.space_id,
            r.id,
          ).map((c) => JSON.parse(c.spec_json)),
          p.spec,
        ],
        review: { requires_user_confirmation: true, known_risks: [] },
      };
      if (!this.validate(plan).valid) throw new C1R1Error('PLAN_INVALID'); // conversation 入口仅 C1 枚举 harness
      const b = this.one('select * from bindings where role_id=? and is_current=1', r.id);
      this.db.prepare('update bindings set is_current=0 where id=?').run(b.id);
      this.db
        .prepare('insert into bindings values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          uid('binding'),
          r.id,
          p.spec.runtime.harness,
          p.spec.workspace_ref,
          null,
          null,
          JSON.stringify(p.spec.runtime),
          b.capability_json,
          null,
          b.epoch + 1,
          1,
          b.last_synced_policy_id,
          'HANDOVER_NEW_SESSION',
          this.clock(),
        );
      this.db
        .prepare('update roles set name=?,description=? where id=?')
        .run(p.spec.display_name, p.spec.mission, r.id);
      return this.publish(r.id, p.spec, p.permissions);
    }
    if (m === 'task.submitFromUser' || m === 'task.createFromUser') {
      const request =
        m === 'task.submitFromUser'
          ? p.request
          : {
              kind: 'task.request',
              to: { type: 'role', id: p.role_id },
              summary: p.summary,
              body: p.body,
              inputs: [],
              expected: ['用户验收'],
              completion: { mode: 'result', to: { type: 'user' } },
            };
      this.assertRole(request.to.id, scope);
      const row = this.db
        .prepare(
          'insert into operations(scope_key,operation_id,request_hash,response_json,committed_at_ms) values(?,?,?,?,?)',
        )
        .run(
          'human:' + c.principal + ':' + c.clientId,
          operation,
          digest(request),
          '{}',
          this.clock(),
        );
      const task = this.core.submitFromUser(
        { projectId: scope.project_id!, spaceId: scope.space_id! },
        request,
        Number(row.lastInsertRowid),
      );
      this.syncConversation();
      return this.snapshot().tasks.find((t) => t.id === task);
    }
    if (m === 'conversation.sendUserInput') {
      this.assertRole(p.role_id, scope);
      const task = this.one(
        'select * from tasks where id=? and assignee_role_id=?',
        p.task_id,
        p.role_id,
      );
      if (
        !task ||
        task.state !== 'WAITING_INPUT' ||
        this.one('select waiting_for from wait_records where task_id=?', task.id)?.waiting_for !==
          'user_input'
      )
        throw new C1R1Error('PLAN_STATE_CONFLICT');
      const atMs = this.clock();
      const sourceId = 'conversation-input:' + operation;
      this.db
        .prepare(
          'insert into conversation_items(id,project_id,space_id,role_id,task_id,kind,title,body,at_ms,source_key,role_session_id) values(?,?,?,?,?,?,?,?,?,?,(select role_session_id from tasks where id=?))',
        )
        .run(
          uid('conversation'),
          scope.project_id,
          scope.space_id,
          p.role_id,
          task.id,
          'USER_MESSAGE',
          '用户续办输入',
          p.body,
          atMs,
          sourceId,
          task.id,
        );
      this.contextStore.appendConversation({
        roleId: p.role_id,
        sourceWorkSessionId: task.role_session_id ?? null,
        sourceId,
        kind: 'USER_MESSAGE',
        title: '用户续办输入',
        body: p.body,
        taskId: task.id,
        atMs,
      });
      this.db.prepare('update wait_records set ready=1 where task_id=?').run(task.id);
      return { entityId: task.id, revision: this.revision };
    }
    if (m === 'task.suspend' || m === 'task.resume' || m === 'task.cancel') {
      const task = this.one('select * from tasks where id=?', p.id);
      if (!task || task.space_id !== scope.space_id) throw new C1R1Error('SCOPE_DENIED');
      if (!['QUEUED', 'SUSPENDED'].includes(task.state))
        throw new C1R1Error('RECONFIGURATION_BLOCKED');
      this.db
        .prepare('update tasks set state=?,updated_at_ms=? where id=?')
        .run(
          m === 'task.cancel' ? 'CANCELLED' : m === 'task.suspend' ? 'SUSPENDED' : 'QUEUED',
          this.clock(),
          p.id,
        );
      return { entityId: p.id, revision: this.revision };
    }
    if (m === 'result.accept' || m === 'result.reject') {
      const result = this.one(
        'select r.*,t.space_id from results r join tasks t on t.id=r.task_id where r.id=?',
        p.id,
      );
      if (!result || result.space_id !== scope.space_id) throw new C1R1Error('SCOPE_DENIED');
      if (result.publication_state !== 'PUBLISHED') throw new C1R1Error('PLAN_STATE_CONFLICT');
      this.db
        .prepare('update tasks set acceptance=? where id=?')
        .run(m === 'result.accept' ? 'ACCEPTED' : 'REJECTED', result.task_id);
      return { entityId: p.id, revision: this.revision };
    }
    if (m === 'run.cancel') {
      const run = this.one('select * from runs where id=?', p.id);
      if (!run) throw new C1R1Error('NOT_FOUND');
      this.assertRole(run.role_id, scope);
      if ((!this.fixtureMode && !this.nativeCancelAvailable?.(run.binding_id)) || !this.one('select run_id from run_sources where run_id=?', run.id))
        throw new C1R1Error('CAPABILITY_UNAVAILABLE');
      if (!['STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(run.state))
        throw new C1R1Error('RECONFIGURATION_BLOCKED');
      this.db
        .prepare("insert or ignore into cancel_intents values(?,?,'PENDING',?)")
        .run(run.id, run.binding_epoch, this.clock());
      return { entityId: run.id, revision: this.revision };
    }
    if (m === 'model.refresh')
      return this.page(
        this.all(
          'select descriptor_json from model_catalog where provider_profile_id=?',
          p.provider_profile_id,
        ).map((x) => JSON.parse(x.descriptor_json)),
      );
    if (['runtime.pauseDispatch', 'runtime.drain', 'runtime.resumeDispatch'].includes(m)) {
      this.db
        .prepare("update app_meta set value=? where key='dispatch_paused'")
        .run(m === 'runtime.resumeDispatch' ? 'false' : 'true');
      return { entityId: 'runtime_local', revision: this.revision };
    }
    if (m === 'runtime.shutdownCore') {
      return { entityId: 'runtime_local', revision: this.revision };
    }
    throw new C1R1Error('CAPABILITY_UNAVAILABLE');
  }
  syncConversation() {
    for (const m of this.all('select * from messages order by seq')) {
      const roleIds = [...new Set([m.from_role_id, m.to_role_id].filter(Boolean))] as string[];
      for (const roleId of roleIds) {
        const r = this.roleScope(roleId),
          p = JSON.parse(m.payload_json),
          kind = (m.from_kind === 'user'
            ? 'USER_MESSAGE'
            : m.kind === 'notice'
              ? 'NOTICE'
              : m.kind === 'task.result'
                ? 'ROUTE_RESULT'
                : 'ROUTE_TASK') as import('./role-context-store.ts').PortableContextKind,
          title = m.from_kind === 'user' ? '用户' : (p.summary ?? 'Route'),
          body = String(p.body ?? ''),
          state = this.one('select state from outbox where message_id=?', m.id)?.state ?? 'STORED',
          sourceId = 'message:' + m.id + ':' + roleId;
        const taskSession = this.one(
          'select rs.id from tasks t join role_sessions rs on rs.id=t.role_session_id and rs.role_id=? where t.id=?',
          roleId,
          m.task_id,
        );
        const roleSessionId =
          taskSession?.id ??
          this.one("select id from role_sessions where role_id=? and state='ACTIVE' order by seq desc limit 1", roleId)?.id ??
          null;
        this.db
          .prepare(
            'insert into conversation_items(id,project_id,space_id,role_id,task_id,kind,title,body,state,at_ms,source_key,role_session_id) values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict(source_key) do update set state=excluded.state,role_session_id=excluded.role_session_id',
          )
          .run(
            uid('conversation'),
            r.project_id,
            m.space_id,
            roleId,
            m.task_id,
            kind,
            title,
            body.slice(0, 4096),
            state,
            m.created_at_ms,
            sourceId,
            roleSessionId,
          );
        const item = this.one('select role_session_id from conversation_items where source_key=?', sourceId);
        this.contextStore.appendConversation({
          roleId,
          sourceWorkSessionId: item?.role_session_id ?? null,
          sourceId,
          kind,
          title,
          body,
          state,
          taskId: m.task_id ?? null,
          atMs: Number(m.created_at_ms),
        });
      }
    }
  }
}
