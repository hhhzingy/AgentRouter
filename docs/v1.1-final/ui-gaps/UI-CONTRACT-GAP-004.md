# UI-CONTRACT-GAP-004 — Result 请求修改的反馈与后续工作

## User scenario

Results → Result Detail → Request Changes。用户输入修改意见后，需要知道这份意见是否已保存、原 Result 如何保留，以及后续工作由哪个 Task / Run 承担。

## Current observed contract

`result.reject` 只接受 Result `id`。Core 当前实现把关联 Task 的 acceptance 改为 `REJECTED`，没有反馈正文参数，也没有创建 follow-up Task / Run 的结果。`task.submitFromUser` 是另一条独立写命令，不能由 UI 假装与 reject 原子提交。

## Required field/action

Core 提供受控的 Request Changes 命令或明确的两阶段流程：反馈正文、原 Result 历史保留、后续 Task / Run 关系、幂等操作 ID，以及确认结果未知时的查询方式。返回 display-safe 的业务结果供 UI 展示。

## Why UI cannot infer safely

仅调用 `result.reject` 会留下“已拒绝”状态，却不会派发修改工作；随后另发任务可能只成功一半。UI 不能把这两个独立操作描述为已提交修改请求。

## Blocking level

P0 Result Detail 的完整 Request Changes 闭环。当前 UI 保留真实 `result.reject`，不得声称反馈已送达或后续工作已启动。

## Owner

V1.1 Core / Result 负责人；UIAI 等待合同后消费。

## Codex response

- status: CORE_IMPLEMENTED_UI_CONSUMED_E2E_UNVERIFIED
- commit: `eccf799`
- UI-CONTRACT-CHANGE: `UI-CONTRACT-CHANGE-20260923`

UI 已使用 `result.requestChanges` 与 `result.reviewStatus`，结果未知时保留原操作记录并仅查询，不用旧 `result.reject` 冒充修改请求。当前 UI 分支尚未合入 Core 提交，联合真实 Core/Remote/Mobile 路径没有通过端到端验收，不能标为 CLOSED。
