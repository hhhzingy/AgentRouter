-- 009: RoleSession 交接包——切换时导出来源会话状态快照;目标会话首运行必须 ACK 后才可用 Route 工具。
create table role_session_handoffs(
  id text primary key,
  role_id text not null references roles(id),
  from_session_id text not null references role_sessions(id),
  to_session_id text not null references role_sessions(id),
  package_json text not null,
  package_hash text not null,
  state text not null default 'PENDING' check(state in ('PENDING','ACKED','FAILED')),
  created_at_ms integer not null,
  acked_at_ms integer
);
create index role_session_handoffs_target on role_session_handoffs(to_session_id, state);
