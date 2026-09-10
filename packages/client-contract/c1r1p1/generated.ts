// 自动生成；唯一来源 contracts/client-api.c1r1p1.schema.json。禁止手改。
// SHA256 8888f8fb9e1680f1dfb813d4f104b19be62b16a5e7a02d377ce4dda281d789fe
export type ConnectionMode = ("LOCAL" | "SSH");
export type ConnectionState = ("DISCONNECTED" | "CONNECTING" | "CONNECTED_CONTROLLER" | "CONNECTED_OBSERVER" | "RECONNECTING" | "DEGRADED" | "INCOMPATIBLE");
export type ProjectStatus = ("ACTIVE" | "ARCHIVED");
export type SpaceStatus = ("ACTIVE" | "PAUSED" | "ARCHIVED");
export type RoleStatus = ("ACTIVE" | "PAUSED" | "DISABLED" | "ARCHIVED");
export type TaskState = ("QUEUED" | "ACTIVE" | "WAITING_INPUT" | "RESULT_STAGED" | "DELIVERED" | "HANDED_OFF" | "PARTIAL" | "FAILED" | "CANCELLED" | "NEEDS_ATTENTION" | "SUSPENDED");
export type RunState = ("CREATED" | "STARTING" | "RUNNING" | "WAITING_APPROVAL" | "SETTLING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "UNKNOWN");
export type AcceptanceState = ("NOT_REQUIRED" | "PENDING" | "ACCEPTED" | "REJECTED");
export type ConversationItemKind = ("USER_MESSAGE" | "ASSISTANT_MESSAGE" | "TOOL_CALL" | "TOOL_RESULT" | "ROUTE_TASK" | "ROUTE_RESULT" | "NOTICE" | "APPROVAL" | "SYSTEM_EVENT" | "GAP");
export type ConnectionProfileVM = {
"id": string;
"label": string;
"mode": ConnectionMode;
"sshHostAlias"?: string;
"lastConnectedAtMs"?: number;
"serverFingerprintLabel"?: string
};
export type CoreHelloVM = {
"serverInstanceId": string;
"serverVersion": string;
"protocol": "agentrouter-client/1";
"schemaVersion": number;
"platform": ("win32" | "linux" | "darwin");
"connectionState": ConnectionState;
"eventCursor": number;
"capabilities": Capabilities;
"health": "OK" | "DEGRADED" | "DIAGNOSTIC_ONLY";
"upgradeRequired": boolean;
"lease": (LeaseVM | null);
"contractRevision"?: "C1" | "C1R1" | "C1R1P1"
};
export type ProjectVM = {
"id": string;
"name": string;
"status": ProjectStatus;
"hostLabel": string;
"displayRoot": string;
"spacesCount": number;
"activeRunsCount": number;
"issuesCount": number;
"revision": Revision;
"statusSummary"?: ProjectStatusSummaryVM
};
export type SpaceVM = {
"id": string;
"projectId": string;
"name": string;
"status": SpaceStatus;
"rolesCount": number;
"queuedTasksCount": number;
"revision": Revision;
"purpose"?: string;
"policyRevision"?: number;
"topologyState"?: "ACTIVE" | "ARCHIVED";
"activeRunsCount"?: number;
"needsUserCount"?: number
};
export type RoleVM = {
"id": string;
"spaceId": string;
"name": string;
"description": string;
"status": RoleStatus;
"harness": ("codex" | "kimi_code" | "pi");
"harnessSupport": ("UNAVAILABLE" | "PROBED" | "LIVE_TESTED" | "CERTIFIED");
"modelLabel"?: string;
"workspaceLabel": string;
"taskState"?: TaskState;
"runState"?: RunState;
"currentTaskSummary"?: string;
"queuedTasksCount": number;
"unreadNoticesCount": number;
"pendingApprovalsCount": number;
"revision": Revision;
"charterRevision"?: number;
"bootstrapState"?: RoleBootstrapState;
"providerProfileId"?: Id;
"modelSelection"?: PlanModelSelection;
"interventionState"?: "NONE" | "BOOTSTRAP_REQUIRED" | "MODEL_UNVERIFIED" | "BOOTSTRAP_FAILED"
};
export type TaskVM = {
"id": string;
"spaceId": string;
"requesterRoleId"?: string;
"assigneeRoleId": string;
"summary": string;
"state": TaskState;
"acceptance": AcceptanceState;
"completionTargetLabel": string;
"createdAtMs": number;
"updatedAtMs": number;
"queuePosition"?: number;
"blockedReason"?: string;
"revision": Revision;
"policyRevision"?: number;
"charterRevision"?: number;
"sourceTaskId"?: Id
};
export type RunVM = {
"id": string;
"roleId": string;
"taskId"?: string;
"harness": ("codex" | "kimi_code" | "pi");
"state": RunState;
"startedAtMs"?: number;
"settledAtMs"?: number;
"nativeSessionDisplay"?: string;
"exitReason"?: string;
"reconciliationRequired": boolean;
"revision": Revision
};
export type ConversationItemVM = {
"id": string;
"cursor": number;
"kind": ConversationItemKind;
"roleId"?: string;
"runId"?: string;
"taskId"?: string;
"occurredAtMs": number;
"title"?: string;
"body"?: string;
"state"?: string;
"artifactIds"?: Array<string>;
"replay": boolean;
"sensitive": false
};
export type ArtifactVM = {
"id": string;
"mediaType": string;
"byteSize": number;
"sha256": string;
"state": ("AVAILABLE" | "MISSING" | "QUARANTINED" | "RETIRED");
"displaySource": string;
"createdAtMs": number;
"revision": Revision
};
export type AccountProfileVM = {
"id": string;
"harness": ("codex" | "kimi_code" | "pi");
"label": string;
"maskedIdentity"?: string;
"status": ("READY" | "UNKNOWN" | "EXPIRED" | "REVOKED" | "DISABLED");
"quotaStatus": ("OK" | "STALE" | "ERROR" | "UNSUPPORTED" | "UNKNOWN");
"revision": Revision
};
export type IssueVM = {
"id": string;
"code": string;
"state": ("OPEN" | "ACKNOWLEDGED" | "RESOLVED");
"projectId"?: string;
"spaceId"?: string;
"roleId"?: string;
"taskId"?: string;
"runId"?: string;
"messageKey": string;
"createdAtMs": number;
"revision": Revision
};
export type ApprovalVM = {
"id": string;
"runId": string;
"state": ("PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | "EXPIRED");
"title": string;
"riskLevel": ("LOW" | "MEDIUM" | "HIGH");
"requestedAtMs": number;
"expiresAtMs"?: number;
"revision": Revision
};
export type RemoteDirectoryEntryVM = {
"name": string;
"displayPath": string;
"kind": ("DIRECTORY" | "FILE");
"readable": boolean;
"selectableAsProjectRoot": boolean;
"pathHandle": Id
};
export type Id = string;
export type Empty = Record<string, never>;
export type Revision = number;
export type DeliveryState = "HELD" | "QUEUED" | "DISPATCHING" | "DELIVERED" | "UNKNOWN" | "UNDELIVERABLE";
export type BindingVM = {
"id": Id;
"roleId": Id;
"harness": ("codex" | "kimi_code" | "pi");
"epoch": number;
"workspaceLabel": string;
"current": boolean;
"revision": number;
"providerProfileId"?: Id;
"modelSelection"?: PlanModelSelection;
"nativeCapability"?: {
"resumeWithTransition": boolean;
"bootstrapMode": "DEVELOPER" | "SYSTEM" | "FIRST_USER_INPUT" | "UNSUPPORTED"
}
};
export type ResultVM = {
"id": Id;
"taskId": Id;
"summary": string;
"acceptance": AcceptanceState;
"delivery": DeliveryState;
"artifactIds": Array<Id>;
"revision": number
};
export type QuotaVM = {
"profileId": Id;
"status": ("OK" | "STALE" | "ERROR" | "UNSUPPORTED" | "UNKNOWN");
"observedAtMs": number;
"remainingPercent": number | null
};
export type Capabilities = {
"methods": Array<"system.initialize" | "system.ping" | "system.snapshot" | "events.catchup" | "control.acquire" | "control.renew" | "control.release" | "project.list" | "project.get" | "space.list" | "role.list" | "role.get" | "binding.getCurrent" | "binding.listHistory" | "task.list" | "task.get" | "run.list" | "run.get" | "artifact.list" | "artifact.get" | "approval.list" | "issue.list" | "inbox.list" | "account.listProfiles" | "account.getStatus" | "quota.listSnapshots" | "message.listTimeline" | "conversation.read" | "filesystem.listRoots" | "filesystem.listDirectory" | "filesystem.validateProjectRoot" | "project.create" | "project.archive" | "project.relocate" | "space.create" | "space.updateStatus" | "role.create" | "role.rename" | "role.updateStatus" | "binding.prepareReplacement" | "binding.commitReplacement" | "binding.abortReplacement" | "task.createFromUser" | "task.cancel" | "task.suspend" | "task.resume" | "run.cancel" | "issue.acknowledge" | "issue.resolve" | "inbox.markRead" | "result.accept" | "result.reject" | "run.reconcile" | "conversation.sendUserInput" | "approval.decide" | "account.switch" | "harness.probe" | "harness.list" | "artifact.readChunk" | "artifact.download" | "artifact.verify" | "runtime.getActiveWork" | "runtime.drain" | "runtime.pauseDispatch" | "runtime.resumeDispatch" | "runtime.shutdownCore" | "space.get" | "space.reconfigure.preview" | "space.reconfigure.get" | "space.reconfigure.commit" | "space.reconfigure.abort" | "workspace.list" | "workspace.get" | "workspace.createWorktree" | "workspace.archive" | "model.list" | "model.get" | "model.refresh" | "provider.listProfiles" | "rolePlan.validate" | "rolePlan.apply" | "rolePlan.list" | "rolePlan.get" | "role.createFromSpec" | "roleCharter.get" | "roleCharter.listHistory" | "roleCharter.update" | "task.submitFromUser">;
"remote_filesystem": boolean;
"event_stream": boolean;
"controller_lease": boolean;
"auth_unit_max_active_runs": 1;
"reference_types": {
"artifact": boolean;
"external": boolean;
"git": false;
"live": false
};
"output_types": Array<"artifact">;
"harnesses": {
"codex": {
"status": "UNAVAILABLE" | "PROBED" | "LIVE_TESTED" | "CERTIFIED";
"create_session": boolean;
"cancel": boolean
};
"kimi_code": {
"status": "UNAVAILABLE" | "PROBED" | "LIVE_TESTED" | "CERTIFIED";
"create_session": boolean;
"cancel": boolean
};
"pi": {
"status": "UNAVAILABLE" | "PROBED" | "LIVE_TESTED" | "CERTIFIED";
"create_session": boolean;
"cancel": boolean
}
};
"mock": boolean;
"role_plans"?: boolean;
"role_charters"?: boolean;
"space_reconfiguration"?: boolean;
"model_catalog"?: boolean;
"workspaces"?: boolean
};
export type LeaseVM = {
"leaseId": Id;
"clientId": Id;
"expiresAtMs": number;
"generation": number
};
export type Scope = {
"project_id"?: Id;
"space_id"?: Id
};
export type InitializeParams = {
"client_protocol": "agentrouter-client/1";
"client_version": string;
"client_id": Id;
"requested_mode": "controller" | "observer";
"last_event_cursor"?: number;
"last_server_instance_id"?: Id
};
export type SnapshotVM = {
"cursor": number;
"revision": number;
"projects": Array<ProjectVM>;
"spaces": Array<SpaceVM>;
"roles": Array<RoleVM>;
"tasks": Array<TaskVM>;
"runs": Array<RunVM>;
"issues": Array<IssueVM>;
"approvals": Array<ApprovalVM>;
"results": Array<ResultVM>;
"workspaces"?: Array<WorkspaceVM>;
"modelCatalog"?: Array<ModelDescriptorVM>
};
export type ReconcileParams = {
"run_id": Id;
"action": "confirm_native_completed" | "confirm_no_side_effect_and_retry" | "mark_failed" | "reattach_native_session" | "quarantine_workspace" | "release_after_manual_verification";
"evidence_ids": Array<Id>;
"native_session_handle"?: Id
};
export type ReconciliationVM = {
"auditId": Id;
"runId": Id;
"action": "confirm_native_completed" | "confirm_no_side_effect_and_retry" | "mark_failed" | "reattach_native_session" | "quarantine_workspace" | "release_after_manual_verification";
"actorId": Id;
"occurredAtMs": number;
"evidenceIds": Array<Id>;
"resourceDisposition": "RETAINED" | "QUARANTINED" | "RELEASED_AFTER_VERIFICATION";
"retryScheduled": false;
"revision": number
};
export type ChangeVM = {
"entityId": Id;
"revision": number
};
export type ErrorCode = "INVALID_FRAME" | "INVALID_PARAMS" | "PROTOCOL_INCOMPATIBLE" | "NOT_INITIALIZED" | "ALREADY_INITIALIZED" | "CONTROL_LEASE_REQUIRED" | "CONTROL_LEASE_BUSY" | "CONTROL_LEASE_EXPIRED" | "OPERATION_CONFLICT" | "REVISION_CONFLICT" | "SCOPE_DENIED" | "CAPABILITY_UNAVAILABLE" | "NOT_FOUND" | "CURSOR_EXPIRED" | "CURSOR_INVALID" | "RECONCILIATION_REQUIRED" | "EVIDENCE_REQUIRED" | "REQUEST_TIMEOUT" | "REQUEST_CANCELLED" | "CONNECTION_LOST" | "INTERNAL_ERROR" | "CROSS_SPACE_DENIED" | "PLAN_INVALID" | "PLAN_HASH_MISMATCH" | "CONFIRMATION_REQUIRED" | "RECONFIGURATION_BLOCKED" | "BOOTSTRAP_REQUIRED" | "MODEL_UNVERIFIED" | "MODEL_SELECTION_INVALID" | "PLAN_STATE_CONFLICT";
export type Error = {
"code": ErrorCode;
"category": "VALIDATION" | "AUTHORIZATION" | "UNAVAILABLE" | "CONFLICT" | "AMBIGUOUS" | "INCOMPATIBLE" | "INTERNAL";
"message_key": string;
"retryable": boolean;
"trace_id": Id;
"details": {
"snapshot_required"?: boolean;
"retry_same_operation_only"?: boolean
}
};
export type Event = {
"v": 1;
"event": "project.changed" | "role.changed" | "run.state.changed" | "control.changed" | "notice.stored" | "reconciliation.recorded" | "connection.changed" | "role.plan.applied" | "role.charter.changed" | "space.reconfigured" | "model.catalog.changed" | "workspace.changed";
"cursor": number;
"occurred_at_ms": number;
"payload": {
"entity_id": Id;
"revision": number;
"scope": Scope
}
};
export type CatchupVM = {
"events": Array<Event>;
"next_cursor": number;
"has_more": boolean;
"server_instance_id": Id
};
export type PageParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type SystemInitializeParams = {
"client_protocol": "agentrouter-client/1";
"client_version": string;
"client_id": Id;
"requested_mode": "controller" | "observer";
"last_event_cursor"?: number;
"last_server_instance_id"?: Id;
"contract_revision"?: "C1R1" | "C1R1P1"
};
export type SystemPingParams = Record<string, never>;
export type SystemSnapshotParams = Record<string, never>;
export type EventsCatchupParams = {
"after_cursor": number;
"limit"?: number;
"server_instance_id": Id
};
export type ControlAcquireParams = Record<string, never>;
export type ControlRenewParams = {
"lease_id": Id
};
export type ControlReleaseParams = {
"lease_id": Id
};
export type ProjectVMPage = {
"items": Array<ProjectVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type ProjectListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type ProjectGetParams = {
"id": Id;
"scope": Scope
};
export type SpaceVMPage = {
"items": Array<SpaceVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type SpaceListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type RoleVMPage = {
"items": Array<RoleVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type RoleListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type RoleGetParams = {
"id": Id;
"scope": Scope
};
export type BindingVMPage = {
"items": Array<BindingVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type BindingGetCurrentParams = {
"id": Id;
"scope": Scope
};
export type BindingListHistoryParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type TaskVMPage = {
"items": Array<TaskVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type TaskListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type TaskGetParams = {
"id": Id;
"scope": Scope
};
export type RunVMPage = {
"items": Array<RunVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type RunListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type RunGetParams = {
"id": Id;
"scope": Scope
};
export type ArtifactVMPage = {
"items": Array<ArtifactVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type ArtifactListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type ArtifactGetParams = {
"id": Id;
"scope": Scope
};
export type ApprovalVMPage = {
"items": Array<ApprovalVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type ApprovalListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type IssueVMPage = {
"items": Array<IssueVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type IssueListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type ResultVMPage = {
"items": Array<ResultVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type InboxListParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type AccountProfileVMPage = {
"items": Array<AccountProfileVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type AccountListProfilesParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type AccountGetStatusParams = {
"id": Id;
"scope": Scope
};
export type QuotaVMPage = {
"items": Array<QuotaVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type QuotaListSnapshotsParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type ConversationItemVMPage = {
"items": Array<ConversationItemVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type MessageListTimelineParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number
};
export type ConversationReadParams = {
"scope"?: Scope;
"after_id"?: Id;
"limit"?: number;
"role_id"?: Id;
"task_id"?: Id;
"run_id"?: Id
};
export type RemoteDirectoryPage = {
"items": Array<RemoteDirectoryEntryVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type FilesystemListRootsParams = Record<string, never>;
export type FilesystemListDirectoryParams = {
"path_handle": Id
};
export type FilesystemValidateProjectRootParams = {
"path_handle": Id
};
export type ProjectCreateParams = {
"name": string;
"path_handle": Id
};
export type ProjectArchiveParams = {
"id": Id
};
export type ProjectRelocateParams = {
"id": Id;
"path_handle": Id
};
export type SpaceCreateParams = {
"name": string
};
export type SpaceUpdateStatusParams = {
"id": Id;
"status": SpaceStatus
};
export type RoleCreateParams = {
"name": string;
"description"?: string;
"harness": ("codex" | "kimi_code" | "pi");
"workspace_id": Id
};
export type RoleRenameParams = {
"id": Id;
"name": string
};
export type RoleUpdateStatusParams = {
"id": Id;
"status": RoleStatus
};
export type BindingPrepareReplacementParams = {
"id": Id;
"harness": ("codex" | "kimi_code" | "pi");
"workspace_id": Id
};
export type BindingCommitReplacementParams = {
"id": Id;
"replacement_id": Id
};
export type BindingAbortReplacementParams = {
"id": Id;
"replacement_id": Id
};
export type TaskCreateFromUserParams = {
"role_id": Id;
"summary": string;
"body": string;
"completion": {
"to": {
"type": "user"
}
}
};
export type TaskCancelParams = {
"id": Id
};
export type TaskSuspendParams = {
"id": Id
};
export type TaskResumeParams = {
"id": Id
};
export type RunCancelParams = {
"id": Id
};
export type IssueAcknowledgeParams = {
"id": Id
};
export type IssueResolveParams = {
"id": Id
};
export type InboxMarkReadParams = {
"id": Id
};
export type ResultAcceptParams = {
"id": Id
};
export type ResultRejectParams = {
"id": Id
};
export type RunReconcileParams = {
"run_id": Id;
"action": "confirm_native_completed" | "confirm_no_side_effect_and_retry" | "mark_failed" | "reattach_native_session" | "quarantine_workspace" | "release_after_manual_verification";
"evidence_ids": Array<Id>;
"native_session_handle"?: Id
};
export type ConversationSendUserInputParams = {
"role_id": Id;
"task_id": Id;
"body": string
};
export type ApprovalDecideParams = {
"id": Id;
"decision": "APPROVE" | "DENY"
};
export type AccountSwitchParams = {
"auth_unit_id": Id;
"profile_id": Id
};
export type HarnessProbeParams = {
"harness": ("codex" | "kimi_code" | "pi")
};
export type HarnessListParams = Record<string, never>;
export type ChunkVM = {
"artifactId": Id;
"offset": number;
"byteSize": number;
"encoding": "base64";
"content": string;
"hasMore": boolean
};
export type ArtifactReadChunkParams = {
"id": Id;
"offset_bytes"?: number;
"limit_bytes"?: number
};
export type ArtifactDownloadParams = {
"id": Id;
"offset_bytes"?: number;
"limit_bytes"?: number
};
export type ArtifactVerifyParams = {
"id": Id
};
export type RuntimeGetActiveWorkParams = Record<string, never>;
export type RuntimeDrainParams = Record<string, never>;
export type RuntimePauseDispatchParams = Record<string, never>;
export type RuntimeResumeDispatchParams = Record<string, never>;
export type RuntimeShutdownCoreParams = Record<string, never>;
export type Request = ({
"v": 1;
"id": Id;
"method": "system.initialize";
"params": SystemInitializeParams
} | {
"v": 1;
"id": Id;
"method": "system.ping";
"params": SystemPingParams
} | {
"v": 1;
"id": Id;
"method": "system.snapshot";
"params": SystemSnapshotParams
} | {
"v": 1;
"id": Id;
"method": "events.catchup";
"params": EventsCatchupParams
} | {
"v": 1;
"id": Id;
"method": "control.acquire";
"params": ControlAcquireParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>
} | {
"v": 1;
"id": Id;
"method": "control.renew";
"params": ControlRenewParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>
} | {
"v": 1;
"id": Id;
"method": "control.release";
"params": ControlReleaseParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>
} | {
"v": 1;
"id": Id;
"method": "project.list";
"params": ProjectListParams
} | {
"v": 1;
"id": Id;
"method": "project.get";
"params": ProjectGetParams
} | {
"v": 1;
"id": Id;
"method": "space.list";
"params": SpaceListParams
} | {
"v": 1;
"id": Id;
"method": "role.list";
"params": RoleListParams
} | {
"v": 1;
"id": Id;
"method": "role.get";
"params": RoleGetParams
} | {
"v": 1;
"id": Id;
"method": "binding.getCurrent";
"params": BindingGetCurrentParams
} | {
"v": 1;
"id": Id;
"method": "binding.listHistory";
"params": BindingListHistoryParams
} | {
"v": 1;
"id": Id;
"method": "task.list";
"params": TaskListParams
} | {
"v": 1;
"id": Id;
"method": "task.get";
"params": TaskGetParams
} | {
"v": 1;
"id": Id;
"method": "run.list";
"params": RunListParams
} | {
"v": 1;
"id": Id;
"method": "run.get";
"params": RunGetParams
} | {
"v": 1;
"id": Id;
"method": "artifact.list";
"params": ArtifactListParams
} | {
"v": 1;
"id": Id;
"method": "artifact.get";
"params": ArtifactGetParams
} | {
"v": 1;
"id": Id;
"method": "approval.list";
"params": ApprovalListParams
} | {
"v": 1;
"id": Id;
"method": "issue.list";
"params": IssueListParams
} | {
"v": 1;
"id": Id;
"method": "inbox.list";
"params": InboxListParams
} | {
"v": 1;
"id": Id;
"method": "account.listProfiles";
"params": AccountListProfilesParams
} | {
"v": 1;
"id": Id;
"method": "account.getStatus";
"params": AccountGetStatusParams
} | {
"v": 1;
"id": Id;
"method": "quota.listSnapshots";
"params": QuotaListSnapshotsParams
} | {
"v": 1;
"id": Id;
"method": "message.listTimeline";
"params": MessageListTimelineParams
} | {
"v": 1;
"id": Id;
"method": "conversation.read";
"params": ConversationReadParams
} | {
"v": 1;
"id": Id;
"method": "filesystem.listRoots";
"params": FilesystemListRootsParams
} | {
"v": 1;
"id": Id;
"method": "filesystem.listDirectory";
"params": FilesystemListDirectoryParams
} | {
"v": 1;
"id": Id;
"method": "filesystem.validateProjectRoot";
"params": FilesystemValidateProjectRootParams
} | {
"v": 1;
"id": Id;
"method": "project.create";
"params": ProjectCreateParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "project.archive";
"params": ProjectArchiveParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "project.relocate";
"params": ProjectRelocateParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "space.create";
"params": SpaceCreateParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "space.updateStatus";
"params": SpaceUpdateStatusParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "role.create";
"params": RoleCreateParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "role.rename";
"params": RoleRenameParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "role.updateStatus";
"params": RoleUpdateStatusParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "binding.prepareReplacement";
"params": BindingPrepareReplacementParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "binding.commitReplacement";
"params": BindingCommitReplacementParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "binding.abortReplacement";
"params": BindingAbortReplacementParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "task.createFromUser";
"params": TaskCreateFromUserParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "task.cancel";
"params": TaskCancelParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "task.suspend";
"params": TaskSuspendParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "task.resume";
"params": TaskResumeParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "run.cancel";
"params": RunCancelParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "issue.acknowledge";
"params": IssueAcknowledgeParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "issue.resolve";
"params": IssueResolveParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "inbox.markRead";
"params": InboxMarkReadParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "result.accept";
"params": ResultAcceptParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "result.reject";
"params": ResultRejectParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "run.reconcile";
"params": RunReconcileParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "conversation.sendUserInput";
"params": ConversationSendUserInputParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "approval.decide";
"params": ApprovalDecideParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "account.switch";
"params": AccountSwitchParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "harness.probe";
"params": HarnessProbeParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "harness.list";
"params": HarnessListParams
} | {
"v": 1;
"id": Id;
"method": "artifact.readChunk";
"params": ArtifactReadChunkParams
} | {
"v": 1;
"id": Id;
"method": "artifact.download";
"params": ArtifactDownloadParams
} | {
"v": 1;
"id": Id;
"method": "artifact.verify";
"params": ArtifactVerifyParams
} | {
"v": 1;
"id": Id;
"method": "runtime.getActiveWork";
"params": RuntimeGetActiveWorkParams
} | {
"v": 1;
"id": Id;
"method": "runtime.drain";
"params": RuntimeDrainParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "runtime.pauseDispatch";
"params": RuntimePauseDispatchParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "runtime.resumeDispatch";
"params": RuntimeResumeDispatchParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "runtime.shutdownCore";
"params": RuntimeShutdownCoreParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "space.get";
"params": SpaceGetParams
} | {
"v": 1;
"id": Id;
"method": "space.reconfigure.preview";
"params": SpaceReconfigurePreviewParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "space.reconfigure.get";
"params": SpaceReconfigureGetParams
} | {
"v": 1;
"id": Id;
"method": "space.reconfigure.commit";
"params": SpaceReconfigureCommitParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "space.reconfigure.abort";
"params": SpaceReconfigureAbortParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "workspace.list";
"params": WorkspaceListParams
} | {
"v": 1;
"id": Id;
"method": "workspace.get";
"params": WorkspaceGetParams
} | {
"v": 1;
"id": Id;
"method": "workspace.createWorktree";
"params": WorkspaceCreateWorktreeParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "workspace.archive";
"params": WorkspaceArchiveParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "model.list";
"params": ModelListParams
} | {
"v": 1;
"id": Id;
"method": "model.get";
"params": ModelGetParams
} | {
"v": 1;
"id": Id;
"method": "model.refresh";
"params": ModelRefreshParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": Record<string, never>;
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "provider.listProfiles";
"params": ProviderListProfilesParams
} | {
"v": 1;
"id": Id;
"method": "rolePlan.validate";
"params": RolePlanValidateParams
} | {
"v": 1;
"id": Id;
"method": "rolePlan.apply";
"params": RolePlanApplyParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "rolePlan.list";
"params": RolePlanListParams
} | {
"v": 1;
"id": Id;
"method": "rolePlan.get";
"params": RolePlanGetParams
} | {
"v": 1;
"id": Id;
"method": "role.createFromSpec";
"params": RoleCreateFromSpecParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "roleCharter.get";
"params": RoleCharterGetParams
} | {
"v": 1;
"id": Id;
"method": "roleCharter.listHistory";
"params": RoleCharterListHistoryParams
} | {
"v": 1;
"id": Id;
"method": "roleCharter.update";
"params": RoleCharterUpdateParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
} | {
"v": 1;
"id": Id;
"method": "task.submitFromUser";
"params": TaskSubmitFromUserParams;
"operation_id": Id;
"client_id": Id;
"expected_revision": number;
"scope": {
"project_id": Id;
"space_id": Id
};
"lease_id": Id
});
export type Response = ({
"v": 1;
"id": Id;
"result": (AccountProfileVM | AccountProfileVMPage | ApprovalVMPage | ArtifactVM | ArtifactVMPage | BindingVM | BindingVMPage | Capabilities | CatchupVM | ChangeVM | ChunkVM | ConversationItemVMPage | CoreHelloVM | Empty | IssueVMPage | LeaseVM | ModelDescriptorVM | ModelDescriptorVMPage | ProjectVM | ProjectVMPage | ProviderProfileVMPage | QuotaVMPage | ReconciliationVM | RemoteDirectoryPage | ResultVMPage | RoleCharterVM | RoleCharterVMPage | RolePlanVM | RolePlanVMPage | RolePlanValidationVM | RoleVM | RoleVMPage | RunVM | RunVMPage | SnapshotVM | SpaceReconfigurationPreviewVM | SpaceReconfigurationVM | SpaceVM | SpaceVMPage | TaskVM | TaskVMPage | WorkspaceVM | WorkspaceVMPage)
} | {
"v": 1;
"id": Id;
"error": Error
});
export type Heartbeat = {
"v": 1;
"heartbeat_at_ms": number
};
export type PlanKey = string;
export type PlanTarget = ({
"type": "user"
} | {
"type": "role_key";
"role_key": PlanKey
});
export type PlanModelSelection = {
"harness": "codex" | "kimi_code" | "pi";
"provider_profile_id"?: string;
"account_profile_id"?: string;
"model_id": string;
"reasoning_effort": string;
"selection_source": "runtime" | "verified_cache" | "seed"
};
export type PlanRequestedPermissions = {
"workspace_access": "read_only" | "read_write";
"allowed_paths": Array<string>;
"tool_profiles": Array<string>;
"network_profile": "none" | "provider_only" | "project_allowlist" | "custom_request";
"notes"?: string
};
export type PlanGroup = {
"group_key": PlanKey;
"display_name": string;
"purpose": string;
"communication_boundary": "within_group_only";
"workspace_strategy": "shared_read_only" | "shared_serial_write" | "dedicated_worktree" | "custom";
"workspace_ref"?: string;
"rules": {
"handoff_requirements": Array<string>;
"completion_definition": Array<string>;
"parallelism_notes": string
}
};
export type PlanRole = {
"role_key": PlanKey;
"group_key": PlanKey;
"display_name": string;
"role_kind": string;
"mission": string;
"responsibilities": Array<string>;
"out_of_scope": Array<string>;
"accepted_inputs": Array<string>;
"required_outputs": Array<string>;
"default_completion_target": PlanTarget;
"problem_target": PlanTarget;
"workspace_ref": string;
"requested_permissions": PlanRequestedPermissions;
"runtime": PlanModelSelection;
"bootstrap_notes": string
};
export type RolePlanInput = {
"schema_version": "agentrouter-role-plan/1";
"project_id": string;
"title": string;
"source": "human" | "external_ai" | "agentrouter_setup_session";
"goals": Array<string>;
"non_goals": Array<string>;
"assumptions": Array<string>;
"groups": Array<PlanGroup>;
"roles": Array<PlanRole>;
"review": {
"requires_user_confirmation": true;
"known_risks": Array<string>
}
};
export type RoleBootstrapState = "PENDING" | "DELIVERING" | "DELIVERED" | "FAILED";
export type WorkspaceVM = {
"id": Id;
"projectId": Id;
"label": string;
"kind": "DIRECTORY" | "WORKTREE";
"displayPath": string;
"status": "READY" | "ARCHIVED" | "QUARANTINED";
"access": "READ_ONLY" | "SERIAL_WRITE";
"revision": number;
"baseCommit"?: string;
"branchLabel"?: string
};
export type ReasoningVM = {
"control": "none" | "reasoning_effort" | "thinking_budget";
"levels": Array<string>;
"default"?: string
};
export type ModelDescriptorVM = {
"id": Id;
"harness": "codex" | "kimi_code" | "pi";
"provider_id": string;
"provider_profile_id": Id;
"model_id": string;
"display_name": string;
"source": "RUNTIME" | "VERIFIED_CACHE" | "SEED";
"availability": "AVAILABLE" | "REQUIRES_LOGIN" | "UNVERIFIED" | "RETIRED";
"modalities": Array<string>;
"tool_support": "SUPPORTED" | "UNSUPPORTED" | "VERIFY_AT_RUNTIME";
"reasoning": ReasoningVM;
"last_observed_at"?: number;
"compatibility_notes": Array<string>;
"context_tokens"?: number;
"max_output_tokens"?: number
};
export type ProviderProfileVM = {
"id": Id;
"providerId": string;
"label": string;
"harness": "codex" | "kimi_code" | "pi";
"status": "READY" | "REQUIRES_LOGIN" | "UNVERIFIED" | "DISABLED";
"mock": boolean
};
export type PermissionGrant = {
"role_key": PlanKey;
"permissions": PlanRequestedPermissions
};
export type RoleCharterVM = {
"id": Id;
"roleId": Id;
"projectId": Id;
"spaceId": Id;
"displayName": string;
"revision": number;
"hash": string;
"effectiveAtMs": number;
"policyRevision": number;
"workspaceId": Id;
"spec": PlanRole;
"effectivePermissions": PlanRequestedPermissions;
"directory": Array<{
"roleId": Id;
"displayName": string
}>;
"bootstrapState": RoleBootstrapState;
"bindingEpoch": number
};
export type ValidationIssueVM = {
"code": string;
"field": string
};
export type RolePlanValidationVM = {
"valid": boolean;
"planHash": string;
"errors": Array<ValidationIssueVM>;
"warnings": Array<ValidationIssueVM>;
"requiredConfirmations": Array<string>
};
export type RolePlanVM = {
"id": Id;
"projectId": Id;
"planHash": string;
"sourcePlan": RolePlanInput;
"state": "APPLIED";
"roleIds": Array<Id>;
"spaceIds": Array<Id>;
"revision": number;
"appliedBy": Id
};
export type SessionStrategy = "NEW_SESSION_WITH_HANDOVER" | "NATIVE_RESUME_WITH_TRANSITION" | "KEEP_ARCHIVED_ONLY";
export type QueueDisposition = {
"task_id": Id;
"action": "MOVE_WITH_ASSIGNEE" | "SUSPEND_FOR_REVIEW" | "CANCEL" | "KEEP_IN_ARCHIVED_GROUP";
"reason"?: string
};
export type ReconfigurationInput = {
"mode": "MERGE" | "SPLIT";
"source_space_ids": Array<Id>;
"targets": Array<{
"group_key": PlanKey;
"display_name": string;
"purpose": string;
"rules": {
"handoff_requirements": Array<string>;
"completion_definition": Array<string>;
"parallelism_notes": string
}
}>;
"assignments": Array<{
"role_id": Id;
"target_group_key": PlanKey;
"workspace_id": Id;
"session_strategy"?: SessionStrategy;
"completion_to"?: RoleDestination;
"problem_to"?: RoleDestination
}>;
"task_dispositions": Array<QueueDisposition>
};
export type SpaceReconfigurationPreviewVM = {
"planId": Id;
"planHash": string;
"expectedRevision": number;
"blockers": Array<ValidationIssueVM>;
"affectedRoleIds": Array<Id>;
"affectedTaskIds": Array<Id>;
"affectedRunIds": Array<Id>;
"affectedWorkspaceIds": Array<Id>;
"proposedDestinations": ReconfigurationInput;
"requiredConfirmations": Array<string>
};
export type GroupTransitionPacketVM = {
"roleId": Id;
"oldSpaceId": Id;
"newSpaceId": Id;
"effectiveAtMs": number;
"policyRevision": number;
"charterId": Id;
"directory": Array<{
"roleId": Id;
"displayName": string
}>;
"workspaceId": Id;
"effectivePermissions": PlanRequestedPermissions;
"taskDispositions": Array<QueueDisposition>;
"strategy": SessionStrategy;
"confirmedFacts": Array<string>;
"nextStep": string;
"untrustedOldAssumptions": Array<string>
};
export type SpaceReconfigurationVM = {
"id": Id;
"state": "PREVIEW" | "COMMITTED" | "ABORTED";
"preview": SpaceReconfigurationPreviewVM;
"newSpaceIds": Array<Id>;
"transitionPackets": Array<GroupTransitionPacketVM>;
"auditId": Id;
"revision": number
};
export type GroupStatusSummaryVM = {
"spaceId": Id;
"name": string;
"roles": Array<{
"roleId": Id;
"name": string;
"status": RoleStatus
}>;
"extraRolesCount": number;
"activeRunsCount": number;
"queuedTasksCount": number;
"needsUserCount": number;
"pendingApprovalsCount": number
};
export type ProjectStatusSummaryVM = {
"groups": Array<GroupStatusSummaryVM>;
"extraGroupsCount": number;
"activeRunsCount": number;
"queuedTasksCount": number;
"needsUserCount": number;
"pendingApprovalsCount": number;
"lastActivityAtMs": number
};
export type WorkspaceVMPage = {
"items": Array<WorkspaceVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type ModelDescriptorVMPage = {
"items": Array<ModelDescriptorVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type ProviderProfileVMPage = {
"items": Array<ProviderProfileVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type RolePlanVMPage = {
"items": Array<RolePlanVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type RoleCharterVMPage = {
"items": Array<RoleCharterVM>;
"next_id": (Id | null);
"has_more": boolean
};
export type SpaceGetParams = {
"id": Id;
"project_id": Id
};
export type SpaceReconfigurePreviewParams = {
"plan": ReconfigurationInput
};
export type SpaceReconfigureGetParams = {
"id": Id;
"project_id": Id
};
export type SpaceReconfigureCommitParams = {
"plan_id": Id;
"plan_hash": string;
"confirmed": true
};
export type SpaceReconfigureAbortParams = {
"plan_id": Id
};
export type WorkspaceListParams = {
"project_id": Id
};
export type WorkspaceGetParams = {
"id": Id;
"project_id": Id
};
export type WorkspaceCreateWorktreeParams = {
"label": string;
"base_commit": string;
"branch_name": string
};
export type WorkspaceArchiveParams = {
"id": Id
};
export type ModelListParams = {
"harness"?: "codex" | "kimi_code" | "pi";
"provider_profile_id"?: Id
};
export type ModelGetParams = {
"provider_profile_id": Id;
"model_id": string
};
export type ModelRefreshParams = {
"provider_profile_id": Id
};
export type ProviderListProfilesParams = Record<string, never>;
export type RolePlanValidateParams = {
"plan": RolePlanInput
};
export type RolePlanApplyParams = {
"plan": RolePlanInput;
"plan_hash": string;
"confirmed": true;
"permission_grants": Array<PermissionGrant>
};
export type RolePlanListParams = {
"project_id": Id
};
export type RolePlanGetParams = {
"id": Id;
"project_id": Id
};
export type RoleCreateFromSpecParams = {
"spec": PlanRole;
"confirmed": true;
"permissions": PlanRequestedPermissions
};
export type RoleCharterGetParams = {
"role_id": Id;
"project_id": Id
};
export type RoleCharterListHistoryParams = {
"role_id": Id;
"project_id": Id
};
export type RoleCharterUpdateParams = {
"role_id": Id;
"spec": PlanRole;
"confirmed": true;
"permissions": PlanRequestedPermissions
};
export type RoleDestination = ({
"type": "user"
} | {
"type": "role";
"id": Id
});
export type UserRouteId = string;
export type UserRouteRoletarget = {
"type": "role";
"id": string
};
export type UserRouteUsertarget = {
"type": "user"
};
export type UserRouteTarget = ({
"type": "role";
"id": string
} | {
"type": "user"
});
export type UserRouteReference = ({
"kind": "artifact";
"artifact_id": string
} | {
"kind": "git";
"repository_id": string;
"commit": string;
"path": string
} | {
"kind": "live";
"workspace_id": string;
"path": string
} | {
"kind": "external";
"uri": string;
"version"?: string;
"description": string
});
export type UserRouteCompletion = ({
"mode": "result";
"to": UserRouteTarget;
"instruction"?: string
} | {
"mode": "handoff";
"to": UserRouteRoletarget;
"instruction": string
});
export type UserRouteRequest = {
"kind": "task.request";
"to": UserRouteRoletarget;
"summary": string;
"body": string;
"inputs": Array<UserRouteReference>;
"expected": Array<string>;
"completion": UserRouteCompletion;
"on_problem"?: UserRouteTarget;
"project_data"?: Record<string, unknown>
};
export type UserRouteNotice = {
"kind": "notice";
"to": UserRouteTarget;
"summary": string;
"body": string;
"inputs": Array<UserRouteReference>;
"project_data"?: Record<string, unknown>
};
export type UserRouteFinish = {
"outcome": "succeeded" | "partial" | "failed" | "cancelled";
"summary": string;
"body": string;
"outputs": Array<UserRouteReference>;
"next_request"?: UserRouteRequest
};
export type UserRouteWait = {
"waiting_for": "child_results" | "user_input" | "external_condition";
"reason": string;
"child_task_ids"?: Array<string>
};
export type UserRouteError = {
"code": string;
"category": "VALIDATION" | "AUTHORIZATION" | "UNAVAILABLE" | "CONFLICT" | "AMBIGUOUS";
"field": string | null;
"message": string;
"suggestion": string;
"retryable": boolean;
"trace_id": string
};
export type TaskSubmitFromUserParams = {
"request": UserRouteRequest
};
export interface MethodMap {
"system.initialize": {params: SystemInitializeParams; result: CoreHelloVM};
"system.ping": {params: SystemPingParams; result: Empty};
"system.snapshot": {params: SystemSnapshotParams; result: SnapshotVM};
"events.catchup": {params: EventsCatchupParams; result: CatchupVM};
"control.acquire": {params: ControlAcquireParams; result: LeaseVM};
"control.renew": {params: ControlRenewParams; result: LeaseVM};
"control.release": {params: ControlReleaseParams; result: Empty};
"project.list": {params: ProjectListParams; result: ProjectVMPage};
"project.get": {params: ProjectGetParams; result: ProjectVM};
"space.list": {params: SpaceListParams; result: SpaceVMPage};
"role.list": {params: RoleListParams; result: RoleVMPage};
"role.get": {params: RoleGetParams; result: RoleVM};
"binding.getCurrent": {params: BindingGetCurrentParams; result: BindingVM};
"binding.listHistory": {params: BindingListHistoryParams; result: BindingVMPage};
"task.list": {params: TaskListParams; result: TaskVMPage};
"task.get": {params: TaskGetParams; result: TaskVM};
"run.list": {params: RunListParams; result: RunVMPage};
"run.get": {params: RunGetParams; result: RunVM};
"artifact.list": {params: ArtifactListParams; result: ArtifactVMPage};
"artifact.get": {params: ArtifactGetParams; result: ArtifactVM};
"approval.list": {params: ApprovalListParams; result: ApprovalVMPage};
"issue.list": {params: IssueListParams; result: IssueVMPage};
"inbox.list": {params: InboxListParams; result: ResultVMPage};
"account.listProfiles": {params: AccountListProfilesParams; result: AccountProfileVMPage};
"account.getStatus": {params: AccountGetStatusParams; result: AccountProfileVM};
"quota.listSnapshots": {params: QuotaListSnapshotsParams; result: QuotaVMPage};
"message.listTimeline": {params: MessageListTimelineParams; result: ConversationItemVMPage};
"conversation.read": {params: ConversationReadParams; result: ConversationItemVMPage};
"filesystem.listRoots": {params: FilesystemListRootsParams; result: RemoteDirectoryPage};
"filesystem.listDirectory": {params: FilesystemListDirectoryParams; result: RemoteDirectoryPage};
"filesystem.validateProjectRoot": {params: FilesystemValidateProjectRootParams; result: RemoteDirectoryPage};
"project.create": {params: ProjectCreateParams; result: ProjectVM};
"project.archive": {params: ProjectArchiveParams; result: ChangeVM};
"project.relocate": {params: ProjectRelocateParams; result: ChangeVM};
"space.create": {params: SpaceCreateParams; result: SpaceVM};
"space.updateStatus": {params: SpaceUpdateStatusParams; result: ChangeVM};
"role.create": {params: RoleCreateParams; result: RoleVM};
"role.rename": {params: RoleRenameParams; result: ChangeVM};
"role.updateStatus": {params: RoleUpdateStatusParams; result: ChangeVM};
"binding.prepareReplacement": {params: BindingPrepareReplacementParams; result: ChangeVM};
"binding.commitReplacement": {params: BindingCommitReplacementParams; result: ChangeVM};
"binding.abortReplacement": {params: BindingAbortReplacementParams; result: ChangeVM};
"task.createFromUser": {params: TaskCreateFromUserParams; result: TaskVM};
"task.cancel": {params: TaskCancelParams; result: ChangeVM};
"task.suspend": {params: TaskSuspendParams; result: ChangeVM};
"task.resume": {params: TaskResumeParams; result: ChangeVM};
"run.cancel": {params: RunCancelParams; result: ChangeVM};
"issue.acknowledge": {params: IssueAcknowledgeParams; result: ChangeVM};
"issue.resolve": {params: IssueResolveParams; result: ChangeVM};
"inbox.markRead": {params: InboxMarkReadParams; result: ChangeVM};
"result.accept": {params: ResultAcceptParams; result: ChangeVM};
"result.reject": {params: ResultRejectParams; result: ChangeVM};
"run.reconcile": {params: RunReconcileParams; result: ReconciliationVM};
"conversation.sendUserInput": {params: ConversationSendUserInputParams; result: ChangeVM};
"approval.decide": {params: ApprovalDecideParams; result: ChangeVM};
"account.switch": {params: AccountSwitchParams; result: ChangeVM};
"harness.probe": {params: HarnessProbeParams; result: Capabilities};
"harness.list": {params: HarnessListParams; result: Capabilities};
"artifact.readChunk": {params: ArtifactReadChunkParams; result: ChunkVM};
"artifact.download": {params: ArtifactDownloadParams; result: ChunkVM};
"artifact.verify": {params: ArtifactVerifyParams; result: ArtifactVM};
"runtime.getActiveWork": {params: RuntimeGetActiveWorkParams; result: SnapshotVM};
"runtime.drain": {params: RuntimeDrainParams; result: ChangeVM};
"runtime.pauseDispatch": {params: RuntimePauseDispatchParams; result: ChangeVM};
"runtime.resumeDispatch": {params: RuntimeResumeDispatchParams; result: ChangeVM};
"runtime.shutdownCore": {params: RuntimeShutdownCoreParams; result: ChangeVM};
"space.get": {params: SpaceGetParams; result: SpaceVM};
"space.reconfigure.preview": {params: SpaceReconfigurePreviewParams; result: SpaceReconfigurationPreviewVM};
"space.reconfigure.get": {params: SpaceReconfigureGetParams; result: SpaceReconfigurationVM};
"space.reconfigure.commit": {params: SpaceReconfigureCommitParams; result: SpaceReconfigurationVM};
"space.reconfigure.abort": {params: SpaceReconfigureAbortParams; result: SpaceReconfigurationVM};
"workspace.list": {params: WorkspaceListParams; result: WorkspaceVMPage};
"workspace.get": {params: WorkspaceGetParams; result: WorkspaceVM};
"workspace.createWorktree": {params: WorkspaceCreateWorktreeParams; result: WorkspaceVM};
"workspace.archive": {params: WorkspaceArchiveParams; result: WorkspaceVM};
"model.list": {params: ModelListParams; result: ModelDescriptorVMPage};
"model.get": {params: ModelGetParams; result: ModelDescriptorVM};
"model.refresh": {params: ModelRefreshParams; result: ModelDescriptorVMPage};
"provider.listProfiles": {params: ProviderListProfilesParams; result: ProviderProfileVMPage};
"rolePlan.validate": {params: RolePlanValidateParams; result: RolePlanValidationVM};
"rolePlan.apply": {params: RolePlanApplyParams; result: RolePlanVM};
"rolePlan.list": {params: RolePlanListParams; result: RolePlanVMPage};
"rolePlan.get": {params: RolePlanGetParams; result: RolePlanVM};
"role.createFromSpec": {params: RoleCreateFromSpecParams; result: RoleVM};
"roleCharter.get": {params: RoleCharterGetParams; result: RoleCharterVM};
"roleCharter.listHistory": {params: RoleCharterListHistoryParams; result: RoleCharterVMPage};
"roleCharter.update": {params: RoleCharterUpdateParams; result: RoleCharterVM};
"task.submitFromUser": {params: TaskSubmitFromUserParams; result: TaskVM};
}
export type Method = keyof MethodMap;
export const methodMetadata = {
  "system.initialize": {
    "params": "SystemInitializeParams",
    "result": "CoreHelloVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "system.ping": {
    "params": "SystemPingParams",
    "result": "Empty",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "system.snapshot": {
    "params": "SystemSnapshotParams",
    "result": "SnapshotVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "events.catchup": {
    "params": "EventsCatchupParams",
    "result": "CatchupVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "control.acquire": {
    "params": "ControlAcquireParams",
    "result": "LeaseVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": true
  },
  "control.renew": {
    "params": "ControlRenewParams",
    "result": "LeaseVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": true
  },
  "control.release": {
    "params": "ControlReleaseParams",
    "result": "Empty",
    "mutation": true,
    "scope": "global",
    "mockImplemented": true
  },
  "project.list": {
    "params": "ProjectListParams",
    "result": "ProjectVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "project.get": {
    "params": "ProjectGetParams",
    "result": "ProjectVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "space.list": {
    "params": "SpaceListParams",
    "result": "SpaceVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "role.list": {
    "params": "RoleListParams",
    "result": "RoleVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "role.get": {
    "params": "RoleGetParams",
    "result": "RoleVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "binding.getCurrent": {
    "params": "BindingGetCurrentParams",
    "result": "BindingVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "binding.listHistory": {
    "params": "BindingListHistoryParams",
    "result": "BindingVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "task.list": {
    "params": "TaskListParams",
    "result": "TaskVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "task.get": {
    "params": "TaskGetParams",
    "result": "TaskVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "run.list": {
    "params": "RunListParams",
    "result": "RunVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "run.get": {
    "params": "RunGetParams",
    "result": "RunVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "artifact.list": {
    "params": "ArtifactListParams",
    "result": "ArtifactVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "artifact.get": {
    "params": "ArtifactGetParams",
    "result": "ArtifactVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "approval.list": {
    "params": "ApprovalListParams",
    "result": "ApprovalVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "issue.list": {
    "params": "IssueListParams",
    "result": "IssueVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "inbox.list": {
    "params": "InboxListParams",
    "result": "ResultVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "account.listProfiles": {
    "params": "AccountListProfilesParams",
    "result": "AccountProfileVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "account.getStatus": {
    "params": "AccountGetStatusParams",
    "result": "AccountProfileVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "quota.listSnapshots": {
    "params": "QuotaListSnapshotsParams",
    "result": "QuotaVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "message.listTimeline": {
    "params": "MessageListTimelineParams",
    "result": "ConversationItemVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "conversation.read": {
    "params": "ConversationReadParams",
    "result": "ConversationItemVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "filesystem.listRoots": {
    "params": "FilesystemListRootsParams",
    "result": "RemoteDirectoryPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "filesystem.listDirectory": {
    "params": "FilesystemListDirectoryParams",
    "result": "RemoteDirectoryPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "filesystem.validateProjectRoot": {
    "params": "FilesystemValidateProjectRootParams",
    "result": "RemoteDirectoryPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "project.create": {
    "params": "ProjectCreateParams",
    "result": "ProjectVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "project.archive": {
    "params": "ProjectArchiveParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": false
  },
  "project.relocate": {
    "params": "ProjectRelocateParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": false
  },
  "space.create": {
    "params": "SpaceCreateParams",
    "result": "SpaceVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": false
  },
  "space.updateStatus": {
    "params": "SpaceUpdateStatusParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "role.create": {
    "params": "RoleCreateParams",
    "result": "RoleVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "role.rename": {
    "params": "RoleRenameParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": true
  },
  "role.updateStatus": {
    "params": "RoleUpdateStatusParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "binding.prepareReplacement": {
    "params": "BindingPrepareReplacementParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "binding.commitReplacement": {
    "params": "BindingCommitReplacementParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "binding.abortReplacement": {
    "params": "BindingAbortReplacementParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "task.createFromUser": {
    "params": "TaskCreateFromUserParams",
    "result": "TaskVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "task.cancel": {
    "params": "TaskCancelParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "task.suspend": {
    "params": "TaskSuspendParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "task.resume": {
    "params": "TaskResumeParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "run.cancel": {
    "params": "RunCancelParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "issue.acknowledge": {
    "params": "IssueAcknowledgeParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "issue.resolve": {
    "params": "IssueResolveParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "inbox.markRead": {
    "params": "InboxMarkReadParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "result.accept": {
    "params": "ResultAcceptParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "result.reject": {
    "params": "ResultRejectParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "run.reconcile": {
    "params": "RunReconcileParams",
    "result": "ReconciliationVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": true
  },
  "conversation.sendUserInput": {
    "params": "ConversationSendUserInputParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "approval.decide": {
    "params": "ApprovalDecideParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": false
  },
  "account.switch": {
    "params": "AccountSwitchParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "harness.probe": {
    "params": "HarnessProbeParams",
    "result": "Capabilities",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "harness.list": {
    "params": "HarnessListParams",
    "result": "Capabilities",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "artifact.readChunk": {
    "params": "ArtifactReadChunkParams",
    "result": "ChunkVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "artifact.download": {
    "params": "ArtifactDownloadParams",
    "result": "ChunkVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "artifact.verify": {
    "params": "ArtifactVerifyParams",
    "result": "ArtifactVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": false
  },
  "runtime.getActiveWork": {
    "params": "RuntimeGetActiveWorkParams",
    "result": "SnapshotVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "runtime.drain": {
    "params": "RuntimeDrainParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "runtime.pauseDispatch": {
    "params": "RuntimePauseDispatchParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "runtime.resumeDispatch": {
    "params": "RuntimeResumeDispatchParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "runtime.shutdownCore": {
    "params": "RuntimeShutdownCoreParams",
    "result": "ChangeVM",
    "mutation": true,
    "scope": "global",
    "mockImplemented": false
  },
  "space.get": {
    "params": "SpaceGetParams",
    "result": "SpaceVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "space.reconfigure.preview": {
    "params": "SpaceReconfigurePreviewParams",
    "result": "SpaceReconfigurationPreviewVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": true
  },
  "space.reconfigure.get": {
    "params": "SpaceReconfigureGetParams",
    "result": "SpaceReconfigurationVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "space.reconfigure.commit": {
    "params": "SpaceReconfigureCommitParams",
    "result": "SpaceReconfigurationVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": true
  },
  "space.reconfigure.abort": {
    "params": "SpaceReconfigureAbortParams",
    "result": "SpaceReconfigurationVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": true
  },
  "workspace.list": {
    "params": "WorkspaceListParams",
    "result": "WorkspaceVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "workspace.get": {
    "params": "WorkspaceGetParams",
    "result": "WorkspaceVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "workspace.createWorktree": {
    "params": "WorkspaceCreateWorktreeParams",
    "result": "WorkspaceVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": true
  },
  "workspace.archive": {
    "params": "WorkspaceArchiveParams",
    "result": "WorkspaceVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": true
  },
  "model.list": {
    "params": "ModelListParams",
    "result": "ModelDescriptorVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "model.get": {
    "params": "ModelGetParams",
    "result": "ModelDescriptorVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "model.refresh": {
    "params": "ModelRefreshParams",
    "result": "ModelDescriptorVMPage",
    "mutation": true,
    "scope": "global",
    "mockImplemented": true
  },
  "provider.listProfiles": {
    "params": "ProviderListProfilesParams",
    "result": "ProviderProfileVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "rolePlan.validate": {
    "params": "RolePlanValidateParams",
    "result": "RolePlanValidationVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "rolePlan.apply": {
    "params": "RolePlanApplyParams",
    "result": "RolePlanVM",
    "mutation": true,
    "scope": "project",
    "mockImplemented": true
  },
  "rolePlan.list": {
    "params": "RolePlanListParams",
    "result": "RolePlanVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "rolePlan.get": {
    "params": "RolePlanGetParams",
    "result": "RolePlanVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "role.createFromSpec": {
    "params": "RoleCreateFromSpecParams",
    "result": "RoleVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": true
  },
  "roleCharter.get": {
    "params": "RoleCharterGetParams",
    "result": "RoleCharterVM",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "roleCharter.listHistory": {
    "params": "RoleCharterListHistoryParams",
    "result": "RoleCharterVMPage",
    "mutation": false,
    "scope": "none",
    "mockImplemented": true
  },
  "roleCharter.update": {
    "params": "RoleCharterUpdateParams",
    "result": "RoleCharterVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": true
  },
  "task.submitFromUser": {
    "params": "TaskSubmitFromUserParams",
    "result": "TaskVM",
    "mutation": true,
    "scope": "space",
    "mockImplemented": true
  }
} as const;
