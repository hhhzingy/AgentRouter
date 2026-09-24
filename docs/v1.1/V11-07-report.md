# V11-07 身份激活与 Native Session 切换报告

## 结论

V1.1 的 WorkSession 切换已经脱离 V1.0 handoff package/ACK：

- WorkSession 保存不可变的 Harness/Driver、workspace affinity 和 Native Session 绑定快照；
- RoleSession.binding_id 不再作为永久执行身份，切回旧 WorkSession 会创建新的 activation epoch；
- Core principal、Run、Native Session 保存和事件处理都校验 activation id/epoch；
- 同一 Role 只有一个 ACTIVE WorkSession，活动/收尾/未知 Run 会阻止切换；
- Native Session 引用按 WorkSession 隔离，后创建的 WS 不会覆盖旧 binding 级快照；
- context_confirmed 使用 Driver/native 事件的 stable marker，不解析模型文本 ACK；
- role_session_handoffs 只保留历史审计，V1.1 运行代码不读取、不写入、不作为 gate；
- task 的 completion.mode=handoff 路由仍保留。

## 验证

- RoleSession 创建、切回、幂等与 activation epoch：通过；
- Native Session A/B/C 隔离及旧 binding 快照保护：通过；
- 活动 Native Run 阻止切换：通过；
- Coordinator stale epoch、上下文 receipt 和工具收尾回归：通过；
- j3-coordinator：12/12 通过；
- role-session、role-session-handoff、native-session-store、core：通过。


