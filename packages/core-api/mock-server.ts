import { randomUUID } from 'node:crypto';
import snapshotFixture from '../../fixtures/client-c1/snapshot.json' with { type: 'json' };
import capsFixture from '../../fixtures/client-c1/capabilities.json' with { type: 'json' };
import {
  asRequest,
  validateResult,
  ContractError,
  type Request,
  type Method,
  type SnapshotVM,
  type Event,
  type LeaseVM,
  type CoreHelloVM,
  type Capabilities,
  type ReconciliationVM,
  methodMetadata,
} from '../client-contract/index.ts';
const id = (prefix: string) => prefix + '_' + randomUUID();
function canonical(x: any): string {
  return JSON.stringify(
    x && typeof x === 'object'
      ? Array.isArray(x)
        ? x.map((v) => JSON.parse(canonical(v)))
        : Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, JSON.parse(canonical(x[k]))]),
          )
      : x,
  );
}
type Connection = {
  principal: string;
  authorizedController: boolean;
  clientId?: string;
  observer: boolean;
  initialized: boolean;
  handler?: (event: Event) => void;
};
/** 仅 C1 合同 Mock：无数据库、Harness、SSH、凭据、OS 资源释放。 */
export class MockCoreServer {
  readonly instanceId = id('mock');
  readonly capabilities = structuredClone(capsFixture) as Capabilities;
  readonly snapshot = structuredClone(snapshotFixture) as SnapshotVM;
  readonly audits: ReconciliationVM[] = [];
  private evidence = new Map<
    string,
    {
      runId: string;
      epoch: number;
      nativeCompleted: boolean;
      resourcesStopped: boolean;
      noSideEffects: boolean;
    }
  >();
  registerMockEvidence(
    id: string,
    proof: {
      runId: string;
      epoch: number;
      nativeCompleted: boolean;
      resourcesStopped: boolean;
      noSideEffects: boolean;
    },
  ) {
    this.evidence.set(id, structuredClone(proof));
  }
  private connections = new Map<string, Connection>();
  private lease: (LeaseVM & { connectionId: string; principal: string }) | null = null;
  private generation = 0;
  private events: Event[] = [];
  private oldestCursor = 0;
  private ledger = new Map<string, { hash: string; result: any }>();
  constructor(
    readonly clock = () => Date.now(),
    readonly ttlMs = 30000,
  ) {}
  open(principal: string, authorizedController = true) {
    const c = id('connection');
    this.connections.set(c, {
      principal,
      authorizedController,
      observer: true,
      initialized: false,
    });
    return c;
  }
  disconnect(c: string) {
    this.connections.delete(c); /* 租约保持到 TTL；业务状态不动。 */
  }
  subscribe(c: string, handler: (e: Event) => void) {
    const conn = this.connection(c);
    conn.handler = handler;
    return () => {
      if (conn.handler === handler) conn.handler = undefined;
    };
  }
  private connection(c: string) {
    const conn = this.connections.get(c);
    if (!conn) throw new ContractError('CONNECTION_LOST', 'UNAVAILABLE');
    return conn;
  }
  private visibleLease(): LeaseVM | null {
    if (!this.lease || this.lease.expiresAtMs <= this.clock()) return null;
    const { connectionId, principal, ...vm } = this.lease;
    return vm;
  }
  private event(name: Event['event'], entity: string, scope: Event['payload']['scope'] = {}) {
    const e: Event = {
      v: 1,
      event: name,
      cursor: ++this.snapshot.cursor,
      occurred_at_ms: this.clock(),
      payload: { entity_id: entity, revision: this.snapshot.revision, scope },
    };
    this.events.push(e);
    for (const c of this.connections.values())
      if (c.initialized) {
        try {
          c.handler?.(structuredClone(e));
        } catch {
          /* 单个订阅者故障不回滚已提交变更。 */
        }
      }
  }
  trimEvents(through: number) {
    if (!Number.isSafeInteger(through) || through < 0 || through > this.snapshot.cursor)
      throw Error('INVALID_TRIM');
    this.events = this.events.filter((e) => e.cursor > through);
    this.oldestCursor = Math.max(this.oldestCursor, through);
  }
  async handle(connectionId: string, raw: unknown) {
    let request: Request;
    try {
      request = asRequest(raw);
    } catch (e) {
      throw e;
    }
    try {
      const result = this.execute(connectionId, request);
      validateResult(request.method, result);
      return { v: 1 as const, id: request.id, result: structuredClone(result) };
    } catch (e) {
      const error =
        e instanceof ContractError ? e : new ContractError('INTERNAL_ERROR', 'INTERNAL');
      return { v: 1 as const, id: request.id, error: error.wire(id('trace')) };
    }
  }
  private execute(cid: string, r: Request): any {
    const c = this.connection(cid),
      m = r.method,
      p = r.params as any;
    if (m === 'system.initialize') {
      if (c.initialized) throw new ContractError('ALREADY_INITIALIZED', 'CONFLICT');
      c.clientId = p.client_id;
      c.initialized = true;
      c.observer = p.requested_mode === 'observer' || !c.authorizedController;
      return {
        serverInstanceId: this.instanceId,
        serverVersion: '1.0.0-dev.0',
        protocol: 'agentrouter-client/1',
        schemaVersion: 1,
        platform: 'linux',
        connectionState: 'CONNECTED_OBSERVER',
        eventCursor: this.snapshot.cursor,
        capabilities: this.capabilities,
        health: 'OK',
        upgradeRequired: false,
        lease: null,
      } satisfies CoreHelloVM;
    }
    if (!c.initialized) throw new ContractError('NOT_INITIALIZED', 'AUTHORIZATION');
    const meta = methodMetadata[m];
    if (!this.capabilities.methods.includes(m))
      throw new ContractError('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
    if (meta.mutation) {
      if (!('operation_id' in r)) throw new ContractError('INVALID_FRAME', 'VALIDATION');
      if (c.observer || !c.authorizedController || r.client_id !== c.clientId)
        throw new ContractError('CONTROL_LEASE_REQUIRED', 'AUTHORIZATION');
      if (m === 'control.release') {
        const replay = this.ledger.get(canonical([c.principal, c.clientId, r.operation_id]));
        if (replay) {
          if (
            replay.hash !==
            canonical({
              method: m,
              params: p,
              scope: r.scope,
              expected_revision: r.expected_revision,
            })
          )
            throw new ContractError('OPERATION_CONFLICT', 'CONFLICT');
          return replay.result;
        }
      }
      if (m !== 'control.acquire') {
        const lease = this.visibleLease();
        if (!lease) throw new ContractError('CONTROL_LEASE_EXPIRED', 'AUTHORIZATION');
        if (
          this.lease!.connectionId !== cid ||
          ('lease_id' in r ? r.lease_id : p.lease_id) !== lease.leaseId
        )
          throw new ContractError('CONTROL_LEASE_REQUIRED', 'AUTHORIZATION');
      }
      const key = canonical([c.principal, c.clientId, r.operation_id]);
      // 租约和传输请求 ID 不属于业务载荷，重连可以使用新租约重放。
      const hash = canonical({
        method: m,
        params: p,
        scope: r.scope,
        expected_revision: r.expected_revision,
      });
      const previous = this.ledger.get(key);
      if (previous) {
        if (previous.hash !== hash) throw new ContractError('OPERATION_CONFLICT', 'CONFLICT');
        if (m === 'control.acquire' && (!this.visibleLease() || this.lease!.connectionId !== cid))
          throw new ContractError('CONTROL_LEASE_EXPIRED', 'AUTHORIZATION');
        return previous.result;
      }
      if (r.expected_revision !== this.snapshot.revision)
        throw new ContractError('REVISION_CONFLICT', 'CONFLICT');
      let result: any;
      if (m === 'control.acquire') {
        if (this.visibleLease()) throw new ContractError('CONTROL_LEASE_BUSY', 'CONFLICT');
        this.lease = {
          leaseId: id('lease'),
          clientId: c.clientId!,
          expiresAtMs: this.clock() + this.ttlMs,
          generation: ++this.generation,
          connectionId: cid,
          principal: c.principal,
        };
        result = this.visibleLease();
      } else if (m === 'control.renew') {
        this.lease!.expiresAtMs = this.clock() + this.ttlMs;
        result = this.visibleLease();
      } else if (m === 'control.release') {
        this.lease = null;
        result = {};
      } else if (m === 'role.rename') {
        const role = this.snapshot.roles.find((x) => x.id === p.id),
          space = this.snapshot.spaces.find((x) => x.id === role?.spaceId);
        if (!role) throw new ContractError('NOT_FOUND', 'VALIDATION');
        if (space?.projectId !== r.scope.project_id || role.spaceId !== r.scope.space_id)
          throw new ContractError('SCOPE_DENIED', 'AUTHORIZATION');
        role.name = p.name;
        role.revision = ++this.snapshot.revision;
        result = { entityId: role.id, revision: role.revision };
        this.event('role.changed', role.id, r.scope);
      } else if (m === 'run.reconcile') {
        const run = this.snapshot.runs.find((x) => x.id === p.run_id),
          role = this.snapshot.roles.find((x) => x.id === run?.roleId),
          space = this.snapshot.spaces.find((x) => x.id === role?.spaceId);
        if (!run) throw new ContractError('NOT_FOUND', 'VALIDATION');
        if (space?.projectId !== r.scope.project_id || role?.spaceId !== r.scope.space_id)
          throw new ContractError('SCOPE_DENIED', 'AUTHORIZATION');
        if (run.state !== 'UNKNOWN') throw new ContractError('RECONCILIATION_REQUIRED', 'CONFLICT');
        const proofs = p.evidence_ids.map((e: string) => this.evidence.get(e));
        if (!proofs.every((e: any) => e && e.runId === run.id && e.epoch === 1))
          throw new ContractError('EVIDENCE_REQUIRED', 'AUTHORIZATION');
        const stopped = proofs.some((e: any) => e.resourcesStopped),
          completed = proofs.some((e: any) => e.nativeCompleted);
        if (
          (p.action === 'release_after_manual_verification' && (!stopped || !completed)) ||
          (p.action === 'confirm_no_side_effect_and_retry' &&
            (!stopped || !proofs.some((e: any) => e.noSideEffects))) ||
          (p.action === 'confirm_native_completed' && !completed) ||
          (p.action === 'reattach_native_session' && !p.native_session_handle)
        )
          throw new ContractError('EVIDENCE_REQUIRED', 'AUTHORIZATION');
        // C1 只对 Mock 核对记录，不伪造 native proof 或释放真实资源。
        run.revision = ++this.snapshot.revision;
        result = {
          auditId: id('audit'),
          runId: run.id,
          action: p.action,
          actorId: c.principal,
          occurredAtMs: this.clock(),
          evidenceIds: p.evidence_ids,
          resourceDisposition:
            p.action === 'release_after_manual_verification'
              ? 'RELEASED_AFTER_VERIFICATION'
              : p.action === 'quarantine_workspace'
                ? 'QUARANTINED'
                : 'RETAINED',
          retryScheduled: false,
          revision: run.revision,
        };
        this.audits.push(result);
        this.event('reconciliation.recorded', run.id, r.scope);
      } else throw new ContractError('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
      this.ledger.set(key, { hash, result: structuredClone(result) });
      return result;
    }
    if (m === 'system.ping') return {};
    if (m === 'system.snapshot' || m === 'runtime.getActiveWork') return this.snapshot;
    if (m === 'harness.list') return this.capabilities;
    if (m === 'events.catchup') {
      if (p.server_instance_id !== this.instanceId || p.after_cursor < this.oldestCursor)
        throw new ContractError('CURSOR_EXPIRED', 'CONFLICT', { snapshot_required: true });
      if (p.after_cursor > this.snapshot.cursor)
        throw new ContractError('CURSOR_INVALID', 'VALIDATION');
      const all = this.events.filter((e) => e.cursor > p.after_cursor),
        items = all.slice(0, p.limit ?? 100);
      return {
        events: items,
        next_cursor: items.at(-1)?.cursor ?? p.after_cursor,
        has_more: all.length > items.length,
        server_instance_id: this.instanceId,
      };
    }
    const collections: Record<string, any[]> = {
      project: this.snapshot.projects,
      space: this.snapshot.spaces,
      role: this.snapshot.roles,
      task: this.snapshot.tasks,
      run: this.snapshot.runs,
      approval: this.snapshot.approvals,
      issue: this.snapshot.issues,
      inbox: this.snapshot.results,
    };
    const collection = collections[m.split('.')[0]];
    if (collection) {
      if (m.endsWith('.get')) {
        const item = collection.find((x) => x.id === p.id);
        if (!item) throw new ContractError('NOT_FOUND', 'VALIDATION');
        return item;
      }
      let start = 0;
      if (p.after_id) {
        const pos = collection.findIndex((x) => x.id === p.after_id);
        if (pos < 0) throw new ContractError('CURSOR_INVALID', 'VALIDATION');
        start = pos + 1;
      }
      const items = collection.slice(start, start + (p.limit ?? 100));
      return {
        items,
        next_id: items.at(-1)?.id ?? null,
        has_more: start + items.length < collection.length,
      };
    }
    throw new ContractError('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  }
}
