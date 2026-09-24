-- 006: 动态 HarnessId(CCR-J3-DRIVER-01 批准后)。移除四表的 harness 枚举 CHECK,
-- 合法集合改由 HarnessDriverRegistry 运行时判定。旧数据原样保留。
CREATE TABLE account_profiles_v6 (
  id TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  label TEXT NOT NULL, identity_json TEXT CHECK(identity_json IS NULL OR json_valid(identity_json)),
  auth_kind TEXT NOT NULL CHECK(auth_kind IN ('API_KEY','OAUTH','OTHER')),
  secret_ref TEXT, profile_home TEXT,
  status TEXT NOT NULL CHECK(status IN ('READY','UNKNOWN','EXPIRED','REVOKED','DISABLED'))
);
INSERT INTO account_profiles_v6 SELECT * FROM account_profiles;
DROP TABLE account_profiles;
ALTER TABLE account_profiles_v6 RENAME TO account_profiles;

CREATE TABLE auth_units_v6 (
  id TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  active_account_id TEXT REFERENCES account_profiles(id),
  runtime_home TEXT NOT NULL,
  max_active_runs INTEGER NOT NULL DEFAULT 1 CHECK(max_active_runs > 0),
  state TEXT NOT NULL CHECK(state IN ('READY','PAUSED','SWITCHING','QUARANTINED'))
);
INSERT INTO auth_units_v6 SELECT id,harness,active_account_id,runtime_home,max_active_runs,state FROM auth_units;
DROP TABLE auth_units;
ALTER TABLE auth_units_v6 RENAME TO auth_units;

CREATE TABLE bindings_v6 (
  id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES roles(id),
  harness TEXT NOT NULL,
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
INSERT INTO bindings_v6 SELECT * FROM bindings;
DROP TABLE bindings;
ALTER TABLE bindings_v6 RENAME TO bindings;

CREATE TABLE native_binding_configs_v6(binding_id TEXT PRIMARY KEY REFERENCES bindings(id),epoch INTEGER NOT NULL,harness TEXT NOT NULL,config_json TEXT NOT NULL CHECK(json_valid(config_json)),config_hash TEXT NOT NULL,registered_at_ms INTEGER NOT NULL);
INSERT INTO native_binding_configs_v6 SELECT * FROM native_binding_configs;
DROP TABLE native_binding_configs;
ALTER TABLE native_binding_configs_v6 RENAME TO native_binding_configs;
