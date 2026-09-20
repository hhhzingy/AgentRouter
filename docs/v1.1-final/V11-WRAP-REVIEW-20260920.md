# V1.1 Windows 最终收口复核（2026-09-20）

**依据：** `docs/执行包/AgentRouter_V1.1_Windows_最终修复优化测试执行包_Cursor_20260920/AgentRouter_V1.1_Windows_Final_Master_Execution.md`

**结论：未完成 Windows RC Gate。不得宣称 `V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE`。**

本文只记录已复核事实。未授权且未执行 merge、tag、release。工作分支已按用户要求推送 GitHub，但不代表执行包完成。

## 1. 当前源码身份

| 项 | 值 |
|---|---|
| 专用工作树 | `E:\AgentRouter\.worktrees\v1.1-final-cursor-win` |
| 分支 | `feat/v1.1-final-cursor-win` |
| C0 规范源 | `16598f621d7160627ce769ecafb8d14ab55399f4` |
| 本轮行为候选 | `0050c1b1f595ee4eb3bdc216334af4c04df06fd2` |
| 当前关键提交 | `65d8ec4` Artifact 输出桥；`9fb6a95` Artifact read/dedup；`bf89877` Codex DUT 指纹；`0050c1b` DSH 百炼 profile |
| 主目录 | `E:\AgentRouter` / `feat/contract-c1`，不是本轮 V1.1 源 |
| 隔离等级 | `LIMITED_ISOLATION`（Windows Job 生命周期），不是全 OS 沙箱 |

`.local-protected/`、`.local/` 与凭据文件未提交。生产 Codex/ZCode HOME 未作为测试 HOME；未切账号、未覆盖已有会话。

## 2. 本轮新增实现

### 2.1 Managed Artifact 工程链

新增受控 `route_artifact_write`，约束如下：

- 只能写当前绑定 workspace；文件名受限；仅 `.md/.json/.txt`；UTF-8，最大 256 KiB；
- 临时文件到原子 rename，写入对象存储与 Artifact DB；
- operation idempotency；相同 workspace+hash 内容寻址去重；
- `route_artifact_read` 同时兼容 flat `artifact_id` 与旧 nested `reference`，拒绝二者同时出现；
- Codex/Kimi/Pi/DSH 的受管 Route 工具清单、授权和测试同步更新。

### 2.2 DSH→百炼官方 adapter

修复原实现“只注入 `BALIAN_API_KEY`，却未配置 provider/model”的假支持：

- 预配 DSH 0.1.5-rc.1 官方 ACP profile，避免空 HOME 首启超过 RPC 活性界；
- 通过官方 `@deepseek-ai/dsh-llm-pi-ai` 配置百炼 OpenAI-compatible endpoint；
- ACP 默认 route 为 `bailian/qwen3.8-flash`；
- `settings.yaml` 只写 endpoint/model 等非秘密信息，API key 只进入测试子进程环境；
- 已存在配置只有与受控模板一致（或 DSH 官方规范化后的等价空配置）才复用，否则 `DSH_PROFILE_CONFIG_REVIEW_REQUIRED`。

## 3. 同一干净 SHA `0050c1b` 的自动化与工程包

| 项 | 结果 |
|---|---|
| typecheck | PASS |
| lint | PASS |
| spec | 36/36 PASS |
| unit | 41 files / 213 tests PASS |
| integration | 49 files / 212 tests PASS |
| contract | 8 files / 67 tests PASS |
| chaos | 1 file / 3 tests PASS |
| staged secret scan | PASS，2134 files，0 findings |
| packaged Core | PASS；`sourceDirty=false`；artifact hash `e3952be31586a602b813985915caf44d493cec033b64518589d02c990eedc50d` |
| Electron 工程包冒烟 | PASS；项目创建、Role Plan、导航上下文、renderer Node 禁用、Core 连接、进程停止 |
| 工程包 | `release/AgentRouter-j3-0050c1b1f595-4cd9e523-801a-48aa-88cf-2811c5409f80` |
| 手机浏览器 live test | PASS；配对 cookie/WSS、controller、断连/重连 |
| 移动视口 | PASS；iPhone 390×844、Pixel 412×915，无横向溢出 |
| 固定负载 | 3/3 PASS；cancel、reconnect、integrity、shutdown；RSS 约 200–203 MiB |

注意：工程包是开发机 unpacked 包，不等于签名安装器、安装/升级或干净机验收。

## 4. Harness DUT 矩阵

执行包 Level A 要求：真实 bootstrap、input Artifact→output Artifact、`route_finish`/PUBLISHED、GUI/下游同字节 hash、原生终态与停止证据。

| Harness | Provider / 模型 | 干净 SHA / 报告 | 结果 |
|---|---|---|---|
| Pi | 百炼 `qwen3.8-flash` | `9fb6a95` / `run-TioZFo` | **Level A Artifact PASS**；input `71199b4b…`，output `7b3c3b5d…`，GUI 下载 hash/marker PASS，Core exited |
| Kimi | 百炼 `bailian/qwen3.8-flash` | `9fb6a95` / `run-C0Ye3r` | **Level A Artifact PASS**；input `a6ab1227…`，output `5901e44a…`，GUI 下载 hash/marker PASS，Core exited |
| DSH | 百炼 `bailian/qwen3.8-flash` | `0050c1b` / `run-L5gPEY` | **Level A Artifact PASS**；input `4b742892…`，output `20f1d739…`，GUI 下载 hash/marker PASS，Core exited |
| Codex | 隔离 DUT，CLI 0.155.0-alpha.9.2，gpt-5.6-luna | 修复前 bb0b70e / run-hmmCyZ；修复后同工作树 / run-K3FTGr | **Level A Artifact PASS（dirty source）**：input→read→output Artifact、PUBLISHED、下载 hash/marker 与 Core stop；待新干净 SHA 复测 |
| ZCode | 隔离 DUT 已选 Bigmodel Coding Plan / GLM-5.3-Flash；百炼 qwen3.8-flash 为指定备选 | 9925402 / run-8GiXnu | FAIL：Bigmodel 尚无隔离 HOME 官方授权，真实入口 Bootstrap=FAILED；百炼备选尚未在 ZCode 受管链实测，不可写为自动回退 |

Pi/Kimi 的 PASS 来自干净 `9fb6a95`，DSH 来自干净 `0050c1b`；它们不是执行包 docs/12 要求的“同一个干净候选 SHA 全矩阵”。因此这些证据不能提升为同一干净 SHA 的 RC Gate PASS；Codex 的新 PASS 另见第 12 节。

### 4.1 Level B 现状

执行包要求每 Harness 在同一个 ACTIVE WS 完成 marker 两轮、WAITING_INPUT、cancel、restart/resume 与 native identity。

- fixture/control-plane 已覆盖 continuation、cancel、history、restart 等部分语义；不能替代真实 Harness。
- `0050c1b` Pi `--ab --cancel`：初始 Run PASS；创建 B WorkSession 后新 Pi native session 在 open 阶段报 `ENOENT`，Run=`UNKNOWN`，Task=`NEEDS_ATTENTION`，B 的 `native_session_ref=null`；报告 `run-Zne21T`，错误 `AB_RUN_NOT_VERIFIED`。
- 旧 A WorkSession 已正确 ARCHIVED，未被重新激活；但 B 未完成，所以历史只读不等于 Level B PASS。
- Codex 最小 Level A 与 Artifact Level A 已在额度自然恢复后重测通过；后者仍需新干净 SHA 复测，Level B 未测。ZCode Bigmodel 登录/Level A/Level B 仍缺。
- 五 Harness 的真实 WAITING_INPUT、同 WS marker continuity 与 restart/resume 尚未形成候选 SHA 完整证据。

因此 Harness Gate 仍为 **PARTIAL / FAIL（非 RC）**。

## 5. Cursor、Participant、Remote 与 Desktop

| 项 | 状态 |
|---|---|
| Cursor Management MCP observer | 已连接；Core `projects=[]`；Cursor 不是 Role |
| Cursor controller 完整矩阵 | NOT_RUN：create Role/Slot、dispatch、inspect participant result、A/B scope、release lease 未在当前真实 Core 全跑 |
| Web ChatGPT Participant | NOT_RUN：当前固定 SHA 未完成真实网页 Join/Identity/Artifact/Result 联跑；自动 integration 不能替代网页 ChatGPT |
| 手机 Tailscale | 历史现场 HTTP+WS 配对 observer 成功；本 SHA 自动浏览器测试 PASS |
| Remote HTTPS+WSS | NOT_RUN；现场仍是 HTTP+WS，不可写成 HTTPS PASS |
| Electron | 本 SHA unpacked 工程包 Core/UI 冒烟 PASS |
| 签名安装器、安装/升级 | NOT_RUN |

## 6. docs/11 八条黄金工作流复核

| 黄金工作流 | 状态 |
|---|---|
| Artifact 工程链 | Pi/Kimi/DSH 单 Harness真实链 PASS；跨 Harness `Codex→Kimi→ZCode` 未完成 |
| WAITING_INPUT | integration PASS；五 Harness 真实链未完成 |
| WS Queue | integration/fixture 有证据；真实 Harness 未形成完整候选证据 |
| 历史只读 | 控制面 PASS；Pi 新 WS 真实启动暴露 `ENOENT` |
| Context 故障 | fault/contract 有覆盖；各宣称支持 Harness 的真实能力矩阵未闭环 |
| 权限矩阵 |自动测试 PASS；Cursor/Remote/Web 真机联合矩阵未闭环 |
| 五 Harness | 四家 Level A Artifact 有真实 PASS（Codex 为脏工作树），ZCode FAIL；Level B 未闭环 |
| 网页+Cursor 协作 | NOT_RUN（当前固定 SHA） |

## 7. docs/12 Gate 判定

### 功能 Gate

未满足：五 Harness 声明矩阵、Context capability 真证、Participant 网页结果链、Cursor controller、真实 Level B。

### 测试 Gate

部分满足：本 SHA 全仓测试、secret scan、packaged Core/Electron、mobile、fixed-load 已过。未满足：同一 SHA 的全部 DUT、Web Participant、real environment smoke、HTTPS Remote、安装器。

### 数据 / 安全 Gate

自动 migration/freeze、scope、grant/binding、malformed input 等已有覆盖；但签名安装/升级、真实 device revoke existing stream、真实多端联合场次仍缺。

### 产品 Gate

Desktop/Remote 展示已有自动证据；网页 GPT 尚未在本 SHA 回答自己的 Role Identity；Codex Artifact 尚缺新干净 SHA 证据，ZCode 授权/运行链未闭环，使用户完整五 Harness 验收无法完成。

**最终判定：`AUTO_SCOPE_DONE_WITH_BLOCKERS`，不是 Windows RC。**

## 8. 阻断与所需外部动作

1. **Codex DUT：** 额度已自然恢复，最小 Level A 复测通过；同名同字节重试已修复，Artifact Level A 在脏工作树实测 PASS；仍需在新干净 SHA 上复测并完成 Level B。用户明确要求不使用 reset credit。
2. **ZCode DUT：** 已在隔离 HOME 选择 Bigmodel / GLM-5.3-Flash，但尚无 Bigmodel 官方授权；需在隔离桌面/TUI 完成登录。百炼 qwen3.8-flash 是指定备选，尚未证明 ZCode 受管链或自动回退。禁止复制生产 HOME 凭据。
3. **Web Participant：** 需要可操作的真实 ChatGPT 网页会话/连接，在本候选 SHA 上完成 Join/Identity/Artifact/Result。
4. **Remote HTTPS/WSS：** 需要实际 TLS/Tailscale Serve 环境与真机复测。
5. **安装器：** 需要签名/安装/升级环境；当前仅 unpacked 工程包。
6. **GitHub CI：** 仍需可用远端 CI 基础设施。
7. **Pi Level B：** 需修复新 WorkSession native session `ENOENT`，随后对五 Harness 重跑同 ACTIVE WS marker、WAITING_INPUT、cancel、restart/resume。

## 9. Git 与发布边界

- 本轮实现已形成本地提交，未包含 `.local-protected`、`.local`、凭据或生产 HOME。
- 分支已推送 origin/feat/v1.1-final-cursor-win，属于阶段性提交，不是完成态或 RC。
- 未 merge main、未 tag、未 release、未删除历史 feature/evidence、未切换账号。


## 10. 后续复测（2026-09-20）

- 用户要求先提交 GitHub；已推送工作分支，未 merge、tag 或 release。
- Codex 额度自然恢复后，在隔离 DUT 对 HEAD 9925402 跑真实产品入口最小任务，报告 run-KqLIuZ：42 / PUBLISHED，Core 正常退出；测试时工作树为 dirty_source=true，不等于干净 SHA 的 Artifact Level A 或 Level B。全程未使用 Codex reset credit。
- ZCode 隔离 DUT 默认选择现为 account:bigmodel-individual-coding-plan / GLM-5.3-Flash。当前隔离凭据仅有 Z.AI 授权；官方 CLI login 只提供 Z.AI，Bigmodel 需要隔离桌面/TUI 授权。真实产品入口 run-8GiXnu 的 Bootstrap 为 FAILED，任务未建立。
- 百炼 qwen3.8-flash 为用户指定备选。官方内置模板支持该模型，但尚未在 ZCode 受管链完成凭据绑定、真实任务与自动回退验证，不能写成已支持自动回退。
- 当前本轮桌面证据文件仍有未提交改动，未丢弃；本次提交只纳入复核文档。
## 11. Codex Artifact Level A 复测故障（2026-09-20）

- 当前 HEAD bb0b70e、工作树 dirty_source=true；隔离 DUT 报告 run-hmmCyZ。
- 最小算术阶段仍为 Run SUCCEEDED、Result 42 / PUBLISHED；Artifact producer 阶段首次 route_artifact_write 已在 workspace 写出 input.md，Artifact DB 中有 AVAILABLE 记录。
- 同一 producer 随后重复调用 route_artifact_write；同名路径已存在，bridge 对该异常只返回 BRIDGE_HANDLER_FAILED。Codex 最终未调用 route_finish，Task=NEEDS_ATTENTION，Result 缺失；测试报 ARTIFACT_TASK_NOT_PUBLISHED。
- 该故障不能简化为额度问题或计为 Artifact Level A PASS。当时需处理同内容安全重试与不同内容冲突并补测试；后续修复和复测见第 12 节。

## 12. Codex Artifact 修复与回归（2026-09-20）

- 在受管 writeArtifact 中，仅当同名目标为普通文件、字节完全相同、数据库已存在 AVAILABLE Artifact 时，把新 operation ID 的重复写视为去重并返回同一 artifact_id；不同内容仍返回 ARTIFACT_NAME_TAKEN，不覆盖文件。补充两项集成断言。
- 定向 Artifact 测试 4/4 PASS；typecheck、lint、spec 36/36 PASS；unit 213/213、integration 212/212、contract+chaos 70/70 PASS。
- 重建 Core 后，隔离 Codex DUT 的 run-K3FTGr 完成真实 input Artifact→读取→output Artifact→Result PUBLISHED→GUI 同路径下载/hash/marker 与 Core stop。代码仍为 dirty_source=true；待提交形成新 SHA 后重测，不能据此宣称 Windows RC。
