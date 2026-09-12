import { validateManagementInput } from './schema.ts';
import { createHash } from 'node:crypto';
import {
  methodMetadata,
  validateDefinition,
  canonical,
  type Method,
} from '../client-contract/c1r1p1/index.ts';
import type {
  ClientSession,
  ClientTransport,
  RequestOptions,
} from '../client-transport/p1/types.ts';
export const managementMethods: Record<string, Method> = {
  router_status: 'system.snapshot',
  router_projects: 'project.list',
  router_project_get: 'project.get',
  router_roles: 'role.list',
  router_role_get: 'role.get',
  router_conversation: 'conversation.read',
  router_plan_validate: 'rolePlan.validate',
  router_plan_apply: 'rolePlan.apply',
  router_wait: 'task.get',
  router_task_dispatch: 'task.submitFromUser',
  router_task_get: 'task.get',
  router_task_cancel: 'task.cancel',
  router_run_cancel: 'run.cancel',
  router_results: 'inbox.list',
  router_result_accept: 'result.accept',
  router_result_reject: 'result.reject',
  router_issues: 'issue.list',
  router_models: 'model.list',
  router_events: 'events.catchup',
  router_role_charter_update: 'roleCharter.update',
  router_control_acquire: 'control.acquire',
  router_control_release: 'control.release',
};
export type GatewayInput = {
  params?: Record<string, unknown>;
  request_key?: string;
  expected_revision?: number;
  scope?: Record<string, string>;
};
/** No database, ApplicationService, RoleBridge, credential or Harness access. */
export class ManagementGateway {
  private session?: ClientSession;
  private lease?: string;
  private renewal?: ReturnType<typeof setInterval>;
  private renewalNumber = 0;
  private released = new Map<string, { hash: string; result: unknown }>();
  private releaseAttempts = new Map<string, { hash: string; lease: string }>();
  private serial: Promise<unknown> = Promise.resolve();
  constructor(
    private transport: ClientTransport,
    private mode: 'observer' | 'controller',
    private clientId = 'mcp_management_codex',
  ) {}
  async connect() {
    this.session = await this.transport.connect({
      clientId: this.clientId,
      clientVersion: '1.0.0-dev.0',
      requestedMode: this.mode,
      contractRevision: 'C1R1P1',
      mode: 'LOCAL_CORE',
    });
    if (this.session.hello.capabilities.mock) {
      await this.close();
      throw Error('FIXTURE_CORE_FORBIDDEN');
    }
  }
  tools() {
    const s = this.get();
    return Object.entries(managementMethods)
      .filter(
        ([, m]) =>
          s.hello.capabilities.methods.includes(m) &&
          (!methodMetadata[m].mutation || this.mode === 'controller'),
      )
      .map(([name, method]) => ({ name, method, mutation: methodMetadata[method].mutation }));
  }
  private get() {
    if (!this.session) throw Error('CORE_NOT_CONNECTED');
    return this.session;
  }
  async close() {
    if (this.renewal) clearInterval(this.renewal);
    this.session = undefined;
    this.lease = undefined;
    await this.transport.close();
  }
  async call(name: string, input: GatewayInput = {}) {
    // Serialize control and writes so the single connection lease has a clear order.
    const action = () => this.execute(name, input);
    if (!this.tools().find((t) => t.name === name)?.mutation) return action();
    const pending = this.serial.then(action, action);
    this.serial = pending.catch(() => {});
    return pending;
  }
  private async execute(name: string, input: GatewayInput) {
    const tool = this.tools().find((t) => t.name === name);
    if (!tool) throw Error('TOOL_UNAVAILABLE');
    validateManagementInput(name, tool.method, input);
    if (
      Object.keys(input).some(
        (k) => !['params', 'request_key', 'expected_revision', 'scope'].includes(k),
      )
    )
      throw Error('INVALID_INPUT');
    const params = { ...(input.params ?? {}) };
    const s = this.get();
    if (name === 'router_control_release' && input.request_key) {
      const old = this.released.get(input.request_key);
      if (old) {
        if (old.hash !== canonical(input)) throw Error('OPERATION_CONFLICT');
        return old.result;
      }
    }
    const options: RequestOptions = {};
    if (tool.mutation) {
      if (
        !input.request_key ||
        !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.request_key) ||
        !Number.isSafeInteger(input.expected_revision)
      )
        throw Error('REQUEST_KEY_AND_REVISION_REQUIRED');
      options.operationId = 'mcp_' + createHash('sha256').update(input.request_key).digest('hex');
      options.expectedRevision = input.expected_revision;
      options.scope = input.scope ?? {};
      if (name === 'router_control_release') {
        const prior = this.releaseAttempts.get(input.request_key);
        if (prior && prior.hash !== canonical(input)) throw Error('OPERATION_CONFLICT');
        const lease = prior?.lease ?? this.lease;
        if (!lease) throw Error('CONTROL_LEASE_REQUIRED');
        this.releaseAttempts.set(input.request_key, { hash: canonical(input), lease });
        params.lease_id = lease;
      } else if (name !== 'router_control_acquire') {
        if (!this.lease) throw Error('CONTROL_LEASE_REQUIRED');
        options.leaseId = this.lease;
      }
    }
    const waitMs = name === 'router_wait' ? Number(params.wait_ms ?? 0) : 0;
    if (name === 'router_wait') {
      if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30000) throw Error('INVALID_WAIT');
      delete params.wait_ms;
    }
    validateDefinition(methodMetadata[tool.method].params, params);
    if (name === 'router_wait') {
      const until = Date.now() + waitMs;
      while (true) {
        const task = await s.request('task.get', params as never);
        if (['DELIVERED', 'HANDED_OFF', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(task.state))
          return { task, timedOut: false };
        if (Date.now() >= until) return { task, timedOut: true };
        await new Promise((r) => setTimeout(r, Math.min(250, until - Date.now())));
      }
    }
    const result = await s.request(tool.method, params as never, options);
    if (name === 'router_control_acquire') {
      this.lease = (result as { leaseId: string }).leaseId;
      if (this.renewal) clearInterval(this.renewal);
      this.renewal = setInterval(() => {
        const renew = async () => {
          if (!this.lease || !this.session) return;
          const snap = await s.request('system.snapshot', {});
          await s.request(
            'control.renew',
            { lease_id: this.lease },
            {
              operationId: 'mcp_renew_' + this.renewalNumber++,
              expectedRevision: snap.revision,
              scope: {},
            },
          );
        };
        this.serial = this.serial.then(renew, renew).catch(() => {
          if (this.renewal) clearInterval(this.renewal);
          this.lease = undefined;
        });
      }, 10000);
      this.renewal.unref();
    }
    if (name === 'router_control_release') {
      this.released.set(input.request_key!, { hash: canonical(input), result });
      this.lease = undefined;
      if (this.renewal) clearInterval(this.renewal);
    }
    if (name === 'router_status')
      return {
        origin: 'MCP',
        mode: 'LOCAL_CORE',
        isolation: 'LIMITED_ISOLATION',
        hello: s.hello,
        snapshot: result,
      };
    if (name === 'router_task_dispatch') {
      const t = result as { id: string; state: string };
      return { id: t.id, state: t.state };
    }
    if (name === 'router_control_acquire') return { controller: true };
    return result;
  }
  /** external-api/1 扩展只经已认证 Client 连接转发；call 走串行队列并要求当前控制租约。 */
  async externalApiList(): Promise<unknown> {
    return (this.get().request as (m: string, p?: unknown) => Promise<unknown>)(
      'externalApi.list',
      {},
    );
  }
  async externalApiDescribe(profileId: string, actionId: string): Promise<unknown> {
    return (this.get().request as (m: string, p?: unknown) => Promise<unknown>)(
      'externalApi.describe',
      { profile_id: profileId, action_id: actionId },
    );
  }
  /** roleSession.* 草案扩展：经已认证 Client 连接转发；create/switch 走串行队列并要求控制租约。 */
  private roleSessionCall(method: string, params: Record<string, unknown>, mutation: boolean): Promise<unknown> {
    const action = async () => {
      const s = this.get();
      const lease = mutation ? this.lease : undefined;
      if (mutation && !lease) throw Error('CONTROL_LEASE_REQUIRED');
      return (s.request as (m: string, p: unknown, o?: unknown) => Promise<unknown>)(
        method,
        params,
        ...(lease ? [{ leaseId: lease }] : []),
      );
    };
    if (!mutation) return action();
    const pending = this.serial.then(action, action);
    this.serial = pending.catch(() => {});
    return pending;
  }
  roleSessionList(roleId: string) {
    return this.roleSessionCall('roleSession.list', { role_id: roleId }, false);
  }
  roleSessionHistory(roleId: string, sessionId: string, limit?: number) {
    return this.roleSessionCall('roleSession.history', { role_id: roleId, session_id: sessionId, ...(limit ? { limit } : {}) }, false);
  }
  roleSessionCreate(roleId: string, name: string) {
    return this.roleSessionCall('roleSession.create', { role_id: roleId, name }, true);
  }
  roleSessionSwitch(roleId: string, sessionId: string) {
    return this.roleSessionCall('roleSession.switch', { role_id: roleId, session_id: sessionId }, true);
  }
  async externalApiCall(input: { params: Record<string, unknown> }): Promise<unknown> {
    const action = async () => {
      const s = this.get();
      if (!this.lease) throw Error('CONTROL_LEASE_REQUIRED');
      return (s.request as (m: string, p: unknown, o?: unknown) => Promise<unknown>)(
        'externalApi.call',
        input.params,
        { leaseId: this.lease, timeoutMs: 60000 },
      );
    };
    const pending = this.serial.then(action, action);
    this.serial = pending.catch(() => {});
    return pending;
  }
}
