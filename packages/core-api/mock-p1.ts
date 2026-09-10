import { randomUUID } from 'node:crypto';
import {
  C1R1Error,
  canonical,
  validateRequest,
  validateDefinition,
  validateResponse,
  projectResult,
  methodMetadata,
  type Method,
  type Event,
} from '../client-contract/c1r1p1/index.ts';
import oldSchema from '../../contracts/client-api.c1.schema.json' with { type: 'json' };
import { MockP1Product as MockProduct } from './mock-p1-product.ts';
import {
  storePreview,
  commitReconfiguration,
  reconfigurationView,
} from './mock-c1r1-reconfiguration.ts';
const uid = (p: string) => p + '_' + randomUUID();
type Connection = {
  principal: string;
  authorized: boolean;
  clientId?: string;
  requestedMode?: string;
  revision: 'C1' | 'C1R1' | 'C1R1P1';
  initialized: boolean;
  handler?: (e: any) => void;
};
const page = (items: any[]) => ({ items, next_id: items.at(-1)?.id ?? null, has_more: false });
const reads = [
  'system.initialize',
  'system.ping',
  'system.snapshot',
  'events.catchup',
  'harness.list',
  'runtime.getActiveWork',
  'project.list',
  'project.get',
  'space.list',
  'role.list',
  'role.get',
  'task.list',
  'task.get',
  'run.list',
  'run.get',
  'approval.list',
  'issue.list',
  'inbox.list',
  'binding.getCurrent',
  'binding.listHistory',
];
const extra = [
  'filesystem.listRoots',
  'filesystem.listDirectory',
  'filesystem.validateProjectRoot',
  'project.create',
  'project.archive',
  'conversation.read',
  'conversation.sendUserInput',
  'task.createFromUser',
  'task.submitFromUser',
];
const writes = [
  'control.acquire',
  'control.renew',
  'control.release',
  'role.rename',
  'runtime.drain',
];
const added = Object.keys(methodMetadata).filter((n) => !(n in oldSchema['x-methods']));
/** C1R1 唯一 Mock 服务；所有变更在 fork 中验证后一次换入，不接生产 Core。 */
export class MockP1Server {
  readonly instanceId = uid('mock');
  private product = new MockProduct();
  private connections = new Map<string, Connection>();
  private lease: any = null;
  private generation = 0;
  private ledger = new Map<string, { hash: string; result: any }>();
  private events: any[] = [];
  private failNext = false;
  private pathGrants = new Map<string, { owner: Connection; label: string }>();
  constructor(readonly clock = () => Date.now()) {}
  get state() {
    return structuredClone(this.product.data);
  }
  open(principal = 'mock_operator', authorized = true) {
    const id = uid('connection');
    this.connections.set(id, { principal, authorized, revision: 'C1', initialized: false });
    return id;
  }
  disconnect(id: string) {
    this.connections.delete(id);
    if (this.lease?.connectionId === id) this.lease = null;
  }
  subscribe(id: string, handler: (e: any) => void) {
    const c = this.connection(id);
    c.handler = handler;
    return () => {
      c.handler = undefined;
    };
  }
  private connection(id: string) {
    const c = this.connections.get(id);
    if (!c) throw new C1R1Error('CONNECTION_LOST', 'UNAVAILABLE');
    return c;
  }
  private caps(c: Connection) {
    const methods = [
      ...new Set([
        ...reads,
        ...writes,
        ...(c.revision !== 'C1' ? added : []),
        ...extra.filter((n) => c.revision === 'C1R1P1' || n !== 'task.submitFromUser'),
      ]),
    ];
    return {
      methods,
      remote_filesystem: false,
      event_stream: true,
      controller_lease: true,
      auth_unit_max_active_runs: 1,
      reference_types: { artifact: true, external: true, git: false, live: false },
      output_types: ['artifact'],
      harnesses: Object.fromEntries(
        ['codex', 'kimi_code', 'pi'].map((h) => [
          h,
          { status: 'PROBED', create_session: false, cancel: false },
        ]),
      ),
      mock: true,
      ...(c.revision !== 'C1'
        ? {
            role_plans: true,
            role_charters: true,
            space_reconfiguration: true,
            model_catalog: true,
            workspaces: true,
          }
        : {}),
    };
  }
  private emit(method: Method, projectId?: string) {
    const cursor = ++this.product.data.snapshot.cursor;
    const event = {
      v: 1,
      event: 'project.changed',
      cursor,
      occurred_at_ms: this.clock(),
      payload: {
        entity_id: projectId ?? 'project_example',
        revision: this.product.revision,
        scope: projectId ? { project_id: projectId } : {},
      },
    };
    this.events.push(event);
    for (const c of this.connections.values())
      try {
        c.handler?.(structuredClone(event));
      } catch {}
  }
  /** 故障注入只供测试，无对应 Client API。 */
  injectCommitFailure() {
    this.failNext = true;
  }
  registerMockCatalog(
    profile: string,
    models: any[],
    source: 'RUNTIME' | 'VERIFIED_CACHE' = 'RUNTIME',
  ) {
    for (const model of models) {
      validateResponse('model.get', model);
      if (model.provider_profile_id !== profile)
        throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
    }
    this.product.data[source === 'RUNTIME' ? 'runtimeCatalogs' : 'cacheCatalogs'][profile] =
      structuredClone(models);
  }
  advanceMockBootstrap(roleId: string, state: string, revision: number, epoch: number) {
    this.product.advanceBootstrap(roleId, state, revision, epoch);
  }
  dispatchMock(roleId: string) {
    return this.product.mockDispatch(roleId);
  }
  routeMock(from: string, to: string, kind: 'task.request' | 'task.result' | 'notice') {
    return this.product.route(from, to, kind);
  }
  setMockBlocker(kind: 'run' | 'switch' | 'lease' | 'task', id: string, value: any) {
    const d = this.product.data;
    if (kind === 'run') {
      d.snapshot.runs = d.snapshot.runs.filter((r: any) => r.id !== id);
      if (value) d.snapshot.runs.push({ id, ...value });
    }
    if (kind === 'task') {
      d.snapshot.tasks = d.snapshot.tasks.filter((t: any) => t.id !== id);
      if (value) d.snapshot.tasks.push({ id, ...value });
    }
    if (kind === 'switch')
      d.switching = value
        ? [...new Set([...d.switching, id])]
        : d.switching.filter((v: string) => v !== id);
    if (kind === 'lease')
      d.uncertainLeases = value
        ? [...new Set([...d.uncertainLeases, id])]
        : d.uncertainLeases.filter((v: string) => v !== id);
  }
  async handle(cid: string, raw: unknown): Promise<any> {
    const r = validateRequest(raw),
      c = this.connection(cid);
    try {
      let result: any;
      if (r.method === 'system.initialize') {
        if (c.initialized) throw new C1R1Error('ALREADY_INITIALIZED', 'CONFLICT');
        c.initialized = true;
        c.clientId = r.params.client_id;
        c.requestedMode = r.params.requested_mode;
        c.revision = r.params.contract_revision ?? 'C1';
        result = {
          serverInstanceId: this.instanceId,
          serverVersion: '1.0.0-dev.0',
          protocol: 'agentrouter-client/1',
          schemaVersion: c.revision === 'C1R1P1' ? 3 : c.revision === 'C1R1' ? 2 : 1,
          contractRevision: c.revision,
          platform: 'win32',
          connectionState: 'CONNECTED_OBSERVER',
          eventCursor: this.product.data.snapshot.cursor,
          capabilities: this.caps(c),
          health: 'OK',
          upgradeRequired: false,
          lease: null,
        };
      } else {
        validateDefinition('Request', r, c.revision);
        if (!c.initialized) throw new C1R1Error('NOT_INITIALIZED', 'AUTHORIZATION');
        if (!this.caps(c).methods.includes(r.method))
          throw new C1R1Error('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
        if (methodMetadata[r.method].mutation) result = this.mutate(cid, c, r as any);
        else result = this.read(c, r.method, r.params as any);
      }
      validateResponse(r.method, result);
      result = projectResult(c.revision, r.method, result);
      return { v: 1, id: r.id, result: structuredClone(result) };
    } catch (error) {
      const e = error instanceof C1R1Error ? error : new C1R1Error('INTERNAL_ERROR', 'INTERNAL');
      const wire = e.wire();
      if (c.revision === 'C1' && !oldSchema.$defs.ErrorCode.enum.includes(wire.code as any)) {
        wire.code = 'CAPABILITY_UNAVAILABLE';
        wire.category = 'UNAVAILABLE';
        wire.message_key = 'errors.capability_unavailable';
      }
      return { v: 1, id: r.id, error: wire };
    }
  }
  private mutate(cid: string, c: Connection, r: any) {
    if (!c.authorized || c.requestedMode !== 'controller' || c.clientId !== r.client_id)
      throw new C1R1Error('CONTROL_LEASE_REQUIRED', 'AUTHORIZATION');
    const key = canonical([c.principal, c.clientId, r.operation_id]),
      hash = canonical({
        method: r.method,
        params: r.params,
        scope: r.scope,
        expected_revision: r.expected_revision,
      });
    const previous = this.ledger.get(key);
    if (previous && previous.hash !== hash) throw new C1R1Error('OPERATION_CONFLICT', 'CONFLICT');
    if (previous && r.method === 'control.release') return previous.result;
    if (r.method !== 'control.acquire') {
      if (!this.lease || this.lease.expiresAtMs <= this.clock())
        throw new C1R1Error('CONTROL_LEASE_EXPIRED', 'AUTHORIZATION');
      if (
        this.lease.connectionId !== cid ||
        (r.lease_id ?? r.params.lease_id) !== this.lease.leaseId
      )
        throw new C1R1Error('CONTROL_LEASE_REQUIRED', 'AUTHORIZATION');
    }
    if (previous) {
      if (
        r.method === 'control.acquire' &&
        (!this.lease || this.lease.connectionId !== cid || this.lease.expiresAtMs <= this.clock())
      )
        throw new C1R1Error('CONTROL_LEASE_EXPIRED', 'AUTHORIZATION');
      return previous.result;
    }
    if (r.expected_revision !== this.product.revision)
      throw new C1R1Error('REVISION_CONFLICT', 'CONFLICT');
    let result: any;
    if (r.method.startsWith('control.')) {
      if (r.method === 'control.acquire') {
        if (this.lease && this.lease.expiresAtMs > this.clock())
          throw new C1R1Error('CONTROL_LEASE_BUSY', 'CONFLICT');
        this.lease = {
          leaseId: uid('lease'),
          clientId: c.clientId,
          expiresAtMs: this.clock() + 30000,
          generation: ++this.generation,
          connectionId: cid,
        };
      }
      if (r.method === 'control.renew') this.lease.expiresAtMs = this.clock() + 30000;
      if (r.method === 'control.release') {
        this.lease = null;
        result = {};
      } else {
        const { connectionId, ...view } = this.lease;
        result = view;
      }
    } else {
      const draft = this.product.fork();
      result = this.write(draft, r.method, r.params, r.scope, c.principal, c);
      validateResponse(r.method, result);
      if (this.failNext) {
        this.failNext = false;
        throw new C1R1Error('INTERNAL_ERROR', 'INTERNAL');
      }
      this.product = draft;
    }
    this.ledger.set(key, { hash, result: structuredClone(result) });
    if (!r.method.startsWith('control.')) this.emit(r.method, r.scope.project_id);
    return result;
  }
  private read(c: Connection, m: Method, p: any): any {
    const product = this.product,
      d = product.data,
      s = product.snapshot();
    if (m === 'system.ping') return {};
    if (m === 'system.snapshot' || m === 'runtime.getActiveWork') return s;
    if (m === 'harness.list') return this.caps(c);
    if (m === 'events.catchup') {
      if (p.server_instance_id !== this.instanceId)
        throw new C1R1Error('CURSOR_EXPIRED', 'CONFLICT');
      if (p.after_cursor > s.cursor) throw new C1R1Error('CURSOR_INVALID');
      const all = this.events.filter((e) => e.cursor > p.after_cursor),
        events = all.slice(0, p.limit ?? 100);
      return {
        events,
        next_cursor: events.at(-1)?.cursor ?? p.after_cursor,
        has_more: events.length < all.length,
        server_instance_id: this.instanceId,
      };
    }
    if (m === 'filesystem.listRoots') {
      const handle = uid('path');
      this.pathGrants.set(handle, { owner: c, label: 'Mock 主目录' });
      return {
        items: [
          {
            pathHandle: handle,
            name: 'Mock 主目录',
            displayPath: 'Mock 主目录',
            kind: 'DIRECTORY',
            readable: true,
            selectableAsProjectRoot: true,
          },
        ],
        next_id: null,
        has_more: false,
      };
    }
    if (m === 'filesystem.listDirectory' || m === 'filesystem.validateProjectRoot') {
      const grant = this.pathGrants.get(p.path_handle);
      if (!grant || grant.owner !== c) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      return {
        items: [
          {
            pathHandle: p.path_handle,
            name: grant.label,
            displayPath: grant.label,
            kind: 'DIRECTORY',
            readable: true,
            selectableAsProjectRoot: true,
          },
        ],
        next_id: null,
        has_more: false,
      };
    }
    if (m === 'conversation.read') return product.conversation(p);
    if (m === 'rolePlan.validate') return product.validate(p.plan);
    if (m === 'model.list')
      return page(
        d.catalog.filter(
          (x: any) =>
            (!p.harness || x.harness === p.harness) &&
            (!p.provider_profile_id || x.provider_profile_id === p.provider_profile_id),
        ),
      );
    if (m === 'model.get') {
      const model = d.catalog.find(
        (x: any) => x.model_id === p.model_id && x.provider_profile_id === p.provider_profile_id,
      );
      if (!model) throw new C1R1Error('NOT_FOUND');
      return model;
    }
    if (m === 'provider.listProfiles')
      return page(
        [...new Set(d.catalog.map((m: any) => m.provider_profile_id))].map((id) => {
          const m = d.catalog.find((m: any) => m.provider_profile_id === id);
          return {
            id,
            providerId: m.provider_id,
            label: 'Mock ' + m.provider_id,
            harness: m.harness,
            status: d.catalog.some(
              (m: any) => m.provider_profile_id === id && m.availability === 'AVAILABLE',
            )
              ? 'READY'
              : 'UNVERIFIED',
            mock: true,
          };
        }),
      );
    if (m === 'workspace.list') {
      product.project(p.project_id);
      return page(d.workspaces.filter((w: any) => w.projectId === p.project_id));
    }
    if (m === 'workspace.get') {
      const w = d.workspaces.find((w: any) => w.id === p.id && w.projectId === p.project_id);
      if (!w) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      return w;
    }
    if (m === 'space.get') {
      product.space(p.id, p.project_id);
      return s.spaces.find((g: any) => g.id === p.id);
    }
    if (m === 'rolePlan.list') {
      product.project(p.project_id);
      return page(d.plans.filter((x: any) => x.projectId === p.project_id));
    }
    if (m === 'rolePlan.get') {
      const x = d.plans.find((x: any) => x.id === p.id && x.projectId === p.project_id);
      if (!x) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      return x;
    }
    if (m === 'roleCharter.get' || m === 'roleCharter.listHistory') {
      product.role(p.role_id, p.project_id);
      return m === 'roleCharter.get'
        ? product.viewCharter(product.charterFor(p.role_id))
        : page(
            d.charters
              .filter((x: any) => x.roleId === p.role_id)
              .map((x: any) => product.viewCharter(x)),
          );
    }
    if (m === 'space.reconfigure.get') {
      const x = d.reconfigurations.find((x: any) => x.id === p.id && x.projectId === p.project_id);
      if (!x) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      return reconfigurationView(x);
    }
    if (m === 'binding.getCurrent' || m === 'binding.listHistory') {
      const roles = s.roles.filter(
        (r: any) =>
          (!p.scope?.space_id || r.spaceId === p.scope.space_id) &&
          (!p.scope?.project_id ||
            s.spaces.some((g: any) => g.id === r.spaceId && g.projectId === p.scope.project_id)),
      );
      const items = d.bindings.filter((b: any) => roles.some((r: any) => r.id === b.roleId));
      if (m === 'binding.listHistory') return page(items);
      const binding = items.find((b: any) => b.roleId === p.id && b.current);
      if (!binding) throw new C1R1Error('NOT_FOUND');
      return binding;
    }
    const collections: Record<string, any[]> = {
      project: s.projects,
      space: s.spaces,
      role: s.roles,
      task: s.tasks,
      run: s.runs,
      approval: s.approvals,
      issue: s.issues,
      inbox: s.results,
    };
    let rows = collections[m.split('.')[0]];
    if (rows) {
      rows = rows.filter((x) => {
        const role = s.roles.find((r: any) => r.id === (x.roleId ?? x.assigneeRoleId));
        const spaceId = x.spaceId ?? role?.spaceId;
        const projectId =
          x.projectId ??
          s.spaces.find((g: any) => g.id === spaceId)?.projectId ??
          (m.startsWith('project.') ? x.id : undefined);
        return (
          (!p.scope?.project_id || p.scope.project_id === projectId) &&
          (!p.scope?.space_id || p.scope.space_id === spaceId)
        );
      });
      if (m.endsWith('.get')) {
        const x = rows.find((x) => x.id === p.id);
        if (!x) throw new C1R1Error('NOT_FOUND');
        return x;
      }
      let start = 0;
      if (p.after_id) {
        const i = rows.findIndex((x) => x.id === p.after_id);
        if (i < 0) throw new C1R1Error('CURSOR_INVALID');
        start = i + 1;
      }
      const items = rows.slice(start, start + (p.limit ?? 100));
      return { ...page(items), has_more: start + items.length < rows.length };
    }
    throw new C1R1Error('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  }
  private write(
    product: MockProduct,
    m: Method,
    p: any,
    scope: any,
    actor: string,
    c: Connection,
  ): any {
    const d = product.data,
      now = this.clock();
    if (scope.project_id) product.project(scope.project_id);
    if (m === 'project.create') {
      const g = this.pathGrants.get(p.path_handle);
      if (!g || g.owner !== c) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      return product.createProject(p.name, g.label);
    }
    if (m === 'project.archive') return product.archiveProject(p.id, scope.project_id);
    if (m === 'task.submitFromUser') return product.submit(p.request, scope, now);
    if (m === 'task.createFromUser')
      return product.submit(
        {
          kind: 'task.request',
          to: { type: 'role', id: p.role_id },
          summary: p.summary,
          body: p.body,
          inputs: [],
          expected: ['用户验收'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
        scope,
        now,
      );
    if (m === 'conversation.sendUserInput') return product.userInput(p, scope, now);
    if (m === 'rolePlan.apply') return product.apply(p, scope.project_id, actor, now);
    if (m === 'role.createFromSpec')
      return product.createFromSpec(p, scope.project_id, scope.space_id, now);
    if (m === 'roleCharter.update')
      return product.updateCharter(p, scope.project_id, scope.space_id, now);
    if (m === 'space.reconfigure.preview') return storePreview(product, p.plan, scope.project_id);
    if (m === 'space.reconfigure.commit')
      return commitReconfiguration(product, p, scope.project_id, actor, now);
    if (m === 'space.reconfigure.abort') {
      const x = d.reconfigurations.find(
        (x: any) => x.id === p.plan_id && x.projectId === scope.project_id,
      );
      if (!x) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      if (x.state !== 'PREVIEW') throw new C1R1Error('PLAN_STATE_CONFLICT', 'CONFLICT');
      x.state = 'ABORTED';
      x.revision = product.next();
      return reconfigurationView(x);
    }
    if (m === 'model.refresh') return page(product.refresh(p.provider_profile_id));
    if (m === 'workspace.createWorktree') {
      const w = {
        id: uid('workspace'),
        projectId: scope.project_id,
        label: p.label,
        kind: 'WORKTREE',
        displayPath: 'MOCK/' + p.label,
        status: 'READY',
        access: 'SERIAL_WRITE',
        revision: product.next(),
        baseCommit: p.base_commit,
        branchLabel: p.branch_name,
      };
      d.workspaces.push(w);
      return w;
    }
    if (m === 'workspace.archive') {
      const w = d.workspaces.find((w: any) => w.id === p.id && w.projectId === scope.project_id);
      if (!w) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
      if (
        d.bindings.some(
          (b: any) => b.current && product.charterFor(b.roleId).workspaceId === w.id,
        ) ||
        d.uncertainLeases.includes(w.id)
      )
        throw new C1R1Error('RECONFIGURATION_BLOCKED', 'CONFLICT');
      w.status = 'ARCHIVED';
      w.revision = product.next();
      return w;
    }
    if (m === 'runtime.drain') {
      d.drained = d.snapshot.spaces.filter((s: any) => s.status === 'ACTIVE').map((s: any) => s.id);
      return { entityId: 'runtime_mock', revision: product.next() };
    }
    if (m === 'role.rename') {
      const role = product.role(p.id, scope.project_id, scope.space_id);
      role.name = p.name;
      role.revision = product.next();
      return { entityId: role.id, revision: role.revision };
    }
    throw new C1R1Error('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  }
}
