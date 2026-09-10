/**
 * 预览 Mock Client：实现与 window.agentrouterClient 相同的 ClientSession 接口。
 * 仅用于静态预览、截图与组件测试；不读取 SQLite、不启动 Harness、不含 Secret。
 */
import type {
  ClientSession,
  ConnectOptions,
} from '../client-transport/p1/types.ts';
import type {
  Capabilities,
  ConnectionState,
  CoreHelloVM,
  Event,
  Method,
  MethodMap,
  RolePlanInput,
  RolePlanValidationVM,
  SnapshotVM,
} from '../client-contract/c1r1p1/generated.ts';
import * as D from './data.ts';

export interface PreviewScenario {
  id: string;
  label: string;
  connectionState?: ConnectionState;
  requestedMode?: 'controller' | 'observer';
  /** 能力裁剪：模拟生产环境不支持的能力。 */
  capabilityFlags?: Partial<Capabilities>;
  empty?: boolean;
}

export const SCENARIOS: PreviewScenario[] = [
  { id: 'full', label: '完整世界（Controller）' },
  { id: 'observer', label: 'Observer 只读', requestedMode: 'observer' },
  {
    id: 'ssh-disconnected',
    label: 'SSH 断线冻结',
    connectionState: 'DISCONNECTED',
  },
  {
    id: 'production-caps',
    label: '生产能力（无组重构/RolePlan）',
    capabilityFlags: { role_plans: false, role_charters: false, space_reconfiguration: false, model_catalog: false, workspaces: false },
  },
  { id: 'empty', label: '空首页', empty: true },
];

export function baseCapabilities(flags: Partial<Capabilities> = {}): Capabilities {
  return {
    methods: [],
    remote_filesystem: false,
    event_stream: true,
    controller_lease: true,
    auth_unit_max_active_runs: 1,
    reference_types: { artifact: true, external: true, git: false, live: false },
    output_types: ['artifact'],
    harnesses: {
      codex: { status: 'PROBED', create_session: false, cancel: false },
      kimi_code: { status: 'UNAVAILABLE', create_session: false, cancel: false },
      pi: { status: 'PROBED', create_session: false, cancel: false },
    },
    mock: true,
    role_plans: true,
    role_charters: true,
    space_reconfiguration: true,
    model_catalog: true,
    workspaces: true,
    ...flags,
  };
}

function err(code: string, category: string): never {
  throw Object.assign(new Error(code), { code, category });
}

export class PreviewClient implements ClientSession {
  hello: CoreHelloVM;
  private scenario: PreviewScenario;
  private cursor = 108;
  private revision = 100;
  private handlers = new Set<(e: Event) => void>();
  private appliedPlans: Array<{ id: string; plan: RolePlanInput }> = [];
  private sentInputs: Array<{ roleId: string; text: string }> = [];
  private clock: () => number;

  constructor(options: ConnectOptions & { scenario?: PreviewScenario; now?: () => number }) {
    this.scenario = options.scenario ?? SCENARIOS[0];
    this.clock = options.now ?? (() => D.FIXED_NOW);
    const mode = this.scenario.requestedMode ?? options.requestedMode;
    const state =
      this.scenario.connectionState ??
      (mode === 'controller' ? 'CONNECTED_CONTROLLER' : 'CONNECTED_OBSERVER');
    this.hello = {
      serverInstanceId: 'preview-core-01',
      serverVersion: '1.0.0-dev.0',
      protocol: 'agentrouter-client/1',
      schemaVersion: 3,
      contractRevision: 'C1R1P1',
      platform: 'win32',
      connectionState: state,
      eventCursor: this.cursor,
      capabilities: baseCapabilities(this.scenario.capabilityFlags),
      health: state === 'DISCONNECTED' ? 'DEGRADED' : 'OK',
      upgradeRequired: false,
      lease:
        state === 'CONNECTED_CONTROLLER'
          ? { leaseId: 'lease-preview', clientId: options.clientId, expiresAtMs: this.clock() + 60000, generation: 1 }
          : null,
    };
  }

  connectionState(): ConnectionState {
    return this.hello.connectionState;
  }

  subscribe(fn: (event: Event) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  private emit(entityId: string, scope: Record<string, string>) {
    const event: Event = {
      v: 1,
      event: 'project.changed',
      cursor: ++this.cursor,
      occurred_at_ms: this.clock(),
      payload: { entity_id: entityId, revision: ++this.revision, scope },
    };
    for (const h of this.handlers) h(event);
  }

  private requireController() {
    if (this.hello.connectionState !== 'CONNECTED_CONTROLLER')
      err('CONTROL_LEASE_REQUIRED', 'AUTHORIZATION');
  }
  private requireConnected() {
    if (this.hello.connectionState === 'DISCONNECTED') err('CONNECTION_LOST', 'UNAVAILABLE');
  }
  private requireCapability(flag: keyof Capabilities) {
    if (this.hello.capabilities[flag] === false) err('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
  }

  private snapshot(): SnapshotVM {
    if (this.scenario.empty)
      return { cursor: this.cursor, revision: this.revision, projects: [], spaces: [], roles: [], tasks: [], runs: [], issues: [], approvals: [], results: [], workspaces: [], modelCatalog: D.modelCatalog };
    return {
      cursor: this.cursor,
      revision: this.revision,
      projects: D.projects,
      spaces: D.spaces,
      roles: D.roles,
      tasks: D.tasks,
      runs: D.runs,
      issues: D.issues,
      approvals: D.approvals,
      results: D.results,
      workspaces: D.workspaces,
      modelCatalog: D.modelCatalog,
    };
  }

  async request<M extends Method>(
    method: M,
    params: MethodMap[M]['params'],
  ): Promise<MethodMap[M]['result']> {
    const p = params as Record<string, unknown>;
    const page = <T>(items: T[]) => ({ items, next_after_id: null }) as never;
    switch (method as string) {
      case 'system.ping':
        this.requireConnected();
        return {} as never;
      case 'system.snapshot':
      case 'runtime.getActiveWork':
        return this.snapshot() as never;
      case 'events.catchup':
        return { events: [], next_cursor: this.cursor, has_more: false, server_instance_id: 'preview-core-01' } as never;
      case 'control.acquire':
        this.requireConnected();
        this.hello.connectionState = 'CONNECTED_CONTROLLER';
        return { leaseId: 'lease-preview', clientId: 'workbench', expiresAtMs: this.clock() + 60000, generation: 1 } as never;
      case 'control.release':
        this.hello.connectionState = 'CONNECTED_OBSERVER';
        return {} as never;
      case 'project.list':
        return page(this.snapshot().projects);
      case 'project.get':
        return this.snapshot().projects.find((x) => x.id === p.project_id) as never;
      case 'space.list':
        return page(D.spaces.filter((s) => !p.scope || (p.scope as { project_id?: string }).project_id === s.projectId));
      case 'space.get':
        return D.spaces.find((s) => s.id === p.space_id) as never;
      case 'role.list':
        return page(D.roles.filter((r) => !p.scope || (p.scope as { space_id?: string }).space_id === r.spaceId));
      case 'role.get':
        return D.roles.find((r) => r.id === p.role_id) as never;
      case 'task.list':
        return page(D.tasks);
      case 'task.get':
        return D.tasks.find((t) => t.id === p.task_id) as never;
      case 'run.list':
        return page(D.runs);
      case 'run.get':
        return D.runs.find((r) => r.id === p.run_id) as never;
      case 'approval.list':
        return page(D.approvals);
      case 'issue.list':
        return page(D.issues);
      case 'inbox.list':
        return page(D.results);
      case 'artifact.list':
        return page(D.artifacts);
      case 'artifact.get':
        return D.artifacts.find((a) => a.id === p.id) as never;
      case 'account.listProfiles':
        return page(D.accountProfiles);
      case 'account.getStatus':
        return D.accountProfiles.find((a) => a.id === p.profile_id) as never;
      case 'quota.listSnapshots':
        return page(D.quotas);
      case 'provider.listProfiles':
        return page(D.providerProfiles);
      case 'model.list':
        this.requireCapability('model_catalog');
        return page(D.modelCatalog);
      case 'model.get':
        this.requireCapability('model_catalog');
        return D.modelCatalog.find((m) => m.id === p.model_id) as never;
      case 'workspace.list':
        this.requireCapability('workspaces');
        return page(D.workspaces);
      case 'message.listTimeline':
      case 'conversation.read': {
        const scope = (p.scope ?? {}) as { space_id?: string };
        const roleId = p.role_id as string | undefined;
        let items = D.conversation;
        if (roleId) items = items.filter((i) => i.roleId === roleId);
        else if (scope.space_id) {
          const roleIds = D.roles.filter((r) => r.spaceId === scope.space_id).map((r) => r.id);
          items = items.filter((i) => !i.roleId || roleIds.includes(i.roleId));
        }
        return page(items);
      }
      case 'conversation.sendUserInput': {
        this.requireController();
        this.requireConnected();
        // 红线：成功发信只确认"已提交"，不产生"对方已接收/已处理"回执。
        this.sentInputs.push({ roleId: String(p.role_id ?? ''), text: String(p.body ?? '') });
        this.emit(String(p.role_id ?? ''), {});
        return { entityId: String(p.role_id ?? ''), revision: ++this.revision } as never;
      }
      case 'task.createFromUser': {
        this.requireController();
        this.requireConnected();
        const role = D.roles.find((r) => r.id === p.role_id);
        if (!role) err('NOT_FOUND', 'VALIDATION');
        const busy = D.tasks.some((t) => t.assigneeRoleId === role.id && (t.state === 'ACTIVE' || t.state === 'WAITING_INPUT'));
        const queued = D.tasks.filter((t) => t.assigneeRoleId === role.id && t.state === 'QUEUED');
        const task = {
          id: `task_new_${this.sentInputs.length}`,
          spaceId: role.spaceId,
          assigneeRoleId: role.id,
          summary: String(p.summary ?? '新任务'),
          state: busy || role.status === 'PAUSED' ? 'QUEUED' : 'ACTIVE',
          acceptance: 'PENDING',
          completionTargetLabel: '用户',
          createdAtMs: this.clock(),
          updatedAtMs: this.clock(),
          queuePosition: busy || role.status === 'PAUSED' ? queued.length + 1 : undefined,
          revision: 1,
        };
        return task as never;
      }
      case 'rolePlan.validate': {
        this.requireCapability('role_plans');
        const plan = p.plan as RolePlanInput;
        const errors: Array<{ code: string; field: string }> = [];
        const warnings: Array<{ code: string; field: string }> = [];
        const requiredConfirmations: string[] = [];
        if (!plan || plan.schema_version !== 'agentrouter-role-plan/1')
          errors.push({ code: 'SCHEMA', field: 'schema_version' });
        for (const r of plan?.roles ?? []) {
          if (!plan.groups.some((g) => g.group_key === r.group_key))
            errors.push({ code: 'GROUP_NOT_FOUND', field: r.role_key });
          if (r.requested_permissions.network_profile === 'custom_request')
            requiredConfirmations.push(`${r.display_name} 请求自定义网络权限`);
          const model = D.modelCatalog.find((m) => m.model_id === r.runtime.model_id);
          if (!model || model.availability !== 'AVAILABLE' || model.source === 'SEED')
            warnings.push({ code: 'MODEL_UNVERIFIED', field: `${r.role_key}.runtime` });
        }
        const result: RolePlanValidationVM = {
          valid: errors.length === 0,
          planHash: 'planhash-' + String(plan?.title ?? '').length,
          errors,
          warnings,
          requiredConfirmations,
        };
        return result as never;
      }
      case 'rolePlan.apply': {
        this.requireController();
        this.requireConnected();
        this.requireCapability('role_plans');
        const plan = p.plan as RolePlanInput;
        const vm = {
          id: `plan_${this.appliedPlans.length + 1}`,
          projectId: plan.project_id,
          planHash: 'planhash-' + plan.title.length,
          sourcePlan: plan,
          state: 'APPLIED',
          roleIds: plan.roles.map((r) => `applied_${r.role_key}`),
          spaceIds: plan.groups.map((g) => `applied_${g.group_key}`),
          revision: 1,
          appliedBy: 'preview-user',
        };
        this.appliedPlans.push({ id: vm.id, plan });
        this.emit(plan.project_id, { project_id: plan.project_id });
        return vm as never;
      }
      case 'rolePlan.list':
        this.requireCapability('role_plans');
        return page(this.appliedPlans.map((x) => ({ id: x.id })));
      case 'roleCharter.get': {
        this.requireCapability('role_charters');
        const role = D.roles.find((r) => r.id === p.role_id);
        if (!role) err('NOT_FOUND', 'VALIDATION');
        return D.charterFor(role) as never;
      }
      case 'roleCharter.listHistory': {
        this.requireCapability('role_charters');
        const role = D.roles.find((r) => r.id === p.role_id);
        return page(role ? [D.charterFor(role)] : []);
      }
      case 'space.reconfigure.preview':
        this.requireController();
        this.requireCapability('space_reconfiguration');
        return D.reconfigPreview as never;
      case 'space.reconfigure.commit': {
        this.requireController();
        this.requireConnected();
        this.requireCapability('space_reconfiguration');
        if (D.reconfigPreview.blockers.length > 0) err('RECONFIGURATION_BLOCKED', 'CONFLICT');
        return { id: 'rcfg_01', state: 'COMMITTED', preview: D.reconfigPreview, newSpaceIds: ['sp_merged'], transitionPackets: [], auditId: 'audit_01', revision: 1 } as never;
      }
      case 'space.reconfigure.get':
        this.requireCapability('space_reconfiguration');
        return { id: 'rcfg_01', state: 'PREVIEW', preview: D.reconfigPreview, newSpaceIds: [], transitionPackets: [], auditId: 'audit_01', revision: 1 } as never;
      case 'space.reconfigure.abort':
        this.requireController();
        this.requireCapability('space_reconfiguration');
        return { id: 'rcfg_01', state: 'ABORTED', preview: D.reconfigPreview, newSpaceIds: [], transitionPackets: [], auditId: 'audit_01', revision: 1 } as never;
      case 'approval.decide':
        this.requireController();
        this.requireConnected();
        return { entityId: String(p.id), revision: ++this.revision } as never;
      case 'issue.acknowledge':
      case 'issue.resolve':
      case 'inbox.markRead':
      case 'result.accept':
      case 'result.reject':
        this.requireController();
        this.requireConnected();
        return { entityId: String(p.id), revision: ++this.revision } as never;
      case 'account.switch':
        this.requireController();
        this.requireConnected();
        return { entityId: String(p.profile_id), revision: ++this.revision } as never;
      case 'run.reconcile':
        this.requireController();
        this.requireConnected();
        return {
          auditId: 'audit_rec_01',
          runId: String(p.run_id),
          action: String(p.action),
          actorId: 'preview-user',
          occurredAtMs: this.clock(),
          evidenceIds: [],
          resourceDisposition: 'RETAINED',
          retryScheduled: false,
          revision: 1,
        } as never;
      case 'role.updateStatus':
      case 'space.updateStatus':
        this.requireController();
        this.requireConnected();
        return { entityId: String(Object.values(p)[0]), revision: ++this.revision } as never;
      case 'runtime.pauseDispatch':
      case 'runtime.resumeDispatch':
        this.requireController();
        this.requireConnected();
        return { entityId: 'runtime', revision: ++this.revision } as never;
      default:
        err('CAPABILITY_UNAVAILABLE', 'UNAVAILABLE');
    }
  }
}

/** 创建预览会话：浏览器静态预览与测试共用入口。 */
export async function connectPreview(
  scenarioId = 'full',
  now?: () => number,
): Promise<ClientSession> {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const client = new PreviewClient({
    clientId: 'workbench-preview',
    clientVersion: '1.0.0-dev.0',
    requestedMode: scenario.requestedMode ?? 'controller',
    contractRevision: 'C1R1P1',
    mode: 'PREVIEW_MOCK',
    scenario,
    now,
  });
  return client;
}
