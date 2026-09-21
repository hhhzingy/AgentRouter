# AgentRouter V1.1 非 UI 收尾 — F4 Participant / F5 Remote 复核

日期：2026-09-21
功能候选：`86ed3eecbeb625b9cb233de6899d1d0ccbf2f922`
结论：`PARTICIPANT_REAL_WORKFLOW_PASS / REMOTE_HTTPS_WSS_BLOCKED`。本文不是 Windows RC，也不是 `V1.1_NON_UI_FUNCTIONAL_RC_READY`。

## 1. 网页 ChatGPT Participant 真实闭环

网页端新账号已创建并选中 `AgentRouter` 插件。插件后端使用官方 Secure MCP Tunnel，Participant HTTP 仅绑定 `127.0.0.1:8790`；Core 使用隔离数据根 `.local/v11-cursor-mcp/core`，未读取生产 HOME。

真实网页会话：

- ChatGPT 会话别名：`chatgpt-conversation-6ab0ca80`（不提交完整网页 URL）；
- Project：`project_de51bea3-a584-41c1-a438-88a749e56f2c`；
- Role：`role_aa631a77-adc2-4685-9b22-acc3ed7f0af6`；
- Slot：`wslot_1f54e16e-3abb-4305-80ce-947b899a6c75`，`CHATGPT_WEB`；
- Task：`task_8552de86-6a1e-4007-ad12-90899d1e5809`；
- 输入 Artifact：`artifact_606ef0db-86de-47bb-98b2-e925e3ad2152`；
- 测试口令：`WEB-3B96CD7F98`。

网页端只调用 Participant 工具：

1. `participant_read_inbox`；
2. `participant_claim_task`；
3. `participant_read_artifact`；
4. `participant_register_artifact`；
5. `participant_submit_result`。

没有调用 Management MCP。当前 HTTP bridge 在进程启动时通过管理面预签发 grant 完成 `participant.attach`，因此公开工具面不广告执行包早期草案中的 `participant_join` / `participant_identity`；网页会话不能自行签发 grant 或改变 Role/Slot。

### 权威持久化复核

不能只采信网页文本。本轮随后直接以只读方式复核隔离 Core：

- Task 最终状态：`DELIVERED`；
- Result：`result_275c3f76-c5bc-4f61-a3fb-051a01e1443b`；
- Result outcome：`succeeded`；
- publication：`PUBLISHED`；
- 人类验收仍独立为 `PENDING`，没有把 Result 等同于人工批准；
- 输出 Artifact：`artifact_50eb0d08-4274-4be4-8eda-763bd4846da7`；
- 文件名：`review.md`；
- 状态：`AVAILABLE`；
- 媒体类型：`text/markdown`；
- 字节数：`161`；
- 登记 SHA-256 与实际文件 SHA-256 均为 `089591a0ac2eb889a79a8832c743fab31971df363656ce4c8f7bd665da0f6822`；
- 实际文件逐字包含 `WEB-3B96CD7F98`；
- Result `outputs_json` 精确引用上述 Artifact。

此外，独立 controller ClientSession `v11_web_downstream_verify` 通过正式 `task.get`、`artifact.get`、`artifact.download` 再次读取同一任务和产物：Task 为 `DELIVERED`，Artifact 为 `AVAILABLE`，下载结果为 161 字节，SHA-256 与登记值一致且包含测试口令。该读取会话未调用 `result.accept`，随后通过正式 shutdown barrier 退出 Core；因此 downstream 可见性不是直接读取数据库所得的推断。

这证明链路是 Role Task → approved input Artifact → 本地真实文件 → Core Artifact hash/bytes → Result → `PUBLISHED`，不是网页 sandbox 链接或自然语言伪造。

## 2. generation / reconnect / replacement 负向边界

clean `86ed3ee` 全量非 UI 测试包含 `tests/integration/participant-grants.test.ts` 7/7 PASS：

- 同角色新 grant 撤销旧 grant；
- 旧聊天继续写入得到 `PARTICIPANT_GENERATION_STALE`；
- 旧 grant 重新 attach 得到 `PARTICIPANT_GRANT_REVOKED`；
- 新 grant 正常写入；
- 连接断开后同 grant 重新 attach，grant 保持 `ACTIVE`；
- revoke 后旧连接工具面与写入均失效；
- 受限连接不能跨项目签发 grant。

真实网页正向闭环完成后没有替用户执行 grant replacement，以免在无必要时使刚配置的插件永久失效。负向 fencing 由正式 Core/bridge 集成测试证明；网页业务路径由真实 ChatGPT 会话证明。判定为：

`PARTICIPANT_REAL_WORKFLOW_PASS_WITH_NEGATIVE_CORE_INTEGRATION_EVIDENCE`

## 3. Artifact 文件成功、DB 失败回滚

提交 `32948556d67ec40efc280487d19f46dce1d5a7b9` 新增高价值故障注入：

- workspace 文件与新 content-addressed blob 已落盘后，强制 `artifacts` INSERT trigger 失败；
- Core 删除本次创建的 workspace 文件、临时文件和新 blob；
- 数据库没有 Artifact 行；
- 若相同内容已有共享 blob，失败回滚只删除本次 workspace 文件，不删除共享 blob；
- 清理本身失败时显式返回 `PARTICIPANT_ARTIFACT_ROLLBACK_INCOMPLETE`，不静默声称原子性。

定向组合回归：8 files / 49 tests PASS；最终 clean `86ed3ee` 全量：99 files / 520 tests PASS。

## 4. Remote 后端

### 已证明

- loopback Gateway、pairing、scope、observer/controller、lease、WAITING_INPUT、cancel、幂等、response-drop `UNKNOWN` reconcile、revoke live stream、revoke 后 queued mutation 丢弃、Core restart/reconnect 均在 `tests/integration/v11-remote-gateway.test.ts` 等自动门中通过；
- `86ed3ee` 全量 520/520 PASS；
- Tailscale 客户端 `1.102.2` 正常运行，MagicDNS tailnet 可见。

### 未证明 / 外部阻塞

`tailscale serve status --json` 返回空对象 `{}`，节点 `CertDomains=null`。Tailnet 尚未启用 Serve，因此没有真实 Tailscale Serve HTTPS/WSS endpoint，不能把 loopback HTTP/WSS 或 OpenAI Secure MCP Tunnel 代替该 Gate。

当前准确状态：

`REMOTE_BACKEND_AUTOMATED_PASS / REAL_TAILSCALE_HTTPS_WSS_BLOCKED_BY_TAILNET_SERVE_ENABLEMENT`

未使用 Funnel，未执行 Serve reset，未把 local endpoint credential 当作 remote credential。

## 5. F4/F5 判定

| 子项 | 判定 |
|---|---|
| 网页 Participant 真实业务闭环 | PASS |
| Artifact 文件/hash/bytes/Result downstream | PASS |
| generation/reconnect/replacement | PASS（真实正向 + Core 集成负向） |
| Remote loopback/backend 自动合同 | PASS |
| Tailscale Serve HTTPS/WSS 真实闭环 | BLOCKED |

因此 G4 仍为 `PARTIAL`，原因只在真实 HTTPS/WSS Remote 子项；不得输出非 UI RC。
