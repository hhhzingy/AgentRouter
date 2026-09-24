# V11-06 阶段报告：新 WorkSession Full Context 与 Compression

## 结论

新 WorkSession 的初始化输入已实现为 `Core authoritative state + Full Portable Context`。目标预算不足时先明确进入压缩分支；没有显式授权的 `ContextCompressionBackend` 时安全阻止，不静默截断或伪装迁移成功。

## 已实现

- `readCoreAuthoritativeState()` 从 Core 权威表重新构造 Role、Project、Space、Charter、Policy、Workspace、Binding、WorkSession、Task、Run、Result、Artifact、Issue 和 Approval 状态。
- authoritative state 不读取 native session ref、account secret ref 或 hidden state，并在出站 envelope 前执行敏感字段检查。
- `ContextMigrationService` 生成 `DELTA`/`FULL` 内部 `AGENTROUTER_CONTEXT_SYNC` envelope；`FULL` 从 `[1..head]` 构造，不复用旧 WorkSession handoff 数据。
- 大于 64 KiB 的可见 Portable Context 使用带 hash/size/seq 的 Router index reference 传输，完整内容仍留在 append-only index，preview 明确标注为引用预览。
- 预算公式保留 system/task/output/safety reserve；capacity/usage 未知时阻止“确定足够”的迁移，Core authoritative state 不纳入压缩输入。
- `ContextCompressionBackend` 接口及本地 deterministic mock backend 已提供；压缩覆盖区间、输入/输出 hash、token/byte 估算和 backend/provider/model 记录到现有 `application_audit`。
- 压缩完成后仅用 `SUMMARY` Portable Context 替换迁移 payload，authoritative state 保持原样；receipt fidelity 正确记录为 `COMPRESSED`。

## 验证

- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node node_modules/vitest/vitest.mjs run tests/integration/context-migration.test.ts`：2/2 通过。
- `node node_modules/vitest/vitest.mjs run tests/integration/context-migration.test.ts tests/integration/role-context-store.test.ts tests/integration/migration-current-binding.test.ts`：12/12 通过。

## 安全/兼容性

- 本阶段无新 migration；001—010、冻结合同和 migration 009 字节不变。
- 没有引入 Vector DB、hidden reasoning/KV/Secret 镜像或用户可见 handoff 对象。
- deterministic backend 仅用于测试/显式本地 profile；真实外部 backend 仍需由宿主配置授权和数据出站策略。

## 尚待后续阶段

V11-07 将把该服务接入 WorkSession 激活流程并切除 WorkSession handoff runtime path；随后完成 activation epoch、GUI/MCP 和真实 Harness E2E。
