/** WC01 一次性 Context Transfer:容量决策纯函数 + 能力门控 + 语义常量。
 * 决策顺序(产品规则):先验 T/S;T>=S 直接(无须 A);T<S 才需要 A;
 * A 未知不当 0 → ASK_USER;压缩只在 A>T 且有受控压缩通道时进行。 */

export interface TransferCapacityInput {
  /** 目标窗口 tokens(T);null=未知 */
  targetWindowTokens: number | null;
  /** 源窗口 tokens(S);null=未知 */
  sourceWindowTokens: number | null;
  /** 源当前占用(A);null=未知/不支持 */
  sourceUsageTokens: number | null;
}
export type TransferDecision =
  | { action: 'DIRECT'; reason: 'TARGET_AT_LEAST_SOURCE' }
  | { action: 'DIRECT'; reason: 'USAGE_FITS_TARGET' }
  | { action: 'COMPRESS'; reason: 'USAGE_OVER_TARGET' }
  | { action: 'ASK_USER'; reason: 'CAPACITY_UNKNOWN' };
export function decideTransfer(input: TransferCapacityInput): TransferDecision {
  const { targetWindowTokens: T, sourceWindowTokens: S, sourceUsageTokens: A } = input;
  // SH-02 修复:先验窗口(T,S);T>=S 无须 A。A 只在 T<S 分支参与。
  if (T === null || S === null) return { action: 'ASK_USER', reason: 'CAPACITY_UNKNOWN' };
  if (T >= S) return { action: 'DIRECT', reason: 'TARGET_AT_LEAST_SOURCE' };
  if (A === null) return { action: 'ASK_USER', reason: 'CAPACITY_UNKNOWN' };
  if (A <= T) return { action: 'DIRECT', reason: 'USAGE_FITS_TARGET' };
  return { action: 'COMPRESS', reason: 'USAGE_OVER_TARGET' };
}

/** WC01/SH-01:继承门控按"来源导出能力 + 双端真实通道"判断——
 * 来源 Driver 须声明 FULL_VISIBLE 导出,且来源/目标都存在已接线的受信通道;
 * 硬编码 false 或只查目标 Harness 都不再出现。UNKNOWN/UNSUPPORTED 显式拒绝。 */
export interface InheritGateInput {
  /** 来源(ACTIVE WS)Harness 的 history_export 能力值 */
  sourceHistoryExport: string;
  /** 来源导出通道是否真实接线(存在已注册的 TransferDriverPort) */
  sourceExportChannel: boolean;
  /** 目标初始化通道是否真实接线 */
  targetInitChannel: boolean;
}
export function inheritSupported(input: InheritGateInput): boolean {
  return (
    input.sourceHistoryExport === 'FULL_VISIBLE' &&
    input.sourceExportChannel &&
    input.targetInitChannel
  );
}

export const CONTEXT_TRANSFER_ERROR_CODES = [
  'CONTEXT_EXPORT_UNSUPPORTED',
  'CONTEXT_EXPORT_FAILED',
  'CONTEXT_SOURCE_COMPRESSION_UNAVAILABLE',
  'CONTEXT_CAPACITY_ASK_USER',
  'CONTEXT_TARGET_INIT_FAILED',
  'CONTEXT_TRANSFER_AMBIGUOUS',
  'CONTEXT_TRANSFER_INTERRUPTED',
  'CONTEXT_TRANSFER_RACE',
] as const;
