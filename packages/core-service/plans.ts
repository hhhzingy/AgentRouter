import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  C1R1Error,
  digest,
  validatePlanShape,
  type RolePlanInput,
  type PlanRole,
  type PlanRequestedPermissions,
  type RolePlanValidationVM,
  type RolePlanApplyParams,
  type RoleCreateFromSpecParams,
} from '../client-contract/c1r1p1/index.ts';
import { Management } from '../runtime/management.ts';
import { Projection } from './projection.ts';
const uid = (p: string) => p + '_' + randomUUID();
export class Plans extends Projection {
  /** Trusted production registration hook, invoked inside the existing command transaction. */
  onRoleCreated?: (roleId: string) => void;
  /** Installed capabilities only; explicit user grants and role requests are still required. */
  trustedToolProfiles: ReadonlySet<string> = new Set();
  constructor(
    db: Database.Database,
    readonly clock = () => Date.now(),
  ) {
    super(db);
  }
  validate(input: unknown): RolePlanValidationVM {
    const errors: { code: string; field: string }[] = [],
      warnings: { code: string; field: string }[] = [];
    const bad = (code: string, field: string) => errors.push({ code, field });
    const planHash = digest(input);
    if (!validatePlanShape(input))
      return {
        valid: false,
        planHash,
        errors: [{ code: 'SCHEMA_INVALID', field: 'plan' }],
        warnings,
        requiredConfirmations: ['USER_REVIEW'],
      };
    const p = input as RolePlanInput;
    if (!this.one("select id from projects where id=? and status='ACTIVE'", p.project_id))
      bad('PROJECT_SCOPE', 'project_id');
    const groups = new Map(p.groups.map((g) => [g.group_key, g])),
      roles = new Map(p.roles.map((r) => [r.role_key, r]));
    if (groups.size !== p.groups.length) bad('DUPLICATE_GROUP_KEY', 'groups');
    if (roles.size !== p.roles.length) bad('DUPLICATE_ROLE_KEY', 'roles');
    if (
      new Set(p.groups.map((g) => g.display_name.trim().toLocaleLowerCase())).size !==
      p.groups.length
    )
      bad('DUPLICATE_GROUP_NAME', 'groups');
    if (
      new Set(p.roles.map((r) => r.group_key + ':' + r.display_name.trim().toLocaleLowerCase()))
        .size !== p.roles.length
    )
      bad('DUPLICATE_ROLE_NAME', 'roles');

    for (const r of p.roles) {
      if (!groups.has(r.group_key)) bad('UNKNOWN_GROUP_KEY', r.role_key);
      if (
        !this.one(
          "select id from workspaces where id=? and project_id=? and status='READY'",
          r.workspace_ref,
          p.project_id,
        )
      )
        bad('WORKSPACE_SCOPE', r.role_key);
      for (const target of [r.default_completion_target, r.problem_target])
        if (target.type === 'role_key' && roles.get(target.role_key)?.group_key !== r.group_key)
          bad('CROSS_SPACE_DENIED', r.role_key);
      if (
        r.requested_permissions.allowed_paths.some((x) =>
          /^(?:[A-Za-z]:|[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)|(?:auth\.json|\.ssh|\.env)/i.test(x),
        )
      )
        bad('PERMISSION_PATH_INVALID', r.role_key);
      const rows = this.all(
        'select descriptor_json from model_catalog where model_id=?',
        r.runtime.model_id,
      ).map((m) => JSON.parse(m.descriptor_json));
      const candidates = rows.filter(
        (m) =>
          m.harness === r.runtime.harness &&
          (!r.runtime.provider_profile_id ||
            m.provider_profile_id === r.runtime.provider_profile_id),
      );
      const model = candidates.length === 1 ? candidates[0] : undefined;
      if (!model || model.availability !== 'AVAILABLE')
        warnings.push({ code: 'MODEL_UNVERIFIED', field: r.role_key });
      if (
        model &&
        model.reasoning.control !== 'none' &&
        !model.reasoning.levels.includes(r.runtime.reasoning_effort)
      )
        bad('MODEL_SELECTION_INVALID', r.role_key);
    }
    for (const g of p.groups)
      if (
        g.workspace_ref &&
        !this.one(
          "select id from workspaces where id=? and project_id=? and status='READY'",
          g.workspace_ref,
          p.project_id,
        )
      )
        bad('WORKSPACE_SCOPE', g.group_key);
    return {
      valid: !errors.length,
      planHash,
      errors,
      warnings,
      requiredConfirmations: ['USER_REVIEW', 'PERMISSIONS', 'UNVERIFIED_MODELS_CANNOT_START'],
    };
  }
  permissions(spec: PlanRole, grant?: PlanRequestedPermissions): PlanRequestedPermissions {
    return {
      workspace_access: 'read_only',
      allowed_paths: (grant?.allowed_paths ?? []).filter((p) =>
        spec.requested_permissions.allowed_paths.includes(p),
      ),
      tool_profiles: (grant?.tool_profiles ?? []).filter(
        (tool) =>
          spec.requested_permissions.tool_profiles.includes(tool) &&
          this.trustedToolProfiles.has(tool),
      ),
      network_profile: 'none',
    };
  }
  publish(role: string, spec: PlanRole, grant?: PlanRequestedPermissions) {
    const r = this.roleScope(role),
      b = this.one('select * from bindings where role_id=? and is_current=1', role),
      prior = this.one(
        'select coalesce(max(revision),0) as n from role_charters where role_id=?',
        role,
      ).n,
      rule = this.one(
        'select revision from space_rules where space_id=? order by revision desc limit 1',
        r.space_id,
      );
    const id = uid('charter'),
      permissions = this.permissions(spec, grant),
      directory = this.all(
        'select id as roleId,name as displayName from roles where space_id=? order by id',
        r.space_id,
      );
    const now = this.clock();
    const immutable = {
      id,
      roleId: role,
      projectId: r.project_id,
      spaceId: r.space_id,
      revision: prior + 1,
      policyRevision: rule?.revision ?? 1,
      bindingEpoch: b.epoch,
      workspaceId: spec.workspace_ref,
      spec,
      effectivePermissions: permissions,
      directory,
      effectiveAtMs: now,
    };
    this.db
      .prepare('insert into role_charters values(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        role,
        r.project_id,
        r.space_id,
        prior + 1,
        digest(immutable),
        immutable.policyRevision,
        b.epoch,
        spec.workspace_ref,
        JSON.stringify(spec),
        JSON.stringify(permissions),
        JSON.stringify(directory),
        now,
      );
    this.db
      .prepare('insert into bootstrap_deliveries values(?,?,?,?,?,?,?,?)')
      .run(uid('bootstrap'), role, id, b.epoch, prior + 1, 'PENDING', null, now);
    this.db
      .prepare(
        'insert into conversation_items(id,project_id,space_id,role_id,kind,title,body,state,at_ms,source_key) values(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        uid('conversation'),
        r.project_id,
        r.space_id,
        role,
        'SYSTEM_EVENT',
        '角色章程 v' + (prior + 1),
        '职责：' + spec.mission,
        'PENDING',
        now,
        'charter:' + id,
      );
    return this.charter(this.one('select * from role_charters where id=?', id));
  }
  createRoleFromSpec(p: RoleCreateFromSpecParams, project: string, space: string) {
    const group = this.one(
      "select * from spaces where id=? and project_id=? and status='ACTIVE'",
      space,
      project,
    );
    if (!group) throw new C1R1Error('SCOPE_DENIED');
    const rule = this.one(
      'select * from space_rules where space_id=? order by revision desc limit 1',
      space,
    );
    if (!rule || p.spec.group_key !== rule.group_key) throw new C1R1Error('PLAN_INVALID');
    if (
      this.one(
        'select id from roles where space_id=? and lower(name)=lower(?)',
        space,
        p.spec.display_name,
      )
    )
      throw new C1R1Error('PLAN_INVALID');
    if (
      this.one(
        "select a.id from initialization_attempts a join roles r on r.id=a.role_id where r.space_id=? and a.state in ('STARTING','RUNNING','UNKNOWN')",
        space,
      ) ||
      this.one(
        "select x.id from runs x join roles r on r.id=x.role_id where r.space_id=? and x.state in ('CREATED','STARTING','RUNNING','WAITING_APPROVAL','SETTLING','UNKNOWN')",
        space,
      )
    )
      throw new C1R1Error('RECONFIGURATION_BLOCKED');
    const members = this.all(
      'select c.role_id,c.permissions_json,c.spec_json from role_charters c join roles r on r.id=c.role_id where r.space_id=? and c.revision=(select max(revision) from role_charters where role_id=r.id)',
      space,
    );
    const existing = members.map((r) => JSON.parse(r.spec_json) as PlanRole);
    const plan: RolePlanInput = {
      schema_version: 'agentrouter-role-plan/1',
      project_id: project,
      title: '添加角色',
      source: 'human',
      goals: ['向现有小组添加经审阅角色'],
      non_goals: [],
      assumptions: [],
      groups: [
        {
          group_key: rule.group_key,
          display_name: group.name,
          purpose: rule.purpose,
          communication_boundary: 'within_group_only',
          workspace_strategy: 'shared_read_only',
          rules: JSON.parse(rule.rules_json),
        },
      ],
      roles: [...existing, p.spec],
      review: { requires_user_confirmation: true, known_risks: [] },
    };
    if (!this.validate(plan).valid) throw new C1R1Error('PLAN_INVALID');
    const created = new Management(this.db).createRole({
      spaceId: space,
      name: p.spec.display_name,
      description: p.spec.mission,
      harness: p.spec.runtime.harness,
      workspaceId: p.spec.workspace_ref,
      model: p.spec.runtime,
    });
    this.db
      .prepare('insert into role_membership_history values(?,?,?,?,?)')
      .run(uid('membership'), created.role, space, this.clock(), null);
    this.publish(created.role, p.spec, p.permissions);
    for (const member of members)
      this.publish(
        member.role_id,
        JSON.parse(member.spec_json),
        JSON.parse(member.permissions_json),
      );
    this.onRoleCreated?.(created.role);
    return this.snapshot().roles.find((r) => r.id === created.role)!;
  }
  apply(p: RolePlanApplyParams, project: string, actor: string) {
    if (p.plan.project_id !== project) throw new C1R1Error('SCOPE_DENIED');
    const v = this.validate(p.plan);
    if (!v.valid) throw new C1R1Error('PLAN_INVALID');
    if (v.planHash !== p.plan_hash) throw new C1R1Error('PLAN_HASH_MISMATCH');
    if (
      new Set(p.permission_grants.map((g) => g.role_key)).size !== p.permission_grants.length ||
      p.permission_grants.some((g) => !p.plan.roles.some((r) => r.role_key === g.role_key))
    )
      throw new C1R1Error('PLAN_INVALID');
    if (
      p.plan.groups.some((g) =>
        this.one(
          'select id from spaces where project_id=? and lower(name)=lower(?)',
          project,
          g.display_name,
        ),
      )
    )
      throw new C1R1Error('PLAN_INVALID');
    const groups = new Map<string, string>(),
      roleIds: string[] = [];
    const now = this.clock(),
      management = new Management(this.db);
    for (const g of p.plan.groups) {
      const id = management.createSpace(project, g.display_name);
      groups.set(g.group_key, id);
      this.db
        .prepare('insert into space_rules values(?,?,?,?,?,?)')
        .run(id, 1, g.group_key, g.purpose, JSON.stringify(g.rules), now);
    }
    for (const spec of p.plan.roles) {
      const r = management.createRole({
        spaceId: groups.get(spec.group_key)!,
        name: spec.display_name,
        description: spec.mission,
        harness: spec.runtime.harness,
        workspaceId: spec.workspace_ref,
        model: spec.runtime,
      });
      roleIds.push(r.role);
      this.db
        .prepare('insert into role_membership_history values(?,?,?,?,?)')
        .run(uid('membership'), r.role, groups.get(spec.group_key), now, null);
    }
    p.plan.roles.forEach((spec, i) =>
      this.publish(
        roleIds[i],
        spec,
        p.permission_grants.find((g) => g.role_key === spec.role_key)?.permissions,
      ),
    );
    for (const role of roleIds) this.onRoleCreated?.(role);
    const id = uid('plan');
    this.db
      .prepare('insert into role_plans values(?,?,?,?,?,?,?,?)')
      .run(
        id,
        project,
        v.planHash,
        JSON.stringify(p.plan),
        JSON.stringify(roleIds),
        JSON.stringify([...groups.values()]),
        this.revision,
        actor,
      );
    return this.plan(this.one('select * from role_plans where id=?', id));
  }
}
