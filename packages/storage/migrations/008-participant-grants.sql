-- 008: Participant 聊天级挂接授权(F-03)。
-- grant 由管理面签发(全局控制器租约),参与者以凭据挂接;签发新 grant 撤销同角色旧 grant,
-- 旧聊天的在途写与再挂接被服务端拒绝,不依赖进程连接生命周期。
-- 库中只存 sha256(token),明文 token 仅在签发响应/操作员分发一次。
CREATE TABLE participant_grants(
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  state TEXT NOT NULL CHECK(state IN ('ACTIVE','REVOKED')),
  generation INTEGER NOT NULL CHECK(generation >= 1),
  created_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER
);
CREATE INDEX participant_grants_role ON participant_grants(role_id, state);
