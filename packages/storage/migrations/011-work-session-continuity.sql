-- 011: V1.1 WorkSession immutable metadata and fresh activation ledger.
-- 001-010 are frozen. Existing binding_id/binding_epoch values are legacy
-- execution snapshots; role_sessions.id remains the durable WorkSession id.

alter table role_sessions add column harness text;
alter table role_sessions add column driver_id text;
alter table role_sessions add column workspace_affinity_json text;
alter table role_sessions add column native_session_ref_hash text;
alter table role_sessions add column native_session_bound_at_ms integer;

update role_sessions
set harness = coalesce(
  (select b.harness from bindings b where b.id = role_sessions.binding_id),
  (select b.harness from bindings b where b.role_id = role_sessions.role_id and b.is_current=1),
  'unknown'
),
driver_id = coalesce(
  (select b.harness from bindings b where b.id = role_sessions.binding_id),
  (select b.harness from bindings b where b.role_id = role_sessions.role_id and b.is_current=1),
  'unknown'
),
workspace_affinity_json = coalesce(
  (select json_object('workspace_id', b.workspace_id) from bindings b where b.id = role_sessions.binding_id),
  (select json_object('workspace_id', b.workspace_id) from bindings b where b.role_id = role_sessions.role_id and b.is_current=1),
  '{}'
),
native_session_bound_at_ms = case when native_session_ref is not null then activated_at_ms else null end;

create table role_session_activations(
  id text primary key,
  role_id text not null references roles(id),
  role_session_id text not null references role_sessions(id),
  binding_id text not null references bindings(id),
  binding_epoch integer not null check(binding_epoch > 0),
  activation_epoch integer not null check(activation_epoch > 0),
  state text not null check(state in ('ACTIVE','ENDED','SETTLING','UNKNOWN')),
  operation_id text,
  created_at_ms integer not null,
  activated_at_ms integer not null,
  ended_at_ms integer,
  unique(role_id, activation_epoch)
);
create index role_session_activations_ws on role_session_activations(role_session_id, activation_epoch);
create unique index role_session_activations_one_active
  on role_session_activations(role_id) where state='ACTIVE';

-- Every V1.0 WorkSession receives a read-compatible activation record. A
-- missing legacy binding is diagnosed by the existing current-binding gate;
-- normal V1.0 databases always have one current binding per Role.
insert into role_session_activations(
  id, role_id, role_session_id, binding_id, binding_epoch, activation_epoch,
  state, operation_id, created_at_ms, activated_at_ms, ended_at_ms
)
select
  'rsa_legacy_' || s.id,
  s.role_id,
  s.id,
  b.id,
  b.epoch,
  row_number() over (partition by s.role_id order by s.seq, s.id),
  case when s.state='ACTIVE' then 'ACTIVE' else 'ENDED' end,
  'v1.0-backfill',
  s.created_at_ms,
  s.activated_at_ms,
  case when s.state='ACTIVE' then null else s.activated_at_ms end
from role_sessions s
join bindings b on b.role_id=s.role_id and b.is_current=1;

create trigger role_sessions_immutable_binding
before update of role_id, harness, driver_id, workspace_affinity_json on role_sessions
when (old.role_id is not new.role_id)
  or (old.harness is not null and new.harness is not old.harness)
  or (old.driver_id is not null and new.driver_id is not old.driver_id)
  or (old.workspace_affinity_json is not null and new.workspace_affinity_json is not old.workspace_affinity_json)
begin
  select raise(abort, 'WORK_SESSION_BINDING_IMMUTABLE');
end;

create trigger role_sessions_native_reference_immutable
before update of native_session_ref on role_sessions
when old.native_session_ref is not null
  and new.native_session_ref is not old.native_session_ref
begin
  select raise(abort, 'WORK_SESSION_NATIVE_REFERENCE_IMMUTABLE');
end;

create trigger role_session_activations_identity_immutable
before update of role_id, role_session_id, binding_id, binding_epoch, activation_epoch on role_session_activations
when old.role_id is not new.role_id
  or old.role_session_id is not new.role_session_id
  or old.binding_id is not new.binding_id
  or old.binding_epoch is not new.binding_epoch
  or old.activation_epoch is not new.activation_epoch
begin
  select raise(abort, 'ROLE_SESSION_ACTIVATION_IMMUTABLE');
end;

create trigger role_session_activations_history_append_only
before delete on role_session_activations
begin
  select raise(abort, 'ROLE_SESSION_ACTIVATION_APPEND_ONLY');
end;

alter table runs add column activation_id text;
update runs
set activation_id = (
  select a.id
  from role_session_activations a
  where a.role_session_id = runs.role_session_id
  order by a.activation_epoch desc
  limit 1
);
create index runs_activation on runs(activation_id);
