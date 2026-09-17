import { createHash } from 'node:crypto';
import { decideTransfer, type TransferDecision } from './context-transfer.ts';

/** WC01/SH-03:一次性 Context Transfer 引擎。
 * 持久 intent(context_transfer_ops)→导出→容量判定→(受控压缩)→目标初始化→短事务提交。
 * 网络调用一律在 DB 事务外;提交只做归档源/插入激活目标/授权更新的短写事务。
 * 目标未确认(响应未知)时停在 SEEDED,可由 restart resume 走 confirm,不自动重复创建。
 * 临时 payload 只在内存,成功/失败即弃;ops 行与 hash/审计保留。 */

export interface TransferDriverPort {
  /** 来源 FULL_VISIBLE 导出;truncated=true 必须如实上报 */
  exportContext(input: { harness: string; nativeSessionRef: string }): Promise<{ text: string; truncated: boolean }>;
  /** 目标新会话初始化:注入 seed 并等待该目标侧受控确认(非用户 Task/Result) */
  initializeTarget(input: { harness: string; seedText: string; workspaceId: string | null }): Promise<{ nativeSessionRef: string; confirmed: boolean }>;
  /** SEEDED 恢复时的确认(崩溃/重启后按持久引用核对,不重复创建) */
  confirmTarget(input: { harness: string; nativeSessionRef: string }): Promise<{ confirmed: boolean }>;
  targetWindowTokens?(input: { harness: string }): Promise<number | null>;
  sourceCapacity?(input: { harness: string; nativeSessionRef: string }): Promise<{ windowTokens: number | null; usageTokens: number | null }>;
  /** 受控源侧压缩(单一授权 profile);无此通道则 COMPRESS 决策显式失败 */
  compressSource?(input: { text: string; maxTokens: number }): Promise<{ text: string; truncated: boolean }>;
}

export interface TransferEngineDeps {
  db: import('better-sqlite3').Database;
  ports: ReadonlyMap<string, TransferDriverPort>;
  clock?: () => number;
  schedule?: (fn: () => void) => void;
  /** 短事务提交(由 RoleSessionExtension 提供,持有 WS/激活/授权 SQL) */
  commit: (input: { opId: string; roleId: string; fromSessionId: string; name: string; targetHarness: string; nativeSessionRef: string }) => { session_id: string };
  /** 提交后通知(恢复派发/踢协调器) */
  onSettled?: (roleId: string) => void;
}

type Row = Record<string, any>;
const ACTIVE_STATES = "('PREPARING','EXPORTED','SEEDED')";
const metaOf = (row: Row): Record<string, any> => {
  try { return JSON.parse(row.capacity_json ?? '{}') ?? {}; } catch { return {}; }
};

export class ContextTransferEngine {
  private readonly clock: () => number;
  private readonly schedule: (fn: () => void) => void;
  constructor(private readonly deps: TransferEngineDeps) {
    this.clock = deps.clock ?? (() => Date.now());
    this.schedule = deps.schedule ?? ((fn) => setImmediate(fn));
  }
  private one(sql: string, ...args: unknown[]): Row | undefined {
    return this.deps.db.prepare(sql).get(...args) as Row | undefined;
  }
  /** 协调器派发暂停检查:该 Role 存在未完成 transfer 时不得派发新业务。 */
  hasActive(roleId: string): boolean {
    return Boolean(
      this.one(`select id from context_transfer_ops where role_id=? and state in ${ACTIVE_STATES} limit 1`, roleId),
    );
  }
  op(opId: string): Row | undefined {
    return this.one('select * from context_transfer_ops where id=?', opId);
  }
  /** 由 RoleSessionExtension.create(inherit) 在短事务里登记 intent 后调用;执行在请求事务之外。 */
  enqueue(opId: string): void {
    this.schedule(() => { void this.run(opId).catch(() => {}); });
  }
  private fail(opId: string, code: string): void {
    this.deps.db
      .prepare("update context_transfer_ops set state='FAILED',error_code=?,updated_at_ms=? where id=? and state not in ('COMMITTED','FAILED','CANCELLED')")
      .run(code, this.clock(), opId);
  }
  private setMeta(opId: string, patch: Record<string, unknown>): void {
    const row = this.op(opId);
    if (!row) return;
    const meta = { ...metaOf(row), ...patch };
    this.deps.db
      .prepare('update context_transfer_ops set capacity_json=?,updated_at_ms=? where id=?')
      .run(JSON.stringify(meta), this.clock(), opId);
  }
  async run(opId: string): Promise<void> {
    const op = this.op(opId);
    if (!op || op.state !== 'PREPARING') return;
    const meta = metaOf(op);
    const targetHarness = String(meta.target_harness ?? '');
    const sourceHarness = String(meta.source_harness ?? targetHarness);
    const sourcePort = this.deps.ports.get(sourceHarness);
    const targetPort = this.deps.ports.get(targetHarness);
    if (!sourcePort || !targetPort) { this.fail(opId, 'CONTEXT_EXPORT_UNSUPPORTED'); this.deps.onSettled?.(op.role_id); return; }
    const source = this.one('select * from role_sessions where id=? and role_id=?', op.from_session_id, op.role_id);
    if (!source || source.state !== 'ACTIVE') { this.fail(opId, 'CONTEXT_TRANSFER_RACE'); this.deps.onSettled?.(op.role_id); return; }
    const sourceRef = typeof source.native_session_ref === 'string' ? source.native_session_ref : null;
    if (!sourceRef) { this.fail(opId, 'CONTEXT_EXPORT_FAILED'); this.deps.onSettled?.(op.role_id); return; }
    let exported: { text: string; truncated: boolean };
    try {
      exported = await sourcePort.exportContext({ harness: sourceHarness, nativeSessionRef: sourceRef });
    } catch { this.fail(opId, 'CONTEXT_EXPORT_FAILED'); this.deps.onSettled?.(op.role_id); return; }
    const exportedSha = createHash('sha256').update(exported.text).digest('hex');
    this.setMeta(opId, { exported_sha256: exportedSha, truncated: exported.truncated });
    this.deps.db.prepare("update context_transfer_ops set state='EXPORTED',updated_at_ms=? where id=? and state='PREPARING'").run(this.clock(), opId);
    // 容量判定(WC01.8):T/S 未知→ASK_USER(显式);T<S 才查 A;COMPRESS 需要受控压缩通道。
    let targetWindow: number | null = null;
    let sourceWindow: number | null = null;
    let sourceUsage: number | null = null;
    try {
      targetWindow = targetPort.targetWindowTokens ? await targetPort.targetWindowTokens({ harness: targetHarness }) : null;
      const sc = sourcePort.sourceCapacity ? await sourcePort.sourceCapacity({ harness: sourceHarness, nativeSessionRef: sourceRef }) : null;
      sourceWindow = sc ? sc.windowTokens : null;
      sourceUsage = sc ? sc.usageTokens : null;
    } catch { /* 容量来源失败按未知处理,不抛 */ }
    const decision: TransferDecision = decideTransfer({ targetWindowTokens: targetWindow, sourceWindowTokens: sourceWindow, sourceUsageTokens: sourceUsage });
    this.setMeta(opId, { decision });
    if (decision.action === 'ASK_USER') { this.fail(opId, 'CONTEXT_CAPACITY_ASK_USER'); this.deps.onSettled?.(op.role_id); return; }
    let seedText = exported.text;
    if (decision.action === 'COMPRESS') {
      if (!sourcePort.compressSource) { this.fail(opId, 'CONTEXT_SOURCE_COMPRESSION_UNAVAILABLE'); this.deps.onSettled?.(op.role_id); return; }
      try {
        const compressed = await sourcePort.compressSource({ text: seedText, maxTokens: targetWindow! });
        seedText = compressed.text;
        this.setMeta(opId, { compressed: true, compressed_truncated: compressed.truncated });
      } catch { this.fail(opId, 'CONTEXT_SOURCE_COMPRESSION_UNAVAILABLE'); this.deps.onSettled?.(op.role_id); return; }
    }
    // 目标初始化(网络调用,事务外);确认未知→停 SEEDED,由 resume 走 confirm,不重复创建。
    let init: { nativeSessionRef: string; confirmed: boolean };
    try {
      init = await targetPort.initializeTarget({ harness: targetHarness, seedText, workspaceId: meta.workspace_id ?? null });
    } catch { this.fail(opId, 'CONTEXT_TARGET_INIT_FAILED'); this.deps.onSettled?.(op.role_id); return; }
    this.setMeta(opId, { target_native_ref: init.nativeSessionRef, target_confirmed: init.confirmed });
    this.deps.db.prepare("update context_transfer_ops set state='SEEDED',updated_at_ms=? where id=? and state='EXPORTED'").run(this.clock(), opId);
    await this.settleSeeded(opId);
  }
  /** SEEDED → 确认目标 → 短事务提交;不确定则保持 SEEDED(CONTEXT_TRANSFER_AMBIGUOUS)。 */
  async settleSeeded(opId: string): Promise<void> {
    const op = this.op(opId);
    if (!op || op.state !== 'SEEDED') return;
    const meta = metaOf(op);
    const targetHarness = String(meta.target_harness ?? '');
    const port = this.deps.ports.get(targetHarness);
    const ref = typeof meta.target_native_ref === 'string' ? meta.target_native_ref : null;
    if (!port || !ref) { this.fail(opId, 'CONTEXT_TRANSFER_AMBIGUOUS'); this.deps.onSettled?.(op.role_id); return; }
    let confirmed = meta.target_confirmed === true;
    if (!confirmed) {
      try { confirmed = (await port.confirmTarget({ harness: targetHarness, nativeSessionRef: ref })).confirmed; } catch { confirmed = false; }
      if (!confirmed) { this.fail(opId, 'CONTEXT_TRANSFER_AMBIGUOUS'); this.deps.onSettled?.(op.role_id); return; }
      this.setMeta(opId, { target_confirmed: true });
    }
    const current = this.one("select id from role_sessions where role_id=? and state='ACTIVE'", op.role_id);
    if (!current || current.id !== op.from_session_id) { this.fail(opId, 'CONTEXT_TRANSFER_RACE'); this.deps.onSettled?.(op.role_id); return; }
    try {
      this.deps.commit({
        opId,
        roleId: op.role_id,
        fromSessionId: op.from_session_id,
        name: String(meta.name ?? '迁移会话'),
        targetHarness,
        nativeSessionRef: ref,
      });
      this.deps.db.prepare("update context_transfer_ops set state='COMMITTED',to_session_id=(select id from role_sessions where role_id=? and state='ACTIVE'),error_code=NULL,updated_at_ms=? where id=?").run(op.role_id, this.clock(), opId);
      this.deps.onSettled?.(op.role_id);
    } catch {
      this.fail(opId, 'CONTEXT_TRANSFER_RACE');
      this.deps.onSettled?.(op.role_id);
    }
  }
  /** 启动恢复:PREPARING/EXPORTED 中断(无持久目标)→FAILED;SEEDED 有持久引用→confirm 后提交。 */
  resumeInterrupted(): void {
    for (const op of this.deps.db.prepare(`select * from context_transfer_ops where state in ${ACTIVE_STATES}`).all() as Row[]) {
      if (op.state === 'SEEDED') { void this.settleSeeded(op.id).catch(() => this.fail(op.id, 'CONTEXT_TRANSFER_INTERRUPTED')); continue; }
      this.fail(op.id, 'CONTEXT_TRANSFER_INTERRUPTED');
    }
  }
}
