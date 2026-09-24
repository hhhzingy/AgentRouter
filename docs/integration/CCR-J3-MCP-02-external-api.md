# CCR-J3-MCP-02：已注册 External API 管理扩展

状态：实现中，尚未开放调用入口。冻结 C1/C1R1/C1R1P1 和 Route 文件保持不变。

设计边界：复用生产 Core 与 SQLite；Management MCP 只通过已认证 Client 连接转发，不自行发 HTTP、不读取秘密、不另建 Core。计划采用可选 external-api/1 扩展，旧客户端不受影响，旧 Core 不提供该扩展时拒绝调用，不降级为直接 HTTP。仅注册动作 list/describe/call；请求不允许任意URL、HTTP头或凭据。

本次已实现：004增量迁移新增 external_api_calls，按 principal/client_id/operation_id 原子领取，执行前持久 IN_FLIGHT；未知状态不超时释放、不自动重试；仅已脱敏结果可入库。数据库 v3 升级前生成独立备份；旧迁移校验和保持不变。实测覆盖两个连接争抢、关闭重开、主体隔离、settle冲突和升级备份可读。回退必须停止对应Core后使用升级前备份；旧版本不应强行打开v4数据库。

## 接线完成（2026-09-12）

- 严格扩展schema：packages/client-contract/external-api-1.ts（external-api/1 帧与结果双向 Ajv 校验；错误码为保守 A-Z 诊断码，不进入冻结 ErrorCode 枚举）。
- 同连接身份/租约：ApplicationService 在冻结 Request 校验前拦截 externalApi.* 帧，将连接 principal/clientId/mode 与本连接租约断言传入 ExternalApiExtension；call 必须 controller+当前租约，list/describe 仅需已授权连接。旧客户端不使用该前缀，旧 Core 按冻结 Request 枚举拒绝（INVALID_FRAME），不降级为直接 HTTP。
- Core固定Provider注册：core_dataset/snapshot（READ_ONLY，数据集诊断计数；闭包自有数据源，不出网不读凭据）。真实上游 API 须另行审查后注册。
- MCP曝光：router_external_api_list/describe/call 三个工具经已认证 Client 连接转发；call 走 gateway 串行队列并要求控制租约。
- journal按principal/client_id隔离领取；响应丢失与真实上游幂等仍受限于已注册动作（当前固定动作为本地只读，天然幂等由journal重放保证）。
- 测试：integration/external-api-extension.test.ts 4项（列表/描述、幂等落库、观察者与无租约拒绝、主体隔离与租约绑定拒绝）+既有registry/journal单测；真实Core进程+SDK MCP端到端验证通过（list/describe/call/同key幂等/observer拒绝）。

边界更新：External API 管理面已可用，但仅含已注册的本地只读诊断动作；任何真实外部HTTP动作在用户明确授权并审查endpoint前不得注册。
