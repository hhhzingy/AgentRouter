# V1.1 Windows 最终收口 — 总结复核

**依据执行包：** `docs/执行包/AgentRouter_V1.1_Windows_最终修复优化测试执行包_Cursor_20260920`

**复核日期：** 2026-09-20

**执行器：** Cursor（仅 Management MCP 客户端 `mcp_management_cursor`，不是 Role）

**RC 短语：** 未发出 `V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE`（docs/12 未全满足）

**merge / tag / release：** 未授权，未执行

本文按执行包 `docs/13` 把「真实实现 / fixture / 真机 / NOT_RUN」分开写。`42 PUBLISHED` 只证明最小文本路径，**不**代替 docs/07 的 Artifact 工程链与 Level B。

---

## 1. 结论（先回答闭环）

| 问题 | 事实 |
|---|---|
| 当前能否宣称 Windows RC？ | **否**。docs/12 功能/测试/产品 Gate 仍有明确缺口。 |
| 关键工作流是否闭环？ | **部分闭环。** 四家 Harness 走通隔离 Core 上的最小 Level A（bootstrap + 任务结果 `42`/`PUBLISHED`）。**未**证明 input/output Artifact hash 链、WAITING_INPUT 真值、同 ACTIVE WS Level B。 |
| 是否有同一干净候选 SHA 的验收证据？ | **否。** 四个成功 live report 均记录 `dirty_source=true`；Pi 成功报告的 `code_sha=bbed011`，Kimi/Codex/DSH 为 `ed78235`。这些报告不能满足 docs/12 的“同一个干净 source SHA”测试 Gate。 |
| Cursor 是否当了 Role？ | **否。** 仅 observer Management MCP。本 MCP Core 快照 `projects=[]`，没有 Cursor Role/WS。 |
| 生产 Codex/ZCode 是否被覆盖？ | **否。** 使用隔离 HOME / `.local-protected`；未复制生产 token。 |
| 用户还要做什么？ | 见第 8 节。不要 merge/tag，除非另行明确批准。 |

---

## 2. 工作树 / 分支 / 源码身份

### 2.1 本轮执行工作树

| 项 | 值 |
|---|---|
| 路径 | `E:\AgentRouter\.worktrees\v1.1-final-cursor-win` |
| 分支 | `feat/v1.1-final-cursor-win` |
| Canonical Windows SHA（C0 固定源） | `16598f621d7160627ce769ecafb8d14ab55399f4` |
| 已提交证据 HEAD | `ed78235f6459594d139de98fa8f2978e2ccc55c8`（`docs(v11-c11)`） |
| 工作树状态 | **脏。** 本文生成时 C11 后的 MCP/Remote/DUT、Electron 测试及 ZCode 修正尚待提交 |
| live report 源码洁净性 | 四个成功报告均为 `dirty_source=true`；不能视为固定候选复测 |
| Review SHA（禁止当补丁基线） | `0d92196` |

C0→C11 已提交：`babf88b` … `ed78235`（C0 基线 → C11 记录）。后续改动仍在工作区。

### 2.2 同机其他 worktree（本轮未在这些树上改 Core）

| 路径 | HEAD | 分支 |
|---|---|---|
| `E:\AgentRouter` | `18c259c` | `feat/contract-c1`（**不是** V1.1 源） |
| `.worktrees/v1.1-final-zcode` | `16598f6` | `feat/v1.1-final-windows-mobile` |
| `.worktrees/v1.1-integration` | `29e732c` | `integration/v1.1-cross-platform` |
| `.worktrees/v1.1-context-continuity` | `2bd41f9` | `feat/v1.1-context-continuity` |
| `.worktrees/ui-ux-spec` | `8c3f0ed` | `feat/ui-ux-spec` |
| `.worktrees/j1-integration` | `bbdea2a` | detached |
| `.worktrees/contract-c1r1` | empty | `feat/contract-c1r1` |

### 2.3 本次跟进 diff（提交范围不含密钥文件内容）

- `.cursor/mcp.json`（项目级 Management MCP observer，已加入 `.gitignore`，不提交）
- `tools/v11-cursor-mcp-start.mjs` / `v11-mint-mobile-pair.mjs` / `v11-seal-codex-dut-identity.mjs` / `v11-zcode-dut-login.mjs`
- `packages/remote/remote-gateway.ts`（HTTP 配对 cookie；Tailscale Origin）
- `packages/platform/local-native-runtime.ts`、`packages/platform/windows-native-process-host.ts`（ZCode 0.16.9、模型选择安全透传）
- `tools/test-j3-production-pi.mjs`、`tools/login-j3-codex-dut.ps1`
- `apps/desktop/workbench/store.tsx`（允许 `remoteDevice.*`）
- `tools/desktop-test.mjs`（当前 UI / preload / 精确进程树收尾）
- `docs/v1.1-final/V11-FINAL-RC.md`、`V11-C11-checkpoint.json` 与本文

`.local-protected/` 含 DUT 登录态，**不得提交、不得贴进聊天。**

---

## 3. 执行包阶段 C0–C11 对照

| 阶段 | 执行包 Gate | 本轮结果 | 证据 |
|---|---|---|---|
| C0 基线审计 | 最新仓 + F01–F30 + migration，不按旧 SHA 盲改 | **完成** | `docs/v1.1-final/V11-C0-baseline.md` · `babf88b` |
| C1 Cursor Management MCP | observer 先于 controller；Cursor 不是 Role | **DUT observer 完成**；真机 IDE 已 Enable；当前 `CONNECTED_OBSERVER`。**未**在本 MCP Core 上做 controller 派发/改 charter | C1 checkpoint · 现场 `router_status` |
| C2 P0 正确性/授权 | 公共入口负测 | **提交完成**（控制面） | `0999f4f` |
| C3 工程工作流 | Artifact 输入/输出 hash 链，不是只算 42 | **控制面 drain/continuation 已提交**；真实 Harness 仍用 `17+25→42` | `dbb9e02`；live reports |
| C4 WS/Context | 历史只读；ZCode Level B 或明确新 WS | **控制面提交**；ZCode 声明 `REQUIRES_NEW_WORKSESSION`；**无**同 WS 两轮真证 | `0183fba` · C7 声明矩阵 |
| C5 Join/Slot/Identity | 网页 ChatGPT 真机 Join A–G | **DUT/测试提交**；本轮 **未**重跑网页 Participant | `0183fba` · C5 checkpoint |
| C6 管理链+Participant 联合 | Management 与 Participant 同时工作 | **DUT 完成**；未与真机 ChatGPT 联跑 | `bbed011` |
| C7 五 Harness DUT | 声明矩阵 + Level A/B + artifact | 声明矩阵 + supervisor Job **PASS**；Level A 真机见第 5 节；Level B **未跑** | `7e268ea` · live reports |
| C8 真实环境 promotion | 新测试项目、不碰生产 HOME | 隔离 `V11-REAL-SMOKE` **PASS**；MCP/Remote 用隔离 Core（空项目） | `0641ff3` |
| C9 Desktop/Mobile UX | 身份、阻塞、槽位、远程页 | **静态 UX 提交**；手机 HTTP+WS 配对成功 | `556a121` + 真机配对 |
| C10 规模/迁移 | 10k / 20MiB / freeze | **fixture PASS** | `9c9272a` |
| C11 收口 | docs/12 全满足才 RC | **AUTO_SCOPE_DONE_WITH_BLOCKERS** | `ed78235` + 本文 |

---

## 4. 项目 / Core / MCP / 手机

### 4.1 Cursor Management MCP Core（真机）

| 项 | 值 |
|---|---|
| 数据根 | `.local/v11-cursor-mcp/core` |
| 模式 | `LOCAL_CORE` · `LIMITED_ISOLATION` |
| 协议 | `C1R1P1` |
| instance | `dataset_55ac4c24-…_2a107110-…` |
| 网关 | `0.0.0.0:8787`（进程曾重建；当前 pid 以 `remote-gateway.json` 为准） |
| Cursor clientId | `mcp_management_cursor` |
| 连接 | `CONNECTED_OBSERVER` · health `OK` · lease `null` |
| 快照 | `projects=[]` `roles=[]` `tasks=[]`（此 Core **没有** live Level A 项目；那些跑在一次性 `.local/j3-production-pi/run-*`） |
| 配置 | `.cursor/mcp.json` → observer argv + 绝对 `node.exe` |

**未做：** Cursor 切 controller、在该 Core 上 create Role/派发任务、scope A/B 真机拒绝演示。

### 4.2 远程 / 手机

| 项 | 值 |
|---|---|
| 访问方式 | Tailscale IPv4 `http://100.74.12.59:8787/`（不要 Clash `198.18.0.1`） |
| TLS | **HTTP+WS**。HTTPS+WSS / Tailscale Serve **未跑** |
| 配对设备 | `rdev_ce732aaa…` · 显示名「手机」· `MOBILE` · `ACTIVE` · 可申请 controller |
| UI 状态 | 用户确认绿点 / 观察者 |
| 修复 | 允许 Tailscale Origin；明文 HTTP 不写 `Secure` cookie（否则手机丢 cookie） |
| Exit Node | **不需要** |

### 4.3 Desktop / Electron

C9 静态工作台（Core 身份、需要关注、blockedReason、Slot、远程配对页）已改。随后完成 unpacked Electron 工程包与当前 UI 的桌面冒烟：

- 工程包：`release/AgentRouter-j3-ed78235f6459-c66fdbc8-f8ca-4dfd-ac13-7a608150a219`
- packaged Core：**PASS**（source SHA `ed78235`，构建时 `sourceDirty=true`，artifact hash `24a95a…`）
- Desktop：**PASS**（创建项目、打开 Role Plan、导航上下文保持、renderer Node 禁用、Core 连接、Electron 进程树停止）

该结果证明工程包可启动，不是安装器签名/安装/升级验收；构建源仍脏，故不能提升为 RC 候选证据。

---

## 5. DUT 与真实 Level A

### 5.1 隔离 DUT 布局（不入 Git）

| 用途 | 路径 | 说明 |
|---|---|---|
| C7 native-runtime | `.local/v11-c7-dut/` | pi/dsh/kimi/zcode；百炼**只引用路径**；`credential_copied=false`；`production_homes_used=false`；Codex 当时省略 |
| MCP + Remote Core | `.local/v11-cursor-mcp/` | 与 live 跑次隔离 |
| 一次性 live Core | `.local/j3-production-pi/run-*` | 每跑次独立 Core，跑完 shutdown |
| Codex DUT | `.local-protected/codex-dut/` | 隔离 `home` + `dut-fj/home` + 仅哈希 `approved-identity.json` |
| ZCode DUT | `.local-protected/zcode-dut/` | 隔离 `cli/` + `home`；后续隔离浏览器登录 **成功**，未触碰桌面生产 HOME |
| 凭据文件（只引用） | `E:\AgentRouter\账号信息\通用API\百炼.txt` | pi / Kimi |
| 凭据文件（只引用） | `E:\AgentRouter\账号信息\通用API\Deepseek.txt` | DSH 最终成功跑次（用户指定，偏离执行包「dsh 也用百炼」） |

生产 `CODEX_HOME` / 桌面 ZCode HOME / `C:\Users\hap_p\.dsh` **未作为 sessionHome。**

### 5.2 五 Harness 声明（C7，未改口）

五家均为 **COLD_RUN**。ZCode `native_resume=UNSUPPORTED`，Level B 要求 **新 WorkSession**。LIMITED_ISOLATION = Windows Job 收尾，**不是**全 OS 沙箱。

### 5.3 真实 Level A（以最后一次成功/失败为准）

| Harness | Provider / 模型 | 结果 | 报告目录 | report `code_sha` / 源码状态 | 是否满足 docs/07 Level A |
|---|---|---|---|---|---|
| pi | 百炼 `qwen3.8-flash` | **PASS_TASK_AND_BOOTSTRAP** | `run-VkEwiu` | `bbed011` / `dirty_source=true` | 仅最小文本路径通过；**无** input/output Artifact |
| Kimi | 百炼 `bailian/qwen3.8-flash` | **PASS_TASK_AND_BOOTSTRAP** | `run-wgaHuS` | `ed78235` / `dirty_source=true` | 同上 |
| Codex | 隔离 DUT · `gpt-5.6-luna` · CLI 实测约 0.155 | **PASS_TASK_AND_BOOTSTRAP** | `run-1cSjvp` | `ed78235` / `dirty_source=true` | 同上；生产账号未复制 |
| DSH | `Deepseek.txt` · `deepseek-v4-flash` | **PASS_TASK_AND_BOOTSTRAP** | `run-atFgNN` | `ed78235` / `dirty_source=true` | 同上；百炼绑定曾失败后按用户改官方 DeepSeek |
| ZCode | Z.AI OAuth · `GLM-5.3` | 隔离登录 **PASS**；live **FAIL** `BOOTSTRAP_NOT_DELIVERED` | `run-ZK11Q4` / `run-h37a9d` / `run-EgRqZb` | `ed78235` / `dirty_source=true` | **未通过**；最终 DB 定位 `NATIVE_ZCODE_MODEL_SELECTION_REQUIRED` |

这里的 PASS 是“真实 Harness 曾完成 bootstrap、运行、`42` 结果发布和进程收尾”的事实陈述，不是候选版本签核。由于成功报告不是同一干净 source SHA，且任务没有 Artifact 工程链，四项均不能提升为 docs/12 RC Gate PASS。

失败过的 DSH 跑次（`run-2Kth7v` 配置拒绝、`run-jaVUtc`/`run-yRKxfY` bootstrap）**不**算通过。

ZCode 最终失败已确定为本地字段透传缺口：运行时 JSON 已有 `account:zai-individual-coding-plan / GLM-5.3`，但 `WindowsNativeProcessHost` 未把 `zcodeModelSelection` 从 prepared process 复制到 `SecureNativeProcess`。本次已补透传和 Windows 回归断言，定向测试通过；为避免继续消耗真实服务调用，**未**再做第四次 live，因此 ZCode Gate 仍保持 FAIL，不能以代码修正代替真机证据。

### 5.4 明确未完成的 Harness 验收（docs/07）

- Level A 的 Artifact 读入/写出/hash 与 GUI 核对
- Level B：同 ACTIVE WS 记 marker、WAITING_INPUT 真值、cancel 不假成功
- 跨 Harness handoff（如 Codex → Kimi → ZCode）
- ZCode 修正后的真实 Level A，以及新 WorkSession 的连续性证据
- 真实环境 **用户已有项目** 上的 smoke（只允许新测试对象；本 MCP Core 仍为空项目）

---

## 6. 已完成工作（按证据层）

### 6.1 真实实现（已提交到 `ed78235`）

- C0 以 `16598f6` 为 Windows 规范源，不按 `0d92196` 盲改
- Management MCP 参数化 clientId；Cursor 示例为 observer
- P0 授权/历史 WS/lease 等控制面收口（C2）
- queued drain、用户输入 continuation（C3）
- session home 精确绑定、停 RoleContext 运行时写入、Join/Slot（C4/C5）
- Management + Participant 联合 DUT（C6）
- 四 Harness 隔离 native-runtime + supervisor stdio Job（C7）
- 隔离真实烟测项目（C8）
- Desktop 身份/阻塞/槽位/远程页（C9）
- 10k conversation、20MiB 分块 artifact、migration freeze 含 017（C10）

### 6.2 单元 / fixture / DUT 控制面

C7 `v11-c7-dut`、native process host、C10 fixture、C6 联合链：checkpoint 记 PASS。GitHub CI 仍为 **基础设施未跑**，不是本仓测试红。

### 6.3 真机（C11 之后，多未提交）

- Cursor IDE 启用 `agentrouter-management`，刷新后 observer 可用
- 手机 Tailscale 配对观察者
- pi / Kimi / Codex / DSH 最小 Level A PASS
- Codex 隔离 device-auth 登录成功并封哈希身份
- ZCode 隔离 OAuth 登录成功；失败原因已从登录问题收敛到 Windows 宿主字段透传，并完成离线回归修正
- Electron unpacked 工程包的 packaged Core 与当前 UI 冒烟通过（脏源，仅工程证据）

---

## 7. 未完成 / BLOCKED / NOT_RUN

| 项 | 状态 |
|---|---|
| docs/12 RC 全 Gate | **未满足** |
| 同一干净候选 SHA 全量复测 | **NOT_RUN**；现有四个成功 live report 均为 dirty，且 Pi 来自较早 SHA |
| ZCode 真实 Level A | FAIL；隔离登录已成功，最后 live 因 `NATIVE_ZCODE_MODEL_SELECTION_REQUIRED` 失败；字段透传已修但未再 live 复证 |
| Artifact 工程黄金链 | 真实 Harness **未跑**（仍 42） |
| Level B / WAITING_INPUT / cancel 真机 | 控制面 DUT 有；五 Harness 真机 **未跑** |
| ChatGPT Web Participant Join/Identity/结果环 | 本轮 **NOT_RUN**（历史 wn05 有过网页侧记录，不能替代本固定 SHA 复测） |
| Cursor Management **controller** 真机派发 | **NOT_RUN** |
| Remote HTTPS+WSS | **NOT_RUN** |
| Electron | unpacked 工程包 Core/UI 冒烟 **PASS（dirty source）**；安装器签名、安装/升级与打包后持久化验收仍 **NOT_RUN** |
| GitHub CI | **BLOCKED_CI_INFRA** |
| 提交 C11 之后的跟进 diff | 本文生成时工作区脏；计划提交到当前特性分支，排除 `.local-protected` / `.cursor/mcp.json` |
| merge `main` / tag / release | **禁止**（无用户批准） |

执行包原要求 dsh/Kimi/Pi 一律百炼。Kimi/Pi 遵守；DSH 在百炼失败后按用户改为 DeepSeek 官方 flash。若 RC 要以执行包原文验收 DSH→百炼，则 DSH 该项仍算未按原文关闭。

---

## 8. 用户只需的后续动作

1. **不要** merge / tag / release，除非另发明确批准。
2. ZCode：隔离登录已完成；仍需在修正后的干净提交上重跑一次 Level A，不能用离线测试替代。
3. 可选：手机「控制 → 获取控制器」（同时只能一名）。
4. 网页 ChatGPT Participant、Electron 安装器/升级、HTTPS Remote：仍待独立真机场次。

---

## 9. 保护约束（本轮遵守情况）

- Cursor 未 `participant_join`，未创建 Cursor Role。
- 百炼 / DeepSeek 密钥未写入仓库、checkpoint 或对话。
- 未复制生产 Codex/ZCode auth。
- 未宣称 RC。
- 测试对象在隔离数据根；MCP 观察 Core 仍无业务项目。
