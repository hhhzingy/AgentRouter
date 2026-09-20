# UI CONTRACT DELTA 002 — Participant Join / WorkSession Replacement

Functional source SHA：`dd785fb852cc21d72ee7d92af6d9de895d7bd037`

Parent UI_BASE_SHA：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`

Status：`STABLE_FOR_UI_WITH_ONE_SECURITY_APPROVAL_PENDING`

## Backend change

Method/schema/state/error：

- `participant.join`：Slot 无 WS 时原子创建新 ACTIVE WS + Binding；预创建未绑定 WS 则复用。
- `participant.join.params.generation` 现在进入 Core generation fencing；旧 generation 返回 `BINDING_GENERATION_STALE`。
- 同 Role 已有 ACTIVE Participant Binding 时，第二 Participant 明确返回 `ROLE_WORKSESSION_ALREADY_BOUND`。
- `participant.leave`：有未完成 Task/Run 时返回 `ROLE_SESSION_QUEUE_NOT_DRAINED`；成功后 Binding ENDED、Slot CLOSED、旧 WS ARCHIVED、activation ENDED。
- replacement：新 Participant 使用新 Slot/Grant，得到新的 WS；旧 WS 永久只读，不复活。
- `roleSession.list.active_session_id`：在 Slot 已关闭且替代 WS 尚未建立的短暂 `PLANNED_NO_SESSION` 状态可为 `null`。
- Managed Harness：RoleSession blank create 或 Context Transfer commit 后，由生产 `w11-main` 在同一事务内自动切换 Managed Binding；模型不手工 join。
- Join 创建 WS 时，将 `role_session_id=null` 的 planned QUEUED Task 原子归属到该 WS；已有历史 attribution 不重算。

Old behavior：Join 无现成 ACTIVE WS 时失败；leave 不归档 WS；replacement 可能复用旧 ACTIVE WS；RoleSession 新建后 Managed Slot 仍可能指向历史 WS；generation 参数未从 ApplicationService 传入。

New behavior：符合 `PLANNED_NO_SESSION / UNBOUND_SESSION → BOUND_ACTIVE → HISTORY_READ_ONLY / CLOSED` 单一 Join 模型。

Breaking?：

- Participant 扩展是兼容增强。
- `roleSession.list.active_session_id` 从“总是 string”扩展为 `string | null`；UI 必须显示“待绑定/无活动工作会话”，不得自动恢复历史 WS。

## UI impact

新增 Identity Pack 非敏感字段：

```json
{
  "project_display_name": "项目名",
  "slot_state": "BOUND",
  "work_session_state": "ACTIVE",
  "safety_protocol": {
    "request_key_required": true,
    "history_read_only": true,
    "cannot_expand_permissions": true,
    "user_approval_must_not_be_fabricated": true
  }
}
```

- Slot CLOSED / WS ARCHIVED 必须只读，不能出现 Continue/Resume。
- `active_session_id=null` 是明确状态，不是加载失败。
- replacement 后 UI 使用新 WS id/generation，迟到旧事件必须丢弃或显示 stale。
- Managed Harness 与 Web Participant 使用同一 Identity 结构。

## Security approval pending

执行包要求 Identity Pack 的 `current_assignment` 直接包含 Task body、input refs、expected 与 result target。把这些具体任务载荷复制到新的 Identity 响应面被安全审查阻止，需用户明确授权。

当前安全行为：

- `current_assignment` 未新增真实任务载荷字段；
- 已授权 Participant 继续通过既有受限 `participant.inbox` 获取 Task body/input/expected/completion；
- 不影响 claim/artifact/result/downstream 功能，但 Identity Pack 单响应尚未满足执行包完整字段要求。

## Tests

- `v11-c5-join.test.ts`：7/7 PASS，覆盖无 WS、预建 WS、幂等重连、占用冲突、stale generation、leave/drain、replacement、Managed 自动绑定。
- 全量：unit 213/213、integration 215/215、contract 67/67、chaos 3/3 PASS。
- 重建 `w11-core` 后 packaged DUT + Participant workloop：4/4 PASS。
- Known limitations：真实网页 ChatGPT Join/Identity/claim/artifact/result/downstream 仍待 N7；Identity `current_assignment` 敏感载荷扩展待授权。
