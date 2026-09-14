# V11-05 阶段报告：可观察上下文 append-only 索引

## 结论

V1.1 的可迁移上下文现在以 Role 为边界写入 append-only index，并继续保留现有 conversation/artifact 引用。上下文条目只包含 Driver 可观察的可移植内容；敏感字段、hidden reasoning、KV、环境变量和超大 payload 在入口拒绝。

## 已实现

- `RoleContextStore` 提供幂等 append、content hash 去重、Role head、按 WorkSession cursor 的 Delta/Full plan。
- Delta 查询排除目标 WorkSession 自己产生的条目，避免恢复时回灌自身历史。
- sync receipt 使用 stable marker；cursor 只有在 native receipt confirm 后推进，不接受自然语言 ACK。
- `ApplicationService.syncConversation()` 和执行协调器产生的可见 conversation/tool 条目同步镜像到新索引；旧 `conversation_items` 继续保留兼容读取。
- 可移植 payload 进行确定性序列化和敏感字段校验，不保存 hidden reasoning/KV/Secret。
- 既有 v3→当前迁移回滚 fixture 增加 011/012 对象清理，确保 V1.0 upgrade/rollback 证据持续有效。

## 验证

- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node node_modules/vitest/vitest.mjs run tests/integration/role-context-store.test.ts`：2/2 通过。
- `node node_modules/vitest/vitest.mjs run tests/integration/role-session.test.ts tests/integration/w11-application.test.ts`：15/15 通过。
- `node node_modules/vitest/vitest.mjs run tests/unit/external-api-journal.test.ts`：4/4 通过。

## 尚待后续阶段

容量预算、Portable Context 压缩审计、Core authoritative state 原样注入、fresh activation epoch、旧 WorkSession 恢复/新建继承流程及 handoff 产品路径切除分别在 V11-06 至 V11-09 完成。
