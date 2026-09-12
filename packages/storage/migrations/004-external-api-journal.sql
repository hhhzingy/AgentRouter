-- Registered External API durable claim journal. No retry or lease expiry reclaim.
CREATE TABLE external_api_calls (
 principal TEXT NOT NULL,
 client_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('IN_FLIGHT','SUCCEEDED','UNKNOWN')),
 result_json TEXT,
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL,
 PRIMARY KEY(principal,client_id,operation_id)
);
