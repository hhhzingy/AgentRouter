import type Database from 'better-sqlite3';
import { RouteError, validatePayload, id, digest, type Data } from '../protocol/index.ts';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { freezeFile, resolveArtifactBlobPath } from '../artifacts/index.ts';
import { assertTransition } from '../domain/index.ts';
export interface Identity {
  roleId: string;
  bindingId: string;
  epoch: number;
  activationId?: string;
  activationEpoch?: number;
  spaceId: string;
  projectId: string;
  runId?: string;
  taskId?: string;
  management?: boolean;
  grantedTools?: readonly string[];
}
export interface Dispatch {
  id: string;
  taskId: string;
  kind: string;
  principal: Identity;
  request: Data;
}
export class Core {
  fault?: () => void;
  constructor(
    readonly db: Database.Database,
    readonly clock = () => Date.now(),
    readonly options: {
      allowMock?: boolean;
      fixtureAuthorization?: (bindingId: string) => boolean;
      nativeAuthorization?: (bindingId: string) => boolean;
      beforeDispatch?: (roleId: string) => string | null;
      kindForTask?: (taskId: string) => string;
    } = {},
  ) {}
  private one(sql: string, ...args: any[]): Data | undefined {
    return this.db.prepare(sql).get(...args) as Data | undefined;
  }
  private all(sql: string, ...args: any[]): Data[] {
    return this.db.prepare(sql).all(...args) as Data[];
  }
  private exec(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  private tx<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }
  private event(
    type: string,
    payload: Data,
    roleId: string | null = null,
    taskId: string | null = null,
    runId: string | null = null,
  ) {
    this.exec(
      'insert into events(event_id,event_type,role_id,task_id,run_id,payload_json,created_at_ms) values(?,?,?,?,?,?,?)',
      id('event'),
      type,
      roleId,
      taskId,
      runId,
      JSON.stringify(payload),
      this.clock(),
    );
  }
  private identity(p: Identity, allowStaged = false) {
    const b = this.one(
      'select b.*,r.space_id,s.project_id from bindings b join roles r on r.id=b.role_id join spaces s on s.id=r.space_id where b.id=?',
      p.bindingId,
    );
    if (
      !b ||
      !b.is_current ||
      b.epoch !== p.epoch ||
      b.role_id !== p.roleId ||
      b.space_id !== p.spaceId ||
      b.project_id !== p.projectId
    )
      throw new RouteError('STALE_IDENTITY', 'AUTHORIZATION');
    if (p.activationId !== undefined) {
      const activation = this.one(
        'select id,role_id,binding_id,binding_epoch,activation_epoch,state from role_session_activations where id=?',
        p.activationId,
      );
      if (
        !activation ||
        activation.state !== 'ACTIVE' ||
        activation.role_id !== p.roleId ||
        activation.binding_id !== p.bindingId ||
        activation.binding_epoch !== p.epoch ||
        (p.activationEpoch !== undefined && activation.activation_epoch !== p.activationEpoch)
      )
        throw new RouteError('STALE_IDENTITY', 'AUTHORIZATION');
    }
    if (p.management) return b; // Only a trusted local application service constructs this; bridge never accepts Identity from payload.
    const r = this.one('select * from runs where id=?', p.runId ?? '');
    if (
      !r ||
      r.binding_id !== p.bindingId ||
      r.binding_epoch !== p.epoch ||
      r.role_id !== p.roleId ||
      r.task_id !== (p.taskId ?? null) ||
      ![
        'RUNNING',
        ...(allowStaged ? ['SETTLING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] : []),
      ].includes(r.state)
    )
      throw new RouteError('INACTIVE_RUN', 'AUTHORIZATION');
    return b;
  }
  management(roleId: string): Identity {
    const b = this.one(
      'select b.*,r.space_id,s.project_id from bindings b join roles r on r.id=b.role_id join spaces s on s.id=r.space_id where role_id=? and is_current=1',
      roleId,
    );
    if (!b) throw new RouteError('INVALID_ROLE');
    return {
      roleId,
      bindingId: b.id,
      epoch: b.epoch,
      spaceId: b.space_id,
      projectId: b.project_id,
      management: true,
    };
  }
  private target(p: Identity, t: Data) {
    if (t.type === 'user') return;
    const r = this.one('select * from roles where id=? and space_id=?', t.id, p.spaceId);
    if (!r) throw new RouteError('INVALID_TARGET', 'AUTHORIZATION', 'to.id');
  }
  private refs(p: Identity, refs: Data[], outputs = false) {
    for (const ref of refs) {
      if (ref.kind === 'artifact') {
        const a = this.one(
          "select * from artifacts where id=? and project_id=? and state='AVAILABLE'",
          ref.artifact_id,
          p.projectId,
        );
        if (!a) throw new RouteError('ARTIFACT_UNAVAILABLE');
        this.readObject(a);
      } else if (outputs) throw new RouteError('OUTPUT_MUST_BE_FROZEN');
      else if (ref.kind !== 'external')
        throw new RouteError('REFERENCE_RESOLVER_UNAVAILABLE', 'UNAVAILABLE');
    }
  }
  private operation(p: Identity, op: string, payload: Data, fn: (row: number) => any) {
    if (typeof op !== 'string' || !op.length || op.length > 200)
      throw new RouteError('INVALID_OPERATION_ID');
    this.identity(p, true);
    const scope = `${p.bindingId}:${p.epoch}:${p.runId ?? 'management'}`;
    const hash = digest(payload);
    try {
      return this.tx(() => {
        const existing = this.one(
          'select * from operations where scope_key=? and operation_id=?',
          scope,
          op,
        );
        if (existing) {
          if (existing.request_hash !== hash)
            throw new RouteError('OPERATION_CONFLICT', 'CONFLICT');
          return JSON.parse(existing.response_json);
        }
        this.identity(p);
        const row = Number(
          this.exec(
            'insert into operations(scope_key,operation_id,request_hash,response_json,committed_at_ms) values(?,?,?,?,?)',
            scope,
            op,
            hash,
            '{}',
            this.clock(),
          ).lastInsertRowid,
        );
        const response = fn(row) ?? {};
        this.exec(
          'update operations set response_json=? where id=?',
          JSON.stringify(response),
          row,
        );
        this.fault?.();
        return response;
      });
    } catch (e) {
      if (e instanceof RouteError) throw e;
      throw new RouteError('STORE_UNAVAILABLE', 'UNAVAILABLE');
    }
  }
  private newRequest(
    p: Identity,
    request: Data,
    op: number,
    heldRun: string | null = null,
    inheritChain?: string,
  ) {
    this.target(p, request.to);
    this.target(p, request.completion.to);
    this.target(p, request.on_problem ?? { type: 'user' });
    this.refs(p, request.inputs);
    const parent = p.taskId ? this.one('select * from tasks where id=?', p.taskId) : undefined;
    const chain = inheritChain ?? parent?.chain_id ?? id('chain');
    if (!inheritChain && !parent)
      this.exec(
        'insert into chains values(?,?,?,?,?,?,?)',
        chain,
        p.spaceId,
        id('operation'),
        this.clock(),
        100,
        28800000,
        'ACTIVE',
      );
    const policy =
      parent?.policy_id ??
      this.one(
        'select id from policies where project_id=? order by revision desc limit 1',
        p.projectId,
      )?.id;
    if (!policy) throw new RouteError('POLICY_REQUIRED');
    const task = id('task');
    this.exec(
      'insert into tasks(id,space_id,requester_role_id,assignee_role_id,parent_task_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,created_at_ms,updated_at_ms) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',

      task,
      p.spaceId,
      p.roleId,
      request.to.id,
      p.taskId ?? null,
      chain,
      policy,
      request.summary,
      request.body,
      JSON.stringify(request),
      JSON.stringify(request.completion),
      JSON.stringify(request.on_problem ?? { type: 'user' }),
      'QUEUED',
      this.clock(),
      this.clock(),
    );
    this.exec(
      'update tasks set role_session_id=? where id=? and role_session_id is null',
      this.activeSessionId(request.to.id),
      task,
    );
    this.message(p, request, op, task, heldRun);
    return task;
  }
  private message(
    p: Identity,
    payload: Data,
    op: number,
    task: string | null,
    heldRun: string | null = null,
  ) {
    const message = id('message');
    this.exec(
      'insert into messages(id,space_id,task_id,kind,from_kind,from_role_id,to_kind,to_role_id,payload_json,operation_row_id,created_at_ms) values(?,?,?,?,?,?,?,?,?,?,?)',
      message,
      p.spaceId,
      task,
      payload.kind,
      'role',
      p.roleId,
      payload.to.type,
      payload.to.id ?? null,
      JSON.stringify(payload),
      op,
      this.clock(),
    );
    if (payload.kind !== 'notice')
      this.exec(
        'insert into outbox(id,message_id,after_run_id,state,updated_at_ms) values(?,?,?,?,?)',
        id('outbox'),
        message,
        heldRun,
        heldRun ? 'HELD' : 'QUEUED',
        this.clock(),
      );
    this.event('MessageStored', { messageId: message, kind: payload.kind }, p.roleId, task);
    return message;
  }
  send(p: Identity, op: string, input: unknown) {
    validatePayload(input);
    if (!['task.request', 'notice'].includes(input.kind))
      throw new RouteError('WRONG_TOOL_PAYLOAD');
    return this.operation(p, op, { tool: 'send', input }, (row) => {
      if (input.kind === 'task.request') this.newRequest(p, input, row);
      else {
        this.target(p, input.to);
        this.refs(p, input.inputs);
        this.message(p, input, row, null);
      }
    });
  }
  /** 角色当前活动会话；迁移005保证每个角色恰有一个。 */
  activeSessionId(roleId: string): string | undefined {
    return (
      this.one("select id from role_sessions where role_id=? and state='ACTIVE'", roleId) as
        { id: string } | undefined
    )?.id;
  }
  submitFromUser(
    scope: { projectId: string; spaceId: string },
    input: unknown,
    operationRow: number,
  ) {
    validatePayload(input);
    if (input.kind !== 'task.request') throw new RouteError('WRONG_TOOL_PAYLOAD');
    for (const target of [input.to, input.completion.to, input.on_problem ?? { type: 'user' }])
      if (
        target.type === 'role' &&
        !this.one('select id from roles where id=? and space_id=?', target.id, scope.spaceId)
      )
        throw new RouteError('CROSS_SPACE_DENIED', 'AUTHORIZATION');
    if (
      !this.one('select id from spaces where id=? and project_id=?', scope.spaceId, scope.projectId)
    )
      throw new RouteError('SCOPE_DENIED', 'AUTHORIZATION');
    for (const ref of input.inputs) {
      // 用户路由引用按 C1 合同以 kind/artifact_id 表达(与角色工具 refs() 一致);
      // 容忍历史 type/id 形状,未知 kind 仍拒绝。
      const kind = (ref.kind ?? ref.type) as string | undefined;
      if (
        kind === 'artifact' &&
        !this.one(
          "select id from artifacts where id=? and project_id=? and state='AVAILABLE'",
          ref.artifact_id ?? ref.id,
          scope.projectId,
        )
      )
        throw new RouteError('ARTIFACT_SCOPE', 'AUTHORIZATION');
      if (!['artifact', 'external'].includes(String(kind)))
        throw new RouteError('REFERENCE_UNSUPPORTED');
    }
    const chain = id('chain'),
      task = id('task'),
      message = id('message'),
      now = this.clock();
    const policy = this.one(
      'select id from policies where project_id=? order by revision desc limit 1',
      scope.projectId,
    );
    if (!policy) throw new RouteError('POLICY_REQUIRED');
    this.exec(
      'insert into chains values(?,?,?,?,?,?,?)',
      chain,
      scope.spaceId,
      id('operation'),
      now,
      100,
      28800000,
      'ACTIVE',
    );
    this.exec(
      'insert into tasks(id,space_id,assignee_role_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,acceptance,created_at_ms,updated_at_ms) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      task,
      scope.spaceId,
      input.to.id,
      chain,
      policy.id,
      input.summary,
      input.body,
      JSON.stringify(input),
      JSON.stringify(input.completion),
      JSON.stringify(input.on_problem ?? { type: 'user' }),
      'QUEUED',
      'PENDING',
      now,
      now,
    );
    this.exec(
      'update tasks set role_session_id=? where id=? and role_session_id is null',
      this.activeSessionId(input.to.id),
      task,
    );
    this.exec(
      'insert into messages(id,space_id,task_id,kind,from_kind,to_kind,to_role_id,payload_json,operation_row_id,created_at_ms) values(?,?,?,?,?,?,?,?,?,?)',
      message,
      scope.spaceId,
      task,
      'task.request',
      'user',
      'role',
      input.to.id,
      JSON.stringify(input),
      operationRow,
      now,
    );
    this.exec(
      'insert into outbox(id,message_id,state,updated_at_ms) values(?,?,?,?)',
      id('outbox'),
      message,
      'QUEUED',
      now,
    );
    this.event('UserTaskStored', { messageId: message }, null, task);
    return task;
  }
  private transition(task: string, to: string) {
    const t = this.one('select state from tasks where id=?', task)!;
    assertTransition(t.state, to);
    this.exec('update tasks set state=?,updated_at_ms=? where id=?', to, this.clock(), task);
  }
  finish(p: Identity, op: string, input: unknown) {
    validatePayload(input);
    if (!input.outcome || p.management || !p.taskId) throw new RouteError('FINISH_REQUIRES_TASK');
    return this.operation(p, op, { tool: 'finish', input }, (row) => {
      const task = this.one('select * from tasks where id=?', p.taskId)!;
      const completion = JSON.parse(task.completion_json);
      const target =
        input.outcome === 'succeeded' ? completion.to : JSON.parse(task.problem_target_json);
      if (input.outcome === 'succeeded' && completion.mode === 'handoff') {
        if (
          !input.next_request ||
          JSON.stringify(input.next_request.to) !== JSON.stringify(completion.to)
        )
          throw new RouteError('HANDOFF_TARGET_MISMATCH');
      } else if (input.next_request) throw new RouteError('UNEXPECTED_NEXT_REQUEST');
      this.refs(p, input.outputs, true);
      this.target(p, target);
      const result = id('result');
      this.exec(
        'insert into results values(?,?,?,?,?,?,?,?,?)',
        result,
        p.taskId,
        p.runId,
        input.outcome,
        input.summary,
        input.body,
        JSON.stringify(input.outputs),
        'STAGED',
        this.clock(),
      );
      if (input.next_request) this.newRequest(p, input.next_request, row, p.runId!, task.chain_id);
      else
        this.message(
          p,
          { kind: 'task.result', to: target, result_id: result, ...input },
          row,
          p.taskId!,
          p.runId!,
        );
      this.transition(p.taskId!, 'RESULT_STAGED');
      this.exec("update runs set state='SETTLING' where id=?", p.runId);
      this.event('ResultStaged', { resultId: result }, p.roleId, p.taskId!, p.runId!);
    });
  }
  wait(p: Identity, op: string, input: unknown) {
    validatePayload(input);
    if (!input.waiting_for || !p.taskId || p.management) throw new RouteError('WAIT_REQUIRES_TASK');
    return this.operation(p, op, { tool: 'wait', input }, () => {
      let deps: string[] = [];
      if (input.waiting_for === 'child_results') {
        const children = this.all('select * from tasks where parent_task_id=?', p.taskId)
          .filter((t) => {
            const c = JSON.parse(t.completion_json);
            return c.mode === 'result' && c.to.type === 'role' && c.to.id === p.roleId;
          })
          .map((t) => t.id);
        deps = input.child_task_ids ?? children;
        if (!deps.length || deps.some((d) => !children.includes(d)))
          throw new RouteError('INVALID_WAIT_DEPENDENCY');
      }
      this.exec(
        'insert into wait_records values(?,?,?,?,?,?) on conflict(task_id) do update set waiting_for=excluded.waiting_for,reason=excluded.reason,dependency_json=excluded.dependency_json,ready=excluded.ready,updated_at_ms=excluded.updated_at_ms',
        p.taskId,
        input.waiting_for,
        input.reason,
        JSON.stringify(deps),
        0,
        this.clock(),
      );
      this.refreshWait(p.taskId!);
      this.transition(p.taskId!, 'WAITING_INPUT');
    });
  }
  private refreshWait(task: string) {
    const w = this.one('select * from wait_records where task_id=?', task);
    if (!w || w.waiting_for !== 'child_results') return;
    const deps = JSON.parse(w.dependency_json) as string[];
    const ready =
      deps.length > 0 &&
      deps.every((d) =>
        this.one(
          "select id from results where task_id=? and publication_state='PUBLISHED' and outcome='succeeded'",
          d,
        ),
      );
    this.exec(
      'update wait_records set ready=?,updated_at_ms=? where task_id=?',
      Number(Boolean(ready)),
      this.clock(),
      task,
    );
  }
  private blocked(role: string, reason: string) {
    this.exec('update role_slots set blocked_reason=? where role_id=?', reason, role);
    return null;
  }
  /**
   * A WorkSession id is durable user history. Execution authorization is a
   * separate, short-lived activation record. A binding change or WS switch
   * therefore always receives a fresh activation epoch.
   */
  private ensureActiveActivation(roleId: string, binding: Data, roleSessionId: string) {
    const session = this.one(
      "select id,role_id,harness,driver_id,workspace_affinity_json from role_sessions where id=? and role_id=? and state='ACTIVE'",
      roleSessionId,
      roleId,
    );
    if (!session) return null;
    if (session.harness && session.harness !== binding.harness) return null;
    if (session.driver_id && session.driver_id !== binding.harness) return null;
    if (session.workspace_affinity_json) {
      let affinity: unknown;
      try {
        affinity = JSON.parse(session.workspace_affinity_json);
      } catch {
        return null;
      }
      if (!affinity || typeof affinity !== 'object' || Array.isArray(affinity)) return null;
      const workspaceId = (affinity as Record<string, unknown>).workspace_id;
      if (workspaceId !== undefined && workspaceId !== null && workspaceId !== binding.workspace_id)
        return null;
    }
    if (!session.harness) {
      this.exec(
        'update role_sessions set harness=?,driver_id=?,workspace_affinity_json=? where id=? and harness is null',
        binding.harness,
        binding.harness,
        JSON.stringify({ workspace_id: binding.workspace_id }),
        roleSessionId,
      );
    }
    const active = this.one(
      "select id,role_session_id,binding_id,binding_epoch,activation_epoch from role_session_activations where role_id=? and state='ACTIVE'",
      roleId,
    );
    if (
      active &&
      active.role_session_id === roleSessionId &&
      active.binding_id === binding.id &&
      active.binding_epoch === binding.epoch
    )
      return active;
    const now = this.clock();
    if (active)
      this.exec(
        "update role_session_activations set state='ENDED',ended_at_ms=? where id=? and state='ACTIVE'",
        now,
        active.id,
      );
    const activationEpoch =
      Number(
        this.one(
          'select coalesce(max(activation_epoch),0) as n from role_session_activations where role_id=?',
          roleId,
        )?.n ?? 0,
      ) + 1;
    const id = 'rsa_' + globalThis.crypto.randomUUID();
    this.exec(
      "insert into role_session_activations(id,role_id,role_session_id,binding_id,binding_epoch,activation_epoch,state,operation_id,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,'ACTIVE',?,?,?)",
      id,
      roleId,
      roleSessionId,
      binding.id,
      binding.epoch,
      activationEpoch,
      'core-dispatch',
      now,
      now,
    );
    return this.one(
      'select id,role_session_id,binding_id,binding_epoch,activation_epoch from role_session_activations where id=?',
      id,
    );
  }
  dispatch(roleId: string): Dispatch | null {
    return this.tx(() => {
      const p = this.management(roleId),
        b = this.identity(p);
      const caps = JSON.parse(b.capability_json);
      if (
        !(this.options.allowMock && caps.fixture === 'mock') &&
        !this.options.fixtureAuthorization?.(b.id) &&
        !(this.options.nativeAuthorization
          ? this.options.nativeAuthorization(b.id)
          : caps.status === 'LIVE_TESTED')
      )
        return this.blocked(roleId, 'harness_unverified');
      const blocked = this.options.beforeDispatch?.(roleId);
      if (blocked) return this.blocked(roleId, blocked);
      const role = this.one(
        'select r.status,s.status as space_status,p.status as project_status from roles r join spaces s on s.id=r.space_id join projects p on p.id=s.project_id where r.id=?',
        roleId,
      )!;
      const slot = this.one('select * from role_slots where role_id=?', roleId);
      if (!slot) throw new RouteError('ROLE_SLOT_MISSING');
      if (
        role.status !== 'ACTIVE' ||
        role.space_status !== 'ACTIVE' ||
        role.project_status !== 'ACTIVE'
      )
        return this.blocked(roleId, 'paused');
      if (slot.active_run_id) return this.blocked(roleId, 'native_run_active');
      if (slot.blocked_reason === 'reconciling') return null;
      let task: Data | undefined,
        kind = 'TASK';
      if (slot.active_task_id) {
        task = this.one('select * from tasks where id=?', slot.active_task_id);
        const w = this.one('select * from wait_records where task_id=?', slot.active_task_id);
        if (task?.state !== 'WAITING_INPUT' || !w?.ready)
          return this.blocked(roleId, 'current_task_unresolved');
        kind = 'CONTINUATION';
      } else
        task = this.one(
          "select t.* from tasks t join messages m on m.task_id=t.id and m.kind='task.request' join outbox o on o.message_id=m.id where t.assignee_role_id=? and t.state='QUEUED' and o.state='QUEUED' order by t.seq limit 1",
          roleId,
        );
      if (!task) return null;
      if (kind === 'TASK') kind = this.options.kindForTask?.(task.id) ?? kind;
      const now = this.clock();
      const latest = this.one('select max(started_at_ms) as t from auto_starts')?.t;
      if (latest && latest > now) return this.blocked(roleId, 'clock_rollback');
      const live = this.one(
        'select count(*) as n from role_slots where active_run_id is not null',
      )!.n;
      if (live >= 3) return this.blocked(roleId, 'global_concurrency');
      const chain = this.one('select * from chains where id=?', task.chain_id)!;
      if (
        chain.status !== 'ACTIVE' ||
        now - chain.created_at_ms >= chain.max_wall_ms ||
        this.one('select count(*) as n from auto_starts where chain_id=?', chain.id)!.n >=
          chain.max_auto_starts
      )
        return this.blocked(roleId, 'chain_budget');
      if (
        this.one(
          'select count(*) as n from auto_starts where role_id=? and started_at_ms>?',
          roleId,
          now - 60000,
        )!.n >= 5 ||
        this.one(
          'select count(*) as n from auto_starts where space_id=? and started_at_ms>?',
          p.spaceId,
          now - 300000,
        )!.n >= 30
      )
        return this.blocked(roleId, 'rate_limited');
      const ws = this.one('select * from workspaces where id=?', b.workspace_id)!;
      if (ws.status !== 'READY') return this.blocked(roleId, 'workspace_unavailable');
      const resources = [`workspace:${ws.canonical_path}`];
      if (b.auth_unit_id) {
        const au = this.one('select * from auth_units where id=?', b.auth_unit_id);
        if (au?.max_active_runs !== 1) return this.blocked(roleId, 'auth_concurrency_unsupported');
        if (au?.state !== 'READY') return this.blocked(roleId, 'auth_unavailable');
        resources.push(`auth:${b.auth_unit_id}`);
      }
      if (resources.some((r) => this.one('select * from resource_leases where resource_key=?', r)))
        return this.blocked(roleId, 'resource_locked');
      const roleSessionId = (this.one('select role_session_id from tasks where id=?', task.id)
        ?.role_session_id ?? null) as string | null;
      if (!roleSessionId) return this.blocked(roleId, 'work_session_missing');
      const activation = this.ensureActiveActivation(roleId, b, roleSessionId);
      if (!activation) return this.blocked(roleId, 'work_session_binding_mismatch');
      const run = id('run');
      this.exec(
        'insert into runs(id,role_id,binding_id,task_id,chain_id,kind,binding_epoch,native_run_ref,request_snapshot_json,state,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms,role_session_id,activation_id) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        run,
        roleId,
        b.id,
        task.id,
        task.chain_id,
        kind,
        b.epoch,
        null,
        task.request_json,
        'STARTING',
        null,
        null,
        null,
        now,
        roleSessionId,
        activation.id,
      );
      for (const resource of resources)
        this.exec(
          'insert into resource_leases values(?,?,?,?,?)',
          resource,
          run,
          b.epoch,
          'HELD',
          now,
        );
      this.transition(task.id, 'ACTIVE');
      this.exec(
        'update role_slots set active_task_id=?,active_run_id=?,blocked_reason=null where role_id=?',
        task.id,
        run,
        roleId,
      );
      this.exec(
        'insert into auto_starts(run_id,role_id,space_id,chain_id,started_at_ms) values(?,?,?,?,?)',
        run,
        roleId,
        p.spaceId,
        chain.id,
        now,
      );
      if (kind === 'TASK' || kind === 'RESULT_HANDLING')
        this.exec(
          "update outbox set state='DISPATCHING',claimed_run_id=?,attempt_count=attempt_count+1,updated_at_ms=? where message_id in (select id from messages where task_id=? and kind='task.request')",
          run,
          now,
          task.id,
        );
      else {
        this.exec(
          'update continuations set consumed_run_id=? where parent_task_id=? and consumed_run_id is null',
          run,
          task.id,
        );
        this.exec('update wait_records set ready=0 where task_id=?', task.id);
      }
      this.event('DispatchIntent', { kind }, roleId, task.id, run);
      return {
        id: run,
        taskId: task.id,
        kind,
        principal: {
          ...p,
          management: false,
          runId: run,
          taskId: task.id,
          activationId: activation.id,
          activationEpoch: activation.activation_epoch,
        },
        request: JSON.parse(task.request_json),
      };
    });
  }
  accepted(run: string) {
    this.exec(
      "update runs set state='RUNNING',accepted_at_ms=? where id=? and state='STARTING'",
      this.clock(),
      run,
    );
    this.exec(
      "update outbox set state='DELIVERED',updated_at_ms=? where claimed_run_id=? and state='DISPATCHING'",
      this.clock(),
      run,
    );
  }
  settle(
    runId: string,
    epoch: number,
    outcome: string,
    evidence: { native: boolean; resourcesStopped: boolean; replay?: boolean },
  ) {
    return this.tx(() => {
      const run = this.one('select * from runs where id=?', runId);
      if (!run) throw new RouteError('UNKNOWN_RUN');
      const b = this.one('select * from bindings where id=?', run.binding_id)!;
      if (epoch !== run.binding_epoch || !b.is_current || b.epoch !== epoch)
        throw new RouteError('STALE_IDENTITY', 'AUTHORIZATION');
      if (run.activation_id) {
        const activation = this.one(
          'select binding_id,binding_epoch from role_session_activations where id=? and role_id=?',
          run.activation_id,
          run.role_id,
        );
        if (
          !activation ||
          activation.binding_id !== run.binding_id ||
          activation.binding_epoch !== run.binding_epoch
        )
          throw new RouteError('STALE_IDENTITY', 'AUTHORIZATION');
      }
      if (evidence.replay) return;
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.state)) return;
      if (run.state === 'UNKNOWN') throw new RouteError('RECONCILIATION_REQUIRED', 'AMBIGUOUS');
      if (
        !evidence.native ||
        !evidence.resourcesStopped ||
        this.one("select id from approvals where run_id=? and state='PENDING'", runId)
      )
        throw new RouteError('SETTLED_BARRIER_UNPROVEN', 'CONFLICT');
      if (!['succeeded', 'failed', 'cancelled'].includes(outcome))
        throw new RouteError('UNKNOWN_OUTCOME');
      const staged = this.one('select * from results where run_id=?', runId);
      this.exec(
        'update runs set state=?,settled_at_ms=? where id=?',
        outcome.toUpperCase(),
        this.clock(),
        runId,
      );
      this.accepted(runId);
      if (staged && outcome === 'succeeded') {
        this.exec("update results set publication_state='PUBLISHED' where id=?", staged.id);
        this.exec(
          "update outbox set state='QUEUED',updated_at_ms=? where after_run_id=? and state='HELD'",
          this.clock(),
          runId,
        );
        const t = this.one('select * from tasks where id=?', run.task_id)!;
        const completion = JSON.parse(t.completion_json);
        const next =
          staged.outcome === 'succeeded'
            ? completion.mode === 'handoff'
              ? 'HANDED_OFF'
              : 'DELIVERED'
            : staged.outcome.toUpperCase();
        this.transition(t.id, next);
        if (
          staged.outcome === 'succeeded' &&
          t.parent_task_id &&
          completion.mode === 'result' &&
          completion.to.type === 'role'
        ) {
          const parent = this.one('select * from tasks where id=?', t.parent_task_id);
          if (parent && parent.assignee_role_id === completion.to.id) {
            this.exec(
              'insert or ignore into continuations(id,parent_task_id,result_id,created_at_ms) values(?,?,?,?)',
              id('continuation'),
              parent.id,
              staged.id,
              this.clock(),
            );
            this.refreshWait(parent.id);
          }
        }
        this.exec('update role_slots set active_task_id=null where role_id=?', run.role_id);
      } else {
        const task = this.one('select * from tasks where id=?', run.task_id);
        if (task && (task.state !== 'WAITING_INPUT' || outcome !== 'succeeded')) {
          this.transition(task.id, 'NEEDS_ATTENTION');
          if (staged)
            this.exec("update results set publication_state='QUARANTINED' where id=?", staged.id);
          this.issue(run, 'RUN_REQUIRES_ATTENTION');
        }
      }
      this.exec('delete from resource_leases where run_id=?', runId);
      this.exec('update role_slots set active_run_id=null where role_id=?', run.role_id);
      this.event('RunSettled', { outcome }, run.role_id, run.task_id, runId);
    });
  }
  private issue(run: Data, code: string) {
    this.exec(
      'insert into issues(id,role_id,task_id,run_id,code,detail_json,state,created_at_ms) values(?,?,?,?,?,?,?,?)',
      id('issue'),
      run.role_id,
      run.task_id,
      run.id,
      code,
      '{}',
      'OPEN',
      this.clock(),
    );
  }
  recover() {
    return this.tx(() => {
      for (const run of this.all(
        "select * from runs where state in ('CREATED','STARTING','RUNNING','WAITING_APPROVAL','SETTLING')",
      )) {
        this.exec("update runs set state='UNKNOWN' where id=?", run.id);
        this.exec(
          "update outbox set state='UNKNOWN' where claimed_run_id=? and state='DISPATCHING'",
          run.id,
        );
        this.exec("update resource_leases set state='QUARANTINED' where run_id=?", run.id);
        this.exec(
          "update role_slots set blocked_reason='reconciling' where role_id=?",
          run.role_id,
        );
        const t = this.one('select * from tasks where id=?', run.task_id);
        if (t && t.state !== 'NEEDS_ATTENTION') this.transition(t.id, 'NEEDS_ATTENTION');
        this.issue(run, 'EXECUTION_UNKNOWN');
      }
    });
  }
  private objectRoot() {
    return resolve(dirname(this.db.name), 'artifacts');
  }
  private readObject(a: Data) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(resolveArtifactBlobPath(this.objectRoot(), String(a.storage_key)));
    } catch (error) {
      if ((error as { code?: string }).code === 'INVALID_STORAGE_KEY' || error instanceof RouteError)
        throw error instanceof RouteError ? error : new RouteError('INVALID_STORAGE_KEY');
      throw new RouteError('ARTIFACT_MISSING', 'UNAVAILABLE');
    }
    if (
      bytes.length !== a.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== a.sha256
    )
      throw new RouteError('ARTIFACT_CORRUPTED', 'AMBIGUOUS');
    return bytes;
  }
  /** 被动收件：分页读取不改变任务、投递或业务回执。 */
  notices(p: Identity, after = 0, limit = 50) {
    this.identity(p, true);
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new RouteError('INVALID_NOTICE_PAGE');
    const rows = this.all(
      "select seq,id,from_role_id,payload_json,created_at_ms from messages where kind='notice' and space_id=? and to_kind='role' and to_role_id=? and seq>? order by seq limit ?",
      p.spaceId,
      p.roleId,
      after,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map(({ payload_json, ...row }) => ({ ...row, notice: JSON.parse(payload_json) })),
      next_cursor: page.at(-1)?.seq ?? after,
      has_more: rows.length > limit,
    };
  }
  context(p: Identity, input: Data = {}) {
    const binding = this.identity(p, true);
    const section = input.section ?? 'identity';
    if (
      Object.keys(input).some((k) => !['section', 'after_cursor', 'limit'].includes(k)) ||
      ![
        'identity',
        'roles',
        'task',
        'child_results',
        'policy',
        'notices',
        'all',
        'results',
      ].includes(section) ||
      (section !== 'notices' && ('after_cursor' in input || 'limit' in input))
    )
      throw new RouteError('INVALID_CONTEXT_QUERY');
    const task = () =>
      p.taskId
        ? this.one('select id,summary,state,request_json,policy_id from tasks where id=?', p.taskId)
        : null;
    const sections: Record<string, () => unknown> = {
      identity: () => ({ role_id: p.roleId, space_id: p.spaceId, project_id: p.projectId }),
      roles: () => this.all('select id,name,status from roles where space_id=?', p.spaceId),
      task: () => {
        const t = task();
        return t
          ? { id: t.id, summary: t.summary, state: t.state, request: JSON.parse(t.request_json) }
          : null;
      },
      child_results: () =>
        p.taskId
          ? this.all(
              "select r.id,r.summary,r.body,r.outputs_json from continuations c join results r on r.id=c.result_id where c.parent_task_id=? and r.publication_state='PUBLISHED'",
              p.taskId,
            ).map(({ outputs_json, ...r }) => ({ ...r, outputs: JSON.parse(outputs_json) }))
          : [],
      policy: () => {
        const policyId = task()?.policy_id ?? binding.last_synced_policy_id;
        const policy = policyId
          ? this.one(
              'select id,revision,protocol_version,content_json,content_hash from policies where id=? and project_id=?',
              policyId,
              p.projectId,
            )
          : undefined;
        if (!policy) throw new RouteError('POLICY_REQUIRED');
        return {
          id: policy.id,
          revision: policy.revision,
          protocol_version: policy.protocol_version,
          content_hash: policy.content_hash,
          rules: JSON.parse(policy.content_json),
        };
      },
      notices: () => this.notices(p, input.after_cursor, input.limit),
    };
    // 显式 all/results 作为旧调用别名保留；默认只披露 identity。
    if (section === 'all')
      return Object.fromEntries(Object.entries(sections).map(([k, fn]) => [k, fn()]));
    if (section === 'results') return { results: sections.child_results() };
    return { [section]: sections[section]() };
  }
  registerArtifact(p: Identity, op: string, input: Data) {
    if (
      !input ||
      Object.keys(input).some((k) => !['workspace_id', 'path', 'media_type'].includes(k)) ||
      typeof input.path !== 'string' ||
      typeof input.workspace_id !== 'string'
    )
      throw new RouteError('INVALID_ARTIFACT_INPUT');
    const binding = this.identity(p);
    if (binding.workspace_id !== input.workspace_id)
      throw new RouteError('WORKSPACE_SCOPE', 'AUTHORIZATION');
    const workspace = this.one('select * from workspaces where id=?', input.workspace_id)!;
    return this.operation(p, op, { tool: 'artifact_register', input }, () => {
      if (!/^project_[A-Za-z0-9_-]+$/.test(p.projectId)) throw new RouteError('INVALID_PROJECT_ID');
      const frozen = freezeFile(workspace.display_path, input.path, this.objectRoot());
      frozen.storage_key = p.projectId + '/' + frozen.storage_key;
      const existing = this.one(
        'select id from artifacts where project_id=? and storage_key=?',
        p.projectId,
        frozen.storage_key,
      );
      if (existing) return { artifact_id: existing.id, ...frozen };
      const artifact = id('artifact');
      this.exec(
        'insert into artifacts values(?,?,?,?,?,?,?,?,?)',
        artifact,
        p.projectId,
        frozen.storage_key,
        frozen.sha256,
        frozen.byte_size,
        input.media_type ?? 'application/octet-stream',
        JSON.stringify({ workspace_id: input.workspace_id, path: input.path }),
        'AVAILABLE',
        this.clock(),
      );
      return { artifact_id: artifact, ...frozen };
    });
  }
  readArtifact(p: Identity, input: Data) {
    this.identity(p, true);
    if (
      !input ||
      Object.keys(input).some((k) => !['reference', 'offset_bytes', 'limit_bytes'].includes(k)) ||
      input.reference?.kind !== 'artifact'
    )
      throw new RouteError('INVALID_ARTIFACT_READ');
    const offset = input.offset_bytes ?? 0,
      limit = input.limit_bytes ?? 65536;
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 65536
    )
      throw new RouteError('ARTIFACT_READ_LIMIT');
    const a = this.one(
      "select * from artifacts where id=? and project_id=? and state='AVAILABLE'",
      input.reference.artifact_id,
      p.projectId,
    );
    if (!a) throw new RouteError('ARTIFACT_SCOPE', 'AUTHORIZATION');
    const bytes = this.readObject(a);
    return {
      artifact_id: a.id,
      offset_bytes: offset,
      byte_size: a.byte_size,
      encoding: 'base64',
      content: bytes.subarray(offset, offset + limit).toString('base64'),
      has_more: offset + limit < bytes.length,
    };
  }
  pause(role: string) {
    this.exec("update roles set status='PAUSED' where id=?", role);
  }
  tasks() {
    return this.all('select * from tasks order by seq');
  }
  inbox() {
    return this.all(
      "select m.* from messages m join outbox o on o.message_id=m.id where m.to_kind='user' and m.kind='task.result' and o.state in ('QUEUED','DELIVERED') order by m.seq",
    );
  }
  snapshot() {
    return {
      at: this.clock(),
      cursor: this.one('select coalesce(max(seq),0) as n from events')!.n,
      roles: this.all(
        'select r.*,s.blocked_reason,s.active_task_id,s.active_run_id from roles r left join role_slots s on s.role_id=r.id',
      ),
      tasks: this.tasks(),
      inbox: this.inbox(),
      issues: this.all('select * from issues order by created_at_ms desc limit 100'),
      events: this.all('select * from events order by seq desc limit 200'),
    };
  }
}
