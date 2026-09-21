# N6 五 Harness DUT 固定分母账本（2026-09-21）

状态：`IN_PROGRESS`；不是 Windows RC，也不是五家 Level B PASS。

## 候选与保护范围

- 功能分支：`feat/v1.1-functional-closeout-codex`。
- 起始 clean SHA：`b45390de847dfcdb683d0fe487a6b615e542e9ae`。
- Artifact/终态合同修复 clean SHA：`28bf80a61196241b708370b7112492ff1c547359`。
- Pi 新 WorkSession 首轮 session-path 修复 clean SHA：`533557c9498f06d9e3a1a8fab70dcc10e33f848f`。
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

## 当前分层判定

| Harness | Level A | Level B | 尚缺 |
|---|---|---|---|
| Pi | PASS（`b45390d` clean） | PARTIAL（`533557c` clean 的 A→B→C/cancel 子集 PASS） | 同 ACTIVE WS 两轮随机 marker、WAITING_INPUT→TaskInput→Turn3、Core/client reconnect 与 cold resume 完整证据。 |
| Kimi Code | PASS（`b45390d` clean） | BLOCKED_NOT_RUN | 同上 Level B 全项。 |
| DSH | PASS_WITH_FAILURE_DENOMINATOR（`b45390d` clean，1 FAIL/1 PASS） | BLOCKED_NOT_RUN | 首次 Bootstrap 瞬断根因、Level B 全项。 |
| Codex | PASS_WITH_FAILURE_DENOMINATOR（`28bf80a` clean，1 FAIL/1 PASS） | BLOCKED_NOT_RUN | Level B 全项；不使用 reset credit。 |
| ZCode | BLOCKED_PROVIDER_BINDING（`28bf80a` clean） | BLOCKED / `native_resume=UNSUPPORTED` | 官方 Bigmodel registry 授权；无官方绑定前不能宣称 Level A、warm 或百炼 fallback。 |

## 代码修复与自动门禁

1. `28bf80a`：Role 工具给出独立终态语义；Codex driver 显式说明中间工具不等于完成；Artifact write/register 返回可直接复制进 `route_finish.outputs` 的 `reference`。冻结 C1/C1R1/P1 schema 与 migration 未变。
2. `533557c`：Pi 新 WorkSession 首个 Run 可以持久保留未物化的 session 文件路径，但仅限当前有效 Run、无旧 native ref、受管 HOME 内；后续 load/recovery 仍要求真实文件，防止假连续。
3. `533557c` 门禁：typecheck/lint PASS，unit 216/216（第一次全套有 supervisor 30 秒超时 1/216；该文件隔离复跑 4/4、完整复跑 216/216），integration 226/226，contract+chaos 70/70，打包态 Remote Core 1/1，staged secret scan 0 findings。

## 下一步与禁止扩大声明

- 补 Pi 同 ACTIVE WS marker/WAITING_INPUT/reconnect/restart，随后按同一固定候选补 Kimi、DSH、Codex 的 Level B。记录每次真实失败，不靠反复刷绿。
- ZCode 需要官方 provider/entitlement 状态变化；不得复制生产认证、伪造 registry 或把客户端误改为普通 CLI Role。
- DUT 关键场景完整通过后才按执行包进入对应 Harness 的真实环境新对象测试；本账本不声明任何真实生产环境 PASS。
- 网页 ChatGPT Participant、Tailscale HTTPS/WSS 手机、Context Transfer 真 receipt、migration/fault/stability、Electron 包、CI 与 UI 合流仍待后续；禁止 Windows RC 声明，未 merge/tag/release。
