# C1 / C1R1 兼容性

传输协议仍为 `agentrouter-client/1`。唯一 C1R1 接口源为 `contracts/client-api.c1r1.schema.json`；产品规划输入源为 `contracts/agentrouter-role-plan.v1.schema.json`，其定义嵌入接口后生成 TypeScript，不另外维护手写请求类型。

新增客户端在 `system.initialize.params` 发送 `contract_revision: "C1R1"`，得到 `schemaVersion: 2`、`contractRevision: "C1R1"`。省略时协商 C1，得到 schemaVersion 1；响应按 C1 闭合 Schema 投影，扩展字段移除、新方法不在 capabilities 广告中、新错误降级为旧版固定错误。旧 InMemoryTransport 实际连接新 Mock 的测试覆盖此路径。

保留 66 个旧方法及其参数/结果定义；初始化仅增加可选协商字段，另增 21 个方法。原 `role.create` 保持低层合同；新 UI 应使用 `role.createFromSpec` 或 `rolePlan.apply`，不可用缺少章程的角色冒充可运行角色。Mock 按 capabilities 返回自己支持的子集，合同存在不等于运行时实现。

Role / Space / Binding / Project 新属性均为可选扩展。事件继续使用全局递增 cursor，Mock 管理变更发送 `project.changed`，客户端重新读取 snapshot。无进程重启持久化保证。旧冻结文件逐项哈希必须保持；新冻结采用 UTF-8、CRLF 归一为 LF 的 SHA-256。

写方法必须带 controller lease、client_id、operation_id、expected_revision 和规定 scope。控制权来自受信任连接，不以客户端自报身份授权。同操作同载荷重放返回原结果；同键不同载荷冲突。确认字段要求字面值 true；false 在帧校验阶段拒绝。Preview 持久于内存草案但不提高业务 revision；Drain 提高 revision，因此 Drain 后需要重新 Preview。

C1R1 没有修改 Route、调度器和原生收尾逻辑：静默成功、指定结果去向、关联结果续办、SETTLING 屏障仍由原工程基线维护。本轮旧回归通过不代表真实 Harness 验收。
