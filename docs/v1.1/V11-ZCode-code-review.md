# AgentRouter V1.1 ZCode 接线复核材料

## 复核基准

- 分支：`feat/v1.1-context-continuity`
- 复核源码 SHA：`15f74a77510efcec6bdd5d56445f138002250aff`
- 代码变更：`c838001fbc499ca4a422a55758d83ff9824b5dd7`
- 真实失败记录：`15f74a7` 所含 `V11-L2-zcode-create-failure-report.md`
- 本复核文档提交不改变上述源码复核基准。

## 变更目的与审查结论

ZCode app-server 在 `session/create` 期间会反向请求 `session/requestRuntimePreferences`。旧生命周期适配器只派发无 ID 通知，没有响应有 ID 请求，真实创建等待超时。新代码返回明确的受管偏好：关闭 memory、native search enhancements 与自动代答；未知客户端请求返回 JSON-RPC `-32601`，写入失败则断开传输。

代码路径与回归测试相符，专项单测通过。此项只修复反向请求的超时，不提供模型 provider 配置，也不代表原生会话已创建成功。

## 复核重点

1. 检查有 ID 的服务器反向请求与普通通知分流，未知请求是否拒绝而非默认授权。
2. 检查偏好回复是否把记忆与自动代答固定关闭，避免意外的上下文持久化或交互绕过。
3. 检查写入回复失败时 lifecycle 是否断开、上层是否将该 run 标记为可恢复/失败状态。
4. 复核 ZCode fresh/resume、MCP 工具列表及 context receipt 时，不能把 `session/create` 成功或 `RunAccepted` 当成 prompt 已持久化 receipt。

## 已验证证据

复核 SHA `15f74a7` 上：7 个 ZCode/dsh 单测文件、22 项通过；TypeScript `--noEmit` 通过；lint、migration manifest/EOL、C1/C1R1/C1R1P1 freeze 与 `git diff --check` 通过。敏感内容提交扫描在对应代码提交钩子中通过。

显式运行的官方 ZCode 隔离探测包含两次创建尝试：首次 `session/requestRuntimePreferences` 超时（-32022）；加入回复后进入 app config/plugin 初始化，但以 -32603 因缺少显式 model provider 配置退出。session/list 在隔离 HOME 返回空列表。原始日志不进入本报告；只保存脱敏错误类别与 PID。未发 prompt、未读写现有用户认证/会话。

## 验收影响

本变更可作为 ZCode 协议修复合入 V1.1 候选评审，不能作为 V1.1 RC 验收。独立 app-server provider/runtime 配置接线、原生 fresh/resume、Role MCP 实际工具调用、取消/停止证明及手机真机验收仍未证明。不得仅凭 session/list 空列表或本地模拟协议测试关闭这些项目。

## 可直接复用的评审摘要

修复 ZCode app-server 创建期间未响应 `session/requestRuntimePreferences` 的超时，并为未知反向请求返回明确的 method-not-found 响应。专项测试、类型检查和冻结门禁通过。真实创建探测现已推进到模型 provider 配置缺失，故 ZCode 受管 Role 尚未完成端到端验收。
