/** AgentRouter V1.0 implementation contract, not an implemented runtime. */
export type HarnessId = 'codex' | 'kimi_code' | 'pi';
export type Id = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Capability = 'supported' | 'unsupported' | 'unverified';
export interface CapabilitySnapshot {
  harness: HarnessId;
  version: string;
  protocolVersion: string;
  testedAt?: string;
  sessionCreate: Capability;
  sessionResume: Capability;
  history: 'replay' | 'read' | 'router-observed-only' | 'unverified';
  toolBridge: Capability;
  cancel: Capability;
  approval: Capability;
  modelSelection: Capability;
  reasoningSelection: Capability;
  quota: Capability;
  accountIdentity: Capability;
  readOnlyEnforcement: Capability;
  nativeQueueControl: Capability;
  settledSignal: { supported: Capability; source: string; semantics: string };
  authConcurrency: 'serialized-refresh-unit' | 'tested-shared-server' | 'independent-key' | 'unverified';
}
export interface ModelOptions {
  providerId: string;
  modelId: string;
  label: string;
  reasoningOptions: Array<{ id: string; label: string }>;
  configurable: boolean;
}
export interface ModelSelection { providerId: string; modelId: string; reasoningId?: string }
export interface SessionRef { bindingId: Id; nativeSessionId: string; epoch: number }
export interface OpenSessionInput {
  bindingId: Id; roleId: Id; workspaceId: Id; canonicalCwd: string;
  model: ModelSelection; policyRevision: number; epoch: number;
  // Reference into the secret broker, never literal credentials in task content.
  authUnitRef?: Id; bridgePrincipalRef: Id; bootstrapText: string;
}
export interface ResumeSessionInput extends OpenSessionInput {
  nativeSessionId: string; incrementalHandoverText: string;
}
export interface RunInput {
  runId: Id; session: SessionRef; inputText: string;
  kind: 'TASK' | 'CONTINUATION' | 'MANAGEMENT' | 'RESULT_HANDLING';
  taskId?: Id; immutableInputRefs: ArtifactReference[];
}
export interface DispatchReceipt {
  state: 'submitted' | 'accepted'; nativeRequestId?: string;
  // This is NOT business receipt and NOT RunSettled.
}
export interface CancelInput { runId: Id; session: SessionRef; reason: string }
export interface CancelReceipt { state: 'requested' | 'acknowledged' | 'not-running' | 'unknown' }
export interface CloseInput { bindingId: Id; reason: string; requireProcessExit: boolean }
export interface HistoryQuery { session: SessionRef; cursor?: string; limit: number }
export interface HistoryPage { entries: Json[]; nextCursor?: string; complete: boolean; gaps: string[] }
export interface AccountSnapshot {
  state: 'verified' | 'unknown' | 'expired' | 'unsupported';
  accountId?: string; displayLabel?: string; observedAt: string;
}
export interface QuotaSnapshot {
  state: 'OK' | 'STALE' | 'ERROR' | 'UNKNOWN' | 'UNSUPPORTED';
  observedAt: string; source: string;
  windows: Array<{ id: string; used?: number; limit?: number; unit: string; resetsAt?: string }>;
  // Token usage or cost estimates must not be represented as subscription remaining quota.
}
export interface EventBase {
  bindingId: Id; epoch: number; runId?: Id;
  nativeEventId?: string; observedAt: string; replay: boolean;
}
export type NormalizedEvent = EventBase & (
  | { type: 'SessionOpened'; session: SessionRef }
  | { type: 'RunAccepted'; nativeRunId?: string }
  | { type: 'TextDelta'; messageId: string; text: string }
  | { type: 'MessageCompleted'; messageId: string; content: Json }
  | { type: 'ToolStarted' | 'ToolUpdated' | 'ToolEnded'; toolCallId: string; detail: Json }
  | { type: 'ApprovalRequired'; requestId: string; detail: Json }
  | { type: 'RunSettled'; outcome: 'succeeded' | 'failed' | 'cancelled'; nativeEvidence: Json }
  | { type: 'RunFailed'; reason: string; sideEffects: 'none-proven' | 'possible' | 'known' }
  | { type: 'Disconnected'; reason: string; executionStatus: 'stopped-proven' | 'unknown' }
);
export interface HarnessAdapter {
  probe(signal: AbortSignal): Promise<CapabilitySnapshot>;
  open(input: OpenSessionInput): Promise<SessionRef>;
  resume(input: ResumeSessionInput): Promise<SessionRef>;
  startRun(input: RunInput): Promise<DispatchReceipt>;
  events(): AsyncIterable<NormalizedEvent>;
  cancel(input: CancelInput): Promise<CancelReceipt>;
  close(input: CloseInput): Promise<void>;
  models(): Promise<ModelOptions[]>;
  history?(input: HistoryQuery): Promise<HistoryPage>;
  account?(): Promise<AccountSnapshot>;
  quota?(): Promise<QuotaSnapshot>;
}
export type Target = { type: 'role'; id: Id } | { type: 'user' };
export type ArtifactReference =
  | { kind: 'artifact'; artifact_id: Id }
  | { kind: 'git'; repository_id: Id; commit: string; path: string }
  | { kind: 'live'; workspace_id: Id; path: string }
  | { kind: 'external'; uri: string; version?: string; description?: string };
export interface Principal {
  principalId: Id; roleId: Id; bindingId: Id; bindingEpoch: number;
  spaceId: Id; projectId: Id; currentRunId: Id; currentTaskId?: Id;
  grantedTools: readonly string[];
}
export interface ToolContext { principal: Principal; operationId: string; requestHash: string }
export interface ContextQuery { section?: 'all' | 'roles' | 'task' | 'policy' | 'results' }
export interface RegisterArtifactInput {
  workspace_id: Id; path: string; media_type?: string;
  // V1.0 registration always freezes the referenced content.
}
export interface ReadArtifactInput {
  reference: ArtifactReference; offset_bytes?: number; limit_bytes?: number;
}
export interface ProtocolError {
  code: string;
  category: 'VALIDATION' | 'AUTHORIZATION' | 'UNAVAILABLE' | 'CONFLICT' | 'AMBIGUOUS';
  field?: string; message: string; suggestion: string; retryable: boolean; trace_id: string;
}
// request/notice/finish/wait payload types must be generated from route.schema.json,
// not duplicated here. Core validates semantic target/scope/version/epoch rules.
