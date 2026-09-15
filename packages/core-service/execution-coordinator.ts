import { randomUUID } from 'node:crypto';
import type { ExecutionBackend, ExecutionExit } from './execution-backend.ts';
import { completionAllowed } from './execution-backend.ts';
import type { Dispatch } from '../runtime/core.ts';
import type { ApplicationService } from './application.ts';
import { ContextMigrationService } from './context-migration.ts';
import { blockBeforeLaunch } from './precheck-blocked.ts';
import { assertNativeContextReceipt } from './native-context-receipt.ts';
const uid = (p: string) => p + '_' + randomUUID();
/** 单一应用协调层；进程 I/O 由后端负责。Fixture 与 Native 共用调度/收尾；生产必须通过可信运行器安全授权。 */
// provenance 的 model 字段只取受信绑定内的模型描述,损坏数据不阻断溯源。
function safeModel(modelJson: unknown): unknown {
  try {
    return JSON.parse(String(modelJson ?? '{}'));
  } catch {
    return null;
  }
}
export class ExecutionCoordinator {
  private scheduled = false;
  private active = new Map<string, () => void>();
  private stopping = false;
  private readonly contextMigration: ContextMigrationService;
  constructor(
    readonly app: ApplicationService,
    readonly backend: ExecutionBackend,
  ) {
    this.contextMigration = new ContextMigrationService(app.db, app.contextStore, app.clock);
    app.onChanged = () => this.kick();
  }
  kick() {
    if (this.stopping || (!this.app.fixtureMode && !this.app.nativeAuthorization) || this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      this.tick();
    });
  }
  configure(role: string, scenario: unknown) {
    if (!this.app.fixtureMode) throw Error('FIXTURE_MODE_REQUIRED');
    this.app.roleScope(role);
    if (
      !scenario ||
      typeof scenario !== 'object' ||
      Buffer.byteLength(JSON.stringify(scenario)) > 131072
    )
      throw Error('INVALID_FIXTURE');
    this.app.db
      .prepare(
        "insert into execution_profiles(role_id,source,scenario_json,verified) values(?,'SIMULATED',?,1) on conflict(role_id) do update set scenario_json=excluded.scenario_json,verified=1",
      )
      .run(role, JSON.stringify(scenario));
    this.kick();
  }
  private tick() {
    if (this.stopping) return;
    const a = this.app;
    for (const intent of a.all(
      "select c.* from cancel_intents c join runs r on r.id=c.run_id where c.state='PENDING' and r.state not in ('UNKNOWN','SUCCEEDED','FAILED','CANCELLED')",
    )) {
      try {
        if (this.backend.cancel(intent.run_id, intent.epoch)) {
          a.db.prepare("update cancel_intents set state='SENT' where run_id=?").run(intent.run_id);
        }
      } catch {
        this.unknown(intent.run_id);
        a.notify();
      }
    }
    for (const profile of a.all('select * from execution_profiles where verified=1')) {
      if (this.stopping) return;
      const b = a.one('select * from bindings where role_id=? and is_current=1', profile.role_id),
        charter = a.one(
          'select * from role_charters where role_id=? order by revision desc limit 1',
          profile.role_id,
        );
      if (!b || !charter) continue;
      if (a.fixtureMode ? profile.source !== 'SIMULATED' : profile.source !== 'NATIVE' || !a.nativeAuthorization?.(b.id)) continue;
      const d = a.one('select * from bootstrap_deliveries where charter_id=?', charter.id),
        scenario = JSON.parse(profile.scenario_json);
      if (d.state === 'PENDING') {
        this.initialize(profile.role_id, b, charter, d, scenario);
        continue;
      }
      if (d.state !== 'DELIVERED') continue;
      // 显式降级已触发:停止向该 profile 派发,直到操作者处理(切换计划或清除降级)。
      if (profile.fallback_json) {
        try {
          if (JSON.parse(profile.fallback_json).triggered) continue;
        } catch {}
      }
      const dispatch = a.db
        .transaction(() => {
          const dispatch = a.core.dispatch(profile.role_id);
          if (dispatch) {
            a.db
              .prepare("insert into run_sources(run_id,source,charter_id) values(?,?,?)")
              .run(dispatch.id, a.fixtureMode ? 'SIMULATED' : 'NATIVE', charter.id);
            a.event(a.roleScope(profile.role_id).project_id, 'DispatchIntent', dispatch.id);
          }
          return dispatch;
        })
        .immediate();
      if (dispatch) {
        void this.run(dispatch, b, charter, {
          ...scenario,
          ...(dispatch.kind === 'CONTINUATION' && scenario.continuationSteps
            ? { steps: scenario.continuationSteps }
            : {}),
          ...(scenario.bySummary?.[dispatch.request.summary] ?? {}),
        }).then(() => a.notify()).catch(() => {
          this.unknown(dispatch.id);
          a.notify();
          this.kick();
        });
      }
    }
  }
  private resources(b: any) {    const a = this.app,
      w = a.one('select canonical_path from workspaces where id=?', b.workspace_id);
    return ['workspace:' + w.canonical_path, ...(b.auth_unit_id ? ['auth:' + b.auth_unit_id] : [])];
  }
  private initialize(role: string, b: any, charter: any, d: any, scenario: any) {
    const a = this.app,
      resources = this.resources(b);
    if (
      a.one(
        'select active_run_id from role_slots where role_id=? and active_run_id is not null',
        role,
      ) ||
      resources.some(
        (key) =>
          a.one('select resource_key from resource_leases where resource_key=?', key) ||
          a.one('select resource_key from initialization_leases where resource_key=?', key),
      )
    )
      return;
    const attempt = uid('initialization');
    a.db
      .transaction(() => {
        a.db
          .prepare(
            "insert into initialization_attempts(id,delivery_id,role_id,epoch,charter_hash,state,source,created_at_ms) values(?,?,?,?,?,'STARTING',?,?)",
          )
          .run(attempt, d.id, role, b.epoch, charter.hash, a.fixtureMode ? 'SIMULATED' : 'NATIVE', a.clock());
        for (const key of resources)
          a.db
            .prepare("insert into initialization_leases values(?,?,?,'HELD')")
            .run(key, attempt, b.epoch);
        a.db
          .prepare(
            "update bootstrap_deliveries set state='DELIVERING',reason=null,updated_at_ms=? where id=?",
          )
          .run(a.clock(), d.id);
        a.event(charter.project_id, 'BootstrapStarted', role);
      })
      .immediate();
    let delivered = false,
      terminal = false,
      broken = false;
    const child = this.launch(
      attempt,
      { mode: 'bootstrap', bindingId:b.id, roleId:role, epoch: b.epoch, charterHash: charter.hash, charter:JSON.parse(charter.spec_json), scenario },
      (event) => {
        if (event.epoch !== b.epoch) {
          this.audit(charter.project_id, 'STALE_BOOTSTRAP_EVENT');
          return;
        }
        if (event.kind === 'diagnostic') this.audit(charter.project_id, 'NATIVE_' + event.code);
        if (event.kind === 'charter' && event.charterHash === charter.hash) delivered = true;
        if (event.kind === 'terminal') terminal = true;
      },
      (exit) => {
        a.db
          .transaction(() => {
            const current = a.one(
              'select epoch from bindings where role_id=? and is_current=1',
              role,
            );
            const stopped = completionAllowed(exit, b.epoch, a.fixtureMode);
            const success =
              !broken &&
              stopped &&
              exit.code === 0 &&
              delivered &&
              terminal &&
              current?.epoch === b.epoch;
            a.db
              .prepare('update initialization_attempts set state=?,completed_at_ms=? where id=?')
              .run(success ? 'DELIVERED' : stopped ? 'FAILED' : 'UNKNOWN', a.clock(), attempt);
            a.db
              .prepare(
                'update bootstrap_deliveries set state=?,reason=?,updated_at_ms=? where id=?',
              )
              .run(
                success ? 'DELIVERED' : 'FAILED',
                success ? null : stopped ? 'BOOTSTRAP_EXECUTION_FAILED' : 'BOOTSTRAP_STOP_UNPROVEN',
                a.clock(),
                d.id,
              );
            if (stopped)
              a.db.prepare('delete from initialization_leases where attempt_id=?').run(attempt);
            else
              a.db
                .prepare("update initialization_leases set state='QUARANTINED' where attempt_id=?")
                .run(attempt);
            a.event(charter.project_id, success ? 'BootstrapDelivered' : 'BootstrapFailed', role);
          })
          .immediate();
        a.notify();
        this.kick();
      },
      () => {
        broken = true;
      },
    );
    a.db
      .prepare('update initialization_attempts set pid=? where id=?')
      .run(child.pid ?? null, attempt);
    a.notify();
  }
  private contextBudget(b: any, mode: 'DELTA' | 'FULL') {
    if (this.app.fixtureMode)
      return { maxContextTokens: 1000000, currentUsageTokens: 0, source: 'ESTIMATED' as const };
    const parsedModel = safeModel(b.model_json);
    const model =
      parsedModel && typeof parsedModel === 'object'
        ? (parsedModel as Record<string, unknown>)
        : {};
    const numberFrom = (keys: string[]) => {
      for (const key of keys) {
        const value = model[key];
        if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
      }
      return null;
    };
    const maxContextTokens = numberFrom(['max_context_tokens', 'context_window_tokens', 'context_tokens']);
    const currentUsageTokens =
      mode === 'FULL'
        ? 0
        : numberFrom(['current_context_tokens', 'context_usage_tokens', 'used_context_tokens']);
    return {
      maxContextTokens,
      currentUsageTokens,
      source: maxContextTokens === null ? ('UNKNOWN' as const) : ('CATALOG' as const),
    };
  }
  private async buildContextPlan(
    dispatch: Dispatch,
    b: any,
  ): Promise<import('./context-migration.ts').ContextMigrationPlan | null> {
    const a = this.app;
    const run = a.one(
      "select r.role_session_id,a.operation_id,s.seq from runs r left join role_session_activations a on a.id=r.activation_id left join role_sessions s on s.id=r.role_session_id where r.id=?",
      dispatch.id,
    );
    if (!run?.role_session_id || ['role-create', 'v1.0-backfill', 'core-dispatch'].includes(String(run.operation_id)))
      return null;
    const state = a.one(
      'select synced_through_seq from role_session_context_state where role_session_id=?',
      run.role_session_id,
    );
    const mode = Number(state?.synced_through_seq ?? 0) > 0 ? 'DELTA' : 'FULL';
    return this.contextMigration.build({
      roleId: dispatch.principal.roleId,
      targetWorkSessionId: String(run.role_session_id),
      operationId: 'ctx_' + dispatch.id,
      mode,
      budget: this.contextBudget(b, mode),
      taskId: dispatch.taskId,
      runId: dispatch.id,
    });
  }
  private async run(dispatch: Dispatch, b: any, charter: any, scenario: any) {
    const a = this.app;
    let terminal: string | undefined,
      broken = false,
      lastDiagnostic = '';
    const runRow = a.one('select role_session_id,activation_id from runs where id=?', dispatch.id);
    const roleSessionId = runRow?.role_session_id as string | null | undefined;
    let contextPlan: import('./context-migration.ts').ContextMigrationPlan | null = null;
    try {
      contextPlan = await this.buildContextPlan(dispatch, b);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CONTEXT_MIGRATION_FAILED';
      this.audit(charter.project_id, /^[A-Z][A-Z0-9_]{1,95}$/.test(code) ? code : 'CONTEXT_MIGRATION_FAILED');
      blockBeforeLaunch(a.db, dispatch.id, code, a.clock());
      a.event(charter.project_id, 'PrecheckBlocked', dispatch.id);
      return;
    }
    const child = this.launch(
      dispatch.id,
      {
        mode: 'run',
        bindingId: b.id,
        roleId: dispatch.principal.roleId,
        epoch: b.epoch,
        charterHash: charter.hash,
        charter: JSON.parse(charter.spec_json),
        request: dispatch.request,
        scenario,
        ...(roleSessionId ? { roleSessionId } : {}),
        ...(dispatch.principal.activationId ? { activationId: dispatch.principal.activationId } : {}),
        ...(dispatch.principal.activationEpoch !== undefined
          ? { activationEpoch: dispatch.principal.activationEpoch }
          : {}),
        ...(contextPlan ? { contextSync: contextPlan.envelope } : {}),
        handleTool: (tool: string, operationId: string, input: any) =>
          this.routeTool(dispatch, tool, operationId, input),
      },
      (event) => {
        if (event.epoch !== b.epoch) {
          this.audit(charter.project_id, 'STALE_RUN_EVENT');
          return;
        }
        const current = a.one(
          'select epoch from bindings where role_id=? and is_current=1',
          dispatch.principal.roleId,
        );
        if (current?.epoch !== event.epoch) {
          this.audit(charter.project_id, 'STALE_BINDING_EVENT');
          return;
        }
        const activation = runRow?.activation_id
          ? a.one(
              'select role_session_id,binding_id,binding_epoch,activation_epoch,state from role_session_activations where id=?',
              runRow.activation_id,
            )
          : null;
        if (
          roleSessionId &&
          (!activation ||
            activation.role_session_id !== roleSessionId ||
            activation.binding_id !== b.id ||
            Number(activation.binding_epoch) !== b.epoch ||
            activation.state !== 'ACTIVE' ||
            (dispatch.principal.activationEpoch !== undefined &&
              Number(activation.activation_epoch) !== dispatch.principal.activationEpoch))
        ) {
          this.audit(charter.project_id, 'STALE_ACTIVATION_EVENT');
          return;
        }
        if (
          a.one(
            'select seq from events where run_id=? and native_event_key=?',
            dispatch.id,
            event.key,
          )
        )
          return;
        if (contextPlan && event.kind === 'context_confirmed') {
          if (!a.fixtureMode) {
            const ws = a.one('select native_session_ref from role_sessions where id=?', roleSessionId);
            const ref = ws?.native_session_ref ? JSON.parse(ws.native_session_ref) : null;
            assertNativeContextReceipt(event.nativeReceipt, {
              runId: dispatch.id, workSessionId: String(roleSessionId),
              activationId: String(runRow?.activation_id), activationEpoch: Number(activation?.activation_epoch),
              nativeSessionId: ref?.id ?? '', envelope: contextPlan.envelope,
            });
          }
          if (event.stableMarker !== contextPlan.envelope.stable_marker)
            throw Error('CONTEXT_SYNC_MARKER_MISMATCH');
          this.contextMigration.confirm(
            contextPlan,
            event.nativeReceipt ?? { marker: event.stableMarker },
            event.nativeHistoryCursor,
          );
        }
        a.db
          .transaction(() => {
            a.db
              .prepare(
                'insert into events(event_id,event_type,role_id,task_id,run_id,native_event_key,payload_json,created_at_ms) values(?,?,?,?,?,?,?,?)',
              )
              .run(
                uid('event'),
                a.fixtureMode ? 'FixtureNative' : 'NativeEvent',
                dispatch.principal.roleId,
                dispatch.taskId,
                dispatch.id,
                event.key,
                JSON.stringify({
                  kind: event.kind,
                  source: a.fixtureMode ? 'SIMULATED' : 'NATIVE',
                  ...(event.kind === 'context_confirmed'
                    ? { stable_marker: event.stableMarker }
                    : {}),
                }),
                a.clock(),
              );
            if (event.kind === 'diagnostic')
              this.audit(charter.project_id, 'NATIVE_' + (event.phase ?? '') + '_' + event.code);
            if (event.kind === 'accepted') a.core.accepted(dispatch.id);
            if (!a.fixtureMode && event.kind === 'text' && typeof event.text === 'string')
              this.conversation(dispatch, 'ASSISTANT_MESSAGE', '原生输出', event.text, event.key);
            if (event.kind === 'gap')
              this.conversation(dispatch, 'GAP', '历史缺口', '缺失内容未重建', event.key);
            if (event.kind === 'tool') {
              if (!a.fixtureMode) throw Error('NATIVE_TOOL_REQUIRES_TRUSTED_BRIDGE');
              this.conversation(
                dispatch,
                'TOOL_CALL',
                event.tool,
                '隔离 FixtureHarness 工具请求',
                event.key + ':call',
              );
              if (!['send', 'finish', 'wait'].includes(event.tool))
                throw Error('FIXTURE_TOOL_DENIED');
              const reply =
                event.tool === 'send'
                  ? a.core.send(dispatch.principal, event.operationId, event.payload)
                  : event.tool === 'finish'
                    ? a.core.finish(dispatch.principal, event.operationId, event.payload)
                    : a.core.wait(dispatch.principal, event.operationId, event.payload);
              this.conversation(
                dispatch,
                'TOOL_RESULT',
                event.tool,
                JSON.stringify(reply ?? {}),
                event.key + ':reply',
              );
              a.syncConversation();
            }
            if (event.kind === 'terminal') {
              terminal = event.outcome;
              a.db
                .prepare('update run_sources set native_terminal=1 where run_id=?')
                .run(dispatch.id);
            }
            if (event.kind === 'diagnostic' && typeof event.code === 'string')
              lastDiagnostic = event.code;
            a.event(charter.project_id, a.fixtureMode ? 'FixtureEvent' : 'NativeEvent', dispatch.id);
          })
          .immediate();
        a.notify();
      },
      (exit) => {
        try {
          a.db
            .transaction(() => {
              if (
                exit.code === 0 &&
                terminal &&
                !broken &&
                completionAllowed(exit, b.epoch, a.fixtureMode)
              ) {
                a.db
                  .prepare('update run_sources set resources_stopped=1 where run_id=?')
                  .run(dispatch.id);
                a.core.settle(dispatch.id, b.epoch, terminal, {
                  native: true,
                  resourcesStopped: true,
                });
                this.deliverPublished();
                a.syncConversation();
              } else this.unknown(dispatch.id);
              // 执行溯源:Core 记录实际执行来源与显式降级判定;模型/客户端声明不入 provenance。
              const fbRow = a.one(
                'select fallback_json from execution_profiles where role_id=?',
                dispatch.principal.roleId,
              ) as { fallback_json?: string | null } | undefined;
              let fallback: Record<string, unknown> | null = null;
              if (terminal === 'failed' && fbRow?.fallback_json) {
                try {
                  const fb = JSON.parse(fbRow.fallback_json) as {
                    harness?: string;
                    reason_codes?: string[];
                    triggered?: unknown;
                  };
                  const hit = (fb.reason_codes ?? []).find((c) => lastDiagnostic.includes(c));
                  if (fb.harness && hit && !fb.triggered) {
                    fallback = {
                      to: fb.harness,
                      reason: lastDiagnostic,
                      matched_code: hit,
                      at_ms: a.clock(),
                      dispatched: false,
                    };
                    // 显式降级触发态写入 profile(权威派发门);操作者切换计划后清除,不静默重派。
                    a.db
                      .prepare('update execution_profiles set fallback_json=? where role_id=?')
                      .run(
                        JSON.stringify({
                          harness: fb.harness,
                          reason_codes: fb.reason_codes,
                          triggered: { at_ms: a.clock(), reason: lastDiagnostic, from_run: dispatch.id },
                        }),
                        dispatch.principal.roleId,
                      );
                  }
                } catch {}
              }
              a.db
                .prepare('update runs set execution_provenance=? where id=?')
                .run(
                  JSON.stringify({
                    harness: b.harness,
                    model: safeModel(b.model_json),
                    outcome: terminal ?? 'unknown',
                    diagnostic: lastDiagnostic || null,
                    fallback,
                    recorded_at_ms: a.clock(),
                  }),
                  dispatch.id,
                );
              a.event(
                charter.project_id,
                a.fixtureMode ? 'FixtureProcessExited' : 'NativeProcessExited',
                dispatch.id,
              );
            })
            .immediate();
        } catch {
          this.unknown(dispatch.id);
        }
        a.notify();
        this.kick();
      },
      () => {
        broken = true;
      },
    );
    a.db.prepare('update run_sources set pid=? where run_id=?').run(child.pid ?? null, dispatch.id);
  }
  private routeTool(d:Dispatch,tool:string,op:string,input:any) {
    if (this.stopping || this.app.fixtureMode) throw Error('NATIVE_ROUTE_UNAVAILABLE');
    const a=this.app;
    if (!a.nativeToolAuthorization?.(d.principal.bindingId,d.principal.epoch,tool)) throw Error('TOOL_NOT_GRANTED');
    const p=d.principal;
    this.conversation(d,'TOOL_CALL',tool,'原生工具调用',op+':call');
    let result;
    if(tool==='route_context') result=a.core.context(p,input);
    else if(tool==='route_send') result=a.core.send(p,op,input);
    else if(tool==='route_finish') result=a.core.finish(p,op,input);
    else if(tool==='route_wait') result=a.core.wait(p,op,input);
    else if(tool==='route_artifact_register') result=a.core.registerArtifact(p,op,input);
    else if(tool==='route_artifact_read') result=a.core.readArtifact(p,input);
    else throw Error('TOOL_UNAVAILABLE');
    this.conversation(d,'TOOL_RESULT',tool,'工具已返回；业务交付仍受原生收尾屏障约束',op+':reply');
    a.syncConversation();a.notify();
    return result;
  }
  private launch(
    key: string,
    packet: { epoch: number; [key: string]: unknown },
    onFrame: (event: any) => void,
    onExit: (exit: ExecutionExit) => void,
    onBroken: () => void,
  ) {
    let ended = false,
      broken = false;
    const fail = () => {
      if (!ended) {
        broken = true;
        onBroken();
      }
    };
    const exit = (value: ExecutionExit) => {
      if (ended) return;
      ended = true;
      this.active.delete(key);
      try {
        onExit(value);
      } catch {
        // Storage failure: stop dispatch before shutdown; restart recovery owns unresolved leases.
        this.stopping = true;
        queueMicrotask(() => this.app.onShutdown?.());
      }
    };
    this.active.set(key, () => {
      fail();
      exit({ code: null, stop: { kind: 'unknown', epoch: packet.epoch } });
    });
    try {
      return this.backend.launch(
        key,
        packet,
        (event) => {
          if (ended || broken) return;
          try {
            onFrame(event);
          } catch {
            fail();
          }
        },
        exit,
        fail,
      );
    } catch {
      fail();
      queueMicrotask(() => exit({ code: null, stop: { kind: 'unknown', epoch: packet.epoch } }));
      return {};
    }
  }
  private conversation(d: Dispatch, kind: string, title: string, body: string, key: string) {
    const a = this.app;
    const roleSessionId = a.one('select role_session_id from runs where id=?', d.id)?.role_session_id ?? null;
    const sourceId = d.id + ':' + key;
    a.db
      .prepare(
        'insert or ignore into conversation_items(id,project_id,space_id,role_id,task_id,run_id,kind,title,body,at_ms,source_key,role_session_id) values(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        uid('conversation'),
        d.principal.projectId,
        d.principal.spaceId,
        d.principal.roleId,
        d.taskId,
        d.id,
        kind,
        title,
        body.slice(0, 4096),
        a.clock(),
        sourceId,
        roleSessionId,
      );
    a.contextStore.appendConversation({
      roleId: d.principal.roleId,
      sourceWorkSessionId: roleSessionId,
      sourceId,
      kind: kind as import('./role-context-store.ts').PortableContextKind,
      title,
      body,
      taskId: d.taskId,
      runId: d.id,
    });
  }
  private audit(project: string, kind: string) {
    this.app.db
      .prepare(
        'insert into application_audit(project_id,actor,kind,detail_json,at_ms) values(?,?,?,?,?)',
      )
      .run(project, 'fixture_process', kind, '{}', this.app.clock());
  }
  unknown(run: string) {
    const a = this.app,
      r = a.one('select * from runs where id=?', run);
    if (!r || ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(r.state)) return;
    a.db
      .transaction(() => {
        a.db.prepare("update runs set state='UNKNOWN' where id=?").run(run);
        a.db.prepare("update resource_leases set state='QUARANTINED' where run_id=?").run(run);
        a.db.prepare("update tasks set state='NEEDS_ATTENTION' where id=?").run(r.task_id);
        a.db
          .prepare("update role_slots set blocked_reason='reconciling' where role_id=?")
          .run(r.role_id);
        a.db
          .prepare(
            "insert into issues(id,role_id,task_id,run_id,code,detail_json,state,created_at_ms) values(?,?,?,?,'EXECUTION_UNKNOWN','{}','OPEN',?)",
          )
          .run(uid('issue'), r.role_id, r.task_id, run, a.clock());
      })
      .immediate();
  }
  private deliverPublished() {
    const a = this.app;
    for (const m of a.all(
      "select m.*,o.id as outbox_id from outbox o join messages m on m.id=o.message_id where o.state='QUEUED' and m.kind='task.result'",
    )) {
      const result = a.one(
        "select * from results where task_id=? and publication_state='PUBLISHED'",
        m.task_id,
      );
      if (!result) continue;
      if (m.to_kind === 'role') {
        const task = a.one('select * from tasks where id=?', m.task_id),
          parent = task.parent_task_id
            ? a.one('select * from tasks where id=?', task.parent_task_id)
            : null;
        if (!parent || parent.assignee_role_id !== m.to_role_id) {
          if (!a.one('select result_id from result_handlings where result_id=?', result.id)) {
            const role = a.roleScope(m.to_role_id),
              charter = a.one(
                'select * from role_charters where role_id=? order by revision desc limit 1',
                role.id,
              ),
              spec = JSON.parse(charter.spec_json);
            const to =
              spec.default_completion_target.type === 'user'
                ? { type: 'user' }
                : {
                    type: 'role',
                    id: a
                      .all(
                        'select role_id,spec_json from role_charters where space_id=?',
                        role.space_id,
                      )
                      .find(
                        (c) =>
                          JSON.parse(c.spec_json).role_key ===
                          spec.default_completion_target.role_key,
                      )?.role_id,
                  };
            const request = {
              kind: 'task.request',
              to: { type: 'role', id: role.id },
              summary: '处理关联结果',
              body: result.body,
              inputs: JSON.parse(result.outputs_json),
              expected: ['处理结果并按明确目标收尾'],
              completion: { mode: 'result', to },
              project_data: { source_result_id: result.id },
            };
            const handling = a.core.submitFromUser(
              { projectId: role.project_id, spaceId: role.space_id },
              request,
              m.operation_row_id,
            );
            a.db
              .prepare('update tasks set requester_role_id=? where id=?')
              .run(m.from_role_id, handling);
            a.db
              .prepare(
                "update messages set from_kind='role',from_role_id=? where task_id=? and kind='task.request'",
              )
              .run(m.from_role_id, handling);
            a.db.prepare('insert into result_handlings values(?,?)').run(result.id, handling);
          }
        }
      }
      a.db
        .prepare("update outbox set state='DELIVERED',updated_at_ms=? where id=?")
        .run(a.clock(), m.outbox_id);
    }
  }
  async stop() {
    this.stopping = true;
    try {
      await this.backend.stop();
    } finally {
      for (const finish of [...this.active.values()]) finish();
    }
  }
}
