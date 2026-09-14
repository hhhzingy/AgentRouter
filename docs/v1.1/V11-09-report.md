# V11-09 Real E2E / RC 阶段报告

## 基线 / 当前 / 阶段

- Baseline SHA：`338fcffc001a5ed8e93c00051605f7c6e4eea74a`。
- Current SHA（RC implementation）：`b1b56f12e818e328b516a8b174a693221c28ff87`。
- Branch：`feat/v1.1-context-continuity`。
- Stage：V11-09 Real E2E / Release Candidate；不合并 main，不创建 tag/release。

## 文件

本阶段涉及可冻结边界适配、连续性运行时和回归测试：

- `packages/core-service/application.ts`
- `packages/core-service/execution-coordinator.ts`
- `packages/core-service/native-session-store.ts`
- `packages/core-service/role-context-store.ts`
- `packages/runtime/core.ts`
- `packages/management-gateway/index.ts`
- `packages/client-transport/p1/memory.ts`、`types.ts`（恢复冻结字节）
- `tests/integration/v11-context-continuity-rc.test.ts` 及受影响迁移/Context/Participant 测试

## Migration

- V1.1 migration 011/012 已在前置阶段独立提交；本阶段不修改其字节。
- migration 001—010（含 009）和冻结 C1/C1R1/C1R1P1 合同保持不变；009 的历史 handoff 数据只读审计。
- V1.0 多 WorkSession upgrade、legacy handoff PENDING/ACKED 保留、迁移失败回滚、backup/restore 由全量测试覆盖。

## 已实现

- 真实 `ApplicationService → Core → ExecutionCoordinator → ExecutionBackend` fixture 贯穿 bootstrap、new WS FULL、old WS resume FULL、后续 DELTA、native receipt 和跨 Harness 新建。
- 同一 WS 的 model/effort 变化不创建新 WS；恢复旧 WS 产生 fresh activation epoch，且事件校验绑定当前 activation。
- Context 使用 append-only Role index；Delta 排除 target WS 自己的 entries，cursor 仅在 stable marker 匹配的 native receipt 后推进。
- 跨 Role 的 conversation mirror 按各自任务/当前 WS 归属写入，避免把消息错误挂到接收方 WS。
- Native Session 的 Harness、Driver、workspace affinity 与 RoleSession 绑定在 load/save 时复核；不回退到 WorkSession handoff package/ACK。
- Context sync 只传 Driver 可观察 Portable Context 和最新 Core authoritative state；stable marker 不依赖 LLM 文本 ACK。

## Offline 验证

- 全量 Vitest：73 files / 432 tests，通过。
- V11.1 Context/Native/RoleSession 定向回归：5 files / 9 tests，通过。
- TypeScript `--noEmit`：通过。
- C1/C1R1/C1R1P1 freeze、contract generation、migration manifest：通过。
- lint：通过。
- 历史敏感信息扫描：通过；未报告 findings，输出已脱敏。

## Live / Packaged

- 本阶段代码路径已用受控 fixture 验证；真实 DeepSeek、Pi、Kimi native session 仍需用户环境中的显式认证与 live harness 条件。
- 真正外部 compression backend 未声明为已认证；无 backend 或容量不足时保持安全阻止，不静默截断。
- Packaged Electron、SSH 与真实用户 smoke 将在当前干净提交后继续执行/记录；不触碰现有 Codex/ZCode 活动会话和认证。

## Compatibility / Data migration

- `task completion.mode=handoff` 保留并由全量旧测试覆盖；删除的只有 WorkSession handoff 产品/运行 gate。
- Participant 仍不能管理 WorkSession；管理写操作继续要求 Controller lease、revision 和 preflight。
- 现有 `conversation_items`、`tasks`、`results`、`artifacts` 作为正文/引用来源；Context entries 负责顺序、来源、分类和去重，不引入 Vector DB。

## Security / Egress

- 只持久化可观察可迁移内容；拒绝 hidden reasoning、KV、Secret、credential、完整 environment。
- Core authoritative state 原样重建，不由压缩摘要覆盖；压缩 backend 仅接收 Portable Context。
- 本次测试未回显 Secret；RC 包不携带账号、密钥或用户数据。

## Limitations / Next

- RC 尚未获得真实 Harness、SSH 和用户 smoke 验收，不得标记正式发布。
- 下一步仅在用户确认并提供隔离 live 条件后执行真实 Harness/SSH smoke；在此之前保持分支隔离，等待用户验收，不合并 main/tag/release。
