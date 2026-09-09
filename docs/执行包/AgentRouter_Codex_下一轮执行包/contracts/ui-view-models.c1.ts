/**
 * AgentRouter Client API C1 UI view models.
 * This file is a contract draft. It must be generated/frozen by the Core owner
 * before UIAI starts implementation.
 *
 * SECURITY: no type in this file may contain API keys, OAuth tokens, auth.json,
 * cookies, SSH private keys, raw Authorization headers, or unrestricted local paths.
 */

export type ConnectionMode = 'LOCAL' | 'SSH';
export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED_CONTROLLER'
  | 'CONNECTED_OBSERVER'
  | 'RECONNECTING'
  | 'DEGRADED'
  | 'INCOMPATIBLE';

export interface ConnectionProfileVM {
  id: string;
  label: string;
  mode: ConnectionMode;
  sshHostAlias?: string;
  lastConnectedAtMs?: number;
  serverFingerprintLabel?: string;
}

export interface CoreHelloVM {
  serverInstanceId: string;
  serverVersion: string;
  protocol: 'agentrouter-client/1';
  schemaVersion: number;
  platform: 'win32' | 'linux' | 'darwin';
  connectionState: ConnectionState;
  eventCursor: number;
  capabilities: Record<string, unknown>;
}

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
export interface ProjectVM {
  id: string;
  name: string;
  status: ProjectStatus;
  hostLabel: string;
  displayRoot: string;
  spacesCount: number;
  activeRunsCount: number;
  issuesCount: number;
}

export type SpaceStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export interface SpaceVM {
  id: string;
  projectId: string;
  name: string;
  status: SpaceStatus;
  rolesCount: number;
  queuedTasksCount: number;
}

export type RoleStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'ARCHIVED';
export interface RoleVM {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  status: RoleStatus;
  harness: 'codex' | 'kimi_code' | 'pi';
  harnessSupport: 'UNAVAILABLE' | 'PROBED' | 'LIVE_TESTED' | 'CERTIFIED';
  modelLabel?: string;
  workspaceLabel: string;
  taskState?: TaskState;
  runState?: RunState;
  currentTaskSummary?: string;
  queuedTasksCount: number;
  unreadNoticesCount: number;
  pendingApprovalsCount: number;
}

export type TaskState =
  | 'QUEUED'
  | 'ACTIVE'
  | 'WAITING_INPUT'
  | 'RESULT_STAGED'
  | 'DELIVERED'
  | 'HANDED_OFF'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED'
  | 'NEEDS_ATTENTION'
  | 'SUSPENDED';

export type RunState =
  | 'CREATED'
  | 'STARTING'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'SETTLING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type AcceptanceState = 'NOT_REQUIRED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface TaskVM {
  id: string;
  spaceId: string;
  requesterRoleId?: string;
  assigneeRoleId: string;
  summary: string;
  state: TaskState;
  acceptance: AcceptanceState;
  completionTargetLabel: string;
  createdAtMs: number;
  updatedAtMs: number;
  queuePosition?: number;
  blockedReason?: string;
}

export interface RunVM {
  id: string;
  roleId: string;
  taskId?: string;
  harness: 'codex' | 'kimi_code' | 'pi';
  state: RunState;
  startedAtMs?: number;
  settledAtMs?: number;
  nativeSessionDisplay?: string;
  exitReason?: string;
  reconciliationRequired: boolean;
}

export type ConversationItemKind =
  | 'USER_MESSAGE'
  | 'ASSISTANT_MESSAGE'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'ROUTE_TASK'
  | 'ROUTE_RESULT'
  | 'NOTICE'
  | 'APPROVAL'
  | 'SYSTEM_EVENT'
  | 'GAP';

export interface ConversationItemVM {
  id: string;
  cursor: number;
  kind: ConversationItemKind;
  roleId?: string;
  runId?: string;
  taskId?: string;
  occurredAtMs: number;
  title?: string;
  body?: string;
  state?: string;
  artifactIds?: string[];
  replay: boolean;
  sensitive: false;
}

export interface ArtifactVM {
  id: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  state: 'AVAILABLE' | 'MISSING' | 'QUARANTINED' | 'RETIRED';
  displaySource: string;
  createdAtMs: number;
}

export interface AccountProfileVM {
  id: string;
  harness: 'codex' | 'kimi_code' | 'pi';
  label: string;
  maskedIdentity?: string;
  status: 'READY' | 'UNKNOWN' | 'EXPIRED' | 'REVOKED' | 'DISABLED';
  quotaStatus: 'OK' | 'STALE' | 'ERROR' | 'UNSUPPORTED' | 'UNKNOWN';
  // Never add secret, token, auth file content, cookie or Authorization fields.
}

export interface IssueVM {
  id: string;
  code: string;
  state: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  projectId?: string;
  spaceId?: string;
  roleId?: string;
  taskId?: string;
  runId?: string;
  messageKey: string;
  createdAtMs: number;
}

export interface ApprovalVM {
  id: string;
  runId: string;
  state: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED' | 'EXPIRED';
  title: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requestedAtMs: number;
  expiresAtMs?: number;
}

export interface RemoteDirectoryEntryVM {
  name: string;
  displayPath: string;
  kind: 'DIRECTORY' | 'FILE';
  readable: boolean;
  selectableAsProjectRoot: boolean;
}
