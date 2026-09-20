# UI CONTRACT DELTA 001 — Formal TaskInput

Functional source SHA：`51b874aca323a51de52b13869cf6fc7d442753df`

Parent UI_BASE_SHA：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`

Status：`STABLE_FOR_UI`（存储/消费语义稳定；独立 Desktop `TaskInputVM` 仍为 PROVISIONAL）

## Backend change

Method/schema/state/error：

- 新增 migration `018-task-inputs.sql`，SHA-256 `64402edcf2fb96b1cbe63d2463a9886b1ab71ee04d740a304dd4df5881449c2c`。
- `wait_records.generation` 为同一 Task 的每次等待建立单调 wait identity。
- `conversation.sendUserInput` 的冻结请求/响应形状不变；写入时新增正式 TaskInput 账本。
- Managed Harness 的下一次 `CONTINUATION` Run 在同一事务中写入 `consumed_by_run_id`。
- Participant `participant.inbox` 在 `WAITING_INPUT` 且输入就绪时可附带 `task_input`；`participant.claim` 返回并以 claim request key 恰好一次消费。
- 新的内部失败码：`TASK_INPUT_MISSING`、`TASK_INPUT_ALREADY_CONSUMED`。它们只表示账本/状态不一致，不得自动重试或伪造输入。

Old behavior：用户回复只写 `conversation_items` 并把 wait 标为 ready；下一 Run 从最新聊天消息推断输入。Participant claim 不返回输入正文。

New behavior：TaskInput 记录 `input_id`、Task/Role/WorkSession、wait generation、请求 Run、actor、payload/hash、operation、created、消费 Run 或 Participant claim。`conversation_items` 仅保留人类可读投影，不再是新写入路径的事实源。v17 中已 ready 的可证明输入在 v18 升级事务内确定性 backfill。

Breaking?：否。C1/C1R1/C1R1P1 冻结方法与 `conversation.sendUserInput → ChangeVM` 响应未改变。Participant 扩展响应只增加可选字段。

## UI impact

Screens/flows that consume it：Task `WAITING_INPUT`、Participant inbox/claim、后续 TaskInput 详情或审计视图。

New required fields/status/errors：

```json
{
  "task_input": {
    "input_id": "task_input_<uuid>",
    "body": "用户回复",
    "payload_sha256": "<64 hex>",
    "created_at_ms": 1789920000000
  }
}
```

- `task_input` 是可选字段；只在当前 wait 尚未消费时出现。
- UI 不得从 conversation 最后一条消息推断“已消费”。
- Desktop 冻结 snapshot 尚未新增独立 `TaskInputVM`；现有 UI 继续以 Task `WAITING_INPUT` / `blockedReason` 展示，不得假造消费状态。

Removed/deprecated behavior：弃用“最新 USER_MESSAGE 就是下一 Run 输入”的推断。

本 delta 不包含视觉设计指令，交互与呈现由 UI AI 决定。

## Fixtures

Request：

```json
{
  "method": "conversation.sendUserInput",
  "params": { "role_id": "role_x", "task_id": "task_x", "body": "OPT-A-R3" }
}
```

Participant inbox response fragment：

```json
{
  "state": "WAITING_INPUT",
  "waiting_for": "user_input",
  "user_input_ready": true,
  "task_input": {
    "input_id": "task_input_x",
    "body": "OPT-A-R3",
    "payload_sha256": "<64 hex>",
    "created_at_ms": 1789920000000
  }
}
```

Negative response：同一 wait 使用不同 operation 再写输入 → `PLAN_STATE_CONFLICT`；同 operation 同帧重试 → 返回原回执且只保留一条 TaskInput。

## Tests

- Contract：67/67 PASS；冻结 C1/C1R1 generation PASS。
- Integration：213/213 PASS；包含 Managed Run 消费、同 Task 两轮 wait generation、Participant replay/claim、v17 backfill、migration 幂等。
- Unit：213/213 PASS；Chaos：3/3 PASS。
- Known limitations：Desktop 独立 `TaskInputVM` 未冻结；真实五 Harness 随机值 WAITING_INPUT 链仍待 N6。
