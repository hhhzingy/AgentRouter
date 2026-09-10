import {
  methodMetadata,
  type Method,
  type SnapshotVM,
  type Scope,
} from '../../../packages/client-contract/c1r1p1/generated.ts';
export function scopeFor(method: Method, p: any, s: SnapshotVM): Scope {
  if (methodMetadata[method].scope === 'none') return {};
  const roleId = p.role_id ?? p.request?.to?.id;
  const role = s.roles.find((r) => r.id === (roleId ?? p.id));
  const task =
    s.tasks.find((t) => t.id === (p.task_id ?? p.id)) ??
    s.tasks.find((t) => s.results.some((r) => r.id === p.id && r.taskId === t.id));
  const run = s.runs.find((r) => r.id === p.id);
  const spaceId =
    p.space_id ??
    role?.spaceId ??
    task?.spaceId ??
    s.roles.find((r) => r.id === run?.roleId)?.spaceId;
  const projectId =
    p.project_id ??
    p.plan?.project_id ??
    s.spaces.find((g) => g.id === spaceId)?.projectId ??
    s.projects.find((x) => x.id === p.id)?.id;
  return {
    ...(projectId ? { project_id: projectId } : {}),
    ...(spaceId && methodMetadata[method].scope !== 'project' ? { space_id: spaceId } : {}),
  };
}
