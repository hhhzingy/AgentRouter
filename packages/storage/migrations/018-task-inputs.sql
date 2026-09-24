-- 018: WAITING_INPUT 的用户回复成为正式、可审计且恰好一次消费的 TaskInput。
-- conversation_items 继续作为人类可读投影，但不再是运行时消费的事实源。
ALTER TABLE wait_records ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK(generation >= 1);

CREATE TABLE task_inputs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  role_session_id TEXT NOT NULL REFERENCES role_sessions(id),
  wait_key TEXT NOT NULL,
  requested_by_run_id TEXT REFERENCES runs(id),
  actor TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(length(payload) > 0),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  operation_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  consumed_by_run_id TEXT REFERENCES runs(id),
  consumed_by_participant_request_key TEXT,
  consumed_at_ms INTEGER,
  UNIQUE(task_id, wait_key),
  UNIQUE(actor, operation_id),
  CHECK(
    (consumed_at_ms IS NULL AND consumed_by_run_id IS NULL AND consumed_by_participant_request_key IS NULL)
    OR
    (consumed_at_ms IS NOT NULL AND (consumed_by_run_id IS NOT NULL) <> (consumed_by_participant_request_key IS NOT NULL))
  )
);
CREATE INDEX task_inputs_task_pending
  ON task_inputs(task_id, created_at_ms)
  WHERE consumed_at_ms IS NULL;
CREATE INDEX task_inputs_run ON task_inputs(consumed_by_run_id);
