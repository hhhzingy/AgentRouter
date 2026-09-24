# V1.1.0 Windows 真实黄金链复核（未通过）

复核时间：2026-09-24；产品 SHA：`ea4bad0a74277883c40087920383c76527d56ca8`；结论：`BLOCKED`。本文件只记录实际发生的步骤，**不把分散的两套隔离数据伪装成一条完整黄金链**。

## 已取得的真实分段证据

| 步骤 | 事实与证据 | 裁决 |
|---|---|---|
| 最终包 Core/SQLite/pipe/重启 | clean source 构建；全新解包后 `tools/packaged-test.mjs` PASS，manifest `version=1.1.0`、`sourceDirty=false`、20 个 migration；同数据目录 Core 停机再启动后 Project/history 可读 | PASS；不等于真实 Electron 黄金链 |
| Codex 独立 DUT | 正常网络用户上下文，`run-LxxCLh`：原生 Bootstrap、Task Run `SUCCEEDED`、Result `PUBLISHED`，输入 `artifact_2258c30a-ddcf-4eaf-979a-4f75c4fff557` → 输出 `artifact_8bfdaf55-6dbc-4647-946a-6f44ca4ea442`，下载字节与登记 SHA-256、随机 marker 均匹配。`run-wmA2Hz`：同 native ref 随机 marker 和 Core 冷重启后续轮的断言 PASS | 分段 PASS；`run-wmA2Hz` 组合脚本随后关闭管理客户端再试 Artifact 而总报告 FAIL，不能写总 PASS |
| ZCode 独立 DUT | `run-2bH3zd`：ZCode 已登录客户端 Existing Account Broker，Bigmodel / `GLM-5.3-Flash`，原生 Bootstrap、Task Run `SUCCEEDED`、Result `PUBLISHED`，输入 `artifact_59ade932-49be-43a3-8527-879119683276` → 输出 `artifact_eb405102-b1bc-4e92-92d4-3401cd4a69c9`，下载哈希与 marker 匹配。`run-xdPqzV` 的同 native ref marker/冷续断言 PASS | 分段 PASS；`run-xdPqzV` 最后清理阶段 `CONTROL_LEASE_EXPIRED`，总报告 FAIL，不能写总 PASS |
| 自动与云端门禁 | 114 文件、654 PASS / 2 SKIP；C1、W11 云端在本产品 SHA 均 success；C1/C1R1 freeze、暂存与 publish refs 扫描通过 | PASS |

两套最小 Harness 脚本使用新建隔离 Core 数据库、工作区与新 Project，没有读取、修改或删除用户既有 Project/Role/WS。但脚本里的 Project/Role 名称并非执行包要求的 `AR_V11_FINAL_<timestamp>`，因此它们只是分段 live smoke，不能充当最终 Golden Flow 身份集合。

## 关键阻塞：Codex → ZCode 完整历史迁移

`packages/core-service/harness-drivers.ts` 中 Codex `history_export=UNKNOWN`；`packages/platform/codex-context-port.ts` 的 `exportContext()` 明确抛 `CODEX_CROSS_HARNESS_EXPORT_UNSUPPORTED`；`packages/core-service/context-transfer.ts` 只允许来源能力为 `FULL_VISIBLE` 且双端真实端口齐备的 inherit。故正常产品路径会 fail closed 为 `CONTEXT_EXPORT_UNSUPPORTED`，不能开始这一步。

本轮对由测试创建的隔离 Codex 会话做了只读、只输出字段形状的原生探针：四个 turn 包含 `userMessage`、`agentMessage`、`reasoning`、`mcpToolCall` 等结构化条目；`model/list` 可用字段未提供可直接信任的上下文窗口数值。不能只拼接文本后宣称“完整历史”或把未知容量当作零。探针没有持久化/输出正文、账号或密钥；一次性脚本已清理。若后续决定实现跨 Harness 可见历史导出，必须先定义并验证工具调用、附件、容量、截断、目标 receipt 与失败回滚的语义，再以新产品 SHA 重做门禁。

因此以下同链断言均未发生：Codex WS → ZCode 新 WS、`TRANSFER_MARKER` 不重给仍被新 WS 引用、旧 Codex WS 永久 HISTORY/read-only、目标初始化 receipt、迁移后的 Core 冷重启及幂等恢复。两个 Harness 各自的冷续成功不能替代该断言。

## 其余未执行的硬步骤

- 同一 `AR_V11_FINAL_*` Project/Role/Task/Slot 内，真实 `REAL_CORE+Electron` 六页面可用性与 Controller/Host 身份显示。
- 同一真实 Result 上的 Controller-attested Evidence `record`、同 operation id 幂等核对、Electron Result Detail 的 Request Changes 与 follow-up 唯一性。
- 同一 Project 的 ChatGPT Web `participant.join`、identity/inbox/claim/read Artifact/submit Result、UI reopen 安全摘要。
- 实体手机在 Tailscale HTTPS/WSS 上的 390px 关键操作、刷新不重复；全新 ZIP 解包后桌面用户 smoke。

Web 与手机按执行包应在机器端 Golden Flow/测试对象就绪后再发用户操作卡；目前未创建可用的 `AR_V11_FINAL_*` Slot，也未提供一次性 Join Instruction，避免让用户在错误/旧对象上验收。历史上其他 SHA 的 Web Participant Task/Artifact/Result 与 Tailnet 后端证据仅作支持材料，不冒称本 SHA 的上述 PASS。

## 失败分母与环境边界

- Codex 首次脚本默认二进制路径已不存在（启动前 `ENOENT`）；随后使用本 worktree 的空 DUT 根得到 Bootstrap `UNKNOWN`；改为既有批准 DUT 后，在隔离沙箱原生 `account/read` 报 `workspace routing discovery failed`；同一 DUT 在正常网络上下文重跑后真实 Bootstrap/Artifact 成功。未使用 Codex reset credit。
- `run-wmA2Hz` 的 cold restart 断言通过，后续组合脚本访问已关闭的 MCP 客户端而失败；这是脚本组合缺陷，不作为 Artifact 产品失败或 Golden PASS。
- `run-xdPqzV` 的 cold restart 断言通过，清理阶段控制租约过期使总状态 FAIL；保留这条失败，不把它改写为完整 ZCode cold smoke PASS。
- 本机受限进程上下文执行 `tools/check-w11.mjs` 时 114 个测试通过，但 Playwright Electron 在进程启动处被拒绝；同 SHA Windows GitHub Actions W11 全流程 success。云端自动 Electron 不能替代本机 REAL_CORE Golden UI 或实体手机。

结论：`V1.1_WINDOWS_RELEASE_BLOCKED`。本候选 ZIP 仅用于继续验收，**不应发布、merge、tag 或称 Windows RC**。
