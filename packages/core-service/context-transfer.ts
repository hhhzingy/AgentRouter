/** W03 一次性 Context Transfer:容量决策纯函数 + 语义常量。
 * 规则(用户附件 §6):T>=S 直接;T<S 且 A 已知且 A<=T 直接;A>T 压缩;
 * 未知容量/usage 不当 0、不跨单位比较 → conservative:'UNKNOWN' 由用户显式选择。 */

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
  if (T === null || S === null || A === null)
    return { action: 'ASK_USER', reason: 'CAPACITY_UNKNOWN' };
  if (T >= S) return { action: 'DIRECT', reason: 'TARGET_AT_LEAST_SOURCE' };
  if (A <= T) return { action: 'DIRECT', reason: 'USAGE_FITS_TARGET' };
  return { action: 'COMPRESS', reason: 'USAGE_OVER_TARGET' };
}

/** Driver 能力 → 是否支持继承式迁移。只有 driver 显式声明 FULL_VISIBLE 导出
 * 且存在受信 export 通道时才允许;UNKNOWN/UNSUPPORTED 一律显式拒绝(不静默空白)。 */
export function inheritSupported(historyExport: string, hasExportChannel: boolean): boolean {
  return historyExport === 'FULL_VISIBLE' && hasExportChannel;
}

export const CONTEXT_TRANSFER_ERROR_CODES = [
  'CONTEXT_EXPORT_UNSUPPORTED',
  'CONTEXT_EXPORT_FAILED',
  'CONTEXT_TARGET_INIT_FAILED',
  'CONTEXT_TRANSFER_AMBIGUOUS',
] as const;
