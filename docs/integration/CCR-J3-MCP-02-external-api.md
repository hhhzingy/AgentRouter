# CCR-J3-MCP-02：已注册 External API 管理扩展

状态：实现中，尚未开放调用入口。冻结 C1/C1R1/C1R1P1 和 Route 文件保持不变。

设计边界：复用生产 Core 与 SQLite；Management MCP 只通过已认证 Client 连接转发，不自行发 HTTP、不读取秘密、不另建 Core。计划采用可选 external-api/1 扩展，旧客户端不受影响，旧 Core 不提供该扩展时拒绝调用，不降级为直接 HTTP。仅注册动作 list/describe/call；请求不允许任意URL、HTTP头或凭据。

本次已实现：004增量迁移新增 external_api_calls，按 principal/client_id/operation_id 原子领取，执行前持久 IN_FLIGHT；未知状态不超时释放、不自动重试；仅已脱敏结果可入库。数据库 v3 升级前生成独立备份；旧迁移校验和保持不变。实测覆盖两个连接争抢、关闭重开、主体隔离、settle冲突和升级备份可读。回退必须停止对应Core后使用升级前备份；旧版本不应强行打开v4数据库。

尚需完成：严格扩展schema、同连接身份/Controller租约校验、Core固定Provider注册、MCP曝光与兼容负测、响应丢失及真实API幂等。未完成前不得宣称External API可用。
