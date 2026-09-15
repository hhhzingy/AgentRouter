import { createHash } from 'node:crypto';
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

export class RoleSessionExtension {
  constructor(
    private readonly db: import('better-sqlite3').Database,
    private readonly clock = () => Date.now(),
  ) {}

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
          result = {
            session: this.create(
              String(p.role_id),
              String(p.name),
              p.target_harness as string | undefined,
              operationId,
            ),
          };
        } else if (method === 'roleSession.switch') {
          if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
          context.assertControllerLease(frame.lease_id!);
          if (!switchParams(p)) throw Error('INVALID_PARAMS');
          if (metadata)
            this.assertPreflightHash(
              metadata,
              this.preflight(String(p.role_id), undefined, String(p.session_id)),
            );
          result = this.switch(String(p.role_id), String(p.session_id), operationId);
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
  }

  private ensureContextRows(roleId: string, sessionId: string, now: number) {
    this.db
      .prepare(
        'insert or ignore into role_context_heads(role_id,head_seq,updated_at_ms) values(?,0,?)',
      )
      .run(roleId, now);
    this.db
      .prepare(
        "insert or ignore into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values(?,?,0,'UNKNOWN',?)",
      )
      .run(sessionId, roleId, now);
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
    const state = this.one(
      'select fidelity from role_session_context_state where role_session_id=?',
      row.id,
    );
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
      migration_fidelity: state?.fidelity ?? 'UNKNOWN',
      hasNativeSession: row.native_session_ref !== null && row.native_session_ref !== undefined,
    };
  }

  private list(roleId: string) {
    this.assertRole(roleId);
    const sessions = this.rows(roleId).map((r) => this.vm(r));
    const active = sessions.find((s) => s.state === 'ACTIVE');
    if (!active) throw Error('ROLE_SESSION_STATE_INVALID');
    return { sessions, active_session_id: active.id };
  }

  private preflight(roleId: string, targetHarness?: string, sessionId?: string) {
    this.assertRole(roleId);
    const binding = this.binding(roleId);
    const candidate = sessionId
      ? this.one('select * from role_sessions where id=? and role_id=?', sessionId, roleId)
      : this.one(
          'select * from role_sessions where role_id=? and harness=? order by seq desc limit 1',
          roleId,
          targetHarness ?? String(binding.harness),
        );
    const harness = targetHarness ?? String(candidate?.harness ?? binding.harness);
    const candidateHarness = String(candidate?.harness ?? harness);
    const sameBinding = harness === binding.harness && candidateHarness === binding.harness;
    const canResume = Boolean(
      candidate?.native_session_ref &&
      sameBinding &&
      (!this.workspaceId(candidate) || this.workspaceId(candidate) === binding.workspace_id),
    );
    let reason = sessionId && !candidate ? 'ROLE_SESSION_NOT_FOUND' : 'NO_WORK_SESSION_FOR_HARNESS';
    if (candidate && !sameBinding) reason = 'TARGET_HARNESS_REQUIRES_BINDING';
    else if (candidate && !candidate.native_session_ref) reason = 'NATIVE_SESSION_NOT_AVAILABLE';
    else if (candidate && !canResume) reason = 'WORKSPACE_AFFINITY_MISMATCH';
    const state = candidate
      ? this.one(
          'select fidelity from role_session_context_state where role_session_id=?',
          candidate.id,
        )
      : undefined;
    const result = {
      role_id: roleId,
      target_harness: harness,
      ...(sessionId ? { session_id: sessionId } : {}),
      recommended_action: canResume ? 'CONTINUE_EXISTING' : 'CREATE_NEW_INHERIT',
      resume_candidate: candidate ? this.vm(candidate) : null,
      new_session_available: true,
      migration_fidelity: state?.fidelity ?? 'UNKNOWN',
      reason_code: canResume ? 'NATIVE_SESSION_RESUMABLE' : reason,
    };
    const hashInput = {
      role_id: roleId,
      target_harness: harness,
      session_id: sessionId ?? null,
      active_session_id: this.active(roleId).id,
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
  ) {
    this.assertRole(roleId);
    this.safeToSwitch(roleId);
    const binding = this.binding(roleId);
    if (targetHarness && targetHarness !== binding.harness)
      throw Error('ROLE_SESSION_TARGET_HARNESS_REQUIRES_BINDING');
    const current = this.active(roleId);
    const now = this.clock();
    const id = 'rsess_' + globalThis.crypto.randomUUID();
    return this.db
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
        this.ensureContextRows(roleId, id, now);
        this.activateWithinTransaction(roleId, id, binding, operationId, now);
        return this.vm(this.one('select * from role_sessions where id=?', id)!);
      })
      .immediate();
  }

  private switch(roleId: string, sessionId: string, operationId: string) {
    this.assertRole(roleId);
    this.safeToSwitch(roleId);
    const target = this.one(
      'select * from role_sessions where id=? and role_id=?',
      sessionId,
      roleId,
    );
    if (!target) throw Error('ROLE_SESSION_NOT_FOUND');
    const binding = this.binding(roleId);
    this.assertCompatible(target, binding);
    if (target.state === 'ACTIVE') {
      const now = this.clock();
      return this.db
        .transaction(() => {
          this.ensureContextRows(roleId, sessionId, now);
          this.activateWithinTransaction(roleId, sessionId, binding, operationId, now);
          return this.vm(this.one('select * from role_sessions where id=?', sessionId)!);
        })
        .immediate();
    }
    const current = this.active(roleId);
    const now = this.clock();
    return this.db
      .transaction(() => {
        const generation =
          Number(
            this.one(
              'select coalesce(max(generation),0) as n from role_sessions where role_id=?',
              roleId,
            )?.n ?? 0,
          ) + 1;
        this.db
          .prepare("update role_sessions set state='ARCHIVED' where id=? and state='ACTIVE'")
          .run(current.id);
        this.db
          .prepare(
            "update role_sessions set state='ACTIVE',generation=?,activated_at_ms=? where id=?",
          )
          .run(generation, now, target.id);
        this.ensureContextRows(roleId, sessionId, now);
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
