-- AgentRouter V1.0 database baseline. This is not an application implementation.
-- Apply through versioned migrations. Core remains the single writer.
-- Semantic checks (scope, transition, epoch, artifact reachability) remain mandatory.
PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at_ms INTEGER NOT NULL,
  checksum TEXT NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL,
  canonical_root TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE spaces (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE repositories (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  canonical_path TEXT NOT NULL, source_address TEXT,
  object_format TEXT NOT NULL CHECK(object_format IN ('sha1','sha256'))
);
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  repository_id TEXT REFERENCES repositories(id),
  display_path TEXT NOT NULL, canonical_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MAIN','WORKTREE','DIRECTORY')),
  base_oid TEXT, branch_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('READY','PAUSED','QUARANTINED','MISSING','ARCHIVED'))
);
CREATE INDEX workspace_physical_path ON workspaces(canonical_path);
CREATE TABLE policies (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  revision INTEGER NOT NULL CHECK(revision > 0),
  protocol_version TEXT NOT NULL CHECK(protocol_version = 'agentrouter/1.0'),
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  content_hash TEXT NOT NULL, published_at_ms INTEGER NOT NULL,
  UNIQUE(project_id, revision)
);
CREATE TABLE roles (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','PAUSED','DISABLED','ARCHIVED')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE account_profiles (
  id TEXT PRIMARY KEY,
  harness TEXT NOT NULL CHECK(harness IN ('codex','kimi_code','pi')),
  label TEXT NOT NULL, identity_json TEXT CHECK(identity_json IS NULL OR json_valid(identity_json)),
  auth_kind TEXT NOT NULL CHECK(auth_kind IN ('API_KEY','OAUTH','OTHER')),
  secret_ref TEXT, profile_home TEXT,
  status TEXT NOT NULL CHECK(status IN ('READY','UNKNOWN','EXPIRED','REVOKED','DISABLED'))
);
CREATE TABLE auth_units (
  id TEXT PRIMARY KEY,
  harness TEXT NOT NULL CHECK(harness IN ('codex','kimi_code','pi')),
  active_account_id TEXT REFERENCES account_profiles(id),
  runtime_home TEXT NOT NULL,
  max_active_runs INTEGER NOT NULL DEFAULT 1 CHECK(max_active_runs > 0),
  state TEXT NOT NULL CHECK(state IN ('READY','PAUSED','SWITCHING','QUARANTINED'))
);
CREATE TABLE bindings (
  id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES roles(id),
  harness TEXT NOT NULL CHECK(harness IN ('codex','kimi_code','pi')),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  account_id TEXT REFERENCES account_profiles(id), auth_unit_id TEXT REFERENCES auth_units(id),
  model_json TEXT NOT NULL CHECK(json_valid(model_json)),
  capability_json TEXT NOT NULL CHECK(json_valid(capability_json)),
  native_session_ref TEXT,
  epoch INTEGER NOT NULL CHECK(epoch > 0),
  is_current INTEGER NOT NULL CHECK(is_current IN (0,1)),
  last_synced_policy_id TEXT REFERENCES policies(id),
  continuity_mode TEXT NOT NULL CHECK(continuity_mode IN ('NEW','NATIVE_RESUME','HANDOVER_NEW_SESSION')),
  created_at_ms INTEGER NOT NULL,
  UNIQUE(role_id, epoch)
);
CREATE UNIQUE INDEX one_current_binding_per_role ON bindings(role_id) WHERE is_current=1;
CREATE TABLE chains (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id),
  root_operation_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
  max_auto_starts INTEGER NOT NULL CHECK(max_auto_starts > 0),
  max_wall_ms INTEGER NOT NULL CHECK(max_wall_ms > 0),
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','PAUSED','CLOSED'))
);
CREATE TABLE tasks (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  requester_role_id TEXT REFERENCES roles(id), assignee_role_id TEXT NOT NULL REFERENCES roles(id),
  parent_task_id TEXT REFERENCES tasks(id), chain_id TEXT NOT NULL REFERENCES chains(id),
  policy_id TEXT NOT NULL REFERENCES policies(id),
  summary TEXT NOT NULL, body TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  completion_json TEXT NOT NULL CHECK(json_valid(completion_json)),
  problem_target_json TEXT NOT NULL CHECK(json_valid(problem_target_json)),
  state TEXT NOT NULL CHECK(state IN ('QUEUED','ACTIVE','WAITING_INPUT','RESULT_STAGED','DELIVERED','HANDED_OFF','PARTIAL','FAILED','CANCELLED','NEEDS_ATTENTION','SUSPENDED')),
  acceptance TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(acceptance IN ('NOT_REQUIRED','PENDING','ACCEPTED','REJECTED')),
  created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
);
CREATE INDEX task_queue ON tasks(assignee_role_id,state,seq);
CREATE UNIQUE INDEX one_active_independent_task ON tasks(assignee_role_id)
  WHERE state IN ('ACTIVE','WAITING_INPUT','RESULT_STAGED');
CREATE TABLE runs (
  id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES roles(id),
  binding_id TEXT NOT NULL REFERENCES bindings(id), task_id TEXT REFERENCES tasks(id),
  chain_id TEXT REFERENCES chains(id),
  kind TEXT NOT NULL CHECK(kind IN ('TASK','CONTINUATION','MANAGEMENT','RESULT_HANDLING')),
  binding_epoch INTEGER NOT NULL CHECK(binding_epoch > 0),
  native_run_ref TEXT, request_snapshot_json TEXT NOT NULL CHECK(json_valid(request_snapshot_json)),
  state TEXT NOT NULL CHECK(state IN ('CREATED','STARTING','RUNNING','WAITING_APPROVAL','SETTLING','SUCCEEDED','FAILED','CANCELLED','UNKNOWN')),
  accepted_at_ms INTEGER, settled_at_ms INTEGER, exit_reason TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_live_run_per_role ON runs(role_id)
  WHERE state IN ('CREATED','STARTING','RUNNING','WAITING_APPROVAL','SETTLING');
CREATE TABLE role_slots (
  role_id TEXT PRIMARY KEY REFERENCES roles(id),
  active_task_id TEXT REFERENCES tasks(id), active_run_id TEXT UNIQUE REFERENCES runs(id),
  blocked_reason TEXT, epoch INTEGER NOT NULL DEFAULT 0 CHECK(epoch>=0)
);
CREATE TABLE operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  committed_at_ms INTEGER NOT NULL,
  UNIQUE(scope_key,operation_id)
);
CREATE TABLE messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
  space_id TEXT NOT NULL REFERENCES spaces(id), task_id TEXT REFERENCES tasks(id),
  kind TEXT NOT NULL CHECK(kind IN ('task.request','task.result','notice')),
  from_kind TEXT NOT NULL CHECK(from_kind IN ('role','user','system')),
  from_role_id TEXT REFERENCES roles(id),
  to_kind TEXT NOT NULL CHECK(to_kind IN ('role','user')),
  to_role_id TEXT REFERENCES roles(id),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  causation_message_id TEXT REFERENCES messages(id),
  operation_row_id INTEGER NOT NULL REFERENCES operations(id),
  created_at_ms INTEGER NOT NULL,
  CHECK((from_kind='role' AND from_role_id IS NOT NULL) OR (from_kind<>'role' AND from_role_id IS NULL)),
  CHECK((to_kind='role' AND to_role_id IS NOT NULL) OR (to_kind='user' AND to_role_id IS NULL))
);
CREATE TABLE results (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
  run_id TEXT NOT NULL REFERENCES runs(id),
  outcome TEXT NOT NULL CHECK(outcome IN ('succeeded','partial','failed','cancelled')),
  summary TEXT NOT NULL, body TEXT NOT NULL,
  outputs_json TEXT NOT NULL CHECK(json_valid(outputs_json)),
  publication_state TEXT NOT NULL CHECK(publication_state IN ('STAGED','PUBLISHED','QUARANTINED')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
  message_id TEXT NOT NULL UNIQUE REFERENCES messages(id),
  after_run_id TEXT REFERENCES runs(id),
  state TEXT NOT NULL CHECK(state IN ('HELD','QUEUED','DISPATCHING','DELIVERED','UNKNOWN','UNDELIVERABLE')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  claimed_run_id TEXT REFERENCES runs(id), last_error_code TEXT,
  updated_at_ms INTEGER NOT NULL,
  CHECK(state<>'HELD' OR after_run_id IS NOT NULL)
);
CREATE INDEX outbox_dispatch ON outbox(state,seq);
CREATE TABLE continuations (
  id TEXT PRIMARY KEY, parent_task_id TEXT NOT NULL REFERENCES tasks(id),
  result_id TEXT NOT NULL REFERENCES results(id),
  consumed_run_id TEXT REFERENCES runs(id),
  created_at_ms INTEGER NOT NULL,
  UNIQUE(parent_task_id,result_id)
);
CREATE TABLE wait_records (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  waiting_for TEXT NOT NULL CHECK(waiting_for IN ('child_results','user_input','external_condition')),
  reason TEXT NOT NULL, dependency_json TEXT NOT NULL CHECK(json_valid(dependency_json)),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)), updated_at_ms INTEGER NOT NULL
);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size>=0), media_type TEXT NOT NULL,
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  state TEXT NOT NULL CHECK(state IN ('AVAILABLE','MISSING','QUARANTINED','RETIRED')),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE artifact_links (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('MESSAGE','RESULT','POLICY','HANDOVER')),
  owner_id TEXT NOT NULL,
  PRIMARY KEY(artifact_id,owner_kind,owner_id)
);
CREATE TABLE resource_leases (
  resource_key TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  binding_epoch INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('HELD','QUARANTINED')),
  acquired_at_ms INTEGER NOT NULL
);
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL,
  role_id TEXT REFERENCES roles(id), task_id TEXT REFERENCES tasks(id), run_id TEXT REFERENCES runs(id),
  native_event_key TEXT, replay INTEGER NOT NULL DEFAULT 0 CHECK(replay IN(0,1)),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX native_event_dedupe ON events(run_id,native_event_key) WHERE native_event_key IS NOT NULL;
CREATE TABLE approvals (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  native_request_id TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  state TEXT NOT NULL CHECK(state IN ('PENDING','APPROVED','DENIED','CANCELLED','EXPIRED')),
  created_at_ms INTEGER NOT NULL, expires_at_ms INTEGER, decided_at_ms INTEGER,
  UNIQUE(run_id,native_request_id)
);
CREATE TABLE issues (
  id TEXT PRIMARY KEY, space_id TEXT REFERENCES spaces(id),
  role_id TEXT REFERENCES roles(id), task_id TEXT REFERENCES tasks(id), run_id TEXT REFERENCES runs(id),
  code TEXT NOT NULL, detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),
  state TEXT NOT NULL CHECK(state IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  created_at_ms INTEGER NOT NULL, resolved_at_ms INTEGER
);
CREATE TABLE auto_starts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  role_id TEXT NOT NULL REFERENCES roles(id), space_id TEXT NOT NULL REFERENCES spaces(id),
  chain_id TEXT REFERENCES chains(id), started_at_ms INTEGER NOT NULL
);
CREATE INDEX starts_role_window ON auto_starts(role_id,started_at_ms);
CREATE INDEX starts_space_window ON auto_starts(space_id,started_at_ms);
CREATE TABLE quota_snapshots (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES account_profiles(id),
  status TEXT NOT NULL CHECK(status IN ('OK','STALE','ERROR','UNSUPPORTED','UNKNOWN')),
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  observed_at_ms INTEGER NOT NULL, expires_at_ms INTEGER, source TEXT NOT NULL
);
CREATE TABLE account_switch_ops (
  id TEXT PRIMARY KEY, auth_unit_id TEXT NOT NULL REFERENCES auth_units(id),
  old_account_id TEXT REFERENCES account_profiles(id), new_account_id TEXT NOT NULL REFERENCES account_profiles(id),
  state TEXT NOT NULL CHECK(state IN ('REQUESTED','PAUSING','QUIESCING','SNAPSHOT_OLD','INSTALL_TARGET','VERIFYING','COMMITTED','FAILED_SAFE','ROLLBACK_REQUIRED')),
  journal_json TEXT NOT NULL CHECK(json_valid(journal_json)),
  created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), updated_at_ms INTEGER NOT NULL
);
