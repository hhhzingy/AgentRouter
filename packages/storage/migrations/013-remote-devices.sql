-- 013: 远程设备身份与配对。凭据/挑战仅存 sha256 哈希,原始 bearer 永不入库/日志。
-- 与本地 endpoint credential 完全分离(不同生成路径、不同校验)。
create table remote_devices(
  device_id text primary key,
  display_name text not null,
  kind text not null check(kind in ('DESKTOP','MOBILE')),
  credential_hash text not null unique,
  scope_json text not null default '[]' check(json_valid(scope_json)),
  can_request_controller integer not null default 0 check(can_request_controller in (0,1)),
  state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED')),
  created_at_ms integer not null,
  last_seen_ms integer not null,
  revoked_at_ms integer
);
create index remote_devices_state on remote_devices(state);
create table remote_pairings(
  pairing_id text primary key,
  challenge_hash text not null unique,
  display_name text not null,
  kind text not null check(kind in ('DESKTOP','MOBILE')),
  scope_json text not null default '[]' check(json_valid(scope_json)),
  can_request_controller integer not null default 0 check(can_request_controller in (0,1)),
  state text not null default 'PENDING' check(state in ('PENDING','CONSUMED','EXPIRED','REVOKED')),
  created_at_ms integer not null,
  expires_at_ms integer not null,
  consumed_at_ms integer,
  device_id text references remote_devices(device_id)
);
create index remote_pairings_state on remote_pairings(state, expires_at_ms);
