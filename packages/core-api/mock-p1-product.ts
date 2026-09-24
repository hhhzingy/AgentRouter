import { randomUUID } from 'node:crypto';
import { MockProduct } from './mock-c1r1-product.ts';
import {
  C1R1Error,
  type TaskSubmitFromUserParams,
  type Scope,
} from '../client-contract/c1r1p1/index.ts';
const uid = (p: string) => p + '_' + randomUUID();
/** 明确的内存预览后端；生产 Core 不得导入此类。 */
export class MockP1Product extends MockProduct {
  override fork() {
    return new MockP1Product(structuredClone(this.data));
  }
  createProject(name: string, label: string) {
    if (!name.trim()) throw new C1R1Error('INVALID_PARAMS');
    const revision = this.next(),
      project = {
        id: uid('project'),
        name,
        status: 'ACTIVE',
        hostLabel: 'PREVIEW_MOCK',
        displayRoot: label,
        spacesCount: 0,
        activeRunsCount: 0,
        issuesCount: 0,
        revision,
      };
    this.data.snapshot.projects.push(project);
    this.data.workspaces.push({
      id: uid('workspace'),
      projectId: project.id,
      label,
      kind: 'DIRECTORY',
      displayPath: label,
      status: 'READY',
      access: 'SERIAL_WRITE',
      revision,
    });
    return project;
  }
  archiveProject(id: string, projectId: string) {
    if (id !== projectId) throw new C1R1Error('SCOPE_DENIED', 'AUTHORIZATION');
    const p = this.project(id);
    if (
      this.data.snapshot.runs.some(
        (r: any) =>
          this.data.snapshot.spaces.some(
            (s: any) =>
              s.projectId === id &&
              this.data.snapshot.roles.some((x: any) => x.id === r.roleId && x.spaceId === s.id),
          ) && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(r.state),
      )
    )
      throw new C1R1Error('RECONFIGURATION_BLOCKED');
    p.status = 'ARCHIVED';
    p.revision = this.next();
    return { entityId: id, revision: p.revision };
  }
  submit(request: TaskSubmitFromUserParams['request'], scope: Scope, now: number) {
    const r = this.role(request.to.id, scope.project_id!, scope.space_id);
    for (const to of [request.completion.to, request.on_problem])
      if (to?.type === 'role') {
        const target = this.role(to.id, scope.project_id!);
        if (target.spaceId !== r.spaceId)
          throw new C1R1Error('CROSS_SPACE_DENIED', 'AUTHORIZATION');
      }
    const revision = this.next(),
      task = {
        id: uid('task'),
        spaceId: r.spaceId,
        assigneeRoleId: r.id,
        summary: request.summary,
        state: 'QUEUED',
        acceptance: 'PENDING',
        completionTargetLabel:
          request.completion.to.type === 'user' ? '用户' : request.completion.to.id,
        createdAtMs: now,
        updatedAtMs: now,
        queuePosition:
          this.data.snapshot.tasks.filter(
            (t: any) => t.assigneeRoleId === r.id && t.state === 'QUEUED',
          ).length + 1,
        revision,
      };
    this.data.snapshot.tasks.push(task);
    this.data.userRequests ??= [];
    this.data.userRequests.push({
      taskId: task.id,
      sender: 'user',
      request: structuredClone(request),
    });
    this.append(r.id, task.id, request.body, now);
    return task;
  }
  private append(roleId: string, taskId: string, body: string, now: number) {
    this.data.conversations ??= [];
    this.data.conversations.push({
      id: uid('conversation'),
      cursor: this.data.conversations.length + 1,
      kind: 'USER_MESSAGE',
      roleId,
      taskId,
      occurredAtMs: now,
      title: '用户',
      body: body.slice(0, 4096),
      replay: false,
      sensitive: false,
    });
  }
  userInput(p: any, scope: Scope, now: number) {
    this.role(p.role_id, scope.project_id!, scope.space_id);
    const t = this.data.snapshot.tasks.find(
      (t: any) => t.id === p.task_id && t.assigneeRoleId === p.role_id,
    );
    if (!t || !['ACTIVE', 'WAITING_INPUT'].includes(t.state))
      throw new C1R1Error('PLAN_STATE_CONFLICT');
    this.append(p.role_id, p.task_id, p.body, now);
    return { entityId: t.id, revision: this.next() };
  }
  conversation(p: any) {
    if (p.role_id) this.role(p.role_id, p.scope?.project_id, p.scope?.space_id);
    let rows = (this.data.conversations ?? []).filter((c: any) => {
      const role = this.data.snapshot.roles.find((r: any) => r.id === c.roleId),
        space = this.data.snapshot.spaces.find((s: any) => s.id === role?.spaceId);
      return (
        (!p.role_id || c.roleId === p.role_id) &&
        (!p.task_id || c.taskId === p.task_id) &&
        (!p.run_id || c.runId === p.run_id) &&
        (!p.scope?.space_id || role?.spaceId === p.scope.space_id) &&
        (!p.scope?.project_id || space?.projectId === p.scope.project_id)
      );
    });
    let offset = 0;
    if (p.after_id) {
      const i = rows.findIndex((c: any) => c.id === p.after_id);
      if (i < 0) throw new C1R1Error('CURSOR_INVALID');
      offset = i + 1;
    }
    const items = rows.slice(offset, offset + (p.limit ?? 100));
    return {
      items,
      next_id: items.at(-1)?.id ?? null,
      has_more: offset + items.length < rows.length,
    };
  }
  override snapshot() {
    const s = super.snapshot();
    for (const p of s.projects) {
      const groups = s.spaces.filter((g: any) => g.projectId === p.id && g.status === 'ACTIVE');
      const needs = (id: string) =>
        s.roles.filter(
          (r: any) => r.spaceId === id && r.interventionState && r.interventionState !== 'NONE',
        ).length;
      for (const g of groups) g.needsUserCount = needs(g.id);
      p.statusSummary.needsUserCount = groups.reduce((n: number, g: any) => n + needs(g.id), 0);
      for (const g of p.statusSummary.groups) g.needsUserCount = needs(g.spaceId);
      p.statusSummary.lastActivityAtMs =
        this.data.audit
          .filter(
            (a: any) =>
              a.projectId === p.id ||
              a.sourceSpaceIds?.some((id: string) =>
                s.spaces.some((g: any) => g.id === id && g.projectId === p.id),
              ),
          )
          .at(-1)?.at ?? 0;
    }
    return s;
  }
}
