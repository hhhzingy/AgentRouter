import { createHash } from 'node:crypto';
import { inheritSupported } from './context-transfer.ts';
import {
  resolveSourceExecutionContext,
  type SessionHomeQuery,
} from './resolved-execution-context.ts';
import type { ContextTransferEngine, TransferDriverPort } from './context-transfer-engine.ts';
import {
  validateExternalApiFrame,
  extensionReply,
  extensionErrorReply,
} from '../client-contract/external-api-1.ts';
import { Ajv2020 } from 'ajv/dist/2020.js';

/**
 * WorkSession 是 Role 下可长期恢复的用户历史；激活执行权限由
 * role_session_activations 独立记录。这里不创建或读取 V1.0 handoff 包。
 */
export interface RoleSessionDispatchContext {
  principal: string;
  clientId?: string;
  mode?: string;
  assertRoleAccess?: (roleId: string, clientId?: string) => void;
  assertControllerLease: (leaseId: string) => void;
  assertRevision?: (expectedRevision: number) => void;
  commitRevision?: () => void;
  transitionBinding?: (roleId: string, harness: string, sessionId?: string) => Record<string, any>;
}

type Row = Record<string, any>;
type MutationMetadata = {
  requestKey: string;
  operationId: string;
  expectedRevision: number;
  preflightHash: string;
  hash: string;
};
const ajv = new Ajv2020({ strict: true, allErrors: false });
const compile = (schema: object) => ajv.compile(schema);
const IdString = { type: 'string', minLength: 1, maxLength: 160 } as const;
const listParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['role_id'],
  properties: { role_id: IdString },
});
const preflightParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['role_id'],
  properties: { role_id: IdString, target_harness: IdString, session_id: IdString },
});
const createParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['role_id', 'name'],
  properties: {
    role_id: IdString,
    name: { type: 'string', minLength: 1, maxLength: 80 },
    target_harness: IdString,
    context_mode: { enum: ['blank', 'inherit'] },
  },
});
const switchParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['role_id', 'session_id'],
  properties: { role_id: IdString, session_id: IdString },
});
const historyParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['role_id', 'session_id'],
  properties: {
    role_id: IdString,
    session_id: IdString,
    limit: { type: 'integer', minimum: 1, maximum: 500 },
  },
});
const transferStatusParams = compile({
  type: 'object',
  additionalProperties: false,
  required: ['role_id', 'op_id'],
  properties: { role_id: IdString, op_id: IdString },
});

export class RoleSessionExtension {
  private transferEngine?: ContextTransferEngine;
  /** 同一提交事务内把新 WS 交给 Participant/Managed Binding 原语。 */
  onSessionCommitted?: (roleId: string, sessionId: string) => void;
  constructor(
    private readonly db: import('better-sqlite3').Database,
    private readonly clock = () => Date.now(),
    /** Harness Context 能力(诚实标注):inherit 门控同时查来源导出与双端通道,不再硬编码拒绝。 */
    private readonly capabilityLookup?: (harness: string) => { historyExport: string; nativeFork?: string },
    /** WC01:已接线的受信传输通道(按 harness);存在=该端 export/init 真实可用。 */
    private readonly transferPorts?: ReadonlyMap<string, TransferDriverPort>,
    /** WC02:同 ACTIVE WS 原生连续性事实(由 Driver 能力投影)。 */
    private readonly continuityOf?: (harness: string) => string,
    /** WN01/F12:按 ResolvedExecutionContext 解析 sessionHome;禁止只按 harness 取第一个 profile。 */
    private readonly sessionHomeOf?: (query: SessionHomeQuery) => string | null,
  ) {}
  /** WN01:目标 binding 安全切换回调(w11-main 注入;仅提交事务内使用)。 */
  transitionBindingForCommit?: (roleId: string, harness: string, sessionId?: string) => Record<string, any>;
  /** WN01:COMMITTED 一致性核对(启动恢复;以提交事实修复活动指针,不新建)。 */
  repairCommitted(input: { roleId: string; sessionId: string }): void {
    this.db.transaction(() => {
      const target = this.one('select id,state from role_sessions where id=? and role_id=?', input.sessionId, input.roleId);
      if (!target) throw Error('ROLE_SESSION_NOT_FOUND');
      if (target.state === 'ACTIVE') return;
      this.db.prepare("update role_sessions set state='ARCHIVED' where role_id=? and state='ACTIVE'").run(input.roleId);
      this.db.prepare("update role_sessions set state='ACTIVE' where id=?").run(input.sessionId);
      const binding = this.binding(input.roleId);
      this.activateWithinTransaction(input.roleId, input.sessionId, binding, 'ctx_transfer_repair_' + this.clock(), this.clock());
    }).immediate();
  }
  /** w11-main 装配:引擎持有本扩展的短事务提交。 */
  attachTransferEngine(engine: ContextTransferEngine): void {
    this.transferEngine = engine;
  }

  handle(raw: unknown, context: RoleSessionDispatchContext): unknown {
    try {
      const frame = validateExternalApiFrame(raw);
      const method = frame.method as string;
      if (!method.startsWith('roleSession.')) throw Error('INVALID_FRAME');
      const p = (frame.params ?? {}) as Record<string, unknown>;
      const mutation = method === 'roleSession.create' || method === 'roleSession.switch';
      context.assertRoleAccess?.(String(p.role_id ?? ''), frame.client_id);
      if (mutation) {
        if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
        context.assertControllerLease(frame.lease_id!);
        if (context.clientId && context.clientId !== frame.client_id)
          throw Error('CONTROL_LEASE_REQUIRED');
      }
      const metadata = mutation ? this.mutationMetadata(frame, p) : null;
      const execute = () => {
        const role = mutation
          ? this.one(
              'select r.id,s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?',
              String(p.role_id ?? ''),
            )
          : undefined;
        if (mutation && !role) throw Error('ROLE_NOT_FOUND');
        const clientId = context.clientId ?? frame.client_id;
        if (mutation && !clientId) throw Error('CONTROL_LEASE_REQUIRED');
        const ledgerKey = metadata
          ? 'roleSession:' +
            createHash('sha256')
              .update(JSON.stringify([role!.project_id, role!.id, metadata.requestKey]))
              .digest('hex')
          : '';
        if (metadata) {
          const previous = this.one(
            'select request_hash,response_json from command_ledger where principal=? and client_id=? and operation_id=?',
            context.principal,
            clientId,
            ledgerKey,
          );
          if (previous) {
            if (previous.request_hash !== metadata.hash) throw Error('OPERATION_CONFLICT');
            return extensionReply(frame.id, JSON.parse(previous.response_json));
          }
          context.assertRevision?.(metadata.expectedRevision);
        }
        const operationId = metadata?.operationId ?? String(frame.id);
        let result: unknown;
        if (method === 'roleSession.list') {
          if (!listParams(p)) throw Error('INVALID_PARAMS');
          result = this.list(String(p.role_id));
        } else if (method === 'roleSession.preflight') {
          if (!preflightParams(p)) throw Error('INVALID_PARAMS');
          result = this.preflight(
            String(p.role_id),
            p.target_harness as string | undefined,
            p.session_id as string | undefined,
          );
        } else if (method === 'roleSession.create') {
          if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
          context.assertControllerLease(frame.lease_id!);
          if (!createParams(p)) throw Error('INVALID_PARAMS');
          if (metadata)
            this.assertPreflightHash(
              metadata,
              this.preflight(String(p.role_id), p.target_harness as string | undefined),
            );
          const outcome = this.create(
            String(p.role_id),
            String(p.name),
            p.target_harness as string | undefined,
            operationId,
            context.transitionBinding,
            p.context_mode === 'inherit' ? 'inherit' : 'blank',
          );
          result = 'transfer' in outcome ? { transfer: outcome.transfer } : { session: outcome.session };
          // 引擎在请求事务提交后运行(网络调用不进 DB 长事务)。
          if ('transfer' in outcome && outcome.transfer && this.transferEngine)
            this.transferEngine.enqueue(outcome.transfer.op_id);
        } else if (method === 'roleSession.transferStatus') {
          if (!transferStatusParams(p)) throw Error('INVALID_PARAMS');
          result = this.transferStatus(String(p.role_id), String(p.op_id));
        } else if (method === 'roleSession.switch') {
          if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
          context.assertControllerLease(frame.lease_id!);
          if (!switchParams(p)) throw Error('INVALID_PARAMS');
          if (metadata)
            this.assertPreflightHash(
              metadata,
              this.preflight(String(p.role_id), undefined, String(p.session_id)),
            );
          result = this.switch(String(p.role_id), String(p.session_id), operationId, context.transitionBinding);
        } else if (method === 'roleSession.history') {
          if (!historyParams(p)) throw Error('INVALID_PARAMS');
          result = this.history(String(p.role_id), String(p.session_id), Number(p.limit ?? 200));
        } else throw Error('UNSUPPORTED_METHOD');
        if (metadata) {
          context.commitRevision?.();
          this.db
            .prepare('insert into command_ledger values(?,?,?,?,?,?)')
            .run(
              context.principal,
              clientId,
              ledgerKey,
              metadata.hash,
              JSON.stringify(result),
              this.clock(),
            );
          this.db
            .prepare(
              'insert into application_audit(project_id,actor,kind,detail_json,at_ms) values(?,?,?,?,?)',
            )
            .run(
              role!.project_id,
              context.principal,
              method,
              JSON.stringify({
                client_id: clientId,
                role_id: role!.id,
                operation_id: metadata.operationId,
              }),
              this.clock(),
            );
        }
        return extensionReply(frame.id, result);
      };
      return mutation ? this.db.transaction(execute).immediate() : execute();
    } catch (error) {
      const rawId = (raw as { id?: unknown })?.id;
      return extensionErrorReply(typeof rawId === 'string' ? rawId : 'unknown', error);
    }
  }

  private mutationMetadata(
    frame: ReturnType<typeof validateExternalApiFrame>,
    params: Record<string, unknown>,
  ): MutationMetadata | null {
    if (
      !frame.request_key ||
      !frame.operation_id ||
      !Number.isSafeInteger(frame.expected_revision) ||
      frame.expected_revision! < 0 ||
      !frame.preflight_hash
    )
      throw Error('REQUEST_KEY_AND_REVISION_REQUIRED');
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          method: frame.method,
          params,
          request_key: frame.request_key,
          operation_id: frame.operation_id,
          expected_revision: frame.expected_revision,
          preflight_hash: frame.preflight_hash,
        }),
      )
      .digest('hex');
    return {
      requestKey: frame.request_key!,
      operationId: frame.operation_id!,
      expectedRevision: frame.expected_revision!,
      preflightHash: frame.preflight_hash!,
      hash,
    };
  }

  private assertPreflightHash(metadata: MutationMetadata, preflight: Row) {
    if (preflight.preflight_hash !== metadata.preflightHash) throw Error('PREFLIGHT_HASH_MISMATCH');
  }

  private one(sql: string, ...args: unknown[]): Row | undefined {
    return this.db.prepare(sql).get(...args) as Row | undefined;
  }

  private rows(roleId: string) {
    return this.db
      .prepare('select * from role_sessions where role_id=? order by seq')
      .all(roleId) as Row[];
  }

  private assertRole(roleId: string) {
    if (!this.one('select id from roles where id=?', roleId)) throw Error('ROLE_NOT_FOUND');
  }

  private binding(roleId: string): Row {
    const row = this.one('select * from bindings where role_id=? and is_current=1', roleId);
    if (!row) throw Error('ROLE_BINDING_NOT_FOUND');
    return row;
  }

  private active(roleId: string): Row {
    const row = this.one("select * from role_sessions where role_id=? and state='ACTIVE'", roleId);
    if (!row) throw Error('ROLE_SESSION_STATE_INVALID');
    return row;
  }

  private workspaceId(row: Row): string | null {
    if (typeof row.workspace_affinity_json !== 'string') return null;
    try {
      const parsed = JSON.parse(row.workspace_affinity_json) as { workspace_id?: unknown };
      return typeof parsed.workspace_id === 'string' ? parsed.workspace_id : null;
    } catch {
      return null;
    }
  }

  private assertCompatible(row: Row, binding: Row) {
    if (row.harness && row.harness !== binding.harness)
      throw Error('ROLE_SESSION_TARGET_HARNESS_MISMATCH');
    const workspaceId = this.workspaceId(row);
    if (workspaceId && workspaceId !== binding.workspace_id)
      throw Error('ROLE_SESSION_WORKSPACE_MISMATCH');
  }

  private safeToSwitch(roleId: string) {
    const slot = this.one('select active_run_id from role_slots where role_id=?', roleId);
    const liveRun = this.one(
      "select id from runs where role_id=? and state not in ('SUCCEEDED','FAILED','CANCELLED') limit 1",
      roleId,
    );
    const liveInitialization = this.one(
      "select id from initialization_attempts where role_id=? and state in ('STARTING','RUNNING','UNKNOWN') limit 1",
      roleId,
    );
    if (slot?.active_run_id || liveRun || liveInitialization)
      throw Error('ROLE_SESSION_SWITCH_BLOCKED');
    // F06/C3:QUEUED/WAITING_INPUT 必须先 drain/cancel,不得静默挂在旧 WS 上无法派发。
    const unfinished = this.one(
      "select id,state from tasks where assignee_role_id=? and state in ('QUEUED','WAITING_INPUT','ACTIVE','RESULT_STAGED','NEEDS_ATTENTION') limit 1",
      roleId,
    );
    if (unfinished) throw Error('ROLE_SESSION_QUEUE_NOT_DRAINED');
  }


  private activateWithinTransaction(
    roleId: string,
    sessionId: string,
    binding: Row,
    operationId: string,
    now: number,
  ): Row {
    const prior = this.one(
      "select id,role_session_id,binding_id,binding_epoch,activation_epoch from role_session_activations where role_id=? and state='ACTIVE'",
      roleId,
    );
    if (
      prior &&
      prior.role_session_id === sessionId &&
      prior.binding_id === binding.id &&
      prior.binding_epoch === binding.epoch
    )
      return prior;
    if (prior)
      this.db
        .prepare(
          "update role_session_activations set state='ENDED',ended_at_ms=? where id=? and state='ACTIVE'",
        )
        .run(now, prior.id);
    const nextEpoch =
      Number(
        this.one(
          'select coalesce(max(activation_epoch),0) as n from role_session_activations where role_id=?',
          roleId,
        )?.n ?? 0,
      ) + 1;
    const id = 'rsa_' + globalThis.crypto.randomUUID();
    this.db
      .prepare(
        "insert into role_session_activations(id,role_id,role_session_id,binding_id,binding_epoch,activation_epoch,state,operation_id,created_at_ms,activated_at_ms) values(?,?,?,?,?,?, 'ACTIVE',?,?,?)",
      )
      .run(id, roleId, sessionId, binding.id, binding.epoch, nextEpoch, operationId, now, now);
    return this.one(
      'select id,role_session_id,binding_id,binding_epoch,activation_epoch from role_session_activations where id=?',
      id,
    )!;
  }

  private vm(row: Row) {
    const fallbackBinding = row.harness ? undefined : this.binding(String(row.role_id));
    // W02:legacy fidelity 镜像停止运行时读取,恒报 UNKNOWN(历史只读,不参与新会话)。
    return {
      id: row.id,
      role_id: row.role_id,
      seq: row.seq,
      name: row.name,
      state: row.state,
      generation: row.generation,
      created_at_ms: row.created_at_ms,
      activated_at_ms: row.activated_at_ms,
      harness: row.harness ?? fallbackBinding?.harness ?? 'unknown',
      driver_id: row.driver_id ?? fallbackBinding?.harness ?? 'unknown',
      native_continuity: this.continuityOf ? this.continuityOf(String(row.harness ?? fallbackBinding?.harness ?? 'unknown')) : 'UNKNOWN',
      migration_fidelity: 'UNKNOWN' as const,
      hasNativeSession: row.native_session_ref !== null && row.native_session_ref !== undefined,
    };
  }

  private list(roleId: string) {
    this.assertRole(roleId);
    const sessions = this.rows(roleId).map((r) => this.vm(r));
    const active = sessions.find((s) => s.state === 'ACTIVE');
    return { sessions, active_session_id: active?.id ?? null };
  }

  private preflight(roleId: string, targetHarness?: string, sessionId?: string) {
    this.assertRole(roleId);
    const binding = this.binding(roleId);
    // W02:resume 候选只允许当前 ACTIVE WS;历史(ARCHIVED)会话永久只读,不再推荐续用。
    const candidate = sessionId
      ? this.one('select * from role_sessions where id=? and role_id=?', sessionId, roleId)
      : this.one(
          "select * from role_sessions where role_id=? and harness=? and state='ACTIVE' order by seq desc limit 1",
          roleId,
          targetHarness ?? String(binding.harness),
        );
    const harness = targetHarness ?? String(candidate?.harness ?? binding.harness);
    const candidateHarness = String(candidate?.harness ?? harness);
    const sameBinding = harness === binding.harness && candidateHarness === binding.harness;
    const archived = Boolean(candidate && candidate.state === 'ARCHIVED');
    const canResume = Boolean(
      candidate &&
      !archived &&
      candidate.native_session_ref &&
      sameBinding &&
      (!this.workspaceId(candidate) || this.workspaceId(candidate) === binding.workspace_id),
    );
    let reason = sessionId && !candidate ? 'ROLE_SESSION_NOT_FOUND' : 'NO_WORK_SESSION_FOR_HARNESS';
    const continuityUnsupported = Boolean(canResume && candidate && this.continuityOf?.(String(candidate.harness ?? binding.harness)) === 'SESSION_CONTINUATION_UNSUPPORTED');
    if (candidate && archived) reason = 'SESSION_ARCHIVED_READ_ONLY';
    else if (candidate && !sameBinding) reason = 'TARGET_HARNESS_REQUIRES_BINDING';
    else if (candidate && !candidate.native_session_ref) reason = 'NATIVE_SESSION_NOT_AVAILABLE';
    else if (candidate && !canResume) reason = 'WORKSPACE_AFFINITY_MISMATCH';
    else if (continuityUnsupported) reason = 'SESSION_CONTINUATION_UNSUPPORTED';
    // W02:legacy fidelity 镜像停止运行时读取;Router 不再宣称迁移保真度。
    const fidelity = 'UNKNOWN' as const;
    const result = {
      role_id: roleId,
      target_harness: harness,
      ...(sessionId ? { session_id: sessionId } : {}),
      recommended_action: canResume ? (continuityUnsupported ? 'NEEDS_NEW_WORKSESSION' : 'CONTINUE_EXISTING') : 'CREATE_NEW_INHERIT',
      resume_candidate: candidate ? this.vm(candidate) : null,
      new_session_available: true,
      migration_fidelity: fidelity,
      reason_code: continuityUnsupported ? 'SESSION_CONTINUATION_UNSUPPORTED' : canResume ? 'NATIVE_SESSION_RESUMABLE' : reason,
    };
    const hashInput = {
      role_id: roleId,
      target_harness: harness,
      session_id: sessionId ?? null,
      active_session_id:
        this.one("select id from role_sessions where role_id=? and state='ACTIVE'", roleId)?.id ??
        null,
      binding_id: binding.id,
      binding_epoch: binding.epoch,
      candidate: candidate
        ? {
            id: candidate.id,
            seq: candidate.seq,
            state: candidate.state,
            harness: candidate.harness ?? null,
            workspace_id: this.workspaceId(candidate),
            has_native_session: Boolean(candidate.native_session_ref),
          }
        : null,
      recommended_action: result.recommended_action,
      migration_fidelity: result.migration_fidelity,
    };
    return {
      ...result,
      preflight_hash: createHash('sha256').update(JSON.stringify(hashInput)).digest('hex'),
    };
  }

  private create(
    roleId: string,
    name: string,
    targetHarness: string | undefined,
    operationId: string,
    transition?: RoleSessionDispatchContext['transitionBinding'],
    contextMode: 'blank' | 'inherit' = 'blank',
  ): { session: Row } | { transfer: { op_id: string; state: string } } {
    this.assertRole(roleId);
    this.safeToSwitch(roleId);
    let binding = this.binding(roleId);
    const requestedHarness = targetHarness ?? String(binding.harness);
    // 来源永远是当前 ACTIVE WS,不从 legacy 重建长期记忆。
    // WN01/裁决1:跨 Harness 的 inherit 不再一刀切拒绝——目标 binding 切换推迟到
    // 提交事务内(transitionBindingForCommit);这里只保留非继承路径的即时切换。
    if (targetHarness && targetHarness !== binding.harness && contextMode !== 'inherit') {
      if (!transition) throw Error('ROLE_SESSION_TARGET_HARNESS_UNAVAILABLE');
      binding = transition(roleId, targetHarness);
      if (binding.harness !== targetHarness || binding.role_id !== roleId || binding.is_current !== 1) throw Error('NATIVE_BINDING_MISMATCH');
    }
    const current = this.one(
      "select * from role_sessions where role_id=? and state='ACTIVE'",
      roleId,
    );
    if (contextMode === 'inherit') {
      if (!current) throw Error('CONTEXT_EXPORT_UNSUPPORTED');
      // SH-01:门控=来源 history_export 能力 + 来源/目标双端真实接线通道;不再硬编码 false。
      const sourceHarness = String(current.harness ?? binding.harness);
      const sourceCap = this.capabilityLookup?.(sourceHarness) ?? { historyExport: 'UNKNOWN', nativeFork: 'UNKNOWN' };
      const ports = this.transferPorts;
      const sameHarnessNativeFork = sourceHarness === requestedHarness &&
        sourceCap.nativeFork === 'VERIFIED' && Boolean(ports?.get(sourceHarness)?.nativeForkTarget);
      if (!sameHarnessNativeFork &&
        !inheritSupported({
          sourceHistoryExport: sourceCap.historyExport,
          sourceExportChannel: Boolean(ports?.has(sourceHarness)),
          targetInitChannel: Boolean(ports?.has(requestedHarness)),
        })
      )
        throw Error('CONTEXT_EXPORT_UNSUPPORTED');
      if (!this.transferEngine) throw Error('CONTEXT_EXPORT_UNSUPPORTED');
      // 持久 intent(短事务);引擎在事务外异步执行导出→判定→初始化→提交。
      const now = this.clock();
      const opId = 'ctop_' + globalThis.crypto.randomUUID();
      const sourceCtx = resolveSourceExecutionContext(this.db, roleId);
      const sourceQuery: SessionHomeQuery = {
        harness: sourceHarness,
        roleId,
        side: 'source',
        workspaceId: binding.workspace_id ?? null,
        sessionId: current.id,
        profileRef: sourceCtx.profileRef,
      };
      const targetQuery: SessionHomeQuery = {
        harness: requestedHarness,
        roleId,
        side: 'target',
        workspaceId: binding.workspace_id ?? null,
        sessionId: current.id,
        profileRef: sourceHarness === requestedHarness ? sourceCtx.profileRef : null,
      };
      const sourceHome = sourceCtx.sessionHome ?? this.sessionHomeOf?.(sourceQuery) ?? null;
      const targetHome =
        this.sessionHomeOf?.(targetQuery) ?? (sourceHarness === requestedHarness ? sourceHome : null);
      this.db
        .prepare(
          "insert into context_transfer_ops(id,role_id,from_session_id,to_session_id,mode,capacity_json,state,created_at_ms,updated_at_ms) values(?,?,?,NULL,'inherit',?,'PREPARING',?,?)",
        )
        .run(
          opId,
          roleId,
          current.id,
          JSON.stringify({
            target_harness: requestedHarness,
            source_harness: sourceHarness,
            workspace_id: binding.workspace_id ?? null,
            source_session_home: sourceHome,
            target_session_home: targetHome,
            source: { ...sourceCtx, sessionHome: sourceHome },
            target: {
              harness: requestedHarness,
              roleId,
              roleSessionId: null,
              workspaceId: binding.workspace_id ?? null,
              workspacePath: sourceCtx.workspacePath,
              bindingId: sourceHarness === requestedHarness ? sourceCtx.bindingId : null,
              bindingEpoch: sourceHarness === requestedHarness ? sourceCtx.bindingEpoch : null,
              profileRef: targetQuery.profileRef,
              sessionHome: targetHome,
              nativeSessionRef: null,
            },
            name,
          }),
          now,
          now,
        );
      return { transfer: { op_id: opId, state: 'PREPARING' } };
    }
    const now = this.clock();
    const id = 'rsess_' + globalThis.crypto.randomUUID();
    return {
      session: this.db
      .transaction(() => {
        const seq =
          Number(
            this.one('select coalesce(max(seq),0) as n from role_sessions where role_id=?', roleId)
              ?.n ?? 0,
          ) + 1;
        const generation =
          Number(
            this.one(
              'select coalesce(max(generation),0) as n from role_sessions where role_id=?',
              roleId,
            )?.n ?? 0,
          ) + 1;
        if (current)
          this.db
            .prepare("update role_sessions set state='ARCHIVED' where id=? and state='ACTIVE'")
            .run(current.id);
        this.db
          .prepare(
            'insert into role_sessions(id,role_id,seq,name,state,binding_id,binding_epoch,harness,driver_id,workspace_affinity_json,native_session_ref,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            roleId,
            seq,
            name,
            'ACTIVE',
            binding.id,
            binding.epoch,
            binding.harness,
            binding.harness,
            JSON.stringify({ workspace_id: binding.workspace_id }),
            null,
            generation,
            now,
            now,
          );
        this.activateWithinTransaction(roleId, id, binding, operationId, now);
        this.onSessionCommitted?.(roleId, id);
        return this.vm(this.one('select * from role_sessions where id=?', id)!);
      })
      .immediate(),
    };
  }

  /** WC01/SH-03:引擎专用短事务提交——归档源、插入目标(带 native ref)、激活、更新授权。 */
  commitTransfer(input: {
    opId: string;
    roleId: string;
    fromSessionId: string;
    name: string;
    targetHarness: string;
    nativeSessionRef: string;
  }): { session_id: string } {
    return this.db
      .transaction(() => {
        let binding = this.binding(input.roleId);
        // WN01:目标确认后在提交事务内切换 current binding;缺回调时跨 Harness 提交显式失败。
        if (binding.harness !== input.targetHarness) {
          if (!this.transitionBindingForCommit) throw Error('CONTEXT_TARGET_BINDING_PREP_MISSING');
          binding = this.transitionBindingForCommit(input.roleId, input.targetHarness);
          if (binding.harness !== input.targetHarness || binding.role_id !== input.roleId || binding.is_current !== 1) throw Error('NATIVE_BINDING_MISMATCH');
        }
        const current = this.active(input.roleId);
        if (current.id !== input.fromSessionId) throw Error('CONTEXT_TRANSFER_RACE');
        const now = this.clock();
        const id = 'rsess_' + globalThis.crypto.randomUUID();
        const seq =
          Number(this.one('select coalesce(max(seq),0) as n from role_sessions where role_id=?', input.roleId)?.n ?? 0) + 1;
        const generation =
          Number(this.one('select coalesce(max(generation),0) as n from role_sessions where role_id=?', input.roleId)?.n ?? 0) + 1;
        this.db
          .prepare("update role_sessions set state='ARCHIVED' where id=? and state='ACTIVE'")
          .run(current.id);
        this.db
          .prepare(
            'insert into role_sessions(id,role_id,seq,name,state,binding_id,binding_epoch,harness,driver_id,workspace_affinity_json,native_session_ref,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            input.roleId,
            seq,
            input.name,
            'ACTIVE',
            binding.id,
            binding.epoch,
            binding.harness,
            binding.harness,
            JSON.stringify({ workspace_id: binding.workspace_id }),
            input.nativeSessionRef,
            generation,
            now,
            now,
          );
        this.activateWithinTransaction(input.roleId, id, binding, 'ctx_transfer_commit_' + now, now);
        this.onSessionCommitted?.(input.roleId, id);
        // 裁决1:op 终态与目标指针在同一提交事务内写入(单一原子事实)。
        this.db
          .prepare("update context_transfer_ops set state='COMMITTED',to_session_id=?,error_code=NULL,updated_at_ms=? where id=?")
          .run(id, now, input.opId);
        return { session_id: id };
      })
      .immediate();
  }

  private transferStatus(roleId: string, opId: string) {
    const op = this.one('select * from context_transfer_ops where id=?', opId);
    // CT-04:op 与请求 role 必须对应;不得凭任一角色权限枚举他角色操作。
    if (!op || String(op.role_id) !== roleId) throw Error('ROLE_SESSION_NOT_FOUND');
    const toSession = op.to_session_id
      ? this.one('select * from role_sessions where id=?', String(op.to_session_id))
      : undefined;
    return {
      op_id: op.id,
      role_id: op.role_id,
      state: op.state,
      error_code: op.error_code ?? null,
      ...(toSession ? { session: this.vm(toSession) } : {}),
    };
  }

  private switch(roleId: string, sessionId: string, operationId: string, transition?: RoleSessionDispatchContext['transitionBinding']) {
    this.assertRole(roleId);
    const target = this.one(
      'select * from role_sessions where id=? and role_id=?',
      sessionId,
      roleId,
    );
    if (!target) throw Error('ROLE_SESSION_NOT_FOUND');
    // W02 新语义:历史 WS 永久只读。ARCHIVED→ACTIVE 重新激活已删除;
    // 继续旧内容只能新建 WS(一次性 Context Transfer),不得复活旧会话。
    if (target.state !== 'ACTIVE') throw Error('ROLE_SESSION_REACTIVATION_REMOVED');
    const current = this.active(roleId);
    if (current.id !== sessionId) this.safeToSwitch(roleId);
    let binding = this.binding(roleId);
    if (target.harness && target.harness !== binding.harness) {
      if (!transition) throw Error('ROLE_SESSION_TARGET_HARNESS_UNAVAILABLE');
      binding = transition(roleId, target.harness, sessionId);
      if (binding.role_id !== roleId || binding.is_current !== 1) throw Error('NATIVE_BINDING_MISMATCH');
    }
    this.assertCompatible(target, binding);
    const now = this.clock();
    return this.db
      .transaction(() => {
        this.activateWithinTransaction(roleId, sessionId, binding, operationId, now);
        return this.vm(this.one('select * from role_sessions where id=?', sessionId)!);
      })
      .immediate();
  }

  private history(roleId: string, sessionId: string, limit: number) {
    this.assertRole(roleId);
    const session = this.one(
      'select id from role_sessions where id=? and role_id=?',
      sessionId,
      roleId,
    );
    if (!session) throw Error('ROLE_SESSION_NOT_FOUND');
    const items = this.db
      .prepare(
        'select seq,kind,title,body,state,at_ms,task_id from conversation_items where role_session_id=? order by seq limit ?',
      )
      .all(sessionId, limit);
    return { items };
  }
}
