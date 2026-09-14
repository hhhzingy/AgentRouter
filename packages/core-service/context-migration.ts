import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  assertPortableContext,
  stablePortableJson,
  type PortableContextEntry,
  type ContextSyncPlan,
  type ContextSyncReceipt,
  type RoleContextStore,
} from './role-context-store.ts';

export type ContextMigrationMode = 'DELTA' | 'FULL';
export type ContextFidelity = 'EXACT' | 'COMPRESSED' | 'PARTIAL' | 'UNKNOWN' | 'BLOCKED';
export type ContextBudgetSource = 'EXACT' | 'CATALOG' | 'ESTIMATED' | 'UNKNOWN';

export interface ContextBudgetInput {
  maxContextTokens?: number | null;
  currentUsageTokens?: number | null;
  source?: ContextBudgetSource;
  systemReserveTokens?: number;
  taskReserveTokens?: number;
  outputReserveTokens?: number;
  safetyMarginTokens?: number;
}

export interface ContextBudgetAssessment {
  status: 'FIT' | 'COMPRESS_REQUIRED' | 'BLOCKED';
  source: ContextBudgetSource;
  maxContextTokens: number | null;
  currentUsageTokens: number | null;
  reservedTokens: number;
  availableTokens: number | null;
  authoritativeTokens: number;
  portableTokens: number;
  requiredTokens: number;
  portableBudgetTokens: number | null;
  reasonCodes: readonly string[];
}

export interface CoreAuthoritativeState {
  schema_version: 'agentrouter-authoritative-state/1';
  role: Record<string, unknown>;
  project: Record<string, unknown>;
  space: Record<string, unknown>;
  charter: Record<string, unknown> | null;
  policy: Record<string, unknown> | null;
  workspace: Record<string, unknown> | null;
  binding: Record<string, unknown> | null;
  work_session: Record<string, unknown> | null;
  task: Record<string, unknown> | null;
  run: Record<string, unknown> | null;
  results: readonly Record<string, unknown>[];
  artifacts: readonly Record<string, unknown>[];
  issues: readonly Record<string, unknown>[];
  approvals: readonly Record<string, unknown>[];
}

export interface ContextCompressionBackendInput {
  roleId: string;
  entries: readonly PortableContextEntry[];
  budgetTokens: number;
  inputTokens: number;
  inputBytes: number;
}

export interface ContextCompressionResult {
  summary: unknown;
  coveredFromSeq: number;
  coveredThroughSeq: number;
  fidelity?: 'COMPRESSED' | 'PARTIAL';
}

/**
 * Compression is intentionally a narrow interface. It receives Portable Context
 * only; Core authoritative state is never passed to a compression backend.
 */
export interface ContextCompressionBackend {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  compress(input: ContextCompressionBackendInput): Promise<ContextCompressionResult>;
}

export interface ContextCompressionPolicy {
  enabled: boolean;
  allowedBackendIds?: readonly string[];
}

export interface PortableContextTransferEntry extends Omit<PortableContextEntry, 'content' | 'metadata'> {
  content: unknown;
  metadata: unknown;
  transfer_mode?: 'INLINE' | 'REFERENCE';
}

export interface ContextMigrationInput {
  roleId: string;
  targetWorkSessionId: string;
  operationId?: string;
  mode: ContextMigrationMode;
  budget: ContextBudgetInput;
  taskId?: string | null;
  runId?: string | null;
  authoritativeState?: CoreAuthoritativeState;
  compressionBackend?: ContextCompressionBackend;
  compressionPolicy?: ContextCompressionPolicy;
}

export interface ContextMigrationPreflight {
  operationId: string;
  roleId: string;
  targetWorkSessionId: string;
  mode: ContextMigrationMode;
  sync: ContextSyncPlan;
  authoritativeState: CoreAuthoritativeState;
  entries: readonly PortableContextTransferEntry[];
  budget: ContextBudgetAssessment;
  recommendation: 'FIT' | 'COMPRESS' | 'BLOCK';
  fidelity: ContextFidelity;
}

export interface ContextMigrationPlan extends ContextMigrationPreflight {
  envelope: ContextSyncEnvelope;
  compression: {
    used: boolean;
    backendId?: string;
    provider?: string;
    model?: string;
    inputHash?: string;
    outputHash?: string;
    inputTokens?: number;
    outputTokens?: number;
    inputBytes?: number;
    outputBytes?: number;
    coveredFromSeq?: number;
    coveredThroughSeq?: number;
  };
}

export interface ContextSyncEnvelope {
  type: 'AGENTROUTER_CONTEXT_SYNC';
  operation_id: string;
  stable_marker: string;
  payload_hash: string;
  mode: ContextMigrationMode;
  role_id: string;
  target_work_session_id: string;
  authoritative_state: CoreAuthoritativeState;
  portable_context: {
    fidelity: ContextFidelity;
    from_seq: number;
    through_seq: number;
    entries: readonly PortableContextTransferEntry[];
  };
}

export class ContextMigrationError extends Error {
  constructor(
    readonly code:
      | 'CONTEXT_BUDGET_UNKNOWN'
      | 'CONTEXT_MIGRATION_TOO_LARGE'
      | 'AUTHORITATIVE_STATE_TOO_LARGE'
      | 'CONTEXT_COMPRESSION_NOT_AUTHORIZED'
      | 'CONTEXT_COMPRESSION_FAILED',
    readonly detail?: string,
  ) {
    super(code);
  }
}

const INLINE_CONTEXT_BYTES = 64 * 1024;
const DEFAULT_RESERVES = Object.freeze({
  system: 1024,
  task: 1024,
  output: 4096,
  safety: 512,
});
const SENSITIVE_KEY = /(?:secret|credential|password|authorization|api[_-]?key|private[_-]?key|hidden[_-]?reasoning|\bkv\b|environment[_-]?variable)/i;

function digest(value: unknown): string {
  return createHash('sha256').update(stablePortableJson(value)).digest('hex');
}

export function estimateContextBytes(value: unknown): number {
  return Buffer.byteLength(stablePortableJson(value), 'utf8');
}

export function estimateContextTokens(value: unknown): number {
  return Math.max(1, Math.ceil(estimateContextBytes(value) / 4));
}

function json(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ensureFiniteInteger(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw Error('CONTEXT_BUDGET_INVALID:' + name);
  return value;
}

function validateBudget(input: ContextBudgetInput): Required<Pick<ContextBudgetInput, 'systemReserveTokens' | 'taskReserveTokens' | 'outputReserveTokens' | 'safetyMarginTokens'>> & ContextBudgetInput {
  const reserves = {
    systemReserveTokens: input.systemReserveTokens ?? DEFAULT_RESERVES.system,
    taskReserveTokens: input.taskReserveTokens ?? DEFAULT_RESERVES.task,
    outputReserveTokens: input.outputReserveTokens ?? DEFAULT_RESERVES.output,
    safetyMarginTokens: input.safetyMarginTokens ?? DEFAULT_RESERVES.safety,
  };
  for (const [name, value] of Object.entries(reserves)) ensureFiniteInteger(value, name);
  if (input.maxContextTokens !== undefined && input.maxContextTokens !== null)
    ensureFiniteInteger(input.maxContextTokens, 'maxContextTokens', 1);
  if (input.currentUsageTokens !== undefined && input.currentUsageTokens !== null)
    ensureFiniteInteger(input.currentUsageTokens, 'currentUsageTokens');
  return { ...input, ...reserves };
}

function collectSensitiveKeys(value: unknown, path = '$'): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = collectSensitiveKeys(value[i], path + '[' + i + ']');
      if (found) return found;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) return path + '.' + key;
    const found = collectSensitiveKeys(item, path + '.' + key);
    if (found) return found;
  }
  return null;
}

function parseRows(db: Database.Database, sql: string, ...args: unknown[]): Record<string, unknown>[] {
  return db.prepare(sql).all(...args) as Record<string, unknown>[];
}

/** Build a fresh structured snapshot. It never reads native session refs or auth secrets. */
export function readCoreAuthoritativeState(
  db: Database.Database,
  roleId: string,
  targetWorkSessionId?: string | null,
  taskId?: string | null,
  runId?: string | null,
): CoreAuthoritativeState {
  const role = db
    .prepare(
      'select r.id,r.name,r.description,r.status,r.created_at_ms,s.id as space_id,s.name as space_name,s.status as space_status,s.project_id,p.id as project_id,p.name as project_name,p.status as project_status,p.created_at_ms as project_created_at_ms from roles r join spaces s on s.id=r.space_id join projects p on p.id=s.project_id where r.id=?',
    )
    .get(roleId) as Record<string, unknown> | undefined;
  if (!role) throw Error('ROLE_NOT_FOUND');

  const charter = db
    .prepare('select id,revision,hash,policy_revision,binding_epoch,workspace_id,spec_json,permissions_json,directory_json,effective_at_ms from role_charters where role_id=? order by revision desc limit 1')
    .get(roleId) as Record<string, unknown> | undefined;
  const policy = db
    .prepare('select id,revision,protocol_version,content_json,content_hash,published_at_ms from policies where project_id=? order by revision desc limit 1')
    .get(role.project_id) as Record<string, unknown> | undefined;
  const binding = db
    .prepare('select id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,last_synced_policy_id,continuity_mode,created_at_ms from bindings where role_id=? and is_current=1')
    .get(roleId) as Record<string, unknown> | undefined;
  const sessionId = targetWorkSessionId ?? (db.prepare("select id from role_sessions where role_id=? and state='ACTIVE'").get(roleId) as { id?: string } | undefined)?.id;
  const session = sessionId
    ? (db.prepare('select id,role_id,seq,name,state,harness,driver_id,workspace_affinity_json,native_session_ref,generation,created_at_ms,activated_at_ms from role_sessions where id=? and role_id=?').get(sessionId, roleId) as Record<string, unknown> | undefined)
    : undefined;
  const task = taskId
    ? (db.prepare('select id,seq,space_id,requester_role_id,assignee_role_id,parent_task_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,acceptance,created_at_ms,updated_at_ms from tasks where id=? and assignee_role_id=?').get(taskId, roleId) as Record<string, unknown> | undefined)
    : undefined;
  const selectedRun = runId
    ? (db.prepare('select id,role_id,task_id,chain_id,kind,binding_id,binding_epoch,state,request_snapshot_json,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms from runs where id=? and role_id=?').get(runId, roleId) as Record<string, unknown> | undefined)
    : task
      ? (db.prepare('select id,role_id,task_id,chain_id,kind,binding_id,binding_epoch,state,request_snapshot_json,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms from runs where task_id=? order by created_at_ms desc limit 1').get(task.id) as Record<string, unknown> | undefined)
      : undefined;
  const selectedTask = task ?? (selectedRun?.task_id
    ? (db.prepare('select id,seq,space_id,requester_role_id,assignee_role_id,parent_task_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,acceptance,created_at_ms,updated_at_ms from tasks where id=? and assignee_role_id=?').get(selectedRun.task_id, roleId) as Record<string, unknown> | undefined)
    : undefined);

  const state: CoreAuthoritativeState = {
    schema_version: 'agentrouter-authoritative-state/1',
    role: {
      id: role.id,
      name: role.name,
      description: role.description,
      status: role.status,
      created_at_ms: role.created_at_ms,
    },
    project: {
      id: role.project_id,
      name: role.project_name,
      status: role.project_status,
      created_at_ms: role.project_created_at_ms,
    },
    space: {
      id: role.space_id,
      name: role.space_name,
      status: role.space_status,
      project_id: role.project_id,
    },
    charter: charter
      ? {
          id: charter.id,
          revision: charter.revision,
          hash: charter.hash,
          policy_revision: charter.policy_revision,
          binding_epoch: charter.binding_epoch,
          workspace_id: charter.workspace_id,
          spec: json(charter.spec_json, {}),
          effective_permissions: json(charter.permissions_json, {}),
          directory: json(charter.directory_json, []),
          effective_at_ms: charter.effective_at_ms,
        }
      : null,
    policy: policy
      ? {
          id: policy.id,
          revision: policy.revision,
          protocol_version: policy.protocol_version,
          content_hash: policy.content_hash,
          content: json(policy.content_json, {}),
          published_at_ms: policy.published_at_ms,
        }
      : null,
    workspace: binding
      ? (db.prepare('select id,project_id,display_path,canonical_path,kind,base_oid,branch_name,status from workspaces where id=?').get(binding.workspace_id) as Record<string, unknown> | undefined) ?? null
      : null,
    binding: binding
      ? {
          id: binding.id,
          role_id: binding.role_id,
          harness: binding.harness,
          workspace_id: binding.workspace_id,
          model: json(binding.model_json, {}),
          capabilities: json(binding.capability_json, {}),
          epoch: binding.epoch,
          is_current: Boolean(binding.is_current),
          last_synced_policy_id: binding.last_synced_policy_id,
          continuity_mode: binding.continuity_mode,
          created_at_ms: binding.created_at_ms,
        }
      : null,
    work_session: session
      ? {
          id: session.id,
          role_id: session.role_id,
          seq: session.seq,
          name: session.name,
          state: session.state,
          harness: session.harness ?? null,
          driver_id: session.driver_id ?? null,
          workspace_affinity: json(session.workspace_affinity_json, null),
          has_native_session: session.native_session_ref !== null && session.native_session_ref !== undefined,
          generation: session.generation,
          created_at_ms: session.created_at_ms,
          activated_at_ms: session.activated_at_ms,
        }
      : null,
    task: selectedTask
      ? {
          id: selectedTask.id,
          seq: selectedTask.seq,
          space_id: selectedTask.space_id,
          requester_role_id: selectedTask.requester_role_id ?? null,
          assignee_role_id: selectedTask.assignee_role_id,
          parent_task_id: selectedTask.parent_task_id ?? null,
          chain_id: selectedTask.chain_id,
          policy_id: selectedTask.policy_id,
          summary: selectedTask.summary,
          body: selectedTask.body,
          request: json(selectedTask.request_json, {}),
          completion: json(selectedTask.completion_json, {}),
          problem_target: json(selectedTask.problem_target_json, {}),
          state: selectedTask.state,
          acceptance: selectedTask.acceptance,
          created_at_ms: selectedTask.created_at_ms,
          updated_at_ms: selectedTask.updated_at_ms,
        }
      : null,
    run: selectedRun
      ? {
          id: selectedRun.id,
          role_id: selectedRun.role_id,
          task_id: selectedRun.task_id ?? null,
          chain_id: selectedRun.chain_id ?? null,
          kind: selectedRun.kind,
          binding_id: selectedRun.binding_id,
          binding_epoch: selectedRun.binding_epoch,
          state: selectedRun.state,
          request: json(selectedRun.request_snapshot_json, {}),
          accepted_at_ms: selectedRun.accepted_at_ms ?? null,
          settled_at_ms: selectedRun.settled_at_ms ?? null,
          exit_reason: selectedRun.exit_reason ?? null,
          created_at_ms: selectedRun.created_at_ms,
        }
      : null,
    results: selectedTask
      ? parseRows(db, 'select id,task_id,run_id,outcome,summary,body,outputs_json,publication_state,created_at_ms from results where task_id=? order by created_at_ms,id', selectedTask.id).map((result) => ({
          id: result.id,
          task_id: result.task_id,
          run_id: result.run_id,
          outcome: result.outcome,
          summary: result.summary,
          body: result.body,
          outputs: json(result.outputs_json, []),
          publication_state: result.publication_state,
          created_at_ms: result.created_at_ms,
        }))
      : [],
    artifacts: parseRows(db, 'select id,sha256,byte_size,media_type,state from artifacts where project_id=? order by created_at_ms,id', role.project_id),
    issues: parseRows(db, 'select id,space_id,role_id,task_id,run_id,code,detail_json,state,created_at_ms,resolved_at_ms from issues where role_id=? order by created_at_ms,id', roleId).map((issue) => ({
      id: issue.id,
      space_id: issue.space_id,
      role_id: issue.role_id,
      task_id: issue.task_id,
      run_id: issue.run_id,
      code: issue.code,
      detail: json(issue.detail_json, {}),
      state: issue.state,
      created_at_ms: issue.created_at_ms,
      resolved_at_ms: issue.resolved_at_ms,
    })),
    approvals: selectedRun
      ? parseRows(db, 'select id,run_id,native_request_id,state,request_json,created_at_ms,expires_at_ms,decided_at_ms from approvals where run_id=? order by created_at_ms,id', selectedRun.id).map((approval) => ({
          id: approval.id,
          run_id: approval.run_id,
          native_request_id: approval.native_request_id,
          state: approval.state,
          request: json(approval.request_json, {}),
          created_at_ms: approval.created_at_ms,
          expires_at_ms: approval.expires_at_ms,
          decided_at_ms: approval.decided_at_ms,
        }))
      : [],
  };
  const sensitivePath = collectSensitiveKeys(state);
  if (sensitivePath) throw Error('AUTHORITATIVE_STATE_FORBIDDEN_FIELD:' + sensitivePath);
  return state;
}

function inlineOrReference(entry: PortableContextEntry): PortableContextTransferEntry {
  const contentBytes = estimateContextBytes(entry.content);
  if (contentBytes <= INLINE_CONTEXT_BYTES) return { ...entry, transfer_mode: 'INLINE' };
  const preview = typeof entry.content === 'string'
    ? entry.content.slice(0, 1024)
    : object(entry.content)?.body && typeof object(entry.content)?.body === 'string'
      ? String(object(entry.content)?.body).slice(0, 1024)
      : null;
  return {
    ...entry,
    content: {
      type: 'portable-context-reference',
      reference: {
        role_id: entry.roleId,
        context_seq: entry.contextSeq,
        source_kind: entry.sourceKind,
        source_id: entry.sourceId,
        content_hash: entry.contentHash,
        byte_size: contentBytes,
      },
      preview,
      note: '完整可见内容保留在 Router append-only index；此 payload 使用引用传输。',
    },
    metadata: {
      original: entry.metadata,
      transfer_mode: 'REFERENCE',
      original_byte_size: contentBytes,
      original_content_hash: entry.contentHash,
    },
    transfer_mode: 'REFERENCE',
  };
}

export function assessContextBudget(
  mode: ContextMigrationMode,
  authoritativeState: unknown,
  entries: readonly PortableContextTransferEntry[],
  input: ContextBudgetInput,
): ContextBudgetAssessment {
  const budget = validateBudget(input);
  const max = budget.maxContextTokens ?? null;
  const usage = budget.currentUsageTokens ?? (mode === 'FULL' ? 0 : null);
  const reservedTokens =
    budget.systemReserveTokens + budget.taskReserveTokens + budget.outputReserveTokens + budget.safetyMarginTokens;
  const authoritativeTokens = estimateContextTokens(authoritativeState);
  const portableTokens = estimateContextTokens(entries);
  const requiredTokens = authoritativeTokens + portableTokens;
  const availableTokens = max === null || usage === null ? null : max - usage - reservedTokens;
  const portableBudgetTokens = availableTokens === null ? null : availableTokens - authoritativeTokens;
  const reasonCodes: string[] = [];
  if (max === null || (mode === 'DELTA' && usage === null)) {
    reasonCodes.push('TARGET_CONTEXT_BUDGET_UNKNOWN');
    return {
      status: 'BLOCKED',
      source: budget.source ?? 'UNKNOWN',
      maxContextTokens: max,
      currentUsageTokens: usage,
      reservedTokens,
      availableTokens,
      authoritativeTokens,
      portableTokens,
      requiredTokens,
      portableBudgetTokens,
      reasonCodes,
    };
  }
  if (availableTokens === null) throw Error('CONTEXT_BUDGET_INVALID');
  if (availableTokens < authoritativeTokens) {
    reasonCodes.push('AUTHORITATIVE_STATE_TOO_LARGE');
    return {
      status: 'BLOCKED',
      source: budget.source ?? 'UNKNOWN',
      maxContextTokens: max,
      currentUsageTokens: usage,
      reservedTokens,
      availableTokens,
      authoritativeTokens,
      portableTokens,
      requiredTokens,
      portableBudgetTokens,
      reasonCodes,
    };
  }
  if (requiredTokens <= availableTokens) {
    return {
      status: 'FIT',
      source: budget.source ?? 'UNKNOWN',
      maxContextTokens: max,
      currentUsageTokens: usage,
      reservedTokens,
      availableTokens,
      authoritativeTokens,
      portableTokens,
      requiredTokens,
      portableBudgetTokens,
      reasonCodes,
    };
  }
  reasonCodes.push('PORTABLE_CONTEXT_OVER_BUDGET');
  return {
    status: 'COMPRESS_REQUIRED',
    source: budget.source ?? 'UNKNOWN',
    maxContextTokens: max,
    currentUsageTokens: usage,
    reservedTokens,
    availableTokens,
    authoritativeTokens,
    portableTokens,
    requiredTokens,
    portableBudgetTokens,
    reasonCodes,
  };
}

function compressionHash(entries: readonly PortableContextEntry[]): string {
  return digest(entries.map((entry) => ({
    context_seq: entry.contextSeq,
    source_kind: entry.sourceKind,
    source_id: entry.sourceId,
    portable_kind: entry.portableKind,
    content_hash: entry.contentHash,
    content: entry.content,
    metadata: entry.metadata,
  })));
}

/** A local deterministic backend used by tests and explicitly opted-in local profiles. */
export const deterministicPortableCompressionBackend: ContextCompressionBackend = {
  id: 'local.deterministic-portable-summary',
  provider: 'local',
  model: 'portable-summary-v1',
  async compress(input) {
    if (!input.entries.length) throw Error('CONTEXT_COMPRESSION_EMPTY');
    const coveredFromSeq = Math.min(...input.entries.map((entry) => entry.contextSeq));
    const coveredThroughSeq = Math.max(...input.entries.map((entry) => entry.contextSeq));
    const inputHash = compressionHash(input.entries);
    const summary = {
      schema_version: 'agentrouter-portable-context-summary/1',
      coverage: { from_seq: coveredFromSeq, through_seq: coveredThroughSeq },
      entry_count: input.entries.length,
      source_hash: inputHash,
      note: '该摘要只压缩 Portable Context；Core authoritative state 在目标 WS 初始化时原样注入。',
    };
    if (estimateContextTokens(summary) > input.budgetTokens) throw Error('CONTEXT_COMPRESSION_OUTPUT_TOO_LARGE');
    return { summary, coveredFromSeq, coveredThroughSeq, fidelity: 'COMPRESSED' };
  },
};

export class ContextMigrationService {
  constructor(
    private readonly db: Database.Database,
    private readonly store: RoleContextStore,
    private readonly clock = () => Date.now(),
  ) {}

  private operationId(input: ContextMigrationInput): string {
    return input.operationId ?? 'ctx_' + randomUUID();
  }

  private sync(input: ContextMigrationInput, operationId: string): ContextSyncPlan {
    return input.mode === 'FULL'
      ? this.store.planFull(input.roleId, input.targetWorkSessionId, operationId)
      : this.store.planDelta(input.roleId, input.targetWorkSessionId, operationId);
  }

  preflight(input: ContextMigrationInput): ContextMigrationPreflight {
    const operationId = this.operationId(input);
    const sync = this.sync(input, operationId);
    const authoritativeState = input.authoritativeState ?? readCoreAuthoritativeState(this.db, input.roleId, input.targetWorkSessionId, input.taskId, input.runId);
    assertPortableContext(authoritativeState);
    const entries = sync.entries.map(inlineOrReference);
    const budget = assessContextBudget(input.mode, authoritativeState, entries, input.budget);
    const recommendation = budget.status === 'FIT' ? 'FIT' : budget.status === 'COMPRESS_REQUIRED' ? 'COMPRESS' : 'BLOCK';
    return {
      operationId,
      roleId: input.roleId,
      targetWorkSessionId: input.targetWorkSessionId,
      mode: input.mode,
      sync,
      authoritativeState,
      entries,
      budget,
      recommendation,
      fidelity: recommendation === 'FIT' ? 'EXACT' : recommendation === 'COMPRESS' ? 'COMPRESSED' : 'BLOCKED',
    };
  }

  private projectId(roleId: string): string | null {
    return (this.db.prepare('select s.project_id from roles r join spaces s on s.id=r.space_id where r.id=?').get(roleId) as { project_id?: string } | undefined)?.project_id ?? null;
  }

  private audit(roleId: string, detail: Record<string, unknown>) {
    const projectId = this.projectId(roleId);
    this.db.prepare('insert into application_audit(project_id,actor,kind,detail_json,at_ms) values(?,?,?,?,?)').run(
      projectId,
      'context_continuity',
      'ContextCompression',
      stablePortableJson(detail),
      this.clock(),
    );
  }

  async build(input: ContextMigrationInput): Promise<ContextMigrationPlan> {
    const preflight = this.preflight(input);
    if (preflight.recommendation === 'BLOCK') {
      this.audit(preflight.roleId, {
        status: 'BLOCKED',
        reason_codes: preflight.budget.reasonCodes,
        mode: preflight.mode,
        target_work_session_id: preflight.targetWorkSessionId,
        from_seq: preflight.sync.fromSeq,
        through_seq: preflight.sync.throughSeq,
        authoritative_tokens: preflight.budget.authoritativeTokens,
        portable_tokens: preflight.budget.portableTokens,
      });
      if (preflight.budget.reasonCodes.includes('AUTHORITATIVE_STATE_TOO_LARGE'))
        throw new ContextMigrationError('AUTHORITATIVE_STATE_TOO_LARGE');
      throw new ContextMigrationError('CONTEXT_BUDGET_UNKNOWN');
    }

    let entries = [...preflight.entries];
    let fidelity: ContextFidelity = preflight.fidelity;
    const compression: ContextMigrationPlan['compression'] = { used: false };
    if (preflight.recommendation === 'COMPRESS') {
      const backend = input.compressionBackend;
      const policy = input.compressionPolicy ?? { enabled: false };
      if (!backend || !policy.enabled || (policy.allowedBackendIds && !policy.allowedBackendIds.includes(backend.id))) {
        this.audit(preflight.roleId, {
          status: 'BLOCKED',
          reason: 'CONTEXT_MIGRATION_TOO_LARGE',
          reason_codes: preflight.budget.reasonCodes,
          mode: preflight.mode,
          target_work_session_id: preflight.targetWorkSessionId,
          from_seq: preflight.sync.fromSeq,
          through_seq: preflight.sync.throughSeq,
          input_tokens: preflight.budget.portableTokens,
          input_bytes: estimateContextBytes(preflight.entries),
        });
        throw new ContextMigrationError('CONTEXT_MIGRATION_TOO_LARGE');
      }
      const originalEntries = preflight.sync.entries;
      const inputTokens = estimateContextTokens(originalEntries);
      const inputBytes = estimateContextBytes(originalEntries);
      let result: ContextCompressionResult;
      try {
        result = await backend.compress({
          roleId: preflight.roleId,
          entries: originalEntries,
          budgetTokens: preflight.budget.portableBudgetTokens!,
          inputTokens,
          inputBytes,
        });
        assertPortableContext(result.summary);
      } catch (error) {
        this.audit(preflight.roleId, {
          status: 'FAILED',
          reason: error instanceof Error ? error.message : 'CONTEXT_COMPRESSION_FAILED',
          backend_id: backend.id,
          provider: backend.provider,
          model: backend.model,
          from_seq: preflight.sync.fromSeq,
          through_seq: preflight.sync.throughSeq,
          input_tokens: inputTokens,
          input_bytes: inputBytes,
        });
        throw new ContextMigrationError('CONTEXT_COMPRESSION_FAILED');
      }
      const outputTokens = estimateContextTokens(result.summary);
      if (outputTokens > preflight.budget.portableBudgetTokens!) {
        this.audit(preflight.roleId, {
          status: 'FAILED',
          reason: 'CONTEXT_COMPRESSION_OUTPUT_TOO_LARGE',
          backend_id: backend.id,
          provider: backend.provider,
          model: backend.model,
          from_seq: result.coveredFromSeq,
          through_seq: result.coveredThroughSeq,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          input_bytes: inputBytes,
          output_bytes: estimateContextBytes(result.summary),
        });
        throw new ContextMigrationError('CONTEXT_COMPRESSION_FAILED', 'output-too-large');
      }
      const summaryEntry: PortableContextTransferEntry = {
        roleId: preflight.roleId,
        contextSeq: result.coveredThroughSeq,
        sourceWorkSessionId: null,
        sourceKind: 'context_compression',
        sourceId: preflight.operationId,
        portableKind: 'SUMMARY',
        contentHash: digest(result.summary),
        content: result.summary,
        metadata: {
          transfer_mode: 'COMPRESSED',
          covered_from_seq: result.coveredFromSeq,
          covered_through_seq: result.coveredThroughSeq,
          backend_id: backend.id,
        },
        createdAtMs: this.clock(),
        transfer_mode: 'INLINE',
      };
      entries = [summaryEntry];
      fidelity = result.fidelity ?? 'COMPRESSED';
      Object.assign(compression, {
        used: true,
        backendId: backend.id,
        provider: backend.provider,
        model: backend.model,
        inputHash: compressionHash(originalEntries),
        outputHash: digest(result.summary),
        inputTokens,
        outputTokens,
        inputBytes,
        outputBytes: estimateContextBytes(result.summary),
        coveredFromSeq: result.coveredFromSeq,
        coveredThroughSeq: result.coveredThroughSeq,
      });
      this.audit(preflight.roleId, {
        status: 'SUCCEEDED',
        backend_id: backend.id,
        provider: backend.provider,
        model: backend.model,
        from_seq: result.coveredFromSeq,
        through_seq: result.coveredThroughSeq,
        input_hash: compression.inputHash,
        output_hash: compression.outputHash,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        input_bytes: inputBytes,
        output_bytes: estimateContextBytes(result.summary),
      });
    }

    this.store.prepare(preflight.sync);
    const envelope: ContextSyncEnvelope = {
      type: 'AGENTROUTER_CONTEXT_SYNC',
      operation_id: preflight.operationId,
      stable_marker: preflight.sync.stableMarker,
      payload_hash: preflight.sync.payloadHash,
      mode: preflight.mode,
      role_id: preflight.roleId,
      target_work_session_id: preflight.targetWorkSessionId,
      authoritative_state: preflight.authoritativeState,
      portable_context: {
        fidelity,
        from_seq: preflight.sync.fromSeq,
        through_seq: preflight.sync.throughSeq,
        entries,
      },
    };
    assertPortableContext(envelope);
    return { ...preflight, entries, fidelity, envelope, compression };
  }

  confirm(plan: ContextMigrationPlan, nativeReceipt: unknown, nativeHistoryCursor?: unknown): ContextSyncReceipt {
    return this.store.confirm(plan.operationId, nativeReceipt, plan.fidelity, nativeHistoryCursor);
  }
}
