# AgentRouter V1.1 UI Contract

本文是 Kimi UI/UX 分支消费的业务语义合同。权威来源是 `contracts/client-api.c1r1p1.schema.json`、`packages/client-contract/c1r1p1/generated.ts`、`packages/core-service/projection.ts` 与明确标注的扩展接口。UI 不维护第二套业务状态机，不从文案、动画或时间推断 Core 状态。

## 1. 不可改变的产品语义

- **Project（项目）** 是用户工作范围和安全边界；`displayRoot` 只用于展示，文件操作必须走 Core 的句柄与权限。
- **Role（角色）** 是长期职责与身份，不是一次聊天、一个进程或一个 MCP 客户端。
- **Role Identity Pack（角色身份包）** 是 Participant 加入时的受控身份投影；`history_only=true` 表示只能读取历史。
- **WorkSession（工作会话）** 是 Role 的一段具体上下文。每个 Role 恰有一个 `ACTIVE` WorkSession；历史 WorkSession 永久只读，不提供 Continue/Resume。
- **WorkSession Slot（会话槽位）** 是规划或 Join 位置；`OPEN/BOUND/CLOSED` 不是模型运行状态。
- **Binding（绑定）** 是实际 Participant/Harness、workspace、epoch 与 WorkSession 的可信关联。`BOUND` 不等于 AI 正在后台思考。
- **Task（任务）** 是业务意图；**Run（运行）** 是一次执行尝试；**Result（结果）** 是发布与交付记录；**Artifact（产物）** 是不可变内容引用。四者不得合并。
- `WAITING_INPUT` 是 Task 状态；等待原因来自 `blockedReason`/wait record，不是 Role 状态。
- `Artifact.state=AVAILABLE` 只表示内容可读，不表示 Result 已被用户接受。
- Cursor Management MCP 是 controller/observer 管理客户端，不是 Role。Participant MCP 才以 Role 范围加入。
- 同一 `ACTIVE` WorkSession 不得静默更换 Harness、native session、workspace 或 Binding epoch。
- Context Transfer 只在创建新 WorkSession 时执行一次；旧 WorkSession 保持只读。

## 2. 稳定的主投影

主投影是 `SnapshotVM`：`cursor`、`revision`、`projects`、`spaces`、`roles`、`tasks`、`runs`、`issues`、`approvals`、`results`，以及可选的 `workspaces`、`modelCatalog`。连接身份来自 `CoreHelloVM`。UI 只将 nullable/optional 字段解释为“未知或当前未提供”，不得解释为零、否或成功。

| 对象 | 来源 | 权威字段与状态 | 可安全展示 | 稳定性与 UI 处理 |
|---|---|---|---|---|
| Project | `ProjectVM` | `id/name/status/revision`；`ACTIVE/ARCHIVED` | 名称、hostLabel、displayRoot、汇总计数 | **STABLE**。计数是快照，不自行累加。 |
| Role | `RoleVM` | `id/spaceId/status/revision`；`ACTIVE/PAUSED/DISABLED/ARCHIVED` | name、description、workspaceLabel、队列/通知/审批计数 | **STABLE**。`harnessSupport` 只能按原值显示。 |
| Binding | `BindingVM`、current/history API | `id/roleId/harness/epoch/current/revision` | workspaceLabel、脱敏 provider/model | **STABLE core / PROVISIONAL extended harnesses**。旧冻结类型只枚举三 Harness，扩展路径可出现 DSH/ZCode；未知值用通用标签，不丢弃。 |
| Task | `TaskVM` | `state`：`QUEUED/ACTIVE/WAITING_INPUT/RESULT_STAGED/DELIVERED/HANDED_OFF/PARTIAL/FAILED/CANCELLED/NEEDS_ATTENTION/SUSPENDED` | summary、acceptance、queuePosition、blockedReason、时间 | **STABLE**。`WAITING_INPUT` 不映射为 Role busy/error。 |
| Run | `RunVM` | `state`：`CREATED/STARTING/RUNNING/WAITING_APPROVAL/SETTLING/SUCCEEDED/FAILED/CANCELLED/UNKNOWN` | harness、时间、exitReason、nativeSessionDisplay | **STABLE**。`UNKNOWN` 必须显示需核对；不可自动重试。 |
| Result | `ResultVM` | `acceptance` 与 `delivery` 是两个维度 | summary、artifactIds、交付/接受状态 | **STABLE**。`PUBLISHED/DELIVERED/ACCEPTED` 不得互相替代。 |
| Artifact | `ArtifactVM`、artifact APIs | `AVAILABLE/MISSING/QUARANTINED/RETIRED`，sha256、byteSize | mediaType、大小、hash、displaySource | **STABLE**。下载/预览仍需 capability 与 Core 校验。 |
| Attention | `IssueVM`、Task `NEEDS_ATTENTION`、Run `UNKNOWN` | Issue `OPEN/ACKNOWLEDGED/RESOLVED` | code 经 `messageKey` 本地化，关联 project/space/role/task/run | **STABLE**。未知 code 仍需显示可复制代码。 |
| Approval | `ApprovalVM` | `PENDING/APPROVED/DENIED/CANCELLED/EXPIRED` | title、riskLevel、期限 | **STABLE**。只能 controller 经 Core 决策。 |
| Core identity | `CoreHelloVM` | `serverInstanceId/serverVersion/protocol/schemaVersion/contractRevision` | platform、health、upgradeRequired | **STABLE**。identity 变化时隔离 pending mutations。 |
| Controller/Observer | `ConnectionState`、`LeaseVM` | `CONNECTED_CONTROLLER/CONNECTED_OBSERVER/...`，lease generation/expiry | 连接态、只读原因、租约到期 | **STABLE**。Observer 永远只读；断线展示 `frozenAtMs`。 |
| Permission summary | Role Charter `effectivePermissions`、capabilities、controller lease | Core 返回值 | 能否执行、为何不可执行 | **STABLE semantics / PROVISIONAL presentation**。UI 不自行放宽权限。 |
| Harness capability | `Capabilities.harnesses`、`DriverContextCapabilities` | `UNAVAILABLE/PROBED/LIVE_TESTED/CERTIFIED` 与 `VERIFIED/IMPLEMENTED_UNVERIFIED/UNSUPPORTED/UNKNOWN` | 原值、证据时间/版本（若有） | **STABLE enum / PROVISIONAL coverage**。UNKNOWN 不能涂绿。 |

## 3. PROVISIONAL 扩展投影

### WorkSession

来源：`roleSession.list/preflight/create/transferStatus/history` 与 `packages/core-service/role-session-extension.ts`。

- 当前字段：`id`、`role_id`、`seq`、`name`、`state`、`generation`、`created_at_ms`、`activated_at_ms`、`harness`、`driver_id`、`native_continuity`、`migration_fidelity`、`hasNativeSession`。
- `state` 当前为 `ACTIVE/ARCHIVED`；`ARCHIVED` 永久只读。
- `native_continuity`、`migration_fidelity`、transfer detailed stages、effective model provenance 均为 **PROVISIONAL**。
- UI：显示 Core 原值与“未知/未验证”；只对当前 `ACTIVE` 会话提供发送或变更动作。历史会话只允许浏览和从其上下文创建新会话的受控流程，不显示“恢复旧会话”。

### WorkSession Slot 与 Participant Binding

来源：`packages/core-service/participant-join.ts`、migrations `016/017`。

- Slot：`id/role_id/seq/name/participant_kind/state/work_session_id/binding_generation/created_at_ms`；状态 `OPEN/BOUND/CLOSED`。
- Participant Binding：Role、Slot、WorkSession、principal、participant kind、external session reference、grant、generation、状态。
- `participant_kind`：`CHATGPT_WEB/MANAGED_HARNESS/PAIR_CODE`。
- participant session correlation 与完整 UI ViewModel 尚为 **PROVISIONAL**。
- UI：不展示 claim code、grant、token、principal secret；generation stale 由 Core 拒绝，UI 不自行修正。

### TaskInput

当前没有独立冻结 `TaskInputVM`；用户输入通过 `conversation.sendUserInput`、wait record 与 Task `WAITING_INPUT` 关联。此对象为 **PROVISIONAL**。

- UI 必须关联明确的 `task_id`/当前等待记录，展示 Core 返回的等待原因。
- 不得把普通新 Task 自动当成 continuation，也不得把输入写入历史 WorkSession。

### Context Transfer

`roleSession.transferStatus` 当前返回 `op_id/role_id/state/error_code` 及可选目标 session。详细阶段与进度是 **PROVISIONAL**。

- UI 可以显示“准备/进行/已提交/失败”和原始安全错误码。
- 不得承诺 token 精确度、跨 Harness 保真度或 warm support；`UNKNOWN` 原样显示。
- transfer 成功后才出现新 `ACTIVE` WorkSession；旧会话保持 `ARCHIVED`。

## 4. 连接、Remote 与安全显示规则

- `DISCONNECTED/CONNECTING/RECONNECTING/DEGRADED/INCOMPATIBLE` 均不是 controller。
- `readOnly` 来自连接态和 lease，不以按钮是否可见代替权限判断。
- Remote connection state 与 Core identity 分开显示；HTTP+WS 历史现场不能标成 HTTPS+WSS。
- pending mutation 绑定 `mode/dataId/clientId/serverInstanceId`；Core identity 不同不得重放。
- 任何 API key、token、cookie、auth、claim code、真实 sessionHome/private path 不进入 UI 日志、截图或错误详情。

## 5. UI 自由与禁止事项

Kimi 可自由决定布局、信息架构的视觉实现、card/list/drawer/split/full page、字体、间距、颜色、动画、响应式、空/加载/错误态、Needs Attention 表达与证据视觉设计。

Kimi 不得把 WorkSession 模糊成 Chat；不得让历史 WorkSession 出现 Continue/Resume；不得合并 Task/Run/Result；不得把 WAITING_INPUT 当 Role 状态；不得把 Management MCP 画成 Role；不得把 BOUND 解释为后台思考；不得把 Artifact AVAILABLE 当 accepted；不得增加后端数据库状态、绕过 Core permission、恢复旧 Context/Memory 设计、修改 Harness lifecycle，或用 mock 冒充 capability。

缺字段时新增 `UI-CONTRACT-GAP-<N>.md` 交给 Codex，不直接进入 Core/migration 改业务语义。
