import { randomUUID } from 'node:crypto';
import seeds from '../../fixtures/client-c1r1/model-seed.json' with { type: 'json' };
import {
  C1R1Error,
  digest,
  validatePlanShape,
  validateDefinition,
  assertSameSpace,
  type RolePlanInput,
  type PlanRole,
  type RolePlanValidationVM,
} from '../client-contract/c1r1/index.ts';
const uid = (prefix: string) => prefix + '_' + randomUUID();
const activeRuns = ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'];
const issue = (code: string, field: string) => ({ code, field });
const find = (xs: any[], id: string) => xs.find((x) => x.id === id);
/** 仅内存合同模型；不打开 DB、不启动 Harness、不修改文件或真实权限。 */
export class MockProduct {
  data: any;
  constructor(data?: any) {
    this.data = data ?? {
      snapshot: {
        cursor: 0,
        revision: 1,
        projects: [
          {
            id: 'project_example',
            name: '双协作组演示',
            status: 'ACTIVE',
            hostLabel: 'MOCK',
            displayRoot: '受控项目',
            spacesCount: 0,
            activeRunsCount: 0,
            issuesCount: 0,
            revision: 1,
          },
        ],
        spaces: [],
        roles: [],
        tasks: [],
        runs: [],
        issues: [],
        approvals: [],
        results: [],
      },
      workspaces: ['core', 'ui'].map((n) => ({
        id: 'workspace_' + n,
        projectId: 'project_example',
        label: n,
        kind: 'WORKTREE',
        displayPath: '受控工作区/' + n,
        status: 'READY',
        access: 'SERIAL_WRITE',
        revision: 1,
      })),
      plans: [],
      charters: [],
      bindings: [],
      memberships: [],
      reconfigurations: [],
      messages: [],
      taskHistory: [],
      audit: [],
      catalog: structuredClone(seeds),
      runtimeCatalogs: {},
      cacheCatalogs: {},
      switching: [],
      uncertainLeases: [],
      nativeResume: [],
      drained: [],
      bootstrap: [],
    };
  }
  fork() {
    return new MockProduct(structuredClone(this.data));
  }
  get revision() {
    return this.data.snapshot.revision as number;
  }
  next() {
    return ++this.data.snapshot.revision;
  }
  project(id: string) {
    const p = find(this.data.snapshot.projects, id);
    if (!p) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
    return p;
  }
  space(id: string, project: string) {
    const s = find(this.data.snapshot.spaces, id);
    if (!s || s.projectId !== project) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
    return s;
  }
  role(id: string, project: string, space?: string) {
    const r = find(this.data.snapshot.roles, id);
    if (!r) throw new C1R1Error('NOT_FOUND');
    this.space(r.spaceId, project);
    if (space && r.spaceId !== space) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
    return r;
  }
  model(runtime: any) {
    return this.data.catalog.find(
      (m: any) =>
        m.harness === runtime.harness &&
        m.model_id === runtime.model_id &&
        (!runtime.provider_profile_id || m.provider_profile_id === runtime.provider_profile_id),
    );
  }
  validate(plan: unknown): RolePlanValidationVM {
    const hash = digest(plan);
    const errors: any[] = [],
      warnings: any[] = [];
    if (!validatePlanShape(plan))
      return {
        valid: false,
        planHash: hash,
        errors: [issue('SCHEMA_INVALID', 'plan')],
        warnings: [],
        requiredConfirmations: ['USER_REVIEW', 'PERMISSIONS'],
      };
    const p = plan as RolePlanInput;
    const groups = new Map(p.groups.map((g) => [g.group_key, g])),
      roles = new Map(p.roles.map((r) => [r.role_key, r]));
    if (groups.size !== p.groups.length) errors.push(issue('DUPLICATE_GROUP_KEY', 'groups'));
    if (roles.size !== p.roles.length) errors.push(issue('DUPLICATE_ROLE_KEY', 'roles'));
    if (!find(this.data.snapshot.projects, p.project_id))
      errors.push(issue('PROJECT_NOT_FOUND', 'project_id'));
    for (const group of p.groups) {
      if (
        group.workspace_ref &&
        !this.data.workspaces.some(
          (w: any) =>
            w.id === group.workspace_ref && w.projectId === p.project_id && w.status === 'READY',
        )
      )
        errors.push(issue('WORKSPACE_SCOPE', 'groups.workspace_ref'));
    }
    for (const r of p.roles) {
      if (!groups.has(r.group_key)) errors.push(issue('UNKNOWN_GROUP_KEY', r.role_key));
      if (
        !this.data.workspaces.some(
          (w: any) =>
            w.id === r.workspace_ref && w.projectId === p.project_id && w.status === 'READY',
        )
      )
        errors.push(issue('WORKSPACE_SCOPE', r.role_key));
      for (const target of [r.default_completion_target, r.problem_target])
        if (
          target.type === 'role_key' &&
          (!roles.has(target.role_key) || roles.get(target.role_key)!.group_key !== r.group_key)
        )
          errors.push(issue('CROSS_SPACE_DENIED', r.role_key));
      if (
        r.requested_permissions.allowed_paths.some((path) =>
          /^(?:[A-Za-z]:|[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)|(?:auth\.json|\.ssh|\.env)/i.test(path),
        )
      )
        errors.push(issue('PERMISSION_PATH_INVALID', r.role_key));
      const m = this.model(r.runtime);
      if (!m || m.availability !== 'AVAILABLE')
        warnings.push(issue('MODEL_UNVERIFIED', r.role_key));
      if (
        m &&
        m.reasoning.control !== 'none' &&
        !m.reasoning.levels.includes(r.runtime.reasoning_effort)
      )
        errors.push(issue('MODEL_SELECTION_INVALID', r.role_key));
    }
    return {
      valid: errors.length === 0,
      planHash: hash,
      errors,
      warnings,
      requiredConfirmations: ['USER_REVIEW', 'PERMISSIONS', 'UNVERIFIED_MODELS_CANNOT_START'],
    };
  }
  private permissions(spec: PlanRole, grant: any) {
    validateDefinition('PlanRequestedPermissions', grant);
    const req = spec.requested_permissions,
      workspace = find(this.data.workspaces, spec.workspace_ref),
      m = this.model(spec.runtime),
      supported = m?.tool_support === 'SUPPORTED';
    const allowed = new Set(['build', 'test', 'frontend-build', 'ui-test']);
    return {
      workspace_access:
        req.workspace_access === 'read_write' &&
        grant.workspace_access === 'read_write' &&
        workspace?.access === 'SERIAL_WRITE' &&
        supported
          ? 'read_write'
          : 'read_only',
      allowed_paths: grant.allowed_paths.filter((p: string) => req.allowed_paths.includes(p)),
      tool_profiles: grant.tool_profiles.filter(
        (p: string) => req.tool_profiles.includes(p) && allowed.has(p) && supported,
      ),
      network_profile: 'none',
    };
  }
  publishCharter(role: any, spec: PlanRole, grant: any, now: number) {
    const space = find(this.data.snapshot.spaces, role.spaceId),
      prior = this.data.charters.filter((c: any) => c.roleId === role.id),
      binding = this.data.bindings.find((b: any) => b.roleId === role.id && b.current);
    const c: any = {
      id: uid('charter'),
      roleId: role.id,
      projectId: space.projectId,
      spaceId: space.id,
      displayName: spec.display_name,
      revision: prior.length + 1,
      effectiveAtMs: now,
      policyRevision: space.policyRevision ?? 1,
      workspaceId: spec.workspace_ref,
      spec: structuredClone(spec),
      effectivePermissions: this.permissions(spec, grant),
      directory: this.data.snapshot.roles
        .filter((r: any) => r.spaceId === space.id)
        .map((r: any) => ({ roleId: r.id, displayName: r.name })),
      bootstrapState: 'PENDING',
      bindingEpoch: binding.epoch,
    };
    const { bootstrapState, ...immutable } = c;
    c.hash = digest(immutable);
    this.data.charters.push(c);
    this.data.bootstrap.push({
      id: uid('bootstrap'),
      roleId: role.id,
      charterId: c.id,
      revision: c.revision,
      epoch: binding.epoch,
      state: 'PENDING',
    });
    Object.assign(role, {
      charterRevision: c.revision,
      bootstrapState: 'PENDING',
      status: 'PAUSED',
      interventionState: 'BOOTSTRAP_REQUIRED',
      modelSelection: structuredClone(spec.runtime),
      ...(spec.runtime.provider_profile_id
        ? { providerProfileId: spec.runtime.provider_profile_id }
        : {}),
    });
    return c;
  }
  private createRoles(
    specs: PlanRole[],
    groupIds: Record<string, string>,
    grants: any[],
    revision: number,
    now: number,
  ) {
    const roles = specs.map((spec) => {
      const role: any = {
        id: uid('role'),
        spaceId: groupIds[spec.group_key],
        name: spec.display_name,
        description: spec.mission,
        status: 'PAUSED',
        harness: spec.runtime.harness,
        harnessSupport: 'PROBED',
        workspaceLabel: find(this.data.workspaces, spec.workspace_ref).label,
        queuedTasksCount: 0,
        unreadNoticesCount: 0,
        pendingApprovalsCount: 0,
        revision,
      };
      this.data.snapshot.roles.push(role);
      this.data.bindings.push({
        id: uid('binding'),
        roleId: role.id,
        harness: role.harness,
        epoch: 1,
        workspaceLabel: role.workspaceLabel,
        current: true,
        revision,
        modelSelection: structuredClone(spec.runtime),
        ...(spec.runtime.provider_profile_id
          ? { providerProfileId: spec.runtime.provider_profile_id }
          : {}),
        nativeCapability: { resumeWithTransition: false, bootstrapMode: 'FIRST_USER_INPUT' },
      });
      this.data.memberships.push({
        roleId: role.id,
        spaceId: role.spaceId,
        joinedAt: now,
        leftAt: null,
      });
      return role;
    });
    roles.forEach((role, index) => {
      const grant = grants.find((g) => g.role_key === specs[index].role_key);
      this.publishCharter(
        role,
        specs[index],
        grant?.permissions ?? {
          workspace_access: 'read_only',
          allowed_paths: [],
          tool_profiles: [],
          network_profile: 'none',
        },
        now,
      );
    });
    return roles;
  }
  apply(params: any, projectId: string, actor: string, now: number) {
    this.project(projectId);
    if (params.plan.project_id !== projectId) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
    const v = this.validate(params.plan);
    if (!v.valid) throw new C1R1Error('PLAN_INVALID');
    if (v.planHash !== params.plan_hash) throw new C1R1Error('PLAN_HASH_MISMATCH', 'CONFLICT');
    const keys = params.plan.roles.map((r: any) => r.role_key);
    if (
      new Set(params.permission_grants.map((g: any) => g.role_key)).size !==
        params.permission_grants.length ||
      params.permission_grants.some((g: any) => !keys.includes(g.role_key))
    )
      throw new C1R1Error('PLAN_INVALID');
    const revision = this.next(),
      ids: Record<string, string> = {};
    for (const group of params.plan.groups) {
      const id = uid('space');
      ids[group.group_key] = id;
      this.data.snapshot.spaces.push({
        id,
        projectId,
        name: group.display_name,
        status: 'ACTIVE',
        rolesCount: 0,
        queuedTasksCount: 0,
        revision,
        purpose: group.purpose,
        policyRevision: 1,
        topologyState: 'ACTIVE',
        activeRunsCount: 0,
        needsUserCount: 0,
        groupKey: group.group_key,
        rules: structuredClone(group.rules),
      });
    }
    const roles = this.createRoles(params.plan.roles, ids, params.permission_grants, revision, now);
    const record = {
      id: uid('plan'),
      projectId,
      planHash: v.planHash,
      sourcePlan: structuredClone(params.plan),
      state: 'APPLIED',
      roleIds: roles.map((r: any) => r.id),
      spaceIds: Object.values(ids),
      revision,
      appliedBy: actor,
    };
    this.data.plans.push(record);
    return record;
  }
  charterFor(roleId: string) {
    const c = this.data.charters.filter((c: any) => c.roleId === roleId).at(-1);
    if (!c) throw new C1R1Error('NOT_FOUND');
    return c;
  }
  private validateSpec(spec: PlanRole, space: any, replaceRole?: string) {
    if (spec.group_key !== space.groupKey)
      throw new C1R1Error('CROSS_SPACE_DENIED', 'AUTHORIZATION');
    const roles = this.data.snapshot.roles
      .filter((r: any) => r.spaceId === space.id && r.id !== replaceRole)
      .map((r: any) => this.charterFor(r.id).spec);
    const plan = {
      schema_version: 'agentrouter-role-plan/1',
      project_id: space.projectId,
      title: '手工角色章程',
      source: 'human',
      goals: ['验证角色'],
      non_goals: [],
      assumptions: [],
      groups: [
        {
          group_key: space.groupKey,
          display_name: space.name,
          purpose: space.purpose,
          communication_boundary: 'within_group_only',
          workspace_strategy: 'custom',
          rules: space.rules,
        },
      ],
      roles: [...roles, spec],
      review: { requires_user_confirmation: true, known_risks: [] },
    };
    if (!this.validate(plan).valid) throw new C1R1Error('PLAN_INVALID');
  }
  createFromSpec(p: any, project: string, spaceId: string, now: number) {
    const space = this.space(spaceId, project);
    if (space.status !== 'ACTIVE') throw new C1R1Error('PLAN_STATE_CONFLICT', 'CONFLICT');
    this.validateSpec(p.spec, space);
    return this.createRoles(
      [p.spec],
      { [space.groupKey]: space.id },
      [{ role_key: p.spec.role_key, permissions: p.permissions }],
      this.next(),
      now,
    )[0];
  }
  updateCharter(p: any, project: string, spaceId: string, now: number) {
    const r = this.role(p.role_id, project, spaceId);
    const old = this.charterFor(r.id);
    if (p.spec.role_key !== old.spec.role_key) throw new C1R1Error('PLAN_INVALID');
    if (
      this.data.snapshot.runs.some(
        (run: any) => run.roleId === r.id && [...activeRuns, 'UNKNOWN'].includes(run.state),
      )
    )
      throw new C1R1Error('RECONFIGURATION_BLOCKED', 'CONFLICT');
    this.validateSpec(p.spec, this.space(spaceId, project), r.id);
    r.revision = this.next();
    const binding = this.data.bindings.find((b: any) => b.roleId === r.id && b.current);
    binding.current = false;
    const nextBinding = {
      ...structuredClone(binding),
      id: uid('binding'),
      current: true,
      epoch: binding.epoch + 1,
      revision: r.revision,
      harness: p.spec.runtime.harness,
      modelSelection: structuredClone(p.spec.runtime),
      workspaceLabel: find(this.data.workspaces, p.spec.workspace_ref).label,
    };
    delete nextBinding.providerProfileId;
    if (p.spec.runtime.provider_profile_id)
      nextBinding.providerProfileId = p.spec.runtime.provider_profile_id;
    this.data.bindings.push(nextBinding);
    Object.assign(r, {
      name: p.spec.display_name,
      description: p.spec.mission,
      harness: p.spec.runtime.harness,
      workspaceLabel: nextBinding.workspaceLabel,
    });
    delete r.providerProfileId;
    return this.publishCharter(r, p.spec, p.permissions, now);
  }
  /** 测试端口：只模拟 Adapter 交付，不接收 GUI 提供的成功断言。 */
  advanceBootstrap(roleId: string, state: string, revision: number, epoch: number) {
    const r = find(this.data.snapshot.roles, roleId),
      c = this.charterFor(roleId),
      delivery = this.data.bootstrap.filter((b: any) => b.roleId === roleId).at(-1);
    if (c.revision !== revision || c.bindingEpoch !== epoch)
      throw new C1R1Error('REVISION_CONFLICT', 'CONFLICT');
    if (
      !(
        {
          PENDING: ['DELIVERING'],
          DELIVERING: ['DELIVERED', 'FAILED'],
          FAILED: ['DELIVERING'],
        } as Record<string, string[]>
      )[delivery.state]?.includes(state)
    )
      throw new C1R1Error('PLAN_STATE_CONFLICT', 'CONFLICT');
    delivery.state = state;
    r.bootstrapState = state;
    // 章程正文与哈希不因 delivery 改变；投影视图附加最新交付状态。
    r.status =
      state === 'DELIVERED' && this.readyModel(r) && !this.data.archivedOnly?.includes(roleId)
        ? 'ACTIVE'
        : 'PAUSED';
    r.interventionState =
      state === 'FAILED'
        ? 'BOOTSTRAP_FAILED'
        : state !== 'DELIVERED'
          ? 'BOOTSTRAP_REQUIRED'
          : this.readyModel(r)
            ? 'NONE'
            : 'MODEL_UNVERIFIED';
  }
  readyModel(role: any) {
    const m = this.model(role.modelSelection);
    return (
      !!m &&
      m.availability === 'AVAILABLE' &&
      m.source !== 'SEED' &&
      m.tool_support === 'SUPPORTED' &&
      (m.reasoning.control === 'none' ||
        m.reasoning.levels.includes(role.modelSelection.reasoning_effort))
    );
  }
  mockDispatch(roleId: string) {
    const r = find(this.data.snapshot.roles, roleId);
    if (!r || r.bootstrapState !== 'DELIVERED')
      throw new C1R1Error('BOOTSTRAP_REQUIRED', 'CONFLICT');
    if (!this.readyModel(r)) throw new C1R1Error('MODEL_UNVERIFIED', 'UNAVAILABLE');
    if (this.data.archivedOnly?.includes(roleId) || r.status !== 'ACTIVE')
      throw new C1R1Error('PLAN_STATE_CONFLICT', 'CONFLICT');
    const task = this.data.snapshot.tasks.find(
      (t: any) => t.assigneeRoleId === roleId && t.state === 'QUEUED' && t.spaceId === r.spaceId,
    );
    if (!task) return null;
    if (this.data.drained.includes(r.spaceId))
      throw new C1R1Error('RECONFIGURATION_BLOCKED', 'CONFLICT');
    task.charterRevision = r.charterRevision;
    task.policyRevision = find(this.data.snapshot.spaces, r.spaceId).policyRevision;
    task.state = 'ACTIVE';
    const run = {
      id: uid('run'),
      roleId,
      taskId: task.id,
      harness: r.harness,
      state: 'RUNNING',
      reconciliationRequired: false,
      revision: this.next(),
    };
    this.data.snapshot.runs.push(run);
    return run;
  }
  route(
    from: string,
    to: string,
    kind: 'task.request' | 'task.result' | 'notice',
    body = '离线消息',
  ) {
    if (!['task.request', 'task.result', 'notice'].includes(kind))
      throw new C1R1Error('INVALID_PARAMS');
    assertSameSpace(this.data.snapshot.roles, from, to);
    const role = find(this.data.snapshot.roles, from);
    const space = find(this.data.snapshot.spaces, role.spaceId);
    if (space.status !== 'ACTIVE') throw new C1R1Error('CROSS_SPACE_DENIED', 'AUTHORIZATION');
    this.data.messages.push({
      id: uid('message'),
      from,
      to,
      kind,
      body,
      spaceId: space.id,
      policyRevision: space.policyRevision,
    });
    return {};
  }
  refresh(profileId: string) {
    const runtime = this.data.runtimeCatalogs[profileId],
      cache = this.data.cacheCatalogs[profileId];
    const winner = runtime ?? cache;
    if (!winner) return this.data.catalog.filter((m: any) => m.provider_profile_id === profileId);
    const source = runtime ? 'RUNTIME' : 'VERIFIED_CACHE';
    const prior = this.data.catalog.filter((m: any) => m.provider_profile_id === profileId);
    const entries = winner.map((m: any) => ({ ...m, source }));
    for (const old of prior)
      if (!entries.some((m: any) => m.model_id === old.model_id))
        entries.push({
          ...old,
          source,
          availability: 'UNVERIFIED',
          compatibility_notes: ['MODEL_NOT_IN_RUNTIME_CATALOG'],
        });
    this.data.catalog = [
      ...this.data.catalog.filter((m: any) => m.provider_profile_id !== profileId),
      ...entries,
    ];
    this.next();
    return entries;
  }
  viewCharter(c: any) {
    const delivery = this.data.bootstrap.find((b: any) => b.charterId === c.id);
    return { ...structuredClone(c), bootstrapState: delivery?.state ?? c.bootstrapState };
  }
  snapshot() {
    const s = structuredClone(this.data.snapshot);
    s.spaces = s.spaces.map((space: any) => {
      const { groupKey, rules, ...vm } = space;
      const roles = s.roles.filter((r: any) => r.spaceId === space.id);
      return {
        ...vm,
        rolesCount: roles.length,
        queuedTasksCount: s.tasks.filter((t: any) => t.spaceId === space.id && t.state === 'QUEUED')
          .length,
        activeRunsCount: s.runs.filter(
          (r: any) => roles.some((x: any) => x.id === r.roleId) && activeRuns.includes(r.state),
        ).length,
        needsUserCount: roles.filter((r: any) => r.interventionState !== 'NONE').length,
      };
    });
    s.projects = s.projects.map((p: any) => {
      const spaces = s.spaces.filter((g: any) => g.projectId === p.id && g.status === 'ACTIVE');
      const groups = spaces.slice(0, 3).map((g: any) => {
        const roles = s.roles.filter((r: any) => r.spaceId === g.id);
        return {
          spaceId: g.id,
          name: g.name,
          roles: roles
            .slice(0, 5)
            .map((r: any) => ({ roleId: r.id, name: r.name, status: r.status })),
          extraRolesCount: Math.max(0, roles.length - 5),
          activeRunsCount: g.activeRunsCount,
          queuedTasksCount: g.queuedTasksCount,
          needsUserCount: g.needsUserCount,
          pendingApprovalsCount: roles.reduce(
            (n: number, r: any) => n + r.pendingApprovalsCount,
            0,
          ),
        };
      });
      return {
        ...p,
        spacesCount: spaces.length,
        activeRunsCount: spaces.reduce((n: number, g: any) => n + g.activeRunsCount, 0),
        statusSummary: {
          groups,
          extraGroupsCount: Math.max(0, spaces.length - 3),
          activeRunsCount: spaces.reduce((n: number, g: any) => n + g.activeRunsCount, 0),
          queuedTasksCount: spaces.reduce((n: number, g: any) => n + g.queuedTasksCount, 0),
          needsUserCount: spaces.reduce((n: number, g: any) => n + g.needsUserCount, 0),
          pendingApprovalsCount: s.roles
            .filter((r: any) => spaces.some((g: any) => g.id === r.spaceId))
            .reduce((n: number, r: any) => n + r.pendingApprovalsCount, 0),
          lastActivityAtMs: this.data.audit.at(-1)?.at ?? 0,
        },
      };
    });
    return {
      ...s,
      workspaces: structuredClone(this.data.workspaces),
      modelCatalog: structuredClone(this.data.catalog),
    };
  }
}
