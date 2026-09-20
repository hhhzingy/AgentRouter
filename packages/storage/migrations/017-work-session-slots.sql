-- 017: WorkSession 规划 Slot 与 Participant Binding（C5）。
-- 现有 role_slots 仍是执行槽（active_run/task），本表是认领入口，禁止混用。
CREATE TABLE work_session_slots (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id),
  seq INTEGER NOT NULL CHECK(seq >= 1),
  name TEXT NOT NULL,
  participant_kind TEXT NOT NULL CHECK(participant_kind IN ('CHATGPT_WEB','MANAGED_HARNESS','PAIR_CODE')),
  state TEXT NOT NULL CHECK(state IN ('OPEN','BOUND','CLOSED')),
  work_session_id TEXT REFERENCES role_sessions(id),
  binding_generation INTEGER NOT NULL DEFAULT 1 CHECK(binding_generation >= 1),
  claim_code_hash TEXT CHECK(claim_code_hash IS NULL OR length(claim_code_hash)=64),
  created_at_ms INTEGER NOT NULL,
  UNIQUE(role_id, seq)
);
CREATE INDEX work_session_slots_role ON work_session_slots(role_id, state);
CREATE TABLE participant_bindings (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES work_session_slots(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  work_session_id TEXT NOT NULL REFERENCES role_sessions(id),
  principal TEXT NOT NULL,
  participant_kind TEXT NOT NULL CHECK(participant_kind IN ('CHATGPT_WEB','MANAGED_HARNESS','PAIR_CODE')),
  external_session_ref TEXT,
  grant_id TEXT REFERENCES participant_grants(id),
  generation INTEGER NOT NULL CHECK(generation >= 1),
  state TEXT NOT NULL CHECK(state IN ('ACTIVE','ENDED')),
  request_key TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX participant_bindings_one_active_slot ON participant_bindings(slot_id) WHERE state='ACTIVE';
CREATE UNIQUE INDEX participant_bindings_request_key ON participant_bindings(role_id, request_key);
CREATE INDEX participant_bindings_ws ON participant_bindings(work_session_id, state);

-- 存量 Role：为当前/初始 WS 补一条 MANAGED 槽并视为已绑定（Harness 不手工 join）。
INSERT INTO work_session_slots(id,role_id,seq,name,participant_kind,state,work_session_id,binding_generation,created_at_ms)
SELECT
  'wslot_' || r.id,
  r.id,
  1,
  'managed',
  'MANAGED_HARNESS',
  CASE WHEN s.id IS NULL THEN 'OPEN' ELSE 'BOUND' END,
  s.id,
  1,
  r.created_at_ms
FROM roles r
LEFT JOIN role_sessions s ON s.role_id=r.id AND s.seq=1;

INSERT INTO participant_bindings(id,slot_id,role_id,work_session_id,principal,participant_kind,generation,state,request_key,created_at_ms)
SELECT
  'pbind_managed_' || r.id,
  'wslot_' || r.id,
  r.id,
  s.id,
  'managed_harness',
  'MANAGED_HARNESS',
  1,
  'ACTIVE',
  'managed:' || r.id,
  r.created_at_ms
FROM roles r
JOIN role_sessions s ON s.role_id=r.id AND s.seq=1;
