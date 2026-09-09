/** 安全门槛与实际验证分开；未知安全版本只能诊断，不能调度写入。 */
export const sqlitePolicy = {
  minimumSafe: '3.53.4',
  verifiedRanges: [{ min: '3.53.4', maxExclusive: '3.53.5' }],
  policyRevision: 1,
} as const;
function parts(v: string): number[] | null {
  if (!/^\d+\.\d+\.\d+$/.test(v)) return null;
  const p = v.split('.').map(Number);
  return p.every(Number.isSafeInteger) ? p : null;
}
function compare(a: number[], b: number[]) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}
export function classifySqlite(
  version: string,
  ranges: readonly { min: string; maxExclusive: string }[] = sqlitePolicy.verifiedRanges,
) {
  const v = parts(version);
  if (!v || compare(v, parts(sqlitePolicy.minimumSafe)!) < 0) return 'UNSAFE' as const;
  return ranges.some((r) => {
    const lo = parts(r.min),
      hi = parts(r.maxExclusive);
    return lo && hi && compare(v, lo) >= 0 && compare(v, hi) < 0;
  })
    ? ('VERIFIED' as const)
    : ('DIAGNOSTIC_ONLY' as const);
}
