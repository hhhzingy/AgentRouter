import { randomUUID } from 'node:crypto';
import { C1R1Error, digest, type ReconfigurationInput } from '../client-contract/c1r1/index.ts';
import { MockProduct } from './mock-c1r1-product.ts';
const uid = (p: string) => p + '_' + randomUUID();
const terminal = ['DELIVERED', 'HANDED_OFF', 'FAILED', 'CANCELLED', 'PARTIAL'];
const issue = (code: string, field: string) => ({ code, field });
export function preview(product: MockProduct, input: ReconfigurationInput, projectId: string) {
  product.project(projectId);
  const d = product.data,
    s = d.snapshot;
  const plan = structuredClone(input);
  plan.assignments = plan.assignments.map((a) => ({
    ...a,
    session_strategy: a.session_strategy ?? 'NEW_SESSION_WITH_HANDOVER',
  }));
  const blockers: any[] = [];
  const sources = s.spaces.filter(
    (g: any) =>
      plan.source_space_ids.includes(g.id) && g.projectId === projectId && g.status === 'ACTIVE',
  );
  if (
    sources.length !== plan.source_space_ids.length ||
    new Set(plan.source_space_ids).size !== plan.source_space_ids.length
  )
    blockers.push(issue('SOURCE_SCOPE', 'source_space_ids'));
  if (
    (plan.mode === 'MERGE' && (sources.length < 2 || plan.targets.length !== 1)) ||
    (plan.mode === 'SPLIT' && (sources.length !== 1 || plan.targets.length < 2))
  )
    blockers.push(issue('TOPOLOGY_INVALID', 'mode'));
  if (new Set(plan.targets.map((t) => t.group_key)).size !== plan.targets.length)
    blockers.push(issue('DUPLICATE_GROUP_KEY', 'targets'));
  const roles = s.roles.filter((r: any) => plan.source_space_ids.includes(r.spaceId));
  const roleIds = roles.map((r: any) => r.id);
  const tasks = s.tasks.filter(
    (t: any) => plan.source_space_ids.includes(t.spaceId) && !terminal.includes(t.state),
  );
  const runs = s.runs.filter((r: any) => roleIds.includes(r.roleId));
  for (const run of runs) {
    if (['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(run.state))
      blockers.push(issue('ACTIVE_RUN', run.id));
    if (run.state === 'UNKNOWN') blockers.push(issue('UNKNOWN_RUN', run.id));
  }
  for (const space of sources) {
    if (d.switching.includes(space.id)) blockers.push(issue('ACCOUNT_SWITCHING', space.id));
    if (!d.drained.includes(space.id)) blockers.push(issue('DRAIN_REQUIRED', space.id));
  }
  const workspaces = [
    ...plan.assignments.map((a) => a.workspace_id),
    ...d.bindings
      .filter((b: any) => b.current && roleIds.includes(b.roleId))
      .map((b: any) => product.charterFor(b.roleId).workspaceId),
  ];
  for (const w of workspaces)
    if (d.uncertainLeases.includes(w)) blockers.push(issue('RESOURCE_LEASE_UNCERTAIN', w));
  const assigned = plan.assignments.map((a) => a.role_id);
  if (
    assigned.length !== roleIds.length ||
    new Set(assigned).size !== assigned.length ||
    roleIds.some((id: string) => !assigned.includes(id))
  )
    blockers.push(issue('ROLE_DESTINATION_REQUIRED', 'assignments'));
  for (const a of plan.assignments) {
    if (
      !roleIds.includes(a.role_id) ||
      !plan.targets.some((t) => t.group_key === a.target_group_key)
    )
      blockers.push(issue('ROLE_DESTINATION_REQUIRED', a.role_id));
    if (
      !d.workspaces.some(
        (w: any) => w.id === a.workspace_id && w.projectId === projectId && w.status === 'READY',
      )
    )
      blockers.push(issue('WORKSPACE_SCOPE', a.role_id));
    if (roleIds.includes(a.role_id)) {
      const old = product.charterFor(a.role_id);
      for (const [field, override] of [
        ['default_completion_target', 'completion_to'],
        ['problem_target', 'problem_to'],
      ] as const) {
        const choice = a[override];
        let targetId: string | undefined;
        if (choice?.type === 'role') targetId = choice.id;
        else if (!choice && old.spec[field].type === 'role_key')
          targetId = roles.find(
            (r: any) =>
              product.charterFor(r.id).spec.role_key === old.spec[field].role_key &&
              r.spaceId === old.spaceId,
          )?.id;
        if (
          (targetId &&
            plan.assignments.find((x) => x.role_id === targetId)?.target_group_key !==
              a.target_group_key) ||
          (!choice && old.spec[field].type === 'role_key' && !targetId)
        )
          blockers.push(issue('RESULT_TARGET_REVIEW_REQUIRED', a.role_id + '.' + field));
      }
    }
    if (
      a.session_strategy === 'NATIVE_RESUME_WITH_TRANSITION' &&
      !d.nativeResume.includes(a.role_id)
    )
      blockers.push(issue('SESSION_STRATEGY_UNSUPPORTED', a.role_id));
  }
  for (const target of plan.targets) {
    const keys = plan.assignments
      .filter((a) => a.target_group_key === target.group_key && roleIds.includes(a.role_id))
      .map((a) => product.charterFor(a.role_id).spec.role_key);
    if (new Set(keys).size !== keys.length)
      blockers.push(issue('DUPLICATE_ROLE_KEY', target.group_key));
  }
  for (const t of plan.targets)
    if (
      !t.rules.completion_definition.every((x) => x.trim()) ||
      !t.display_name.trim() ||
      !t.purpose.trim()
    )
      blockers.push(issue('RULES_INVALID', t.group_key));
  for (const t of tasks) {
    if (!['QUEUED', 'SUSPENDED'].includes(t.state)) blockers.push(issue('UNRESOLVED_TASK', t.id));
    const choices = plan.task_dispositions.filter((q) => q.task_id === t.id);
    if (choices.length !== 1) blockers.push(issue('TASK_DISPOSITION_REQUIRED', t.id));
    else if (choices[0].action === 'CANCEL' && !choices[0].reason?.trim())
      blockers.push(issue('CANCEL_REASON_REQUIRED', t.id));
  }
  if (plan.task_dispositions.some((q) => !tasks.some((t: any) => t.id === q.task_id)))
    blockers.push(issue('UNKNOWN_TASK_DISPOSITION', 'task_dispositions'));
  return {
    planId: uid('reconfiguration'),
    planHash: digest({ projectId, revision: product.revision, plan }),
    expectedRevision: product.revision,
    blockers,
    affectedRoleIds: roleIds,
    affectedTaskIds: tasks.map((t: any) => t.id),
    affectedRunIds: runs.map((r: any) => r.id),
    affectedWorkspaceIds: [...new Set(workspaces)] as string[],
    proposedDestinations: plan,
    requiredConfirmations: [
      'EXPLICIT_TASK_DISPOSITIONS',
      'SESSION_CONTINUITY',
      'NO_WORKTREE_MERGE',
      'OLD_CONTEXT_NOT_FORGOTTEN',
    ],
  };
}
export function storePreview(product: MockProduct, input: ReconfigurationInput, project: string) {
  const p = preview(product, input, project);
  product.data.reconfigurations.push({
    id: p.planId,
    projectId: project,
    state: 'PREVIEW',
    preview: p,
    newSpaceIds: [],
    transitionPackets: [],
    auditId: uid('audit'),
    revision: product.revision,
  });
  return p;
}
export function reconfigurationView(value: any) {
  const { projectId, ...view } = value;
  return view;
}
export function commitReconfiguration(
  product: MockProduct,
  p: any,
  projectId: string,
  actor: string,
  now: number,
) {
  const d = product.data,
    s = d.snapshot;
  const record = d.reconfigurations.find(
    (r: any) => r.id === p.plan_id && r.projectId === projectId,
  );
  if (!record) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
  if (record.state !== 'PREVIEW') throw new C1R1Error('PLAN_STATE_CONFLICT', 'CONFLICT');
  if (record.preview.planHash !== p.plan_hash)
    throw new C1R1Error('PLAN_HASH_MISMATCH', 'CONFLICT');
  if (record.preview.expectedRevision !== product.revision)
    throw new C1R1Error('REVISION_CONFLICT', 'CONFLICT');
  const current = preview(product, record.preview.proposedDestinations, projectId);
  if (current.blockers.length) throw new C1R1Error('RECONFIGURATION_BLOCKED', 'CONFLICT');
  const plan = current.proposedDestinations,
    revision = product.next(),
    mapping: Record<string, string> = {};
  for (const target of plan.targets) {
    const id = uid('space');
    mapping[target.group_key] = id;
    s.spaces.push({
      id,
      projectId,
      name: target.display_name,
      status: 'ACTIVE',
      rolesCount: 0,
      queuedTasksCount: 0,
      revision,
      purpose: target.purpose,
      policyRevision: 1,
      topologyState: 'ACTIVE',
      activeRunsCount: 0,
      needsUserCount: 0,
      groupKey: target.group_key,
      rules: structuredClone(target.rules),
    });
  }
  for (const source of s.spaces.filter((g: any) => plan.source_space_ids.includes(g.id))) {
    source.status = 'ARCHIVED';
    source.topologyState = 'ARCHIVED';
    source.revision = revision;
  }
  const oldCharters: Record<string, any> = {};
  const oldSpaces: Record<string, string> = {};
  for (const a of plan.assignments) {
    const role = s.roles.find((r: any) => r.id === a.role_id);
    oldSpaces[role.id] = role.spaceId;
    oldCharters[role.id] = structuredClone(product.charterFor(role.id));
    for (const member of d.memberships.filter(
      (m: any) => m.roleId === role.id && m.leftAt === null,
    ))
      member.leftAt = now;
    role.spaceId = mapping[a.target_group_key];
    role.revision = revision;
    role.status = 'PAUSED';
    d.memberships.push({ roleId: role.id, spaceId: role.spaceId, joinedAt: now, leftAt: null });
    const binding = d.bindings.find((b: any) => b.roleId === role.id && b.current);
    binding.current = false;
    d.bindings.push({
      ...structuredClone(binding),
      id: uid('binding'),
      epoch: binding.epoch + 1,
      current: true,
      revision,
      workspaceLabel: d.workspaces.find((w: any) => w.id === a.workspace_id).label,
    });
    role.workspaceLabel = d.workspaces.find((w: any) => w.id === a.workspace_id).label;
  }
  for (const choice of plan.task_dispositions) {
    const t = s.tasks.find((t: any) => t.id === choice.task_id);
    d.taskHistory.push(structuredClone(t));
    if (choice.action === 'MOVE_WITH_ASSIGNEE') {
      const r = s.roles.find((r: any) => r.id === t.assigneeRoleId);
      s.tasks.push({
        ...structuredClone(t),
        id: uid('task'),
        sourceTaskId: t.id,
        spaceId: r.spaceId,
        state: 'QUEUED',
        revision,
        createdAtMs: now,
        updatedAtMs: now,
        policyRevision: 1,
        charterRevision: product.charterFor(r.id).revision + 1,
      });
    }
    t.state = choice.action === 'CANCEL' ? 'CANCELLED' : 'SUSPENDED';
    t.blockedReason =
      choice.action === 'KEEP_IN_ARCHIVED_GROUP' ? 'ARCHIVED_HISTORY_ONLY' : choice.action;
    t.revision = revision;
    t.updatedAtMs = now;
  }
  // 全体成员先改组，再生成各自仅包含新组通讯录的章程和交接包。
  for (const a of plan.assignments) {
    const role = s.roles.find((r: any) => r.id === a.role_id),
      old = oldCharters[role.id],
      spec = structuredClone(old.spec);
    spec.group_key = a.target_group_key;
    spec.workspace_ref = a.workspace_id;
    for (const [field, override] of [
      ['default_completion_target', 'completion_to'],
      ['problem_target', 'problem_to'],
    ] as const) {
      const choice = a[override];
      if (choice?.type === 'user') spec[field] = { type: 'user' };
      if (choice?.type === 'role')
        spec[field] = { type: 'role_key', role_key: oldCharters[choice.id].spec.role_key };
    }
    if (a.session_strategy === 'KEEP_ARCHIVED_ONLY') {
      d.archivedOnly ??= [];
      d.archivedOnly.push(role.id);
    }
    const charter = product.publishCharter(role, spec, old.effectivePermissions, now);
    record.transitionPackets.push({
      roleId: role.id,
      oldSpaceId: oldSpaces[role.id],
      newSpaceId: role.spaceId,
      effectiveAtMs: now,
      policyRevision: 1,
      charterId: charter.id,
      directory: structuredClone(charter.directory),
      workspaceId: a.workspace_id,
      effectivePermissions: structuredClone(charter.effectivePermissions),
      taskDispositions: plan.task_dispositions.filter(
        (q) => s.tasks.find((t: any) => t.id === q.task_id)?.assigneeRoleId === role.id,
      ),
      strategy: a.session_strategy,
      confirmedFacts: [],
      nextStep: '下一项实际任务前交付新章程；不自动唤醒',
      untrustedOldAssumptions: ['拆组不会使旧会话遗忘；旧组任务和通讯录不自动继承'],
    });
  }
  record.state = 'COMMITTED';
  record.newSpaceIds = Object.values(mapping);
  record.revision = revision;
  d.audit.push({
    id: record.auditId,
    actor,
    at: now,
    kind: 'space.reconfigured',
    sourceSpaceIds: plan.source_space_ids,
    newSpaceIds: record.newSpaceIds,
  });
  return reconfigurationView(record);
}
