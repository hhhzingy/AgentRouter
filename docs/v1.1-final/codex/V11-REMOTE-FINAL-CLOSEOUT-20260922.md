# AgentRouter V1.1 发布前最后一轮后续收口（2026-09-22）

执行包：`E:\AgentRouter\docs\执行包\AgentRouter_V1.1_发布前最后一轮_Codex执行包_20260921`

工作树：`E:\AgentRouter\.worktrees\v1.1-functional-codex`  
分支：`feat/v1.1-functional-closeout-codex`  
运行时与发布包候选：`7fda36940599c39c39d74f4f79c34ee18c22b3bc`

## 结论

> 2026-09-22 后续更新：用户已恢复 C1/W11。本轮新增并真实验证 ZCode V4 `forkAssistant` 与 Codex `thread/fork` 同 Harness 原生历史复制；两端父子会话均可 cold resume，源历史不变，且未发送模型 prompt。C1 本地等价门禁 100 files / 539 tests PASS；W11 本地等价门禁 111 files / 638 tests、B0/J1/J2/Electron PASS。最终 GitHub 同 SHA 结果须在推送后回填。在远端结果 green、重新绑定最终 SHA/package 前，仍不得宣称 Windows RC。

本轮已完成此前剩余的真实 Tailscale Serve HTTPS/WSS 后端语义：业务取消、提交后响应丢失的 UNKNOWN/连接丢失、不自动重放、活动流撤销、Core/Application 重建后的游标失效与事件追赶、快照恢复均通过。重新绑定 clean SHA 的源包、ZIP、全新解包、Codex 与 ZCode 真实冒烟也已通过。

**G1—G6 已通过；G7 C1/W11 按用户要求暂停。因此整体仍为 `NOT_V1.1_NON_UI_FUNCTIONAL_RC_READY`，不得宣称 Windows RC。** 没有 CI waiver，也没有 merge、tag 或 release。

本文覆盖 [Codex/Remote 恢复复核](./V11-RESUMED-CODEX-REMOTE-REVIEW-20260922.md) 中 G5 `PARTIAL_REAL_BACKEND` 的旧状态；旧文档保留当时事实和首次 TLS 超时失败分母。

## 最终 Gate 矩阵

| Gate | 状态 | 结论 |
|---|---|---|
| G1 Codex | PASS | 隔离 DUT Core restart、同 Native ref、marker continuity、PUBLISHED；源包与解包态真实 Codex 均 `42/PUBLISHED`；未使用 reset credit。 |
| G2 ZCode | PASS | Existing Account Broker、Bigmodel / `GLM-5.3-Flash`、Level A/B、TaskInput、Artifact、cold resume、Core restart；源包与解包态真实 ZCode 均 `42/PUBLISHED`。 |
| G3 Pi/Kimi/DSH | PASS_WITH_RETRY_DENOMINATOR | 历史强连续性与共享回归有效；Kimi/DSH 首次瞬态失败和独立重试通过同时保留。 |
| G4 Web Participant | PASS_BY_UNCHANGED_CODE_EVIDENCE | 真实网页 Task→Artifact→Result→PUBLISHED 证据有效，相关运行时代码未变。 |
| G5 Remote | **PASS** | 真实 Tailscale Serve HTTPS/WSS 后端完整覆盖执行包列出的 hello/snapshot、observer/controller lease、无害 mutation、cancel、live revoke、Core restart reconnect/catchup、response-drop UNKNOWN 不重放。 |
| G6 Data/Package | PASS | clean SHA、18 migrations、源包/ZIP/解包、Core 重启、Codex/ZCode 两侧冒烟、两侧 secret scan 通过。 |
| G7 GitHub CI | **LOCAL_PASS_REMOTE_PENDING** | 用户已恢复 C1/W11；本地等价 C1/W11 均 PASS。最终非 skip SHA 推送后等待 GitHub 两条 workflow 实际 green。 |

## Work Session 完整历史迁移后续闭环

- ZCode 0.16.9：使用稳定 V4 `v4/conversation/rowsRange` + `v4/command(forkAssistant)`，保留可见文本、工具与附件/显示语义；源历史摘要不变，子会话摘要一致，父子均 cold resume。正式 `createZcodeContextPort` 已真实回放通过。
- Codex：使用官方 `thread/read(includeTurns=true)` + `thread/fork`，子 thread 的 `forkedFromId` 绑定源 thread；完整 turns 摘要一致，源 thread 不变，父子均经新 app-server 进程 `thread/resume`。正式 `createCodexContextPort` 已真实回放通过。
- 两者均作为独立 `native_fork=VERIFIED` 能力，只允许同 Harness 使用；`history_export` 继续保持 `UNKNOWN`，因此跨 Harness 不会被误报为完整迁移。
- 引擎对 target ref 已落盘但回执丢失的情况只读 cold confirm；Codex 在 fork 请求发出但没有返回 child ref 时保持 `UNRESOLVED` 且不自动重试，避免重复建 child。
- 测试不发送模型 prompt、不使用 Codex reset credit、不读取或输出凭据。

安全复核见 [公开仓库全历史安全复核](./V11-PUBLIC-HISTORY-SECURITY-REVIEW-20260922.md)。

## G5 真实 Tailnet 证据

测试：`tests/live/v11-tailscale-serve.test.ts`。仅在设置 `AR_TAILSCALE_SERVE_URL` 时运行，常规离线矩阵中保持 opt-in skip。测试数据位于 `.local/v11-tailscale-serve`，业务对象统一使用 `AR-V11-FINAL-REMOTE-*`，不读取或写入生产 HOME、生产项目及 `.local-protected`。

本轮从空配置开始，临时执行 tailnet-only `HTTPS 443 → 127.0.0.1:44568`，未启用 Funnel。真实链路一次通过以下断言：

1. HTTPS `/health` 和 WSS 握手成功；精确 HTTPS Origin、Secure/HttpOnly/SameSite Cookie 生效。
2. MOBILE observer 不具备 controller 能力；DESKTOP controller 可获取 lease。
3. 在隔离根创建项目、应用最小 Role Plan，并先暂停 dispatch，确保任务保持 QUEUED；`task.cancel` 后读取为 `CANCELLED`。
4. `project.create` 在服务端提交后故意丢弃响应，客户端得到 `CONNECTION_LOST`（不把未知结果冒充失败或成功）；重连后项目只存在一份，处理计数保持一次，证明 mutation 未自动重放。
5. 撤销已连接 observer 后，活动 WSS 立即以 `4001` 关闭；撤销后的 credential 不能重新认证。
6. 关闭网关和数据库、用同一隔离数据重建 Application/Core 服务后，`serverInstanceId` 改变；旧 instance 的 catchup 明确返回 `CURSOR_EXPIRED`，新 instance 配合原 cursor 可取回 `project.changed`，随后 snapshot 可见两个项目及已取消任务。

验收完成后执行 `tailscale serve --https=443 off`，最终 `tailscale serve status --json={}`，未留下指向已停止测试端口的入口。

## 最终包与解包证据

源包：`release/AgentRouter-j3-7fda36940599-e8e6a269-3f96-42e6-abd8-0d4c39e4da37`

- `sourceSHA=7fda36940599c39c39d74f4f79c34ee18c22b3bc`
- `sourceDirty=false`
- `artifactHash=835d2e86194c28dd79125d3e249a4beec453d01a418dbc79d970b9fabfb954dc`
- manifest/18 migrations/Core shutdown+restart：PASS
- secret scan：137 files / 0 findings
- Codex：`.local/j3-production-pi/run-buM0Gy/report.json`，`DELIVERED/SUCCEEDED/42/PUBLISHED`
- ZCode：`.local/j3-production-pi/run-iJxaZz/report.json`，`DELIVERED/SUCCEEDED/42/PUBLISHED`

ZIP：`release/AgentRouter-j3-7fda36940599.zip`

- bytes：`200093488`
- SHA-256：`061ca629bc0321149fce0e499f867787bfe825d0d85c6a29d6c07caccb332866`

全新解包：`.local/unpacked-7fda36940599/AgentRouter-j3-7fda36940599-e8e6a269-3f96-42e6-abd8-0d4c39e4da37`

- manifest/18 migrations/Core shutdown+restart：PASS
- secret scan：137 files / 0 findings
- Codex：`.local/j3-production-pi/run-dovdeC/report.json`，`DELIVERED/SUCCEEDED/42/PUBLISHED`
- ZCode：`.local/j3-production-pi/run-ErSWWu/report.json`，`DELIVERED/SUCCEEDED/42/PUBLISHED`

上述 Harness 运行均使用隔离 DUT；未使用 Codex reset credit，未将凭据或散列值写入 Git。

当前候选验证完成后，已删除被替代且可从 Git 重建的旧 `8443abc` 包目录、ZIP 与解包目录；保留 `7fda369` 当前包、ZIP、解包态和报告。旧产物为不可直接恢复的本地生成物，但可从对应 SHA 重建；未触碰 `.local-protected`、生产 HOME、项目、会话或凭据。

## 本地回归与 CI 边界

- `pnpm typecheck`：PASS
- `pnpm lint`：PASS
- 完整 Vitest：113 files PASS / 2 SKIP；638 tests PASS / 3 SKIP
- 真实 Tailnet opt-in：1 file / 1 test PASS
- 当前交互 Node 24.19.0 与 engine 24.14.0 不同，命令有 warning；发布包内 Node 为 24.14.0。

C1/W11 已恢复并完成本地等价运行：C1 为 100 files / 539 tests PASS；W11 为 111 files / 638 tests PASS，B0/J1/J2/Electron 全部通过。GitHub 远端仍必须绑定本轮最终非 skip SHA，确认两条 Actions 有实际 steps 且 green；若 SHA 变化，需重新绑定发布证据。只有远端 G7 完成并重新生成/复核最终 SHA 的发布包后，才可重新评估 `V1.1_NON_UI_FUNCTIONAL_RC_READY`。

## 发布边界

- 不宣称 Windows RC
- 不 merge main/UI
- 不 tag
- 不 release
- 不把本地 PASS 写成 GitHub CI green
