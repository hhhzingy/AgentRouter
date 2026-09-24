# V11-C0 Baseline — AgentRouter V1.1 Windows 最终收口

**Stage:** C0  
**Date:** 2026-09-20  
**Auditor:** Cursor (Management MCP client only; not a Role)  
**Worktree:** `E:\AgentRouter\.worktrees\v1.1-final-cursor-win`  
**Branch:** `feat/v1.1-final-cursor-win` (new; does not overwrite existing worktrees)  
**Canonical V1.1 Windows source SHA:** `16598f621d7160627ce769ecafb8d14ab55399f4`  
**Tip subject:** `fix(wn05e): zcode managed config dual-write for repacked 0.16.5 + P0 card: supervisor stdio breakage`  
**Review SHA (do not patch against):** `0d92196eddd915774354f267ce0a9ce687f96aa2` (2026-09-17)  
**main merge / tag / release authorized:** false

本文件只记录**当前仓库事实**。旧 Review 是 9 月 17 日假设，不是实现清单。

---

## 1. 仓库拓扑（2026-09-20 重新读取）

### 1.1 当前 worktrees

| Path | HEAD | Branch | Dirty |
|---|---|---|---|
| `E:\AgentRouter` | `18c259c` | `feat/contract-c1` | untracked 执行包 / `.local-protected` |
| `.worktrees/v1.1-final-zcode` | `16598f6` | `feat/v1.1-final-windows-mobile` | clean |
| `.worktrees/v1.1-integration` | `29e732c` | `integration/v1.1-cross-platform` | `M apps/participant-mcp/http.mjs` |
| `.worktrees/v1.1-context-continuity` | `2bd41f9` | `feat/v1.1-context-continuity` | clean |
| `.worktrees/ui-ux-spec` | `8c3f0ed` | `feat/ui-ux-spec` | clean |
| `.worktrees/j1-integration` | `bbdea2a` | detached | — |
| `.worktrees/contract-c1r1` | `0000000` | `feat/contract-c1r1` (empty) | — |
| `.worktrees/v1.1-final-cursor-win` | `16598f6` | `feat/v1.1-final-cursor-win` | **this C0 worktree** |

主目录 `E:\AgentRouter` **不是** V1.1 源：它跟踪早期 `feat/contract-c1`。不得在那里改 Core。

### 1.2 分支关系

```
origin/main                              16370d3  2026-09-09  (远落后)
feat/v1.1-context-continuity             2bd41f9  2026-09-15
origin/feat/linux-v1.1-port              0645f20  2026-09-17  Linux lane
merge(integration)                       6e95922  2026-09-17  SC1/SC2 Windows d99cb10 + Linux 0645f20
integration/v1.1-cross-platform          29e732c  2026-09-17  records 6e95922 package
Windows Review input                     0d92196  2026-09-17  tunnel READY / web MCP
  + 5594553 feat(wn05b) participant workloop
  + 2e8a9e4 docs(wn05c) web v2 loop
  + 40bf524 docs(wn05d) CHATGPT_PARTICIPANT_VERIFIED
  + 16598f6 fix(wn05e) zcode dual-write + supervisor stdio P0 card
feat/v1.1-final-windows-mobile           16598f6  2026-09-18  newest Windows
```

- `0d92196` **是** `16598f6` 的祖先（4 commits）。
- `29e732c` **不是** `16598f6` 的祖先。Windows 与 integration **已分叉**。
- 因此：**canonical V1.1 Windows source = `16598f6`**，不是 Review SHA，也不是 integration SHA。
- 本轮 Windows RC 从 `16598f6` 前进。Linux 同构图不在本 SHA；记 F19/F30，本包不阻塞 Windows 先修 shared。

### 1.3 为何不沿用 0d92196

Review 之后已落地：

- migration **016** participant workloop（claim / request_user_input / submit_result，`results.run_id` 可 NULL）
- 网页 Participant 本地+真实演练证据（`docs/parallel/web-demo-participant-evidence-20260918.md`）
- ZCode 0.16.5 managed config dual-write；supervisor stdio 仍标 P0 blocker

按旧 SHA 盲改会覆盖 workloop、重复修已变路径。

---

## 2. CI

远端 GitHub Actions（`feat/v1.1-final-windows-mobile` 最近 15 次，含 `16598f6`）：

- 工作流：`C1 contract and offline gates`、`W11 integration and P1 gates`
- 结论：`failure`
- 时长：**3–5 秒**
- job `c1`：`steps: []`（未真正 checkout / install / test）

判定：**BLOCKED_CI_INFRA**（账号/runner 计费导致 job 未启动），**不是**本 SHA 的代码测试红。  
不得把远端 failure 改称 PASS。本地 gates 仍必须跑。checkpoint 已记录 `host_blockers: BLOCKED_CI_INFRA`。

---

## 3. Migrations 001–016 字节冻结

| File | SHA256 (LF, current tree) | freeze.migrations.json |
|---|---|---|
| 001-baseline.sql | `96c60988816b8c8057b0c34e78c8f23fa0f039958decc9c340cd00749f539fe3` | MATCH |
| 002-w11-application.sql | `d49e1bae041c9703120dc33a08e379710d9d35e9859ca9ac1c90625790b63552` | MATCH |
| 003-native-execution.sql | `617cbb1701d85cd75d552ae990bb3f49246df1ebadc9591446067c8f94ce585b` | MATCH |
| 004-external-api-journal.sql | `fe2645142aefe33643fa163bec2a4063d292150d709eed666ebc30b995dddab9` | MATCH |
| 005-role-sessions.sql | `1cf43e27223c06c1bd08b4f5db3ec97aa27770222f26766b45e4dfb8e7e7f84b` | MATCH |
| 006-role-harness-dynamic.sql | `84e9173de9c761ce707d8785cb045db3d40800e52067950aaa864d4de243cab2` | MATCH |
| 007-restore-current-binding-index.sql | `e9014b8c880eb65a0331e87a1467c5161e467b5e4c295485d34720c5fa02620b` | MATCH |
| 008-participant-grants.sql | `3860a9960b1cc2af729af76c30a93965e9137ebf7838298ace9e46cd1b6ee719` | MATCH |
| 009-role-session-handoffs.sql | `7e11cc46de84c211073820879684fa417f7ede44c7cbfcba5752bd5a24f94deb` | MATCH |
| 010-run-provenance.sql | `a2a8662a6a479f2475d6e85ba5183252501df5417517217230a017cb5eaf26dc` | MATCH |
| 011-work-session-continuity.sql | `8103e00209659b8b3a27556f1c5bd3690acc4cc953f732987cdc6cd3c12a2b01` | MATCH |
| 012-role-context-index.sql | `c3ba6d048be3af633128309f4248a0e4a60d2d169eb9640a00ba58e559bafaa3` | MATCH |
| 013-remote-devices.sql | `aa8e1ab630a01742235a6b5123584abf2f23b1f859a9d2db249880fbdb592ddc` | MATCH |
| 014-context-convergence.sql | `96c142acbc52b46d7bb5930034e124a595416a414e8969b84e606a246832e04f` | MATCH |
| 015-context-transfer.sql | `2943063cb49e73833f2df519d2a0bd67186948a56dad753ec80db173f0f6ed97` | MATCH |
| **016-participant-workloop.sql** | `4989318ce97a9b6842174c92745cb3e3ed5ceed8665a4aa6da5a228c2820a740` | **MISSING from freeze** |

**结论：** 001–015 字节冻结成立，禁止改历史文件。016 已在 `application-store.ts` 执行，但 `docs/api/freeze.migrations.json` 未收录 → `tools/check-migrations.mjs` 在 HEAD **会失败**。C2 不得改 001–015；只把 016 以当前字节加入 freeze（不改 SQL）。

VACUUM 备份：v2–v6、v11、v12、v16 有；007–010、013–015 无（F27 残留）。

---

## 4. 已实现 / 部分实现 / 未实现（对照三份源文档）

### 4.1 已实现（当前 SHA 有公共入口或明确产品关闭）

- Project / Role / Task / Run / Result / Artifact / Approval / Lease / SQLite
- 五 Harness Driver 注册：Codex、ZCode、Pi、Kimi Code、DeepSeek Harness
- Windows Core `apps/core-daemon/w11-main.ts` + Electron Workbench
- Management MCP stdio：`apps/management-mcp/main.ts`，`clientId` 正则 `^mcp_management_[A-Za-z0-9_.:-]{1,100}$`，默认 `mcp_management_codex`；**可直接用 `mcp_management_cursor`，无需 Cursor 专用协议分支**
- Participant MCP 7 工具：inbox / claim / request_user_input / submit_result / read_artifact / send_user_input / register_artifact
- Participant grant + generation fencing + attach
- 网页 ChatGPT 基础连通 + workloop 真实演练（用户已确认；wn05d PASS）
- 产品 API：归档 WS `roleSession.switch` → `ROLE_SESSION_REACTIVATION_REMOVED`（无 `resume`/`reactivate` 方法）
- Create WorkSession GUI（blank / inherit）
- Remote Gateway + device pairing + node ledger（有已知安全欠账）
- Reference codec：`submitFromUser` 同时认 `kind/artifact_id` 与旧 `type/id`（F03）
- 历史 conversation 任务条目不再被 sync 改到新 ACTIVE（F05 主路径）

### 4.2 部分实现

- Context Transfer 状态机存在；ZCode port 已注册，但 **假 confirmed**（F01）且 history_export 仍 UNKNOWN
- Artifact 有 freezeFile / registerArtifact / inspectArtifact，**三套 storage_key 不兼容**（F04）
- Auth：`authorized` + `mode` + `allowedProjects` 三态雏形；observer/controller 未拆干净（F08）
- MCP project scope 环境变量存在，**未落到真实 pipe principal `human_<hash>`**（F07）
- Participant 可 claim/submit；**无 Slot / participant_join / participant_identity / Role Identity Pack**
- Needs Attention：状态聚合，非独立 Workbench 首屏
- ZCode：诚实声明 `native_resume=UNSUPPORTED` / `SESSION_CONTINUATION_UNSUPPORTED`；warm 未做
- `run.reconcile`：仅 mock GUI；生产 Core 无此 method（F16）

### 4.3 未实现（本轮必须做或必须诚实禁用）

| 需求 | 状态 |
|---|---|
| REQ-JOIN-01 WorkSession Slot | 无表/无 API。`role_slots` 是执行槽（active_run），不是规划槽 |
| REQ-JOIN-02/03 Participant Binding + 幂等 `participant_join` | 无。现有是 grant+attach |
| REQ-JOIN-04 `participant_identity` / Role Identity Pack | 无 |
| REQ-JOIN-05 reconnect vs replacement | 无 Binding generation 产品语义（grant generation 有） |
| REQ-P0-08 WAITING_INPUT → 下一 Run 消费 TaskInput | 落库，不进入 `task.request_json` / dispatch |
| REQ-P0-05/06 Context 证据链 + 源 WS 保护 | 引擎有阶段；假 confirmed + repairCommitted 会复活历史 |
| REQ-P0-07 队列 drain/cancel/carry | `safeToSwitch` 忽略 QUEUED |
| Cursor Management MCP 真实接入 | launcher 通用；无 `.cursor/mcp.json` 示例、无 DUT observer 证据 |
| Desktop Host identity / Result Detail / blocked reason / Mobile sheet | 部分文案，未按 docs/09 收口 |
| Reader vs WorkspaceExecutor 真实写权限 | plans 写死 `read_only` / `network none` |

### 4.4 明确不做（V1.1 范围）

RAG / Role Context Delta / 历史 WS Resume / 账号切换 / 自动模型路由 / 复杂 DAG / 原生 iOS Android Core / Cloud Relay / 外部 API 费用保护 / 强制 4h soak / 强制 1M / 把 Cursor 当 Role。

---

## 5. Review F01–F30 当前判定（源码 SHA `16598f6`）

判定规则：OPEN = 当前代码仍可达；FIXED = 公共入口有负测+正测且源码不再表现该缺陷；NOT_REPRODUCED = 当前代码路径已不存在该机制；SUPERSEDED = 新产品规则替代且实现与文档一致。

| ID | Pri | Status | 当前证据 | 公共入口测试 |
|---|---|---|---|---|
| F01 | P0 | **OPEN** | `zcode-context-port.ts` `initializeTarget`：void seed、`confirmed: true`；`confirmTarget` 只 resume | NONE（engine 测用 mock confirmed） |
| F02 | P0 | **OPEN** | `resumeInterrupted` 遍历全部 COMMITTED 调 `repairCommitted` 把目标改回 ACTIVE。产品 switch 已禁复活，**启动恢复仍会复活** | switch 负测有；A→B→C→restart 无 |
| F03 | P1 | **FIXED** | `core.ts` `submitFromUser` 读 `kind ?? type`、`artifact_id ?? id` | contract/workloop 使用 kind 路径 |
| F04 | P0 | **OPEN** | runtime 写 `projectId/hash`；`inspectArtifact` 只认 64 hex；participant 写 workspace 文件、DB 记 hash | artifacts 测不经 inspectArtifact |
| F05 | P1 | **FIXED** | `syncConversation` 先 join `tasks.role_session_id` | `role-session.test.ts` 新 WS 后归属不变 |
| F06 | P1 | **OPEN** | `safeToSwitch` 不看 QUEUED；dispatch 要求 ACTIVE | NONE |
| F07 | P0 | **OPEN** | `open()` 仅 `human_local` 或 `mcp_*` 继承 `defaultConnectionScope`；`w11-main` principal=`human_<hash>` 不传 scope | `mcp-scope.test.ts` 只用 `human_local` |
| F08 | P1 | **OPEN** | `authorized := canRequestController`；observer 被挡扩展读 | 有 acquire 负测，无 observer 读 roleSession 正测 |
| F09 | P0 | **OPEN** | `participant.grant.issue` 无 project authorize；`remoteDevice.*` 只挡 `remote_device_*` 前缀；`scope={}` 空转 | NONE 跨项目 grant |
| F10 | P0 | **OPEN** | `remote-gateway.ts` cookie `decodeURIComponent` 在 try 外 | NONE |
| F11 | P0 | **OPEN** | `remoteDevice.revoke` 只改 store；`revokeLive` 未接到 extension/`w11-main` | PAIR-06 只测 authenticate 失败 |
| F12 | P1 | **OPEN** | `w11-main` `sessionHomeOf(harness)` = 该 harness 第一个 profile | mock port |
| F13 | P1 | **OPEN** | sendUserInput / syncConversation / coordinator 仍 `appendConversation` | store 测仍要求写入 |
| F14 | P1 | **OPEN** | wait.ready=1；CONTINUATION 仍用原始 `request_json` | 无「随机值进入下一轮 prompt」测 |
| F15 | P1 | **OPEN** | 每 Run `stopProcess` + tree-empty；ZCode `native_resume=UNSUPPORTED`（诚实，但 Level B 同 WS 连续未交付） | wc02-continuity |
| F16 | P1 | **OPEN** | GUI ReconcilePanel；生产无 `run.reconcile` | mock only |
| F17 | P1 | **OPEN** | `handle()` 前缀旁路冻结表；大量 `any` | freeze 脚本不拒未知前缀 |
| F18 | P1 | **OPEN** | `plans.permissions()` 写死 read_only | 无 executor 写路径 |
| F19 | P1 | **OPEN** | 本 SHA 无 `linux-main.ts`；`w11-main` `WINDOWS_CORE_ONLY_THIS_STAGE`。Linux 装配在 integration `29e732c`，未并入 | n/a Windows 本轮 |
| F20 | P2 | **OPEN** | 全量 snapshot / syncConversation / 整文件 hash | 无 1k/10k |
| F21 | P1 | **OPEN** | 关键状态散落 SQL | 无单一 command 门 |
| F22 | P2 | **OPEN** | `one_current_binding_per_role` 已有；`verified` 仍=配置校验 | migration-current-binding |
| F23 | P2 | **OPEN** | provenance.model 来自 binding，非 effective | run-provenance 不测模型对 |
| F24 | P2 | **OPEN** | 开库 seed `fixtures/client-c1r1/model-seed.json` | c1r1 依赖 catalog |
| F25 | P1 | **OPEN** | http 与 https 均合法；坏 JSON → 空账本 | 无加密则拒明文 |
| F26 | P1 | **OPEN** | workloop 已补 claim/result；join/identity/Slot 仍缺。**不可标 FIXED** | workloop integration PASS |
| F27 | P2 | **OPEN** | freeze 缺 016；备份不齐 | check-migrations 现应失败 |
| F28 | P2 | **OPEN** | 同一 `w11-main` fixture/native 分支 | packaged 测存在 |
| F29 | P2 | **OPEN** | GUI &lt;15s 自动 renew；无 idle 释放 | 无 idle 测 |
| F30 | P2 | **OPEN** | Windows `16598f6` ≠ integration `29e732c` | 无双平台 composition 快照 |

**P0 仍 OPEN：** F01 F02 F04 F07 F09 F10 F11（C2 必须先收口）。  
**本轮 FIXED：** F03 F05。  
**NOT_REPRODUCED / SUPERSEDED：** 无整项。产品关闭历史 switch ≠ F02 修复。

---

## 6. Management MCP / Cursor

现有 launcher：

```text
node <management-mcp.mjs> <AGENTROUTER_DATA> <observer|controller> <clientId>
clientId default: mcp_management_codex
accepted: /^mcp_management_[A-Za-z0-9_.:-]{1,100}$/
AGENTROUTER_MANAGED_ROLE=1 → MANAGEMENT_START_DENIED
```

C1 计划：DUT observer 使用 `mcp_management_cursor`；**不**创建 Cursor Role/WS/Binding；**不**调用 `participant_join`。密钥不进 `.cursor/mcp.json`。Controller 须等 F07/F09。

本 SHA 无项目级 `.cursor/mcp.json` / example。

---

## 7. Harness 声明（`harness-drivers.ts`）

| Harness | native_resume | continuity | Context export | 本轮 Provider |
|---|---|---|---|---|
| Codex | IMPLEMENTED_UNVERIFIED | SAME_SESSION_CONTINUOUS | UNKNOWN | 用户已登录账号；只新建测试会话 |
| ZCode | UNSUPPORTED | SESSION_CONTINUATION_UNSUPPORTED | port 存在但 F01 假 confirmed | 同上 |
| Pi | IMPLEMENTED_UNVERIFIED | SAME_SESSION_CONTINUOUS | UNKNOWN | 百炼 OpenAI-compatible `qwen3.8-flash` |
| Kimi | IMPLEMENTED_UNVERIFIED | SAME_SESSION_CONTINUOUS | UNKNOWN | 同上 |
| dsh | IMPLEMENTED_UNVERIFIED | SAME_SESSION_CONTINUOUS | UNKNOWN | 同上 |

checkpoint 另记：**Windows supervisor stdio DuplicateHandle/overlapped EOF** 曾阻塞全部 native live 路径（wn05e 执行卡）。C7 前必须复验是否仍 BLOCKED。

百炼：只从 `E:\AgentRouter\账号信息\通用API\百炼.txt` 由受信 loader 注入子进程；禁止写入仓库/报告/聊天。

---

## 8. 保护资产

- 不删除/改写用户既有 Codex/ZCode 会话、认证、项目
- 不覆盖 auth 文件
- 不在用户主工作树做故障注入
- DUT → 通过后才允许 `V11-REAL-SMOKE-<timestamp>` 真实环境
- Cursor 不是 Role

---

## 9. Gate C0

| 项 | 结果 |
|---|---|
| canonical source 无歧义 | PASS：`16598f6` |
| 不从旧 Review SHA 开工 | PASS |
| F01–F30 全部重新判定 | PASS（上表） |
| 未知标 UNKNOWN 不猜 | PASS：ChatGPT tunnel session correlation 稳定性 = UNKNOWN（沿用 pair-code fallback 直到探测） |
| 新 worktree 不覆盖已有开发树 | PASS |

**下一步 C1：** 复用 generic Management MCP + `mcp_management_cursor` DUT observer。  
**并行准备 C2：** P0 反例测试 → 最小修复。未经用户批准不 merge main / tag / release。
