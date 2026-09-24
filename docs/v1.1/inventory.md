# AgentRouter V1.1 Context Continuity Inventory

## 审计范围

- 审计基线：`338fcffc001a5ed8e93c00051605f7c6e4eea74a`（V1.0 Closeout）。
- 审计分支：`feat/v1.1-context-continuity`。
- 审计阶段：`V11-01`；本文件只记录实现清单与缺口，不执行数据库迁移。
- 冻结边界：`packages/storage/migrations/001-baseline.sql`—`010-run-provenance.sql`、`docs/api/freeze.migrations.json`、C1/C1R1/C1R1P1 冻结合同及其生成文件保持原字节。

V11-00 已完成 generation/freeze、migration/EOL、spec、敏感信息、doctor、类型检查、lint 和离线回归门禁：68 个测试文件、418 个测试通过。以下结论来自源码、迁移、测试和 UI/MCP 的只读检查；没有读取或输出凭据、Secret、隐藏推理或原生会话内容。

## 1. 关键对象与当前语义

| 范围 | V1.0 当前证据 | V1.1 缺口/必须改变的语义 |
| --- | --- | --- |
| Role | `roles.id` 是现有角色主键；Core、任务、消息和权限都以它关联。 | Role 是长期身份，不能因为切 Harness、切模型或切 WorkSession 而重建。 |
| WorkSession | `005-role-sessions.sql` 建立 `role_sessions`，并以 `role_sessions_one_active` 保证每个 Role 一个 `ACTIVE` 行；`role-session-extension.ts` 的 create/switch 负责归档和激活。 | `role_sessions.id` 应成为永久 WorkSession 身份；当前 `binding_id/binding_epoch` 只是执行授权快照，不能继续等同永久 WS 绑定。恢复旧 WS 必须生成新的 activation epoch/binding，旧 epoch 的写入和事件必须失效。 |
| WS 与 Harness/Native Session | create 会把当前 `binding_id/binding_epoch` 复制到新 WS；`NativeSessionStore` 对初始 WS 还存在 binding 级 fallback，save 同时更新 WS 和 binding 的 `native_session_ref`。 | 每个 WS 首次成功建立后永久绑定同一 Harness/Driver、workspace affinity 和 Native Session；引用只允许受信宿主写入，不能由切换过程隐式借用别的 WS。 |
| Active WS | Core 的 `activeSessionId()` 和数据库部分唯一索引选择 `state='ACTIVE'`；任务创建时记录 `role_session_id`。 | 保留一个可写 Active WS 不变量，并将“激活”与永久 WS 身份分开；A→B→A 每次回到 A 都必须是 fresh activation epoch。 |
| 模型/effort | `NativeBindingConfig` 将 harness、model、effort 作为 binding 配置；native registry 对配置哈希变化要求新的 binding。Driver 生命周期只有 open/start/cancel 等通用操作。 | 同一 Native Session 内切 model/effort 不得新建 WS；由 Driver 的同会话能力完成。能力为 `UNKNOWN/UNSUPPORTED` 时安全阻止，不以新 WS 或静默新原生会话绕过约束。 |
| 跨 Harness | 当前 binding 列表/当前 binding 查询是 Role 级；没有“目标 Harness 最新 WS 候选”的选择器。 | 自动候选只考虑该 Role、目标 Harness 下按创建/序号最新的 WS；用户始终可以选择新建。旧 WS 恢复须明确显示可用性和迁移保真度。 |

### 1.1 当前 WorkSession 写入链

`RoleSessionExtension.create/switch` 在事务中改变 `role_sessions.state`，随后 `buildHandoff()` 查询来源会话的最近 20 条对话和开放任务并写入 `role_session_handoffs`。这说明现有切换事务把“激活”与旧 handoff 产品路径耦合，不能直接演进为 V1.1 恢复流程。V1.1 应改为受 Core/Controller 保护的 preflight → context sync → native receipt confirmed → fresh activation epoch → 原子 Active 的状态机。

`NativeSessionStore.load/save` 当前先按 `bindings(id, epoch, is_current)` 校验，再按可选 `roleSessionId` 读取 WS 引用；save 会更新 `native_sessions`、`role_sessions.native_session_ref` 和 `bindings.native_session_ref`。这保留了 V1.0 的执行安全边界，但没有实现 immutable WS binding，也没有 NULL→首次成功后不可替换的约束。

## 2. Context、对话与 Artifact

| 组件 | 当前实现 | V1.1 处理 |
| --- | --- | --- |
| 对话持久化 | `conversation_items`（002）已有 SQLite 自增 `seq`、`source_key` 和按 Role/任务的索引；`conversation.sendUserInput` 可按任务归属 WS。 | 复用 existing conversation refs，不造 Vector DB。新增 append-only Role Context index/head/state 时必须能由 source key/hash 去重，并保留原始引用。 |
| Core 镜像 | `ApplicationService.syncConversation()` 遍历 `messages`，按角色生成 conversation item；`ExecutionCoordinator.conversation()` 写原生文本时没有显式 WS 归属，且 body 只保留 4096 字符。 | 需要将 Driver 可观察的 visible context 纳入可追溯的 portable entry；不能把截断后的镜像当成完整迁移。大结果应保存 artifact/ref/hash，正文只保存安全可见摘要。 |
| 当前 route context | `Core.context()` 返回 identity、roles、task、child results、policy、notices 等 Core 视图；它不是按 WS cursor 增量同步的协议。 | 明确分为 Core authoritative state 与 Portable Context。Core 权威事实必须原样注入，Portable 只包含可观察的用户/助手、Route、工具元数据、摘要和 artifact refs。 |
| Delta | 当前没有 `role_context_heads`、per-WS synced cursor 或 native history cursor；也没有 target-source 排除规则。 | Delta 为 `(N,M]`，严格排除 `source_work_session_id == target WS` 的 entries；新 WS 取最大可迁移完整范围。cursor 只有在 Native receipt confirmed 后推进。 |
| 同步确认 | 当前 handoff 依赖原生文本中的 ACK/`handoff_ack` 事件；没有 stable marker/history reconcile。 | 使用 `AGENTROUTER_CONTEXT_SYNC:<operation_id>:<payload_hash>` 等稳定标记并结合历史 reconcile；不依赖 LLM 自然语言 ACK，也不 replay route tool 或 finish。 |
| Artifact | 现有 artifacts/artifact_links 和 external reference 体系可作为大结果的引用边界；冻结 schema 仍包含历史 owner kind `HANDOVER`。 | 迁移只存可授权的 artifact ref/hash/metadata；不存 Secret、环境变量、hidden reasoning、KV/private DB。历史 handoff artifact 只审计，不作为新同步输入。 |

### 2.1 必须保持的排除条件

1. Router 只保存 Driver 能观察到的 visible context，不保存 hidden reasoning、KV、Secret、凭据或私有数据库内容。
2. 目标 WS 自己已经产生的 entries 不进入对它的 Delta，避免重复注入和自引用扩散。
3. Context sync 是内部同步操作，不触发新的 route mutation、任务完成或业务交付。
4. 压缩只作用于 Portable Context；Core authoritative state 每次都以原样事实注入。

## 3. Handoff 现状与拆分边界

### 3.1 需要移除的 WorkSession handoff 产品路径

当前运行链如下：

- `packages/core-service/role-session-extension.ts:142-170` 构造并写入 `role_session_handoffs`。
- `packages/core-service/execution-coordinator.ts:221-241` 读取目标 WS 的 `PENDING` handoff，并将包交给 Native backend。
- `packages/core-service/execution-coordinator.ts:281-284` 根据 `handoff_ack` 帧推进 ACK 状态。
- `packages/core-service/native-process-backend.ts:164-169,206-211,301-307` 从原生文本寻找 ACK、在 ACK 前拒绝 Route 工具，并把 handoff prompt 注入任务。
- `apps/desktop/workbench/pages-role.tsx:259-345` 向用户说明“切换生成交接包、首次运行需确认”，并以 create/switch 作为 UI 主流程。
- `apps/management-mcp/main.ts:35-57,132-145` 暴露 role session 的旧 create/switch/history 工具，但没有 preflight、resume、新建继承和 fidelity 语义。

V1.1 cutover 必须停止上述新写入、读取、ACK、prompt 和 `HANDOFF_ACK_REQUIRED` gate；migration 009 的表、哈希和历史数据保持只读审计，不删除、不改字节、不作为运行时 gate。旧数据不应被自动 replay 成新 Context。

### 3.2 必须保留的 task handoff 语义

两类 handoff 不能混淆：

- `route.schema.json`/生成合同仍允许 `task completion.mode = "handoff"`。
- `packages/runtime/core.ts:387-393,675-680` 继续校验 `next_request.to`，并将完成结果转为 `HANDED_OFF`。
- `apps/desktop/workbench/task-draft.ts:9-12` 继续允许用户提交带明确目标和下一步要求的任务。

因此，V1.1 只删除 WorkSession handoff package/ACK 产品路径；不得删除或弱化任务完成模式 `handoff`、目标匹配校验、任务结果状态和现有回归测试。

另有冻结的 `HANDOVER_NEW_SESSION` continuity 枚举/历史写入点（001/006 及旧 binding 更新逻辑）。它属于冻结 schema/兼容审计边界，后续只能通过 011+ 的映射和停止新写入处理，不能用修改旧迁移或简单全库删除字符串的方式处理。

## 4. Driver 能力盘点

当前 `packages/core-service/harness-drivers.ts` 的 `HarnessDriver` 只定义 `processArgs`、`requiresSessionPath`、可选 `supportsFreshSession`、生命周期和可选 `runPrompt`，尚未有统一的 Context/History/Capacity/Compaction/同会话切模型能力接口。

| Harness/Driver | 已见实现证据 | 不能直接推断的能力 |
| --- | --- | --- |
| `codex` | lifecycle 可携带 `nativeSessionId` 打开/恢复并通过受信 verifier；当前可启动任务。 | history export、精确容量/用量、native compaction、同会话 model/effort switch 均未由 Driver 合同证明。 |
| `kimi_code` | ACP session load/new；生命周期有 HistoryReplay 事件处理和受管 model/effort configure。 | HistoryReplay 不等于完整可迁移 visible history；容量、压缩、receipt marker 和同会话切换的可验证合同仍缺失。 |
| `pi` | 需要 session path；生命周期可使用既有 session 文件并传入 provider/model/thinking level。 | path 存在不等于 history 可导出或容量可测；同会话切换和 compaction 尚无统一能力结果。 |
| `zcode` | 有 session create/resume/list 协议适配；生产 CLI 由可信宿主注入。 | 具体版本、history 可见范围、容量和 compaction 未有本地探针证据，不能标为 VERIFIED。 |
| `deepseek_harness` | `supportsFreshSession=true`，可用 ACP new/resume，并有任务轮 prompt。 | fresh session 能力不等于 context migration 能力；压缩、marker/history reconcile 和精确 capacity 仍 UNKNOWN。 |

V11-04 必须给每个 Driver 建立 evidence-backed capability 状态：`VERIFIED`、`IMPLEMENTED_UNVERIFIED`、`UNSUPPORTED` 或 `UNKNOWN`；容量和用量分别标注 `EXACT`、`ESTIMATED`、`UNSUPPORTED` 或 `UNKNOWN`。没有探针/协议/版本证据时不得乐观声明支持。

## 5. Context Budget 与安全降级

当前仓库没有统一的 `ContextCompressionBackend`、portable token budget、native compaction 结果或“容量不足安全阻止”的迁移状态。Native backend 的现有 ACK/工具屏障不能替代上下文容量确认。

V1.1 顺序固定为：读取 native usage/capacity → 尝试原生 compaction → 重新计算 → 对 Portable Context 使用明确的 CompressionBackend（若有）→ 再次校验 → 成功才确认 cursor。不存在可验证的压缩后端或窗口仍不足时返回可诊断的 `CONTEXT_MIGRATION_TOO_LARGE`/等价安全阻止，不静默截断；Core authoritative state 不参与压缩。

## 6. GUI、Management MCP 与 Participant 边界

- 当前 Role 页面通过 `roleSession.list/create/switch` 直接管理会话，文案暴露 handoff package/ACK，且只展示 session name、generation 和是否有 native session。
- 当前 Management MCP 只有 role session 的 list/history/create/switch 扩展，没有 target Harness 最新 WS 候选、preflight、resume、new-with-inherit、fidelity 或 diagnostics 的语义。
- 当前 Role/Binding snapshot 主要展示 Harness、model、workspace 和 binding current 状态，没有“继续已有 / 新建并继承上下文 / 迁移保真度”的用户级选择模型。
- Participant extension/MCP 与 Route 工具已是独立边界；V1.1 应继续保持 participant 只能做用户输入/成果等参与者动作，不把内部 cursor/KV/raw budget 或管理切换权限下放给 participant。

V1.1 UI/MCP 仅呈现：当前 WS、可继续的既有 WS、是否新建并继承上下文、目标 Harness、workspace affinity、迁移保真度和可行动的阻止原因。cursor、native history cursor、KV、hidden context、原始预算数字和 Secret 都属于内部实现/审计字段，不进入普通界面。

## 7. Migration、升级与回滚边界

### 7.1 冻结事实

- `docs/api/freeze.migrations.json` 锁定 001—010 的 LF 字节哈希；`tools/check-migrations.mjs` 要求迁移目录与 manifest 一一对应。
- `packages/storage/application-store.ts:37-152` 以固定顺序载入 001—010，并在旧库升级前对相应阶段执行备份；V1.1 只能追加 011+，不能重排或改写旧版本。
- `packages/storage/backup.ts:11-20` 要求数据库 migration rows 与迁移文件集合完全匹配；新增版本时必须同步设计备份/恢复校验。

### 7.2 已有 V1.0 fixture/rollback 证据

`tests/integration/migration-current-binding.test.ts` 已提供 `buildUpTo()` 的分版本建库和真实数据 seed：

- DB-01 验证 v5→v10 升级、007 恢复单一 current binding 索引，以及任务/会话数据保留。
- DB-02 验证 006 缺陷窗口存在双 current binding 时 007 显式失败，版本记录和冲突数据不被挑选、删除。
- DB-03 注入 FK 违规，验证 006 事务失败后版本保持 v5、业务数据保留。
- DB-04 验证重复打开的幂等升级；`tests/integration/backup.test.ts` 另验证在线 SQLite 备份恢复。

这满足 V1.0 upgrade fixture 和 rollback test 的基线要求，但不覆盖 V1.1 新增的 WS immutable binding、activation epoch、Context head/entry/cursor、compression audit 或 legacy handoff 只读回归。任何 011+ migration 写入前，必须先提交对应的 V1.0→V1.1 upgrade fixture、失败回滚、幂等和数据保留测试；迁移失败不得自动挑选 Active WS、删除 handoff 历史或重写 artifact/context 内容。

## 8. 当前测试覆盖与已知缺口

现有 `tests/integration/role-session.test.ts` 覆盖初始 WS、A/B 建立、切回、任务按 WS 归属和历史隔离；`role-session-handoff.test.ts` 则明确锁定旧 handoff package/ACK 行为。后者在 V1.1 cutover 前必须转为 migration 009 只读审计和“运行时不再写入/不再 gate”的回归，而不能通过删除测试来掩盖语义变化。

当前尚无专门覆盖：

- A→B→A fresh activation epoch、stale activation 写入拒绝和同一 Native Session 的 model/effort switch；
- 目标 Harness 仅自动选最新 WS、同时始终允许新建；workspace affinity 冲突；
- `(N,M]` Delta 的 source WS 排除、receipt-confirmed cursor、重复/乱序 retry 和 stable marker/history reconcile；
- 新 WS full portable context、native compaction、CompressionBackend 失败和 `CONTEXT_MIGRATION_TOO_LARGE`；
- visible-only redaction、artifact/ref/hash 保真、Core state 原样重注入；
- GUI/MCP 的用户级继续/新建/继承/保真度流程；
- task `completion.mode=handoff` 在 WorkSession handoff 路径删除后的回归。

## 9. V11-01 结论与后续闸门

V1.0 的持久 Core、冻结合同、001—010 迁移和基础 Active WS 约束可以作为 V1.1 的底座，但当前 `binding`、native session、handoff 和对话镜像仍是 V1.0 执行模型，不能直接宣称 Context Continuity 已实现。

后续实现顺序必须保持：

1. 先把本 inventory/ADR 中的 V1.0→V1.1 upgrade fixture、rollback、幂等和数据保留测试提交并通过。
2. 再追加 011 identity/continuity metadata；随后追加 Context index/head/state 等迁移，所有新迁移分别有 manifest、备份和回滚证据。
3. 只有 Context sync、Driver capability、budget/compression 和 fresh activation 具备测试后，才 cutover 移除 WorkSession handoff runtime path。
4. 最后改 GUI/MCP 与 E2E/RC；在 V1.1 RC 和用户验收前不合并 main、不打 tag/release。
