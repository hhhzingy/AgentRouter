# FUNC-CHECKPOINT-A — Artifact / Reference / TaskInput / Queue

状态：`STABLE_FOR_UI_WITH_REAL_DUT_PENDING`；不是 Windows RC

## Source

- source SHA：`51b874aca323a51de52b13869cf6fc7d442753df`
- parent：`af414de7c7b74b743869b6d969f5a4cad84e0673`
- branch：`feat/v1.1-functional-closeout-codex`
- UI Base：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- UI contract delta：`UI-CONTRACT-DELTA-001-TASK-INPUT.md`

## Contract / schema / migration

- 冻结 C1/C1R1/C1R1P1 请求/响应未破坏；Participant 扩展仅增加可选 `task_input`。
- migration：`018-task-inputs.sql`
- migration SHA-256：`64402edcf2fb96b1cbe63d2463a9886b1ab71ee04d740a304dd4df5881449c2c`
- migrations `001`—`017` 字节未改；freeze manifest + LF guard PASS。
- `wait_records.generation`：同一 Task 多轮等待的稳定关联，不依赖毫秒时间。
- `task_inputs`：正式记录输入、hash、幂等 operation 与恰好一次消费归属。

## 三条黄金流程

| 流程 | 自动证据 | 当前判定 |
|---|---|---|
| 输入 Artifact → 读 → 输出 Artifact → Result → Participant/downstream | `artifacts.test.ts`、`participant-workloop.test.ts` | PASS_AUTOMATED；真实跨 Harness DUT 待 N6/N7 |
| WAITING_INPUT → 随机输入 → 下一 Run/Participant 消费 | `core.test.ts`、`participant-grants.test.ts`、`participant-workloop.test.ts` | PASS_AUTOMATED；正式 TaskInput、hash、replay、两轮 wait、消费归属均断言 |
| QUEUED/WAITING_INPUT → 新 WorkSession | `role-session.test.ts` | PASS_AUTOMATED；未 drain 明确 `ROLE_SESSION_QUEUE_NOT_DRAINED`，cancel/drain 后才允许创建 |

## Stable capabilities safe for UI

- Task/Run/Result/Artifact 仍是不同对象；Artifact AVAILABLE 不等于 Result accepted。
- `conversation.sendUserInput` 同 operation 同帧重试幂等；同一 wait 不接受第二个不同输入。
- 下一 Managed Run 的 `request_snapshot.task_input` 含 `input_id/body/hash/actor/created/source`，并原子记录 `consumed_by_run_id`。
- Participant inbox/claim 的 `task_input` 是可选真实字段；没有字段时 UI 必须显示未提供/不一致，不能从历史消息猜测。
- 历史 WorkSession 的 conversation attribution 不随 current WS 重算。

## Changed files

- `packages/storage/migrations/018-task-inputs.sql`
- `packages/storage/application-store.ts`
- `packages/core-service/application.ts`
- `packages/runtime/core.ts`
- `packages/core-service/participant-extension.ts`
- migration manifest 与对应 unit/integration tests。

## Verification

- typecheck：PASS
- lint：PASS
- spec：36/36 PASS
- unit：41 files / 213 tests PASS
- integration：49 files / 213 tests PASS
- contract：8 files / 67 tests PASS
- chaos：1 file / 3 tests PASS
- migration freeze/EOL：PASS
- staged secret scan：PASS
- protected assets：PASS；未触碰生产 HOME、旧会话、账号文件或 UI 工作树

执行中已解释并修复的失败分母：

- 独立工作树首次缺 `ws` link，补齐 lockfile 依赖后 Remote 11/11 PASS；不是产品断言失败。
- migration 版本清单最初仍期待 17，更新到 18 后完整 integration PASS。
- v17 ready input backfill 审查发现兼容风险，补 backfill 与降级 fixture 后定向及全量回归 PASS。

## Known gaps / next stage

- 真实五 Harness 的 Artifact 与随机值 WAITING_INPUT 链尚未在同一干净 SHA 重跑。
- Web ChatGPT Participant 真实网页链尚未在本 SHA 重跑。
- 独立 Desktop `TaskInputVM` 仍为 PROVISIONAL；UI 可先安全消费 Task 状态与 Participant 可选字段。
- ZCode、Pi Level B、Remote HTTPS/WSS、Electron 安装/升级、CI 仍未闭环。

下一阶段：N3 Role Identity / Slot / Binding / Participant 当前 SHA 复核与真实链准备。未经授权不 merge main、tag 或 release。
