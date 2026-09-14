# V11-08 GUI / Management MCP 阶段报告

## 结论

管理面和桌面角色页已切换到 V1.1 Context Continuity 语义：

- 角色页显示当前/归档 WorkSession、固定 Harness、原生会话可继续状态和迁移保真度；
- Core roleSession.preflight 返回目标 Harness 下最新候选、继续已有/新建并继承上下文建议，且新建始终可用；
- GUI 与 Management MCP 的 create/switch 都先读取 revision 与 preflight hash，再携带 request key、operation id 和 expected revision 执行；
- 并发变化或重复请求由 Core revision/preflight 校验和 operation id 幂等保护；
- GUI 不显示 cursor、native ref、KV、hidden reasoning、Secret 或 handoff package/ACK 细节；
- Observer/Participant 仍不能管理 WorkSession；RoleSession 写操作继续要求 Controller lease；
- MCP 保留只读 preflight/history/list，并将新建/继续动作分成用户可理解的操作文案。

## 变更

- roleSession.preflight 接入扩展帧、ManagementGateway、Management MCP 和桌面 Workbench；
- External API 扩展帧增加受限的 request key、operation id、expected revision、preflight hash 元数据；
- 角色页增加恢复建议、迁移保真度和安全阻止提示；
- 删除 GUI/MCP 中的 WorkSession handoff package/ACK 文案和控制入口。

## 验证

- tsc --noEmit -p tsconfig.json：通过；
- RoleSession、Context migration/native compaction、Native Session、Coordinator 和 UI 回归：通过；
- MCP/GUI mutation path 均经过 preflight + revision + lease；
- 仍待 V11-09 统一 SHA 进行真实 Harness、打包 Electron、备份恢复和 SSH 条件验证。

## 兼容性

roleSession.* 继续作为非冻结扩展帧提供；冻结 C1/C1R1/C1R1P1 合同和 migration 001—010 未修改。历史 role_session_handoffs 仅用于审计，不进入 GUI/MCP 或运行时恢复路径。
