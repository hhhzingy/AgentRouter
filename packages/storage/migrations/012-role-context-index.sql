-- 012: append-only Role Context index and per-WorkSession sync state.
-- Context entries are visible/portable metadata only; authoritative Core state
-- is reconstructed by Core and injected separately on every activation.

create table role_context_heads(
  role_id text primary key references roles(id),
  head_seq integer not null check(head_seq >= 0),
  updated_at_ms integer not null
);

create table role_context_entries(
  role_id text not null references roles(id),
  context_seq integer not null check(context_seq > 0),
  source_work_session_id text references role_sessions(id),
  source_kind text not null,
  source_id text not null,
  portable_kind text not null,
  content_hash text not null,
  content_json text not null check(json_valid(content_json)),
  metadata_json text not null check(json_valid(metadata_json)),
  created_at_ms integer not null,
  primary key(role_id, context_seq),
  unique(role_id, source_kind, source_id, portable_kind, content_hash)
);
create index role_context_entries_source
  on role_context_entries(role_id, source_work_session_id, context_seq);

create table role_session_context_state(
  role_session_id text primary key references role_sessions(id),
  role_id text not null references roles(id),
  synced_through_seq integer not null default 0 check(synced_through_seq >= 0),
  native_history_cursor_json text check(native_history_cursor_json is null or json_valid(native_history_cursor_json)),
  fidelity text not null default 'UNKNOWN' check(fidelity in ('EXACT','COMPRESSED','PARTIAL','UNKNOWN','BLOCKED')),
  updated_at_ms integer not null,
  unique(role_id, role_session_id)
);
create index role_session_context_state_role on role_session_context_state(role_id);

create table role_context_sync_receipts(
  operation_id text primary key,
  role_id text not null references roles(id),
  target_work_session_id text not null references role_sessions(id),
  from_seq integer not null check(from_seq >= 0),
  through_seq integer not null check(through_seq >= from_seq),
  payload_hash text not null,
  stable_marker text not null,
  state text not null check(state in ('PREPARED','CONFIRMED','FAILED')),
  native_receipt_json text check(native_receipt_json is null or json_valid(native_receipt_json)),
  created_at_ms integer not null,
  confirmed_at_ms integer
);
create index role_context_sync_receipts_target
  on role_context_sync_receipts(target_work_session_id, created_at_ms);

insert into role_context_heads(role_id, head_seq, updated_at_ms)
select id, 0, created_at_ms from roles;

insert into role_session_context_state(role_session_id, role_id, synced_through_seq, fidelity, updated_at_ms)
select id, role_id, 0, 'UNKNOWN', activated_at_ms from role_sessions;

create trigger role_context_entries_append_only_update
before update on role_context_entries
begin
  select raise(abort, 'ROLE_CONTEXT_ENTRY_APPEND_ONLY');
end;

create trigger role_context_entries_append_only_delete
before delete on role_context_entries
begin
  select raise(abort, 'ROLE_CONTEXT_ENTRY_APPEND_ONLY');
end;

create trigger role_context_heads_monotonic
before update of head_seq on role_context_heads
when new.head_seq < old.head_seq
begin
  select raise(abort, 'ROLE_CONTEXT_HEAD_NOT_MONOTONIC');
end;
