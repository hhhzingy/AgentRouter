export type DriverCapabilityStatus =
  | 'VERIFIED'
  | 'IMPLEMENTED_UNVERIFIED'
  | 'UNSUPPORTED'
  | 'UNKNOWN';
export type DriverHistoryExport =
  | 'FULL_VISIBLE'
  | 'PARTIAL'
  | 'ROUTER_ONLY'
  | 'UNSUPPORTED'
  | 'UNKNOWN';
export type DriverContextCapacity = 'EXACT' | 'CATALOG' | 'ESTIMATED' | 'UNKNOWN';
export type DriverContextUsage = 'EXACT' | 'ESTIMATED' | 'UNSUPPORTED' | 'UNKNOWN';

/** Stable public capability shape; evidence is kept beside it, never in the model payload. */
export interface DriverContextCapabilities {
  harness: string;
  driver_version?: string;
  native_resume: DriverCapabilityStatus;
  history_export: DriverHistoryExport;
  context_capacity: DriverContextCapacity;
  context_usage: DriverContextUsage;
  native_compaction: DriverCapabilityStatus;
  model_switch_same_session: DriverCapabilityStatus;
  last_verified_at_ms?: number;
}

export interface DriverCapabilityEvidence {
  source: 'protocol' | 'probe' | 'test' | 'operator';
  reference: string;
  observed_at_ms: number;
  note?: string;
}

export interface DriverCapabilityRecord {
  capabilities: DriverContextCapabilities;
  evidence: readonly DriverCapabilityEvidence[];
}

const capabilityStatuses = new Set<DriverCapabilityStatus>([
  'VERIFIED',
  'IMPLEMENTED_UNVERIFIED',
  'UNSUPPORTED',
  'UNKNOWN',
]);
const historyStatuses = new Set<DriverHistoryExport>([
  'FULL_VISIBLE',
  'PARTIAL',
  'ROUTER_ONLY',
  'UNSUPPORTED',
  'UNKNOWN',
]);
const capacityStatuses = new Set<DriverContextCapacity>([
  'EXACT',
  'CATALOG',
  'ESTIMATED',
  'UNKNOWN',
]);
const usageStatuses = new Set<DriverContextUsage>([
  'EXACT',
  'ESTIMATED',
  'UNSUPPORTED',
  'UNKNOWN',
]);

export function unknownDriverContextCapabilities(
  harness: string,
  driverVersion?: string,
): DriverContextCapabilities {
  return {
    harness,
    ...(driverVersion ? { driver_version: driverVersion } : {}),
    native_resume: 'UNKNOWN',
    history_export: 'UNKNOWN',
    context_capacity: 'UNKNOWN',
    context_usage: 'UNKNOWN',
    native_compaction: 'UNKNOWN',
    model_switch_same_session: 'UNKNOWN',
  };
}

export function validateDriverContextCapabilities(
  value: DriverContextCapabilities,
): DriverContextCapabilities {
  if (
    !value ||
    typeof value.harness !== 'string' ||
    !/^[a-z][a-z0-9_]{1,40}$/.test(value.harness) ||
    (value.driver_version !== undefined && typeof value.driver_version !== 'string') ||
    !capabilityStatuses.has(value.native_resume) ||
    !historyStatuses.has(value.history_export) ||
    !capacityStatuses.has(value.context_capacity) ||
    !usageStatuses.has(value.context_usage) ||
    !capabilityStatuses.has(value.native_compaction) ||
    !capabilityStatuses.has(value.model_switch_same_session) ||
    (value.last_verified_at_ms !== undefined &&
      (!Number.isSafeInteger(value.last_verified_at_ms) || value.last_verified_at_ms < 0))
  )
    throw Error('DRIVER_CAPABILITIES_INVALID');
  return { ...value };
}

export function capabilityRecord(
  capabilities: DriverContextCapabilities,
  evidence: readonly DriverCapabilityEvidence[] = [],
): DriverCapabilityRecord {
  return { capabilities: validateDriverContextCapabilities(capabilities), evidence: [...evidence] };
}
