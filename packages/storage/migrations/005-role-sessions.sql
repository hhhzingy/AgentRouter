-- 005: RoleSession——同一稳定角色下的多工作会话。Binding/epoch 仍归执行授权，不让用户直接管理。
create table role_sessions(
  id text primary key,
  role_id text not null references roles(id),
  seq integer not null,
  name text not null,
  state text not null default 'ACTIVE',
  binding_id text,
  binding_epoch integer,
  native_session_ref text,
  generation integer not null default 1,
  created_at_ms integer not null,
  activated_at_ms integer not null
);
create unique index role_sessions_one_active on role_sessions(role_id) where state='ACTIVE';
insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms)
  select 'rsess_' || id, id, 1, '初始会话', 'ACTIVE', 1, created_at_ms, created_at_ms from roles;
alter table tasks add column role_session_id text;
update tasks set role_session_id =
  (select s.id from role_sessions s where s.role_id = tasks.assignee_role_id and s.state='ACTIVE');
alter table runs add column role_session_id text;
update runs set role_session_id =
  (select t.role_session_id from tasks t where t.id = runs.task_id);
alter table conversation_items add column role_session_id text;
update conversation_items set role_session_id = coalesce(
  (select t.role_session_id from tasks t where t.id = conversation_items.task_id),
  (select s.id from role_sessions s where s.role_id = conversation_items.role_id and s.state='ACTIVE'));
