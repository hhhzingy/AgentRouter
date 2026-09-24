-- Controller-authored claims are distinct from Core-verified Run and Artifact facts.
-- One immutable attestation per published Result; corrections require a new Result.
CREATE TABLE result_evidence_attestations(
  result_id TEXT PRIMARY KEY REFERENCES results(id),
  source_revision TEXT,
  tests_json TEXT NOT NULL CHECK(json_valid(tests_json)),
  limitations_json TEXT NOT NULL CHECK(json_valid(limitations_json)),
  principal TEXT NOT NULL,
  client_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL
);
