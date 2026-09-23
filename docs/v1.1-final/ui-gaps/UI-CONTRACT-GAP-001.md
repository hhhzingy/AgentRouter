# UI-CONTRACT-GAP-001

## Page / Flow

Role Detail → WorkSession Slots / Participant Binding

## User need

用户需要区分“Slot 已创建”“Participant 已绑定”“Participant 最近在线”以及“谁正在承担该 WorkSession”。

## Missing / ambiguous contract

`participant.slot.list` 只返回 Slot 行，缺少 display-safe 的 Participant Binding 摘要、last seen、external session 脱敏引用与可复制 Join Instruction。

## Current fields

`id/role_id/seq/name/participant_kind/state/work_session_id/binding_generation/created_at_ms`

## Required display-safe field / behavior

- `binding: null | { display_name, participant_kind, state, last_seen_at_ms, external_session_display }`
- Core 生成的 non-secret `join_instruction` 或可安全复制的 `short_ref`
- 明确说明字段是否可以在主 Snapshot 中稳定投影

## Why UI cannot safely infer it

`BOUND` 只证明存在可信 Binding，不能推出 Participant 的展示身份、最近在线或正在运行；UI 也不能拼接 claim code、grant 或 secret。

## Suggested additive shape (optional, not authoritative)

在 Slot list item 增加可空 `binding_summary` 与 `join_instruction_display`；所有 secret 保持不可见。

## Priority

P1

## UI work that can continue without this gap

显示 Slot 的 `OPEN/BOUND/CLOSED`、WorkSession 是否关联，并把缺失详情明确标为 Core 未提供。

## Codex response

- status: PARTIAL_CORE_IMPLEMENTED_UI_CONSUMED
- commit: `eccf799`
- UI-CONTRACT-CHANGE: `UI-CONTRACT-CHANGE-20260923`

Core 已提供 `short_ref`、OPEN `join_instruction_display` 和 ACTIVE `binding_summary`，UI 已按真实字段显示；最近在线和外部会话仍无可信来源，返回 `null`，不能标为完整关闭。最终 Core+UI 真实链路尚未合流验证。
