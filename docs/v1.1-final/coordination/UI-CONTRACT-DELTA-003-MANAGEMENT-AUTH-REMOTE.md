# UI CONTRACT DELTA 003 — Management Slot / AuthContext / Remote

Functional source SHA：`4ce5c374c38819accae9a2fd1d689ab14441213b`

Parent UI_BASE_SHA：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`

Status：`STABLE_FOR_UI_AUTOMATED_REAL_REMOTE_PENDING`

## Backend change

Management MCP 新增：

- `router_participant_slot_list(params)`：observer/controller 均可读，但受 project scope；Participant 调用同源 Core method 时还受当前 grant/binding generation 约束。
- `router_participant_slot_create(params, request_key, expected_revision)`：仅 controller；需有效 lease、project scope、稳定 request key。
- `router_participant_slot_leave(params, request_key, expected_revision)`：仅 controller；与 create 相同的 mutation 约束，并保留既有 drain/历史只读规则。

Management MCP 移除：

- `router_role_session_switch`：不再作为产品工具暴露。历史 WorkSession 不能通过 resume/switch 恢复 ACTIVE。

Auth/Remote 行为：

- `authenticated`、principal kind、`mayAcquireController`、当前 lease、project scope 分开判定。
- Remote observer 的 hello capability `controller_lease=false`；其可读不代表可申请 lease。
- `clientId` 只是审计标签；UI 不得依据名称前缀推断权限。
- Remote extension mutation 透传 request key、operation id、revision、preflight hash 与 lease id。
- revoke 后订阅与排队写均失效；Participant generation 过期后读写均返回 stale/forbidden。
- response 丢失产生 unknown effect 时，transport 不自动重放 mutation。

## Mutation contract

UI 对 Slot create/leave 必须：

1. 使用在一次用户意图内稳定的 `request_key`；网络重试不得换 key。
2. 携带最近一次服务端 `expected_revision`。
3. 仅在 controller + valid lease 状态显示写入口。
4. 将 `OPERATION_CONFLICT`、revision mismatch、lease lost、scope denied、generation stale 区分展示；不得静默重试或伪装成功。

exact same key + same payload 返回原持久结果；same key + different payload 返回 `OPERATION_CONFLICT`。

## UI impact

- observer：只展示 status/project/role/WS/Slot/task/result 等只读面；隐藏 acquire/control 与所有 mutation。
- controller：可创建/关闭 Participant Slot，但关闭前仍应清楚展示 queue/run drain 阻塞。
- Remote：断线后的 pending mutation 显示“结果未知/待核对”，不能自动创建第二次操作。
- WorkSession：继续遵循 Delta 002；`active_session_id=null` 是明确未绑定状态，历史项只读。
- 本 Delta 不要求 Codex 重做桌面或手机 UI；由 UI 分支消费合同。

## Compatibility / breaking assessment

- 冻结 C1/C1R1/P1 schema 与 migration `001`—`018` 未变化。
- 新 Slot 工具是兼容增强。
- 移除 `router_role_session_switch` 是有意的产品面收紧；依赖该工具的 UI 必须删除入口，不能寻找替代 resume 路径。
- observer 工具列表变为严格只读；此前错误显示的写工具应视为越权 UI，不是兼容目标。

## Tests and limitations

- automated：type/lint/spec、unit 215、integration 225、contract+chaos 70 全部 PASS。
- packaged：本地 Remote Core 1/1 PASS。
- real isolated process：stdio Management MCP + LOCAL Core PASS。
- pending：本 SHA 的真实 Cursor controller、Codex/ZCode 客户端、Tailscale HTTPS/WSS 与手机 UI。
- 本 Delta 不是 Windows RC 声明。
