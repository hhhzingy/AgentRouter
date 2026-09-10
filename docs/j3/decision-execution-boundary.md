# ADR J3-01A：单一协调层和原生收尾边界

状态：已实现基础抽取；生产注册未接入。冻结 C1/C1R1/P1/Route 和迁移未变。

ExecutionCoordinator 唯一拥有应用调度、Bootstrap、结果续办、会话投影及 Native Completion Barrier。FixtureDriver 兼容旧隔离测试入口，FixtureBackend 只负责受控进程 I/O。

退出信息来自可信后端，不得由模型输出或 Client API 构造。fixture-parent-exit 仅在 fixtureMode 接受；生产整树停止证明需受保护 supervisor 通道。目前没有生产证明提供者，不计真实支持。

坏帧、重复/晚到回调、启动抛错不能交付。停止未知保留 UNKNOWN/QUARANTINED；取消写入不代表完成。关闭后未证明停止的执行仍隔离；终止事务失败停派发并请求关闭，重启沿用原持久恢复。

Reviewer 两轮指出的问题已补修并增加数据库负测。新增测试前置等待和列名错误均已修正，未降低业务断言。测试输出可由 AGENTROUTER_TEST_EVIDENCE_ROOT 重定向至项目内 J3 目录，避免覆盖历史。

后续仍需生产注册、事件映射、发送前失败证明、配置迁移、OS 隔离和可信控制通道。J3-01 未全部完成。
