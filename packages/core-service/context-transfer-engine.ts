import { createHash } from 'node:crypto';
import { decideTransfer, type TransferDecision } from './context-transfer.ts';

/** WN01/CT-02..04:一次性 Context Transfer 引擎。
 * 持久 intent(context_transfer_ops)→导出→容量判定→(受控压缩)→目标初始化→短事务原子提交。
 * - 网络调用一律在 DB 事务外;有稳定 operationId 传入端口,端口必须按 operationId 幂等(重试不重复建目标)。
 * - 目标初始化"确定未开始"才允许 FAILED;任何不确定保持非终态(暂停派发),有界 confirm,不伪造成功也不放开调度。
 * - 提交(op 终态+目标指针+归档源+激活目标+binding 切换)由 extension.commitTransfer 单事务完成。
 * - 崩溃恢复:PREPARING/EXPORTED 可安全重放(导出只读、init 幂等);SEEDED 走 confirm。COMMITTED 是历史事实,不得用来复活后来合法的新 ACTIVE WS。 */

export type TransferPortContext = {
  harness: string;
  sessionHome: string | null;
  workspace?: string | null;
  profileRef?: string | null;
  bindingId?: string | null;
  roleSessionId?: string | null;
};

export interface TransferDriverPort {
  /** 来源 FULL_VISIBLE 导出;truncated=true 必须如实上报 */
  exportContext(input: TransferPortContext & { nativeSessionRef: string }): Promise<{ text: string; truncated: boolean }>;
  /** 目标新会话初始化:注入 seed;以 operationId 幂等。抛 Error('NOT_STARTED') 表示确定未开始任何副作用。 */
  initializeTarget(input: TransferPortContext & {
    seedText: string;
    operationId: string;
    expectedPayloadHash: string;
    targetNativeSessionRef?: string | null;
    /** Driver 创建目标后、注入 seed 前立即持久化 native ref，供 UNKNOWN_EFFECT/重启核对。 */
    recordTargetCreated(nativeSessionRef: string): void;
    /** 在向 native transport 写入 seed 前持久化；此后异常一律按 UNKNOWN_EFFECT 只读核对。 */
    recordInputDispatch(): void;
  }): Promise<{ nativeSessionRef: string; confirmed: boolean; acceptedPayloadHash?: string; nativeReceipt?: string }>;
  /** SEEDED/崩溃恢复时按持久引用核对特定 payload(只读,不创建)。 */
  confirmTarget(input: TransferPortContext & {
    nativeSessionRef: string;
    operationId: string;
    expectedPayloadHash: string;
  }): Promise<{ confirmed: boolean; acceptedPayloadHash?: string; nativeReceipt?: string }>;
  targetWindowTokens?(input: TransferPortContext & {
    operationId: string;
    targetNativeSessionRef?: string | null;
    /** 若探测窗口必须创建目标，此 ref 就是本次迁移的目标，不得另建一次性探针会话。 */
    recordTargetCreated(nativeSessionRef: string): void;
  }): Promise<number | null>;
  sourceCapacity?(input: TransferPortContext & { nativeSessionRef: string }): Promise<{ windowTokens: number | null; usageTokens: number | null }>;
  /** 受控源侧压缩(单一授权 profile);无此通道则 COMPRESS 决策显式失败 */
  compressSource?(input: { text: string; maxTokens: number }): Promise<{ text: string; truncated: boolean }>;
}

export interface TransferCommitInput {
  opId: string;
  roleId: string;
  fromSessionId: string;
  name: string;
  targetHarness: string;
  nativeSessionRef: string;
}

export interface TransferEngineDeps {
  db: import('better-sqlite3').Database;
  ports: ReadonlyMap<string, TransferDriverPort>;
  clock?: () => number;
  schedule?: (fn: () => void) => void;
  /** 单事务提交:归档源、插入/激活目标(带 native ref)、必要时目标 binding 切换、op→COMMITTED+to_session 指针。 */
  commit: (input: TransferCommitInput) => { session_id: string };
  /** COMMITTED 恢复核对:当前 ACTIVE 与已提交目标不一致时以提交事实修复。 */
  repairCommitted?: (input: { roleId: string; sessionId: string }) => void;
  /** 提交/终态后踢协调器(恢复派发)。 */
  onSettled?: (roleId: string) => void;
}

type Row = Record<string, any>;
const ACTIVE_STATES = "('PREPARING','EXPORTED','SEEDED')";
const MAX_CONFIRM_ATTEMPTS = 3;
const MAX_RETRIES = 2;
const metaOf = (row: Row): Record<string, any> => {
  try { return JSON.parse(row.capacity_json ?? '{}') ?? {}; } catch { return {}; }
};
function sideOf(meta: Record<string, any>, side: 'source' | 'target'): Record<string, any> {
  const value = meta[side];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function portContext(
  meta: Record<string, any>,
  side: 'source' | 'target',
  harness: string,
  session?: Row,
): TransferPortContext {
  const resolved = sideOf(meta, side);
  const homeKey = side === 'source' ? 'source_session_home' : 'target_session_home';
  return {
    harness,
    sessionHome: (resolved.sessionHome as string | null | undefined) ?? (meta[homeKey] as string | null | undefined) ?? null,
    workspace: (resolved.workspacePath as string | null | undefined) ?? null,
    profileRef: (resolved.profileRef as string | null | undefined) ?? null,
    bindingId: (resolved.bindingId as string | null | undefined) ?? null,
    roleSessionId: (resolved.roleSessionId as string | null | undefined) ?? (session?.id as string | undefined) ?? null,
  };
}

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
  /** 协调器派发暂停:非终态(含不确定的 EXPORTED/SEEDED)一律暂停,FAILED/CANCELLED/COMMITTED 放行。 */
  hasActive(roleId: string): boolean {
    return Boolean(
      this.one(`select id from context_transfer_ops where role_id=? and state in ${ACTIVE_STATES} limit 1`, roleId),
    );
  }
  op(opId: string): Row | undefined {
    return this.one('select * from context_transfer_ops where id=?', opId);
  }
  enqueue(opId: string): void {
    this.schedule(() => { void this.run(opId).catch(() => {}); });
  }
  private fail(opId: string, code: string): void {
    this.deps.db
      .prepare("update context_transfer_ops set state='FAILED',error_code=?,updated_at_ms=? where id=? and state not in ('COMMITTED','FAILED','CANCELLED')")
      .run(code, this.clock(), opId);
  }
  /** 不确定结果:保持非终态(继续暂停派发),只记诊断码。 */
  private markUncertain(opId: string, code: string): void {
    this.deps.db.prepare('update context_transfer_ops set error_code=?,updated_at_ms=? where id=?').run(code, this.clock(), opId);
  }
  private setMeta(opId: string, patch: Record<string, unknown>): void {
    const row = this.op(opId);
    if (!row) return;
    const meta = { ...metaOf(row), ...patch };
    this.deps.db
      .prepare('update context_transfer_ops set capacity_json=?,updated_at_ms=? where id=?')
      .run(JSON.stringify(meta), this.clock(), opId);
  }
  /** 从 EXPORTED 起可安全重放(导出只读、init 按 opId 幂等)。 */
  async run(opId: string): Promise<void> {
    const op = this.op(opId);
    if (!op || (op.state !== 'PREPARING' && op.state !== 'EXPORTED')) return;
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
    const sourceCtx = portContext(meta, 'source', sourceHarness, source);
    const targetCtx = portContext(meta, 'target', targetHarness);
    // TARGET_CREATED 已持久化但进程在 INPUT_ACCEPTED 回执前中断：不得再创建目标；只读核对既有目标。
    if (
      op.state === 'EXPORTED' &&
      typeof meta.target_native_ref === 'string' &&
      typeof meta.seed_sha256 === 'string' &&
      meta.seed_send_started === true
    ) {
      this.deps.db.prepare("update context_transfer_ops set state='SEEDED',updated_at_ms=? where id=? and state='EXPORTED'").run(this.clock(), opId);
      await this.settleSeeded(opId);
      return;
    }
    let exported: { text: string; truncated: boolean };
    try {
      exported = await sourcePort.exportContext({ ...sourceCtx, nativeSessionRef: sourceRef });
    } catch { this.fail(opId, 'CONTEXT_EXPORT_FAILED'); this.deps.onSettled?.(op.role_id); return; }
    const exportedSha = createHash('sha256').update(exported.text).digest('hex');
    this.setMeta(opId, { exported_sha256: exportedSha, truncated: exported.truncated });
    this.deps.db.prepare("update context_transfer_ops set state='EXPORTED',updated_at_ms=? where id=? and state='PREPARING'").run(this.clock(), opId);
    let targetWindow: number | null = null;
    let sourceWindow: number | null = null;
    let sourceUsage: number | null = null;
    try {
      const beforeTarget = metaOf(this.op(opId) ?? {});
      targetWindow = targetPort.targetWindowTokens ? await targetPort.targetWindowTokens({
        ...targetCtx,
        operationId: opId,
        targetNativeSessionRef: typeof beforeTarget.target_native_ref === 'string' ? beforeTarget.target_native_ref : null,
        recordTargetCreated: (nativeSessionRef) => {
          if (!nativeSessionRef) throw Error('CONTEXT_TARGET_REF_EMPTY');
          this.setMeta(opId, { target_native_ref: nativeSessionRef, target_created: true });
        },
      }) : null;
      const sc = sourcePort.sourceCapacity ? await sourcePort.sourceCapacity({ ...sourceCtx, nativeSessionRef: sourceRef }) : null;
      sourceWindow = sc ? sc.windowTokens : null;
      sourceUsage = sc ? sc.usageTokens : null;
    } catch { /* 容量未知按 null 参与决策 */ }
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
    const seedSha = createHash('sha256').update(seedText).digest('hex');
    this.setMeta(opId, { seed_sha256: seedSha });
    // 目标初始化:确定未开始才 FAILED;其余不确定保持 EXPORTED+error_code,重放/重启按 operationId 幂等重试。
    let init: { nativeSessionRef: string; confirmed: boolean; acceptedPayloadHash?: string; nativeReceipt?: string };
    try {
      const beforeInit = metaOf(this.op(opId) ?? {});
      const reservedTargetRef = typeof beforeInit.target_native_ref === 'string' ? beforeInit.target_native_ref : null;
      init = await targetPort.initializeTarget({
        ...targetCtx,
        seedText,
        operationId: opId,
        expectedPayloadHash: seedSha,
        targetNativeSessionRef: reservedTargetRef,
        recordTargetCreated: (nativeSessionRef) => {
          if (!nativeSessionRef) throw Error('CONTEXT_TARGET_REF_EMPTY');
          this.setMeta(opId, { target_native_ref: nativeSessionRef, target_created: true });
        },
        recordInputDispatch: () => this.setMeta(opId, { seed_send_started: true }),
      });
    } catch (error) {
      const definite = String((error as Error)?.message ?? error).includes('NOT_STARTED');
      if (definite) this.fail(opId, 'CONTEXT_TARGET_INIT_FAILED');
      else {
        const after = this.op(opId);
        const afterMeta = after ? metaOf(after) : {};
        if (typeof afterMeta.target_native_ref === 'string') {
          this.deps.db.prepare("update context_transfer_ops set state='SEEDED',error_code=?,updated_at_ms=? where id=? and state='EXPORTED'")
            .run('CONTEXT_TRANSFER_AMBIGUOUS', this.clock(), opId);
          await this.settleSeeded(opId);
        } else this.scheduleRetry(opId);
      }
      this.deps.onSettled?.(op.role_id);
      return;
    }
    const recorded = metaOf(this.op(opId) ?? {});
    const recordedTargetRef = typeof recorded.target_native_ref === 'string' ? recorded.target_native_ref : null;
    if (recordedTargetRef && recordedTargetRef !== init.nativeSessionRef) {
      this.setMeta(opId, { target_returned_ref: init.nativeSessionRef });
      this.deps.db.prepare("update context_transfer_ops set state='SEEDED',error_code=?,updated_at_ms=? where id=? and state='EXPORTED'")
        .run('CONTEXT_TARGET_REF_MISMATCH', this.clock(), opId);
      this.deps.onSettled?.(op.role_id);
      return;
    }
    const receiptMatches = init.confirmed === true && init.acceptedPayloadHash === seedSha;
    this.setMeta(opId, {
      target_native_ref: init.nativeSessionRef,
      target_created: true,
      target_confirmed: receiptMatches,
      accepted_payload_sha256: receiptMatches ? seedSha : null,
      native_receipt: typeof init.nativeReceipt === 'string' ? init.nativeReceipt : null,
      init_unknown: false,
    });
    this.deps.db.prepare("update context_transfer_ops set state='SEEDED',error_code=NULL,updated_at_ms=? where id=? and state='EXPORTED'").run(this.clock(), opId);
    await this.settleSeeded(opId);
  }
  /** SEEDED → 确认(≤MAX_CONFIRM_ATTEMPTS 次) → 单事务提交;不确定保持 SEEDED。 */
  async settleSeeded(opId: string): Promise<void> {
    const op = this.op(opId);
    if (!op || op.state !== 'SEEDED') return;
    const meta = metaOf(op);
    const targetHarness = String(meta.target_harness ?? '');
    const port = this.deps.ports.get(targetHarness);
    const ref = typeof meta.target_native_ref === 'string' ? meta.target_native_ref : null;
    const expectedPayloadHash = typeof meta.seed_sha256 === 'string' ? meta.seed_sha256 : null;
    if (!port || !ref || !expectedPayloadHash) { this.markUncertain(opId, 'CONTEXT_TRANSFER_UNRESOLVED'); return; }
    let confirmed = meta.target_confirmed === true && meta.accepted_payload_sha256 === expectedPayloadHash;
    if (!confirmed) {
      const attempts = Number(meta.confirm_attempts ?? 0) + 1;
      this.setMeta(opId, { confirm_attempts: attempts });
      let receipt: { confirmed: boolean; acceptedPayloadHash?: string; nativeReceipt?: string } | null = null;
      try {
        receipt = await port.confirmTarget({
          ...portContext(meta, 'target', targetHarness),
          nativeSessionRef: ref,
          operationId: opId,
          expectedPayloadHash,
        });
        confirmed = receipt.confirmed === true && receipt.acceptedPayloadHash === expectedPayloadHash;
      } catch { confirmed = false; }
      if (!confirmed) {
        this.markUncertain(opId, attempts >= MAX_CONFIRM_ATTEMPTS ? 'CONTEXT_TRANSFER_UNRESOLVED' : 'CONTEXT_TRANSFER_AMBIGUOUS');
        if (attempts < MAX_CONFIRM_ATTEMPTS) this.scheduleRetry(opId);
        return;
      }
      this.setMeta(opId, {
        target_confirmed: true,
        accepted_payload_sha256: expectedPayloadHash,
        native_receipt: typeof receipt?.nativeReceipt === 'string' ? receipt.nativeReceipt : null,
      });
    }
    const current = this.one("select id from role_sessions where role_id=? and state='ACTIVE'", op.role_id);
    if (!current || current.id !== op.from_session_id) { this.fail(opId, 'CONTEXT_TRANSFER_RACE'); this.deps.onSettled?.(op.role_id); return; }
    try {
      // 单事务:归档源+激活目标(带 ref)+目标 binding 切换+op COMMITTED+to_session 指针。
      this.deps.commit({ opId, roleId: op.role_id, fromSessionId: op.from_session_id, name: String(meta.name ?? '迁移会话'), targetHarness, nativeSessionRef: ref });
      this.deps.onSettled?.(op.role_id);
    } catch {
      this.fail(opId, 'CONTEXT_TRANSFER_RACE');
      this.deps.onSettled?.(op.role_id);
    }
  }
  /** 有界自动重试:保留非终态(派发仍暂停),超限后停在 UNRESOLVED 等待人工核对,绝不伪造成功或放开调度。 */
  private scheduleRetry(opId: string): void {
    const op = this.op(opId);
    if (!op) return;
    const meta = metaOf(op);
    const retries = Number(meta.retries ?? 0);
    if (retries >= MAX_RETRIES) { this.markUncertain(opId, 'CONTEXT_TRANSFER_UNRESOLVED'); return; }
    this.setMeta(opId, { retries: retries + 1 });
    const timer = setTimeout(() => { void this.runOrSettle(opId).catch(() => {}); }, 1500);
    if (timer.unref) timer.unref();
  }
  async runOrSettle(opId: string): Promise<void> {
    const op = this.op(opId);
    if (!op) return;
    if (op.state === 'SEEDED') return this.settleSeeded(opId);
    return this.run(opId);
  }
  /** 启动恢复:仅未完成操作。COMMITTED 不得重放,否则会把后续空白/新 WS 打回历史目标。 */
  resumeInterrupted(): void {
    for (const op of this.deps.db.prepare(`select * from context_transfer_ops where state in ${ACTIVE_STATES}`).all() as Row[]) {
      if (op.state === 'SEEDED') { void this.settleSeeded(op.id).catch(() => this.markUncertain(op.id, 'CONTEXT_TRANSFER_AMBIGUOUS')); continue; }
      // PREPARING/EXPORTED:重放整个受控流程(导出只读、init 幂等);无法恢复端口的按 INTERRUPTED 显式失败。
      void this.run(op.id).catch(() => this.fail(op.id, 'CONTEXT_TRANSFER_INTERRUPTED'));
    }
  }
}
