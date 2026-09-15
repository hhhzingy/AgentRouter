-- 014: Context 收敛切换点(W02)。legacy Context 表(role_context_heads/entries、
-- role_session_context_state、role_context_sync_receipts、role_session_handoffs、
-- role_session_activations)按字节保留供升级/审计/回滚,产品 runtime 自此标记起
-- 停止读写与 GUI/MCP 暴露;历史以 conversation_items/Task/Run/Result/Artifact 为准。
insert or replace into app_meta(key,value) values('context_convergence','W02-read-only-legacy');
