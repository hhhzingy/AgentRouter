# FUNC-CHECKPOINT-C — Management MCP / AuthContext / Remote

状态：`FUNCTIONALLY_STABLE_AUTOMATED_REAL_REMOTE_AND_DUT_PENDING`；不是 Windows RC

## Source

- source SHA：`4ce5c374c38819accae9a2fd1d689ab14441213b`
- parent：`89b27d63aa5f66a53b73b75d55d4df259f309de9`
- branch：`feat/v1.1-functional-closeout-codex`
- UI Base：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- UI delta：`UI-CONTRACT-DELTA-003-MANAGEMENT-AUTH-REMOTE.md`
- migration：无新增；冻结范围仍为 `001`—`018`

## Frozen hashes

以下均为文件原始字节的 SHA-256；本批未修改冻结合同或 migration：

| 对象 | SHA-256 |
|---|---|
| `docs/api/freeze.c1.json` | `f6486b499dedf42acf77d72c2e96cc37430da59cd8f144e141acb5139f7ca5a4` |
| `docs/api/freeze.c1r1.json` | `961152fac1007cf52ed03b40f6952c121c55f2115feea3da17dd7dfbe9912f5c` |
| `docs/api/freeze.c1r1p1.json` | `8988751225dc411cdd739cfa9a7afce71c275199367ac63e9c1104ac225dbe8` |
| `docs/api/freeze.migrations.json` | `ed85b253863e362d13f94fa412ee454689df51b071418b88a985fb1c9e63e6d5` |
| `contracts/agentrouter-role-plan.v1.schema.json` | `218e426db01e87275dc086f4b9d6cbf9eb65d4bcfdab7eff8468aac1f6ae5971` |

## N5 capability matrix

| Gate | 证据 | 判定 |
|---|---|---|
| AuthContext 分离 authenticated / principal kind / project scope / controller eligibility / lease | Core + Local/Remote/P1 transport 正负测 | PASS_AUTOMATED |
| 不以 `clientId`/principal 名称前缀充当授权 | LOCAL/REMOTE/PARTICIPANT/UNAUTHENTICATED 显式 principal kind | PASS_AUTOMATED |
| Management Slot list/create/leave | MCP → Gateway → Core，含 revision/request_key/lease | PASS_AUTOMATED |
| Slot 写入持久幂等 | exact replay、payload drift、revision、operation ledger | PASS_AUTOMATED |
| 历史 WorkSession resume/switch 产品工具不可见 | `router_role_session_switch` 从 MCP surface 移除 | PASS_AUTOMATED |
| Cursor observer scope 正负测且不是 Role | `mcp_management_cursor` in-scope/cross-project/write denial | PASS_AUTOMATED；旧 SHA observer 实连，不等于本 SHA controller 实测 |
| Codex/ZCode Management launcher 回归 | observer/controller 可启动，managedRole 拒绝 | PASS_AUTOMATED；真实客户端待跑 |
| Remote observer 与 controller 资格分离 | observer 可读、不能申请 lease，hello 能力为 false | PASS_AUTOMATED |
| Remote controller mutation metadata | request_key/operation_id/revision/preflight/lease 透传 | PASS_AUTOMATED |
| Remote revoke | 订阅断开；已排队 mutation 不进入 Core | PASS_AUTOMATED |
| Remote reconnect / unknown write | 丢响应返回 `CONNECTION_LOST`，同 transport 不自动重放；对象只创建一次 | PASS_AUTOMATED |
| Remote extension idempotency | Slot create exact replay；drift → `OPERATION_CONFLICT` | PASS_AUTOMATED |
| Participant revoke fencing | grant 撤销后 Slot list 变 stale | PASS_AUTOMATED |
| 打包态 Remote Core | 独立进程 health/console/auth/shutdown | PASS_PACKAGED_LOCAL |
| Tailscale Serve HTTPS/WSS + 手机 | 本 SHA 未执行 | NOT_RUN_REAL_REMOTE |

## Stable backend semantics

1. `authenticated` 只表示认证已建立；能否申请控制权由 `mayAcquireController` 单独决定，是否能写还必须同时满足持有 lease、scope、revision 和稳定 request key。
2. principal kind 是服务端显式事实：`LOCAL_CLIENT`、`REMOTE_DEVICE`、`PARTICIPANT`、`UNAUTHENTICATED`。`clientId` 仅作审计标签，不能提升权限。
3. Management MCP 新增 `router_participant_slot_list/create/leave`。observer 只看到只读工具；controller 写工具仍受 lease 与 project scope 约束。
4. `router_role_session_create` 继续只接受明确 `blank`/`inherit`；历史 resume/switch 不再作为产品 MCP 工具暴露。
5. Remote WebSocket 对 extension method 保留同一 request metadata；断线后的未知写不由 transport 猜测重放，调用方只能用原 request key 查询/重试。
6. Remote Device 管理只允许已认证的本地 Management Client；Remote Device、Participant 与未认证连接都不能自我扩权。

## Verification

- typecheck：PASS
- lint：PASS
- spec：36/36 PASS
- unit：41 files / 215 tests PASS
- integration：49 files / 225 tests PASS
- contract + chaos：9 files / 70 tests PASS
- N5 定向回归：11 files / 60 tests PASS
- packaged Remote Core：1/1 PASS
- 隔离真实 stdio Management MCP：PASS；验证真实 LOCAL Core、observer/controller、租约续期、持久化、幂等、等待/取消与工具隔离
- `git diff --check`：PASS
- staged secret scan：PASS，0 findings
- protected assets：PASS；只使用 worktree 下 `.local` 隔离目录，未触碰生产 HOME、既有账号或会话

## UI AI 可安全消费的 API

- 可消费 `router_participant_slot_list` 展示 Slot/Binding/WorkSession 当前事实。
- 只有 controller UI 才可呈现 create/leave 操作；必须随请求携带 `request_key` 与 `expected_revision`，并处理 lease/scope/stale/conflict 错误。
- observer 端不得渲染“获取控制权”或写入口；`controller_lease=false` 是真实能力，不是加载失败。
- 断线写返回未知结果时不得自动换 key 重放；保留原 request key 进入查询/人工 reconcile 流程。
- 不得重新加入历史 WorkSession 的 Continue/Resume/Switch 操作。

## Known gaps / next stage

- `mcp_management_cursor` controller、Codex/ZCode Management MCP 尚未在本 SHA 由真实客户端连接；当前证据是协议/launcher 自动回归和隔离 stdio 实测。
- 本 SHA 未跑 Tailscale Serve HTTPS/WSS、手机 observer/controller/revoke/reconnect；本地打包态 HTTP/WS 通过不能替代真实网络证据。
- N4 的 ZCode 真正 payload receipt、同/跨 Harness Context Transfer 仍待真实 DUT。
- N6 五 Harness Level A+B、N7 真实网页 Participant、N8 migration/fault/stability、Electron 安装包/CI、UI 合流均未完成。
- 未 merge main、未 tag、未 release；当前分支不得称 Windows RC。
