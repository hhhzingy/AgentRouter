import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export type PortableContextKind =
  | 'USER_MESSAGE'
  | 'ASSISTANT_MESSAGE'
  | 'NOTICE'
  | 'ROUTE_TASK'
  | 'ROUTE_RESULT'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'HISTORY_VISIBLE'
  | 'ARTIFACT_REF'
  | 'SUMMARY';

export interface AppendPortableContextInput {
  roleId: string;
  sourceWorkSessionId?: string | null;
  sourceKind: string;
  sourceId: string;
  portableKind: PortableContextKind;
  content: unknown;
  metadata?: unknown;
  createdAtMs?: number;
}

export interface PortableContextEntry {
  roleId: string;
  contextSeq: number;
  sourceWorkSessionId: string | null;
  sourceKind: string;
  sourceId: string;
  portableKind: PortableContextKind;
  contentHash: string;
  content: unknown;
  metadata: unknown;
  createdAtMs: number;
}

export interface ContextSyncReceipt {
  operationId: string;
  roleId: string;
  targetWorkSessionId: string;
  fromSeq: number;
  throughSeq: number;
  payloadHash: string;
  stableMarker: string;
  state: 'PREPARED' | 'CONFIRMED' | 'FAILED';
  nativeReceipt?: unknown;
  fidelity: 'EXACT' | 'COMPRESSED' | 'PARTIAL' | 'UNKNOWN' | 'BLOCKED';
}

export interface ContextSyncPlan {
  roleId: string;
  targetWorkSessionId: string;
  fromSeq: number;
  throughSeq: number;
  entries: PortableContextEntry[];
  payloadHash: string;
  stableMarker: string;
  operationId: string;
  mode: 'DELTA' | 'FULL';
}

const FORBIDDEN_KEY = /(?:secret|credential|password|authorization|api[_-]?key|private[_-]?key|hidden[_-]?reasoning|\bkv\b|environment[_-]?variable)/i;
export const MAX_PORTABLE_JSON_BYTES = 1024 * 1024;

export function stablePortableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stablePortableJson).join(',') + ']';
  const object = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + stablePortableJson(object[key]))
      .join(',') +
    '}'
  );
}

export function assertPortableContext(value: unknown, path = '$') {
  if (typeof value === 'function' || typeof value === 'symbol' || value === undefined)
    throw Error('PORTABLE_CONTEXT_INVALID');
  if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > MAX_PORTABLE_JSON_BYTES)
    throw Error('PORTABLE_CONTEXT_TOO_LARGE');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPortableContext(item, path + '[' + index + ']'));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) throw Error('PORTABLE_CONTEXT_FORBIDDEN_FIELD');
    assertPortableContext(item, path + '.' + key);
  }
  if (Buffer.byteLength(stablePortableJson(value), 'utf8') > MAX_PORTABLE_JSON_BYTES)
    throw Error('PORTABLE_CONTEXT_TOO_LARGE');
}

const stable = stablePortableJson;
const assertPortable = assertPortableContext;

function nativeMarker(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const marker = (value as Record<string, unknown>).marker;
  return typeof marker === 'string' ? marker : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw Error('PORTABLE_CONTEXT_CORRUPT');
  }
}

export class RoleContextStore {
  constructor(
    private readonly db: Database.Database,
    private readonly clock = () => Date.now(),
  ) {}

  private one(sql: string, ...args: unknown[]): any {
    return this.db.prepare(sql).get(...args) as any;
  }

  private all(sql: string, ...args: unknown[]): any[] {
    return this.db.prepare(sql).all(...args) as any[];
  }

  private ensureRole(roleId: string, now = this.clock()) {
    if (!this.one('select id from roles where id=?', roleId)) throw Error('ROLE_NOT_FOUND');
    this.db
      .prepare('insert into role_context_heads(role_id,head_seq,updated_at_ms) values(?,?,?) on conflict(role_id) do nothing')
      .run(roleId, 0, now);
  }

  private ensureSession(roleId: string, sessionId: string | null | undefined, now = this.clock()) {
    if (!sessionId) return;
    const session = this.one('select id,role_id,activated_at_ms from role_sessions where id=?', sessionId);
    if (!session || session.role_id !== roleId) throw Error('ROLE_SESSION_NOT_FOUND');
    this.db
      .prepare(
        "insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values(?,?,0,'UNKNOWN',?) on conflict(role_session_id) do nothing",
      )
      .run(sessionId, roleId, now);
  }

  private decode(row: any): PortableContextEntry {
    return {
      roleId: row.role_id,
      contextSeq: Number(row.context_seq),
      sourceWorkSessionId: row.source_work_session_id ?? null,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      portableKind: row.portable_kind,
      contentHash: row.content_hash,
      content: parseJson(row.content_json),
      metadata: parseJson(row.metadata_json),
      createdAtMs: Number(row.created_at_ms),
    };
  }

  append(input: AppendPortableContextInput): { inserted: boolean; contextSeq: number; contentHash: string } {
    assertPortable(input.content);
    assertPortable(input.metadata ?? {});
    if (!input.roleId || !input.sourceKind || !input.sourceId || !input.portableKind)
      throw Error('PORTABLE_CONTEXT_INVALID');
    const contentJson = stable(input.content);
    const metadataJson = stable(input.metadata ?? {});
    const contentHash = createHash('sha256').update(contentJson).digest('hex');
    const now = input.createdAtMs ?? this.clock();
    const write = () => {
        this.ensureRole(input.roleId, now);
        this.ensureSession(input.roleId, input.sourceWorkSessionId, now);
        const existing = this.one(
          'select context_seq,content_hash from role_context_entries where role_id=? and source_kind=? and source_id=? and portable_kind=? and content_hash=?',
          input.roleId,
          input.sourceKind,
          input.sourceId,
          input.portableKind,
          contentHash,
        );
        if (existing)
          return { inserted: false, contextSeq: Number(existing.context_seq), contentHash };
        const head = this.one('select head_seq from role_context_heads where role_id=?', input.roleId);
        const contextSeq = Number(head?.head_seq ?? 0) + 1;
        this.db
          .prepare(
            'insert into role_context_entries(role_id,context_seq,source_work_session_id,source_kind,source_id,portable_kind,content_hash,content_json,metadata_json,created_at_ms) values(?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            input.roleId,
            contextSeq,
            input.sourceWorkSessionId ?? null,
            input.sourceKind,
            input.sourceId,
            input.portableKind,
            contentHash,
            contentJson,
            metadataJson,
            now,
          );
        this.db
          .prepare('update role_context_heads set head_seq=?,updated_at_ms=? where role_id=? and head_seq<?')
          .run(contextSeq, now, input.roleId, contextSeq);
        return { inserted: true, contextSeq, contentHash };
      };
    // Coordinator may append visible context while its event transaction is open.
    // Reuse that transaction instead of attempting an unsupported nested BEGIN.
    return this.db.inTransaction ? write() : this.db.transaction(write).immediate();
  }

  appendConversation(input: {
    roleId: string;
    sourceWorkSessionId?: string | null;
    sourceId: string;
    kind: PortableContextKind;
    title: string;
    body: string;
    state?: string;
    taskId?: string | null;
    runId?: string | null;
    atMs?: number;
  }) {
    // F13:兼容表写入入口。运行时 sendUserInput/syncConversation/coordinator 已停止调用；
    // 仅显式迁移/测试保留。人类历史仍写 conversation_items。
    return this.append({
      roleId: input.roleId,
      sourceWorkSessionId: input.sourceWorkSessionId,
      sourceKind: 'conversation',
      sourceId: input.sourceId,
      portableKind: input.kind,
      content: {
        title: input.title,
        body: input.body,
        state: input.state ?? 'VISIBLE',
        task_id: input.taskId ?? null,
        run_id: input.runId ?? null,
        at_ms: input.atMs ?? this.clock(),
      },
      metadata: { visible: true },
      createdAtMs: input.atMs,
    });
  }

  head(roleId: string): number {
    this.ensureRole(roleId);
    return Number(this.one('select head_seq from role_context_heads where role_id=?', roleId)?.head_seq ?? 0);
  }

  state(roleSessionId: string): {
    roleId: string;
    syncedThroughSeq: number;
    nativeHistoryCursor: unknown;
    fidelity: ContextSyncReceipt['fidelity'];
  } {
    const row = this.one(
      'select role_id,synced_through_seq,native_history_cursor_json,fidelity from role_session_context_state where role_session_id=?',
      roleSessionId,
    );
    if (!row) throw Error('ROLE_SESSION_CONTEXT_STATE_NOT_FOUND');
    return {
      roleId: row.role_id,
      syncedThroughSeq: Number(row.synced_through_seq),
      nativeHistoryCursor: row.native_history_cursor_json ? parseJson(row.native_history_cursor_json) : null,
      fidelity: row.fidelity,
    };
  }

  entries(roleId: string, fromSeq: number, throughSeq: number, targetWorkSessionId?: string | null) {
    if (!Number.isSafeInteger(fromSeq) || !Number.isSafeInteger(throughSeq) || fromSeq < 0 || throughSeq < fromSeq)
      throw Error('CONTEXT_CURSOR_INVALID');
    return this.all(
      'select * from role_context_entries where role_id=? and context_seq>? and context_seq<=? and (source_work_session_id is null or source_work_session_id is not ?) order by context_seq',
      roleId,
      fromSeq,
      throughSeq,
      targetWorkSessionId ?? null,
    ).map((row) => this.decode(row));
  }

  private payloadHash(plan: {
    roleId: string;
    targetWorkSessionId: string;
    fromSeq: number;
    throughSeq: number;
    entries: PortableContextEntry[];
  }) {
    return createHash('sha256')
      .update(
        stable({
          role_id: plan.roleId,
          target_work_session_id: plan.targetWorkSessionId,
          from_seq: plan.fromSeq,
          through_seq: plan.throughSeq,
          entries: plan.entries.map((entry) => ({
            context_seq: entry.contextSeq,
            source_kind: entry.sourceKind,
            source_id: entry.sourceId,
            portable_kind: entry.portableKind,
            content_hash: entry.contentHash,
          })),
        }),
      )
      .digest('hex');
  }

  planDelta(roleId: string, targetWorkSessionId: string, operationId: string): ContextSyncPlan {
    const state = this.state(targetWorkSessionId);
    if (state.roleId !== roleId) throw Error('ROLE_SESSION_NOT_FOUND');
    const throughSeq = this.head(roleId);
    const entries = this.entries(roleId, state.syncedThroughSeq, throughSeq, targetWorkSessionId);
    const payloadHash = this.payloadHash({ roleId, targetWorkSessionId, fromSeq: state.syncedThroughSeq, throughSeq, entries });
    return {
      roleId,
      targetWorkSessionId,
      fromSeq: state.syncedThroughSeq,
      throughSeq,
      entries,
      payloadHash,
      stableMarker: `AGENTROUTER_CONTEXT_SYNC:${operationId}:${payloadHash}`,
      operationId,
      mode: 'DELTA',
    };
  }

  planFull(roleId: string, targetWorkSessionId: string, operationId: string): ContextSyncPlan {
    const state = this.state(targetWorkSessionId);
    if (state.roleId !== roleId) throw Error('ROLE_SESSION_NOT_FOUND');
    const throughSeq = this.head(roleId);
    const entries = this.entries(roleId, 0, throughSeq, targetWorkSessionId);
    const payloadHash = this.payloadHash({ roleId, targetWorkSessionId, fromSeq: 0, throughSeq, entries });
    return {
      roleId,
      targetWorkSessionId,
      fromSeq: 0,
      throughSeq,
      entries,
      payloadHash,
      stableMarker: `AGENTROUTER_CONTEXT_SYNC:${operationId}:${payloadHash}`,
      operationId,
      mode: 'FULL',
    };
  }

  prepare(plan: ContextSyncPlan): ContextSyncReceipt {
    const now = this.clock();
    return this.db
      .transaction(() => {
        const existing = this.one('select * from role_context_sync_receipts where operation_id=?', plan.operationId);
        if (existing) {
          if (existing.payload_hash !== plan.payloadHash || existing.target_work_session_id !== plan.targetWorkSessionId)
            throw Error('CONTEXT_SYNC_OPERATION_CONFLICT');
          return this.receipt(existing);
        }
        this.db
          .prepare(
            "insert into role_context_sync_receipts(operation_id,role_id,target_work_session_id,from_seq,through_seq,payload_hash,stable_marker,state,created_at_ms) values(?,?,?,?,?,?,?,'PREPARED',?)",
          )
          .run(plan.operationId, plan.roleId, plan.targetWorkSessionId, plan.fromSeq, plan.throughSeq, plan.payloadHash, plan.stableMarker, now);
        return this.receipt(this.one('select * from role_context_sync_receipts where operation_id=?', plan.operationId));
      })
      .immediate();
  }

  confirm(
    operationId: string,
    nativeReceipt: unknown,
    fidelity: ContextSyncReceipt['fidelity'] = 'EXACT',
    nativeHistoryCursor?: unknown,
  ): ContextSyncReceipt {
    assertPortable(nativeReceipt);
    const now = this.clock();
    return this.db
      .transaction(() => {
        const row = this.one('select * from role_context_sync_receipts where operation_id=?', operationId);
        if (!row) throw Error('CONTEXT_SYNC_OPERATION_NOT_FOUND');
        if (row.state === 'CONFIRMED') return this.receipt(row);
        if (row.state === 'FAILED') throw Error('CONTEXT_SYNC_OPERATION_FAILED');
        if (nativeMarker(nativeReceipt) !== row.stable_marker) throw Error('CONTEXT_SYNC_MARKER_MISMATCH');
        const state = this.one('select * from role_session_context_state where role_session_id=?', row.target_work_session_id);
        if (!state) throw Error('ROLE_SESSION_CONTEXT_STATE_NOT_FOUND');
        const cursorJson = nativeHistoryCursor === undefined ? state.native_history_cursor_json : stable(nativeHistoryCursor);
        this.db
          .prepare('update role_context_sync_receipts set state=\'CONFIRMED\',native_receipt_json=?,confirmed_at_ms=? where operation_id=? and state=\'PREPARED\'')
          .run(stable(nativeReceipt), now, operationId);
        this.db
          .prepare('update role_session_context_state set synced_through_seq=max(synced_through_seq,?),native_history_cursor_json=?,fidelity=?,updated_at_ms=? where role_session_id=?')
          .run(row.through_seq, cursorJson, fidelity, now, row.target_work_session_id);
        return this.receipt(this.one('select * from role_context_sync_receipts where operation_id=?', operationId));
      })
      .immediate();
  }

  reconcile(operationId: string, nativeMarkers: readonly string[]): ContextSyncReceipt | undefined {
    const row = this.one('select * from role_context_sync_receipts where operation_id=?', operationId);
    if (!row) return undefined;
    if (row.state === 'CONFIRMED') return this.receipt(row);
    if (nativeMarkers.includes(row.stable_marker)) return this.confirm(operationId, { marker: row.stable_marker }, 'EXACT');
    return this.receipt(row);
  }

  private receipt(row: any): ContextSyncReceipt {
    const state = this.one(
      'select fidelity from role_session_context_state where role_session_id=?',
      row.target_work_session_id,
    );
    return {
      operationId: row.operation_id,
      roleId: row.role_id,
      targetWorkSessionId: row.target_work_session_id,
      fromSeq: Number(row.from_seq),
      throughSeq: Number(row.through_seq),
      payloadHash: row.payload_hash,
      stableMarker: row.stable_marker,
      state: row.state,
      nativeReceipt: row.native_receipt_json ? parseJson(row.native_receipt_json) : undefined,
      fidelity: row.state === 'CONFIRMED' ? (state?.fidelity ?? 'UNKNOWN') : 'UNKNOWN',
    };
  }
}
