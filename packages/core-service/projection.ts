import type Database from 'better-sqlite3';
import {
  C1R1Error,
  type SnapshotVM,
  type RoleCharterVM,
  type RolePlanVM,
} from '../client-contract/c1r1p1/index.ts';
export class Projection {
  constructor(readonly db: Database.Database) {}
  one(sql: string, ...args: unknown[]): any {
    return this.db.prepare(sql).get(...args);
  }
  all(sql: string, ...args: unknown[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  get revision() {
    return Number(this.one("select value from app_meta where key='revision'").value);
  }
  get cursor() {
    return this.one('select coalesce(max(cursor),0) as n from client_events').n as number;
  }
  rev(id: string) {
    return (
      this.one('select revision from entity_revisions where entity_id=?', id)?.revision ??
      this.revision
    );
  }
  roleScope(id: string) {
    const r = this.one(
      'select r.*,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?',
      id,
    );
    if (!r) throw new C1R1Error('NOT_FOUND');
    return r;
  }
  charter(row: any): RoleCharterVM {
    const spec = JSON.parse(row.spec_json);
    return {
      id: row.id,
      roleId: row.role_id,
      projectId: row.project_id,
      spaceId: row.space_id,
      displayName: spec.display_name,
      revision: row.revision,
      hash: row.hash,
      effectiveAtMs: row.effective_at_ms,
      policyRevision: row.policy_revision,
      workspaceId: row.workspace_id,
      spec,
      effectivePermissions: JSON.parse(row.permissions_json),
      directory: JSON.parse(row.directory_json),
      bootstrapState:
        this.one('select state from bootstrap_deliveries where charter_id=?', row.id)?.state ??
        'PENDING',
      bindingEpoch: row.binding_epoch,
    };
  }
  plan(row: any): RolePlanVM {
    return {
      id: row.id,
      projectId: row.project_id,
      planHash: row.plan_hash,
      sourcePlan: JSON.parse(row.source_json),
      state: 'APPLIED',
      roleIds: JSON.parse(row.role_ids_json),
      spaceIds: JSON.parse(row.space_ids_json),
      revision: row.revision,
      appliedBy: row.applied_by,
    };
  }
  snapshot(): SnapshotVM {
    return this.db.transaction(() => this.view()).deferred();
  }
  private view(): SnapshotVM {
    const revision = this.revision,
      cursor = this.cursor;
    const workspaces = this.all('select * from workspaces order by id').map((w) => ({
      id: w.id,
      projectId: w.project_id,
      label: w.display_path,
      kind: w.kind === 'WORKTREE' ? 'WORKTREE' : 'DIRECTORY',
      displayPath: w.display_path,
      status: w.status === 'READY' ? 'READY' : w.status === 'ARCHIVED' ? 'ARCHIVED' : 'BLOCKED',
      access: 'SERIAL_WRITE',
      revision: this.rev(w.id),
    }));
    const runs = this.all(
      'select r.*,b.harness from runs r join bindings b on b.id=r.binding_id order by r.created_at_ms,r.id',
    ).map((r) => ({
      id: r.id,
      roleId: r.role_id,
      ...(r.task_id ? { taskId: r.task_id } : {}),
      harness: r.harness,
      state: r.state,
      startedAtMs: r.created_at_ms,
      ...(r.settled_at_ms ? { settledAtMs: r.settled_at_ms } : {}),
      ...(r.exit_reason ? { exitReason: r.exit_reason } : {}),
      nativeSessionDisplay:
        this.one('select source from run_sources where run_id=?', r.id)?.source ?? 'UNVERIFIED',
      reconciliationRequired: r.state === 'UNKNOWN',
      revision: this.rev(r.id),
    }));
    const tasks = this.all('select * from tasks order by seq').map((t) => {
      const completion = JSON.parse(t.completion_json);
      return {
        id: t.id,
        spaceId: t.space_id,
        ...(t.requester_role_id ? { requesterRoleId: t.requester_role_id } : {}),
        assigneeRoleId: t.assignee_role_id,
        summary: t.summary,
        state: t.state,
        ...(t.state==='WAITING_INPUT'?{blockedReason:this.one('select waiting_for from wait_records where task_id=?',t.id)?.waiting_for==='user_input'?'WAITING_FOR_USER_INPUT':'WAITING_FOR_DEPENDENCY'}:{}),
        acceptance: t.acceptance,
        completionTargetLabel:
          completion.to.type === 'user'
            ? '用户'
            : (this.one('select name from roles where id=?', completion.to.id)?.name ??
              completion.to.id),
        createdAtMs: t.created_at_ms,
        updatedAtMs: t.updated_at_ms,
        ...(t.state === 'QUEUED'
          ? {
              queuePosition: this.one(
                "select count(*) as n from tasks where assignee_role_id=? and state='QUEUED' and seq<=?",
                t.assignee_role_id,
                t.seq,
              ).n,
            }
          : {}),
        revision: this.rev(t.id),
        policyRevision:
          this.one('select revision from policies where id=?', t.policy_id)?.revision ?? 1,
        ...(this.one(
          'select c.revision from run_sources rs join role_charters c on c.id=rs.charter_id join runs r on r.id=rs.run_id where r.task_id=? order by r.created_at_ms desc limit 1',
          t.id,
        )
          ? {
              charterRevision: this.one(
                'select c.revision from run_sources rs join role_charters c on c.id=rs.charter_id join runs r on r.id=rs.run_id where r.task_id=? order by r.created_at_ms desc limit 1',
                t.id,
              ).revision,
            }
          : {}),
      };
    });
    const approvals = this.all('select * from approvals order by created_at_ms,id').map((a) => ({
      id: a.id,
      runId: a.run_id,
      state: a.state,
      title: '受控执行器审批',
      riskLevel: 'HIGH',
      requestedAtMs: a.created_at_ms,
      ...(a.expires_at_ms ? { expiresAtMs: a.expires_at_ms } : {}),
      revision: this.rev(a.id),
    }));
    const roles = this.all(
      'select r.*,b.harness,b.model_json,b.workspace_id,b.id as binding_id from roles r join bindings b on b.role_id=r.id and b.is_current=1 order by r.created_at_ms,r.id',
    ).map((r) => {
      const charter = this.one(
          'select * from role_charters where role_id=? order by revision desc limit 1',
          r.id,
        ),
        delivery = charter
          ? this.one('select * from bootstrap_deliveries where charter_id=?', charter.id)
          : null;
      const active = runs.find(
        (run) => run.roleId === r.id && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.state),
      );
      const slot = this.one('select * from role_slots where role_id=?', r.id);
      const intervention = !charter
        ? 'NONE'
        : delivery?.state === 'FAILED'
          ? 'BOOTSTRAP_FAILED'
          : delivery?.state !== 'DELIVERED'
            ? 'BOOTSTRAP_REQUIRED'
            : slot?.blocked_reason === 'harness_unverified'
              ? 'MODEL_UNVERIFIED'
              : 'NONE';
      return {
        id: r.id,
        spaceId: r.space_id,
        name: r.name,
        description: r.description,
        status: r.status,
        harness: r.harness,
        harnessSupport: 'PROBED',
        workspaceLabel: workspaces.find((w) => w.id === r.workspace_id)?.label ?? '未获取',
        queuedTasksCount: tasks.filter((t) => t.assigneeRoleId === r.id && t.state === 'QUEUED')
          .length,
        unreadNoticesCount: this.one(
          "select count(*) as n from messages where to_role_id=? and kind='notice'",
          r.id,
        ).n,
        pendingApprovalsCount: approvals.filter(
          (a) =>
            a.state === 'PENDING' && runs.some((run) => run.id === a.runId && run.roleId === r.id),
        ).length,
        revision: this.rev(r.id),
        modelSelection: JSON.parse(r.model_json),
        ...(charter ? { charterRevision: charter.revision, bootstrapState: delivery.state } : {}),
        interventionState: intervention,
        ...(active ? { runState: active.state } : {}),
      };
    });
    const spaces = this.all('select * from spaces order by created_at_ms,id').map((s) => {
      const rule = this.one(
        'select * from space_rules where space_id=? order by revision desc limit 1',
        s.id,
      );
      return {
        id: s.id,
        projectId: s.project_id,
        name: s.name,
        status: s.status,
        rolesCount: roles.filter((r) => r.spaceId === s.id).length,
        queuedTasksCount: tasks.filter((t) => t.spaceId === s.id && t.state === 'QUEUED').length,
        revision: this.rev(s.id),
        purpose: rule?.purpose ?? '',
        policyRevision: rule?.revision ?? 1,
        topologyState: s.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        activeRunsCount: runs.filter(
          (run) =>
            roles.some((r) => r.spaceId === s.id && r.id === run.roleId) &&
            ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(run.state),
        ).length,
        needsUserCount: roles.filter(
          (r) => r.spaceId === s.id && (r.interventionState !== 'NONE' || r.runState === 'UNKNOWN'),
        ).length,
      };
    });
    const issues = this.all('select * from issues order by created_at_ms,id').map((i) => {
      const role = i.role_id ? this.roleScope(i.role_id) : null;
      return {
        id: i.id,
        code: i.code,
        state: i.state,
        ...(role ? { projectId: role.project_id, spaceId: role.space_id, roleId: role.id } : {}),
        ...(i.task_id ? { taskId: i.task_id } : {}),
        ...(i.run_id ? { runId: i.run_id } : {}),
        messageKey: 'issues.' + i.code.toLowerCase(),
        createdAtMs: i.created_at_ms,
        revision: this.rev(i.id),
      };
    });
    const results = this.all(
      "select r.*,t.acceptance from results r join tasks t on t.id=r.task_id where r.publication_state='PUBLISHED' and exists(select 1 from messages m join outbox o on o.message_id=m.id where m.task_id=r.task_id and m.kind='task.result' and m.to_kind='user' and o.state in ('QUEUED','DELIVERED')) order by r.created_at_ms,r.id",
    ).map((r) => ({
      id: r.id,
      taskId: r.task_id,
      summary: r.summary,
      acceptance: r.acceptance,
      delivery:
        this.one(
          "select o.state from outbox o join messages m on m.id=o.message_id where m.task_id=? and m.kind='task.result' order by o.seq desc limit 1",
          r.task_id,
        )?.state ?? (r.publication_state === 'STAGED' ? 'HELD' : 'DELIVERED'),
      artifactIds: JSON.parse(r.outputs_json)
        .filter((o: any) => o.type === 'artifact' || o.kind === 'artifact')
        .map((o: any) => o.id ?? o.artifact_id),
      revision: this.rev(r.id),
    }));
    const projects = this.all('select * from projects order by created_at_ms,id').map((p) => {
      const groups = spaces.filter((s) => s.projectId === p.id && s.status !== 'ARCHIVED');
      const n = (k: 'activeRunsCount' | 'queuedTasksCount' | 'needsUserCount') =>
        groups.reduce((sum, g) => sum + g[k], 0);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        hostLabel: 'LOCAL_CORE',
        displayRoot: p.root_path,
        spacesCount: groups.length,
        activeRunsCount: n('activeRunsCount'),
        issuesCount: issues.filter((i) => i.projectId === p.id && i.state !== 'RESOLVED').length,
        revision: this.rev(p.id),
        statusSummary: {
          groups: groups.slice(0, 3).map((g) => {
            const rs = roles.filter((r) => r.spaceId === g.id);
            return {
              spaceId: g.id,
              name: g.name,
              roles: rs.slice(0, 5).map((r) => ({ roleId: r.id, name: r.name, status: r.status })),
              extraRolesCount: Math.max(0, rs.length - 5),
              activeRunsCount: g.activeRunsCount,
              queuedTasksCount: g.queuedTasksCount,
              needsUserCount: g.needsUserCount,
              pendingApprovalsCount: rs.reduce((sum, r) => sum + r.pendingApprovalsCount, 0),
            };
          }),
          extraGroupsCount: Math.max(0, groups.length - 3),
          activeRunsCount: n('activeRunsCount'),
          queuedTasksCount: n('queuedTasksCount'),
          needsUserCount: n('needsUserCount'),
          pendingApprovalsCount: roles
            .filter((r) => groups.some((g) => g.id === r.spaceId))
            .reduce((n, r) => n + r.pendingApprovalsCount, 0),
          lastActivityAtMs: this.one(
            'select coalesce(max(at_ms),0) as t from client_events where project_id=?',
            p.id,
          ).t,
        },
      };
    });
    const value = {
      cursor,
      revision,
      projects,
      spaces,
      roles,
      tasks,
      runs,
      issues,
      approvals,
      results,
      workspaces,
      modelCatalog: this.all(
        'select descriptor_json from model_catalog order by provider_profile_id,model_id',
      ).map((m) => JSON.parse(m.descriptor_json)),
    };
    // 合同有集合上限；超过时拒绝，不能静默截断成“完整快照”。
    for (const v of Object.values(value))
      if (Array.isArray(v) && v.length > 1000) throw new C1R1Error('CAPABILITY_UNAVAILABLE');
    return value as SnapshotVM;
  }
}
