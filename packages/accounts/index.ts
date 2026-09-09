export type QuotaStatus = 'OK' | 'STALE' | 'ERROR' | 'UNKNOWN' | 'UNSUPPORTED';
export interface QuotaValue {
  status: QuotaStatus;
  observedAt: number | null;
  source: string;
  windows: unknown[];
}
export function quotaSnapshot(
  envelope: unknown,
  observedAt: number,
  now: number,
  ttl = 60000,
): QuotaValue {
  if (!envelope || typeof envelope !== 'object')
    return { status: 'UNKNOWN', observedAt: null, source: 'unavailable', windows: [] };
  const value = envelope as Record<string, any>;
  if (value.kind === 'error' || value.error)
    return { status: 'ERROR', observedAt, source: 'kimi-server-api', windows: [] };
  if (value.kind !== 'success' || !Array.isArray(value.windows))
    return { status: 'UNKNOWN', observedAt, source: 'unverified-envelope', windows: [] };
  return {
    status: now - observedAt > ttl ? 'STALE' : 'OK',
    observedAt,
    source: 'verified-adapter-envelope',
    windows: value.windows,
  };
}
export interface SwitchPort {
  pause(): Promise<void>;
  stopped(): Promise<boolean>;
  snapshotLatest(): Promise<void>;
  installTarget(): Promise<void>;
  verifyIdentity(): Promise<boolean>;
  record(state: string): Promise<void>;
}
// Filesystem/auth implementation is intentionally not supplied until real profile tests pass.
export async function switchAccount(port: SwitchPort) {
  try {
    await port.record('REQUESTED');
    await port.pause();
    await port.record('PAUSING');
    await port.record('QUIESCING');
    if (!(await port.stopped())) throw Error('OLD_PROCESSES_ACTIVE');
    await port.record('SNAPSHOT_OLD');
    await port.snapshotLatest();
    await port.record('INSTALL_TARGET');
    await port.installTarget();
    await port.record('VERIFYING');
    if (!(await port.verifyIdentity())) throw Error('IDENTITY_MISMATCH');
    await port.record('COMMITTED');
    return 'COMMITTED';
  } catch {
    await port.record('FAILED_SAFE');
    return 'FAILED_SAFE';
  }
}
