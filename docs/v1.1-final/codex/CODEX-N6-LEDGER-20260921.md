# N6 五 Harness DUT 固定分母账本（2026-09-21）

状态：`IN_PROGRESS`；不是 Windows RC，也不是五家 Level B PASS。

## 候选与保护范围

- 功能分支：`feat/v1.1-functional-closeout-codex`。
- 起始 clean SHA：`b45390de847dfcdb683d0fe487a6b615e542e9ae`。
- Artifact/终态合同修复 clean SHA：`28bf80a61196241b708370b7112492ff1c547359`。
- Pi 新 WorkSession 首轮 session-path 修复 clean SHA：`533557c9498f06d9e3a1a8fab70dcc10e33f848f`。
- Kimi `route_finish` 终态提示修复 clean SHA：`dd601dd52c4808f9ae970758e760b6610a5f4c36`；此前 N6 固定分母记录提交 `a05a46f`。
- 当前 `533557c` Core bundle SHA-256：`6197c5e381299642a46b896cedebd4263bbeef61ab49e68ec04766f6c0ac70c8`；Management MCP bundle SHA-256：`f87738f6c22ee17f13cc6eaa264525e7956f99f346f9fb0661c08379654a78ab`。
- 平台：Windows；以下均为隔离 DUT，`fullIsolationCertified=false`（Windows 进程 Job 生命周期有证据，但不宣称完整 OS 隔离）。
- 每次运行均创建 `.local/j3-production-pi/run-*` 独立 Core/Workspace/受管 HOME；Codex/ZCode 只借用上一轮受保护 DUT 身份，不复制或输出凭据；未触碰生产 HOME/已有对话。Codex 未使用 reset credit。
- 百炼有效模型：Pi/DSH `qwen3.8-flash`，Kimi `bailian/qwen3.8-flash`；凭据由受信 loader 只注入测试子进程。ZCode 隔离选择是 Bigmodel Coding Plan / `GLM-5.3-Flash`，百炼仅为显式备选、无自动回退证据。

## Level A 固定尝试记录

表中 `run-*` 是隔离 DUT 数据根别名；原始报告仅留在 `.local`，不提交凭据或完整模型输出。

| Harness | source | DUT 别名 | 结果与失败归因 |
|---|---|---|---|
| Pi | `b45390d` clean | `run-U29flR` | PASS：Bootstrap、42/PUBLISHED、input→output Artifact、hash/marker、Core stop。 |
| Kimi Code | `b45390d` clean | `run-7brVtp` | PASS：同上，百炼 provider。 |
| DSH | `b45390d` clean | `run-rxaAIm` | FAIL：Bootstrap `NATIVE_DISCONNECTED`，未建任务 Run；原因未解释，不计入成功。 |
| DSH | `b45390d` clean | `run-X9g7Hb` | PASS：Bootstrap、42/PUBLISHED、Artifact/hash/marker、Core stop。累计 1 FAIL / 1 PASS。 |
| Codex | `b45390d` clean | `run-OOTME4`、`run-2lrRTa` | 两次 FAIL：最小 42/PUBLISHED 通过；Artifact 已写入但未 `route_finish`，Task `NEEDS_ATTENTION`。 |
| Codex | `b45390d` dirty | `run-ZCeeUg` | FAIL：只改工具描述仍未提交终态；证实描述单独不足。 |
| Codex | `b45390d` dirty | `run-6jPmtG` | FAIL：外层终态协议使模型诚实提交 failed；Artifact 引用形状被 `INVALID_INPUT` 拒绝。 |
| Codex | `b45390d` dirty | `run-dhMBD2` | PASS：补 `response.reference` 后完整 Artifact 链通过；仅作为修复验证，不作 clean 候选通过证据。 |
| Codex | `28bf80a` clean | `run-TiIqnJ` | FAIL：两段 Artifact 与 hash/下载均正确，但首段模型把随机 marker 少抄 1 字符，最终 marker 校验失败。 |
| Codex | `28bf80a` clean | `run-Jg41jx` | PASS：完整 Artifact 链、PUBLISHED、下载 hash/marker、Core stop。clean SHA 分母 1 FAIL / 1 PASS。 |
| ZCode | `28bf80a` clean | `run-0Nw7bW` | FAIL：Bigmodel / `GLM-5.3-Flash` 的 `session/create` 被官方 Provider Registry 拒绝，Bootstrap FAILED、`NATIVE_ZCODE_REQUEST_REJECTED`，未建 Run。不得说百炼自动回退成功。 |

## Level B 子集固定尝试记录

| Harness | source | DUT 别名 | 结果与边界 |
|---|---|---|---|
| Pi | `28bf80a` clean | `run-SyZkiF` | FAIL：创建 B 后首 Run `UNKNOWN`，审计 `NATIVE__ENOENT`，B 无 native ref。 |
| Pi | `28bf80a` dirty | `run-K3Hn2s` | B Run 已越过 ENOENT，后因测试脚本仍期待已移除的 `router_role_session_switch` 而 FAIL；实际返回 `TOOL_UNAVAILABLE`，是正确产品行为。 |
| Pi | `28bf80a` dirty | `run-SqKDNB` | PASS 子集：A→B→C 三个 native ref、历史 switch 工具不广告、A 归档、运行中 cancel=`CANCELLED`、Core stop。 |
| Pi | `533557c` clean | `run-AJfMAM` | PASS 同一子集；三 ref 独立、历史工具不可见、cancel=`CANCELLED`、Core stop。仍不是完整 Level B。 |
| Kimi Code | `a05a46f` clean | `run-jikGQM` | FAIL：初始 42 Run SUCCEEDED 但无 Result，未进入子集。 |
| Kimi Code | `dd601dd` dirty | `run-xSfNEW` | PASS：A→B→C/cancel 子集；修复验证，不算 clean。 |
| Kimi Code | `dd601dd` clean | `run-WXCaQW` | PASS：同一子集；与前次失败一起保留分母。 |
| DSH | `dd601dd` dirty | `run-IPezFH` | PASS：A→B→C/cancel 子集；不算 clean。 |
| DSH | `dd601dd` clean | `run-cEtBGc` | PASS：同一子集。 |
| Codex | `dd601dd` clean | `run-2gNzSN` | FAIL：Bootstrap `NATIVE_RPC_NATIVE_REJECTED`，未进入子集；不推断是额度或代码根因，未使用 reset credit。 |

### 持续会话 marker / 正式 TaskInput 子项

以下 `--marker`、`--wait-input` 是新增真实 DUT 模式。第一批运行时测试脚本有未提交改动，故明确记为 dirty evidence；后续在 clean `e731880` 固定候选复测。基础 `42` 任务失败也计入分母，不无限刷绿。`--marker` 的第二轮请求不包含随机值，核对同一 ACTIVE WorkSession 与同一 native ref；`--wait-input` 通过正式 controller P1 API 写 TaskInput，核对 CONTINUATION Run 消费与 PUBLISHED Result。初版 dirty wait-input 尚未核对前后 native ref；clean 候选已补上并通过。

| 子项 | Harness | source | DUT 别名 | 结果 |
|---|---|---|---|---|
| marker | Pi | `dd601dd` dirty | `run-VxG5Wt` | PASS，两轮随机 marker、同 WS/native ref。 |
| marker | Kimi Code | `dd601dd` dirty | `run-Y86fgL` | FAIL：初始 42 无 Result，未进入 marker。 |
| marker | Kimi Code | `dd601dd` dirty | `run-MP1fdE` | PASS，两轮随机 marker、同 WS/native ref；分母 1 FAIL / 1 PASS。 |
| marker | DSH | `dd601dd` dirty | `run-GIeMWj` | PASS，两轮随机 marker、同 WS/native ref。 |
| TaskInput | Pi | `dd601dd` dirty | `run-wnE7bK` | PASS，正式 TaskInput 被同 WS 的 CONTINUATION Run 消费。 |
| TaskInput | Kimi Code | `dd601dd` dirty | `run-Wxg0Ra` | FAIL：初始 42 Run SUCCEEDED、Task NEEDS_ATTENTION、无 Result；未进入 TaskInput。 |
| TaskInput | Kimi Code | `dd601dd` dirty | `run-Z18pyh` | PASS，正式 TaskInput 被同 WS 的 CONTINUATION Run 消费；分母 1 FAIL / 1 PASS。 |
| TaskInput | DSH | `dd601dd` dirty | `run-gMA5Og` | PASS，正式 TaskInput 被同 WS 的 CONTINUATION Run 消费。 |
| marker | Pi | `e731880` clean | `run-mfklri` | PASS，两轮随机 marker、同 ACTIVE WS/native ref、Core stop。 |
| TaskInput | Pi | `e731880` clean | `run-XR6iUz` | PASS，正式 TaskInput、同 WS/native ref、CONTINUATION Run、Result PUBLISHED、Core stop。 |
| marker | Kimi Code | `e731880` clean | `run-QIPJpn` | PASS，两轮随机 marker、同 ACTIVE WS/native ref、Core stop；此前 dirty 失败仍保留。 |
| TaskInput | Kimi Code | `e731880` clean | `run-O8V5Qo` | PASS，正式 TaskInput、同 WS/native ref、CONTINUATION Run、Result PUBLISHED、Core stop；此前 dirty 失败仍保留。 |
| marker | DSH | `e731880` clean | `run-uibEsw` | PASS，两轮随机 marker、同 ACTIVE WS/native ref、Core stop。 |
| TaskInput | DSH | `e731880` clean | `run-5Qgn3e` | PASS，正式 TaskInput、同 WS/native ref、CONTINUATION Run、Result PUBLISHED、Core stop。 |

### 客户端控制端断连重连子项

`--client-reconnect` 先经 Management MCP 释放控制租约，再用本地 P1 controller 取得租约并主动断开连接（不调用 release），以同 `clientId` 新连接重新取租约，正式 `task.submitFromUser` 派发下一轮，核对原 ACTIVE WorkSession、native ref、Task/Run/Result PUBLISHED 与 Core stop。Core 进程在此子项中未重启，故不能写成 cold resume。首次 Pi 立即抢租约遇瞬时 `CONTROL_LEASE_BUSY`，后改为最多 5 秒的有界重取；失败分母保留。测试工具提交为 `ebc1ada` 后，三家均在 clean SHA 复测通过。

| Harness | source | DUT 别名 | 结果 |
|---|---|---|---|
| Pi | `262364f` dirty | `run-wKFsTz` | FAIL：第二连接立即 `control.acquire` 时 `CONTROL_LEASE_BUSY`；原基础 42 已 PUBLISHED。 |
| Pi | `262364f` dirty | `run-IbvrNP` | PASS：有界重取租约后，同 WS/native ref 下一轮 PUBLISHED；分母 1 FAIL / 1 PASS。 |
| Kimi Code | `262364f` dirty | `run-j6S1Kx` | PASS：同 `clientId` 重连、重新取租约、同 WS/native ref 下一轮 PUBLISHED。 |
| DSH | `262364f` dirty | `run-wTXRg2` | PASS：同上。 |
| Pi | `ebc1ada` clean | `run-PjCN3d` | PASS：同 `clientId` 重连、重新取租约、同 WS/native ref 下一轮 PUBLISHED。 |
| Kimi Code | `ebc1ada` clean | `run-MSsBWY` | PASS：同上。 |
| DSH | `ebc1ada` clean | `run-I2id8b` | PASS：同上。 |

### Core 停机重启 / cold continuation 子项

`--core-restart` 在同一隔离 DUT 数据根中通过正式 `runtime.shutdownCore` 停止旧 Core，强制等待进程退出；随后启动新 Core 并要求 endpoint credential 更新。强证据版本先在重启前让 Harness 存入随机 marker，重启后请求不重复 marker，必须在同一 ACTIVE WorkSession 与完全相同的 native ref 上准确回忆、调用 `route_finish` 并发布 Result；新 Core 最后也必须通过退出屏障。关停 RPC 可能因 pipe 先关闭而返回 `CONNECTION_LOST`，只有随后真实进程退出屏障成立才允许继续，不能把断连本身算作成功。

| Harness | source | DUT 别名 | 结果 |
|---|---|---|---|
| Pi | `ebc1ada` dirty | `run-Oo7dtd` | FAIL：旧 Core 已真实退出，但关停 RPC 的 `CONNECTION_LOST` 尚未按“响应丢失+退出屏障”处理，未启动新 Core。 |
| Pi | `ebc1ada` dirty | `run-PYtk0V` | PASS（弱证据）：Core 真重启、同 WS/native ref 下一轮 42 PUBLISHED，但当时尚未用跨重启 marker 证明模型上下文。 |
| Kimi Code | `ebc1ada` dirty | `run-VFxcVk` | FAIL：重启前基础 42 Run SUCCEEDED 但无 Result，未进入 cold continuation。 |
| DSH | `ebc1ada` dirty | `run-hukmYS` | PASS（弱证据）：Core 真重启、同 WS/native ref 下一轮 42 PUBLISHED。 |
| Kimi Code | `ebc1ada` dirty | `run-4QvdzD` | PASS（弱证据）：Core 真重启、同 WS/native ref 下一轮 42 PUBLISHED；与前次失败一起保留。 |
| Pi | `ebc1ada` dirty | `run-7tv5Nu` | PASS（强证据）：重启前随机 marker、重启后请求不重复 marker仍准确回忆；同 WS/native ref，Result PUBLISHED，旧/新 Core 均退出。 |
| Kimi Code | `ebc1ada` dirty | `run-UeDkM8` | FAIL：重启前基础任务只分块输出旧 `AGENTROUTER_CHARTER_ACK`，未调用 Route 工具，Run SUCCEEDED、Task NEEDS_ATTENTION、无 Result。定位为任务轮未显式作废 Bootstrap 一次性 ACK。 |
| Kimi Code | `ebc1ada` dirty（含 ACK 作废修复） | `run-8NrkvL` | PASS（强证据）：随机 marker 跨 Core 重启准确回忆；同 WS/native ref，Result PUBLISHED，旧/新 Core 均退出。 |
| DSH | `ebc1ada` dirty | `run-M5SRnJ` | PASS（强证据）：随机 marker 跨 Core 重启准确回忆；同 WS/native ref，Result PUBLISHED，旧/新 Core 均退出。 |

## 当前分层判定

| Harness | Level A | Level B | 尚缺 |
|---|---|---|---|
| Pi | PASS（`b45390d` clean） | PARTIAL（A→B→C/cancel、marker、TaskInput、client reconnect 有 clean PASS；strong cold continuation dirty PASS_WITH_FAILURE_DENOMINATOR） | strong cold continuation clean 候选与完整组合批次。 |
| Kimi Code | PASS（`b45390d` clean） | PARTIAL（A→B→C/cancel、marker、TaskInput、client reconnect 有 clean PASS；strong cold continuation 修复后 dirty PASS_WITH_FAILURE_DENOMINATOR） | ACK 作废修复 clean 候选、稳定性分母、完整组合批次。 |
| DSH | PASS_WITH_FAILURE_DENOMINATOR（`b45390d` clean，1 FAIL/1 PASS） | PARTIAL（A→B→C/cancel、marker、TaskInput、client reconnect 有 clean PASS；strong cold continuation dirty PASS） | 首次 Bootstrap 瞬断根因、strong cold continuation clean 候选与完整组合批次。 |
| Codex | PASS_WITH_FAILURE_DENOMINATOR（`28bf80a` clean，1 FAIL/1 PASS） | BLOCKED_BY_BOOTSTRAP_ON_LATEST（`dd601dd` clean） | Level B 全项；不使用 reset credit。 |
| ZCode | BLOCKED_PROVIDER_BINDING（`28bf80a` clean） | BLOCKED / `native_resume=UNSUPPORTED` | 官方 Bigmodel registry 授权；无官方绑定前不能宣称 Level A、warm 或百炼 fallback。 |

## 代码修复与自动门禁

1. `28bf80a`：Role 工具给出独立终态语义；Codex driver 显式说明中间工具不等于完成；Artifact write/register 返回可直接复制进 `route_finish.outputs` 的 `reference`。冻结 C1/C1R1/P1 schema 与 migration 未变。
2. `533557c`：Pi 新 WorkSession 首个 Run 可以持久保留未物化的 session 文件路径，但仅限当前有效 Run、无旧 native ref、受管 HOME 内；后续 load/recovery 仍要求真实文件，防止假连续。
3. `533557c` 门禁：typecheck/lint PASS，unit 216/216（第一次全套有 supervisor 30 秒超时 1/216；该文件隔离复跑 4/4、完整复跑 216/216），integration 226/226，contract+chaos 70/70，打包态 Remote Core 1/1，staged secret scan 0 findings。
4. `dd601dd`：Kimi 原生 driver 增加明确 `route_finish` 终态提交提示，避免只输出自然语言导致 Run 成功但 Task 无 Result；typecheck/lint PASS、unit 217/217、integration 226/226、contract+chaos 70/70、secret scan 0 findings。真实 Kimi 仍出现过初始 42 无 Result，故不声称完全稳定。
5. 当前 dirty 修复：Kimi 任务轮与 DSH 一样显式作废 Bootstrap 一次性 `AGENTROUTER_CHARTER_ACK`，并重申生效章程；失败 DUT 的 conversation/event 证据显示模型此前只复读 ACK 且没有工具调用。修复后 `run-8NrkvL` 的真实强 cold continuation PASS。当前门禁：typecheck/lint PASS，unit 217/217，integration 226/226，contract 67/67，chaos 3/3；尚待提交并在 clean SHA 复测。

## 下一步与禁止扩大声明

- 下一步提交 Kimi ACK 作废修复与 strong cold continuation 工具，在 clean SHA 复测 Pi/Kimi/DSH；随后执行三轮固定组合稳定性批次，并按同一候选推进 Codex 与 ZCode 可用边界。记录每次真实失败，不靠反复刷绿。
- ZCode 需要官方 provider/entitlement 状态变化；不得复制生产认证、伪造 registry 或把客户端误改为普通 CLI Role。
- DUT 关键场景完整通过后才按执行包进入对应 Harness 的真实环境新对象测试；本账本不声明任何真实生产环境 PASS。
- 网页 ChatGPT Participant、Tailscale HTTPS/WSS 手机、Context Transfer 真 receipt、migration/fault/stability、Electron 包、CI 与 UI 合流仍待后续；禁止 Windows RC 声明，未 merge/tag/release。
