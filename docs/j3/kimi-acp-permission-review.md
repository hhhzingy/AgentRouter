# Kimi 0.42.0 ACP 单次 Route 许可复核

只读 Reviewer 已核对官方精确 tag @moonshot-ai/kimi-code@0.42.0。原生 MCP tool name 为 qualifiedName；toolApprovalService 从 context.toolCall.name 形成请求；ACP approval.ts 将 req.toolName 写入 title，非模型参数或展示文案。仅该固定版本/hash 可使用专用许可，不推广到未知Harness。

许可条件：现有生命周期核验session/active/epoch，拒绝cancel/uncertain/terminal；精确六个 mcp__agentrouter-role__route_* 名称；非空toolCallId；唯一approve_once且kind=allow_once。不批准永久许可，不根据content或action授权。Core仍通过运行令牌验证实际工具权限。全局tools.enabled只含六工具，agent没有内置工具或子Agent。

实际诊断：hRPklR的模型工具快照确实只有六Route；context/finish原生审批为rejected。仅写config permission.rules不等于ACP完成规则注入。此前失败保留；本修复不重放旧任务。

来源：
- https://github.com/MoonshotAI/kimi-code/blob/%40moonshot-ai%2Fkimi-code%400.42.0/packages/acp-server/src/approval.ts
- https://github.com/MoonshotAI/kimi-code/blob/%40moonshot-ai%2Fkimi-code%400.42.0/packages/agent-core-v2/src/agent/toolApproval/toolApprovalService.ts
