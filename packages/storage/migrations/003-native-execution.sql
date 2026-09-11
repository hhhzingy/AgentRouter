-- J3 native execution sources; 001/002 stay immutable. Applied with FK checks before commit.
CREATE TABLE initialization_attempts_v3(id TEXT PRIMARY KEY,delivery_id TEXT NOT NULL REFERENCES bootstrap_deliveries(id),role_id TEXT NOT NULL REFERENCES roles(id),epoch INTEGER NOT NULL,charter_hash TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('STARTING','RUNNING','DELIVERED','FAILED','UNKNOWN')),source TEXT NOT NULL CHECK(source IN ('SIMULATED','NATIVE')),pid INTEGER,created_at_ms INTEGER NOT NULL,completed_at_ms INTEGER);
INSERT INTO initialization_attempts_v3 SELECT * FROM initialization_attempts;
DROP TABLE initialization_attempts;
ALTER TABLE initialization_attempts_v3 RENAME TO initialization_attempts;
CREATE TABLE execution_profiles_v3(role_id TEXT PRIMARY KEY REFERENCES roles(id),source TEXT NOT NULL CHECK(source IN ('SIMULATED','NATIVE')),scenario_json TEXT NOT NULL CHECK(json_valid(scenario_json)),verified INTEGER NOT NULL CHECK(verified IN (0,1)));
INSERT INTO execution_profiles_v3 SELECT * FROM execution_profiles;
DROP TABLE execution_profiles;
ALTER TABLE execution_profiles_v3 RENAME TO execution_profiles;
CREATE TABLE run_sources_v3(run_id TEXT PRIMARY KEY REFERENCES runs(id),source TEXT NOT NULL CHECK(source IN ('SIMULATED','NATIVE')),charter_id TEXT NOT NULL REFERENCES role_charters(id),pid INTEGER,native_terminal INTEGER NOT NULL DEFAULT 0,resources_stopped INTEGER NOT NULL DEFAULT 0);
INSERT INTO run_sources_v3 SELECT * FROM run_sources;
DROP TABLE run_sources;
ALTER TABLE run_sources_v3 RENAME TO run_sources;
CREATE TABLE native_binding_configs(binding_id TEXT PRIMARY KEY REFERENCES bindings(id),epoch INTEGER NOT NULL,harness TEXT NOT NULL CHECK(harness IN ('codex','kimi_code','pi')),config_json TEXT NOT NULL CHECK(json_valid(config_json)),config_hash TEXT NOT NULL,registered_at_ms INTEGER NOT NULL);
CREATE TABLE native_sessions(binding_id TEXT NOT NULL REFERENCES bindings(id),epoch INTEGER NOT NULL,session_ref TEXT NOT NULL,updated_at_ms INTEGER NOT NULL,PRIMARY KEY(binding_id,epoch));
