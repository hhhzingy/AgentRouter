-- 015: 一次性 Context Transfer 操作日志(W03)。
-- 只承载短流程状态与引用,不是长期 Context 镜像;崩溃核对用,完成后状态终态化。
create table context_transfer_ops(
  id text primary key,
  role_id text not null references roles(id),
  from_session_id text not null references role_sessions(id),
  to_session_id text references role_sessions(id),
  mode text not null check(mode in ('inherit','blank')),
  capacity_json text not null default '{}' check(json_valid(capacity_json)),
  state text not null check(state in ('PREPARING','EXPORTED','SEEDED','COMMITTED','FAILED','CANCELLED')),
  error_code text,
  created_at_ms integer not null,
  updated_at_ms integer not null
);
create index context_transfer_ops_role on context_transfer_ops(role_id, created_at_ms);
