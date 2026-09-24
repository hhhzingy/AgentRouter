# ADR：V1.1 Final Role / WorkSession / Binding / Join

状态：Accepted（C4 收口后作为 C5 设计闸门）。不要求停工等待人工批准。  
范围：Windows 最终源 `feat/v1.1-final-cursor-win`；不 merge main、不 tag、不 release。

## 1. 权威对象与当前表（禁止第二真相）

| 对象 | 权威表 / 对象 | 不是权威 |
|---|---|---|
| Role | `roles` + 最新 `role_charters` | ROLE.md / AGENTS.md / prompt |
| WorkSession | `role_sessions`（state=ACTIVE\|ARCHIVED） | GUI 当前选中、模型记忆 |
| Slot（规划认领入口） | **新建** `work_session_slots`（C5 migration 017） | 现有 `role_slots`（那是执行槽：active_run/task） |
| Binding | `bindings`（is_current=1 当前执行绑定）+ `role_session_activations` | `bindings.native_session_ref` 遗留列 |
| Native/External 会话身份 | `role_sessions.native_session_ref` + `native_binding_configs` + C5 `participant_bindings` | 客户端自报 session_id |
| Task | `tasks`；已开始则 `tasks.role_session_id` 固定 | 当前 ACTIVE WS |
| Run | `runs` + `run_sources` | 无 |
| Artifact / Result | `artifacts` / `results`；blob 以 hash 为物理键 | 各客户端自造 storage_key |
| AuthContext / Grant / Lease | 连接 scope + `control_leases` + `participant_grants` | `clientId`（仅审计标签） |

`role_slots` **保持执行槽语义**，不改造成规划 Slot，避免把 active_run 不变量和认领入口绑死。

## 2. WorkSession 状态不变量

- 每个 Role 至多一个 ACTIVE WS（现有部分唯一索引 `role_sessions_one_active`）。
- ARCHIVED/HISTORY WS 经正常 API 不得再变 ACTIVE；`roleSession.switch` 抛 `ROLE_SESSION_REACTIVATION_REMOVED`。
- WS 一旦建立，Harness 与 native/external session 身份不得偷换。ZCode `SESSION_CONTINUATION_UNSUPPORTED` 时同 WS 只保存首个 native ref。
- 新 WS 创建成功前，源 WS 保持 ACTIVE（Context Transfer：intent→SEEDED 期间源仍 ACTIVE；COMMITTED 事务内才归档源并激活目标）。
- 重启只恢复未完成操作（PREPARING/EXPORTED/SEEDED）。COMMITTED 不得 `repairCommitted` 复活后来的 ACTIVE。

## 3. Slot / Binding / Join（C5）

规划 Slot ≠ 已存在 WS。

```text
work_session_slots
  id, role_id, seq, name, participant_kind, state
  work_session_id NULLABLE
  binding_generation
  claim_code_hash NULLABLE   -- Tunnel 无稳定外部会话时的短期 pair
  created_at_ms

participant_bindings
  id, slot_id, role_id, work_session_id
  principal, participant_kind, external_session_ref NULLABLE
  grant_id, generation, state
  request_key_hash
  created_at_ms
```

Join 幂等：

1. 无 WS：原子创建 WS + Binding + 写 slot.work_session_id。
2. 预建未绑定 WS：绑定该 WS，不创建第二份。
3. 占用冲突：`ROLE_WORKSESSION_ALREADY_BOUND`；不 revoke、不复制 Role、不新建 WS。
4. 同 `request_key`：返回原 Binding；异参同键 → 稳定冲突。
5. `external_session_ref` 只是关联证据，不是权限。权限来自 grant generation + attachment。
6. OpenAI Tunnel 若不能提供可信 session correlation：使用本地批准的一次性 claim code，不把客户端自报 id 当认证。
7. managed Harness（Codex/ZCode/API）由 Router 在 Role/WS 创建时自动建立 Binding，不要求模型调用 `participant_join`。

## 4. Context Transfer 证据链

已实现：`context_transfer_ops.state` = PREPARING → EXPORTED → SEEDED → COMMITTED | FAILED。  
不确定结果保持非终态 + `CONTEXT_TRANSFER_AMBIGUOUS` / `UNRESOLVED`，不伪装 NOT_STARTED。  
端口按 `ResolvedExecutionContext`（binding/profile/workspace/sessionHome）运行，禁止 `profiles.find(harness)`。  
来源 `history_export` 非 `FULL_VISIBLE` 或端口未接线 → `CONTEXT_EXPORT_UNSUPPORTED`。

## 5. Task 与 WS

- 已开始 / 已有副作用的 Task 固定 `role_session_id`。
- 换新 WS 前 QUEUED/WAITING_INPUT/ACTIVE/RESULT_STAGED/NEEDS_ATTENTION 必须 drain/cancel，否则 `ROLE_SESSION_QUEUE_NOT_DRAINED`。
- WAITING_INPUT 的用户输入进入下一 Run 快照的 `task_input`，不改写历史 `tasks.request_json`。

## 6. Artifact

唯一模型：logical Artifact → metadata → blob(`artifacts/<sha256>`)；`storage_key` 允许 `projectId/hash` 或纯 hash。  
Participant 与 Runtime 写入同一物理键。跨文件/DB 失败可 `inspectArtifact` 恢复，不把 `rename()` 当 DB 事务。

## 7. Authorization

连接必须同时具备：authenticated、principal kind、allowedProjects/Roles、allowedActions、mayAcquireController、current control lease、grant/binding generation。  
Management MCP 客户端 `mcp_management_cursor` 不是 Role，不得 `participant_join`。  
Participant 方法走 grant attachment，不走全局 controller lease 冒充。

## 8. Native lifecycle

| Harness | lifecycle | continuity | Level B |
|---|---|---|---|
| codex / kimi_code / pi / deepseek_harness | COLD_RUN | SAME_SESSION_CONTINUOUS | DECLARED_UNVERIFIED（冷 resume，每 Run 树空） |
| zcode | COLD_RUN | SESSION_CONTINUATION_UNSUPPORTED | REQUIRES_NEW_WORKSESSION |

本轮不把 ZCode 做成 WARM_SESSION，以免削弱其他 Harness 的树空停止证明。同 ACTIVE WS 两轮真实依赖上轮状态 = 未交付，须新 WS + 一次性 Context Transfer。

## 9. Role Identity Pack

Core 投影，不是新权限库。字段来自 `roles` / charter / effective permissions / 当前 slot+WS+binding。  
可选 ROLE.md 是派生镜像，默认写 Router metadata root；**不得覆盖项目 AGENTS.md / CLAUDE.md / README**。  
人工篡改 prompt/ROLE.md 不能突破 Core 权限。

## 10. Migration

- 001–016 字节冻结。
- C5 新表从 **017** 继续；不占用并行号。
- 旧历史 WS 只读迁移不得通过“重激活修复”。
