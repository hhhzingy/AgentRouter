-- 019: 仅记录可信 Participant 认领/已授权请求的最近活动时间。
-- 不回填 created_at_ms：存量 Binding 的最近活动仍为 UNKNOWN；此列也不是在线心跳。
ALTER TABLE participant_bindings ADD COLUMN last_seen_at_ms INTEGER;
