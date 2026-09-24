# AgentRouter V1.1 Windows 剩余 Core/UI 契约与真实测试复核（2026-09-24）

## 0. 结论

**状态：`NOT_V1.1_WINDOWS_RC_READY`；目前不能作为 Windows RC 或正式版发布。** Core/UI 联合候选已能运行，关键 Core 契约、五家 Harness 的最小真实任务、目录包生产 Core 和 Windows C1/W11 有可复核证据；但这些证据没有覆盖最终合流包的全部 Level B/Artifact/完整历史迁移、11 个 P0 页面逐页真实验收、实体手机与屏幕阅读器、签名安装器和发布流程。不得以 CI 绿灯或 `42/PUBLISHED` 取代上述门禁。

本文件是截至 2026-09-24 的审计结论，不执行 `main` merge、tag 或 release，也不把旧 SHA 的测试冒充最新 SHA 的测试。历史详表见 [`V11-CORE-UI-COMBINED-REVIEW-20260923.md`](V11-CORE-UI-COMBINED-REVIEW-20260923.md)。

## 1. 仓库、分支和固定证据边界

| 对象 | 当前核对值 | 用途/限制 |
|---|---|---|
| 正确合流工作树 | `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate` | 本轮审计与后续 V1.1 联合候选源码；检查时干净。 |
| 候选分支 | `codex/v1.1-core-ui-candidate` | 已与 `origin/codex/v1.1-core-ui-candidate` 同步；审计基线 HEAD `02ad90af65ff86bd078c4cbe8878f80c2960d9fc`。本文件提交后文档 HEAD 会前进，不改变下列已测产品源码。 |
| 固定已测包源码 | `84b1ef2b0021bd48c5ac7d0e3f5a42dad7f595be` | `02ad90a` 相比它只修改联合复核文档；不能把新文档 SHA 写成同包源码 SHA。 |
| 主目录 | `E:\AgentRouter`，`feat/contract-c1` | **不是**本轮 V1.1 联合候选源码。 |
| Core 父分支 | `feat/v1.1-functional-closeout-codex`，合流父提交 `98dce0ca0f6a6476ec5fafaa3cf55cceb8e1a54d` | 历史来源，不是当前候选 HEAD。 |
| UI 父分支 | `feat/v1.1-ui-kimi`，合流父提交 `bee47f9c126ce2e7f587f220c4072361b744f340` | UI lane 的 [`UI-FINAL-CHECKPOINT.json`](../ui-final/UI-FINAL-CHECKPOINT.json) 仍为 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`。 |

当前已测目录包：`release/AgentRouter-j3-84b1ef2b0021-afac6996-d59d-4cc4-96fc-b7e38669cce3`；manifest `sourceSHA=84b1ef2...`、`sourceDirty=false`、`artifactHash=728e4f850fd829f4ad5254ae9eb5fd6762d26b9db45716f03cd15f3aa1720325`、20 个迁移。它是可运行的候选目录包，**不是签名安装器**；没有此 SHA 的正式发布 ZIP/干净目标机安装认证。

## 2. 已完成且证据足够的子范围

| 范围 | 结论与可复核证据 | 不可外推为 |
|---|---|---|
| Core/UI 合流与基本回归 | 产品实现 `82b8a28` 的 Unit/Integration/Contract/Chaos/UI 完整本地回归为 114 文件、653 PASS、2 SKIP；TypeScript、lint、spec、DB/migration 检查通过。`84b1ef2` 只补定向回滚/越权断言与文档，改动文件定向测试通过；`02ad90a` 只补文档。最终审计基线的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35873637782) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35873637827) 均 `completed/success`，W11 安装依赖、合同/安全/进程测试步骤实际执行成功。 | 11 页 P0 逐页视觉/交互通过，或真实设备认证。 |
| Result/Artifact/Run Evidence 契约 | 已发布 Result 可读 Core 持久 Run/Artifact 状态和 SHA-256；Run 执行层区分 `REAL_NATIVE`、`FIXTURE`、`UNKNOWN`。v20 迁移新增控制者单份不可变 `result.evidence.record`，以 Lease/修订/操作 ID 约束，声明的 Git SHA、测试记录、限制清单标为 `CONTROLLER_ATTESTED`；非法 Artifact 引用、回滚、幂等重放、冲突、Observer 越权及 v19→v20 备份有集成测试。 | Core 已核验 Git 对象或测试真的通过；真实用户 Result 已录入声明。 |
| Result 请求修改 | `result.requestChanges` 原子保留原已发布 Result、保存反馈并派发后续 Task；`result.reviewStatus` 用于未知回执核对。先前同源阶段 Windows W11 的真实 Electron→本地 Core Fixture 路径与 Chrome 手机尺寸路径通过。 | 最终安装包、远程实体手机或真实网络丢回复已完整验收。 |
| Participant Slot/WorkSession 安全展示 | Fixture Core + 真实 Electron 页面已覆盖 OPEN Slot、Pair Code 认领到 BOUND、已认证活动时间及脱敏外部会话别名；不把 BOUND 显示为在线。New WorkSession 向导按目标 Harness 获取 preflight，失败时安全禁用并在提交前复核 hash；受信宿主只对当前配置且支持 fresh session 的 Harness 开放能力。 | ChatGPT 网页插件亲自调用 `participant.join`；真实 profile 下向导创建/迁移成功；创建前容量预测已知。 |
| 同 SHA 目录包与真实 Harness 最小 Level A | `84b1ef2` 包 `sourceDirty=false`，生产 Core/命名管道/同目录重启 PASS，139 文件包扫描 0 findings。真实隔离报告：Codex `run-HKE0s2`、ZCode Bigmodel/`GLM-5.3-Flash` `run-v4XgCO`、pi `run-bW0xpf`、DSH `run-8Kmbn6` 首跑均 `DELIVERED/SUCCEEDED/42/PUBLISHED`；Kimi `run-3EpSWZ` 首次 `UNKNOWN`、无 Result，全新隔离 `run-lLpGOT` 复测通过。六份本机报告位于 `.local/j3-production-pi/run-*/report.json`，均固定 `code_sha=package_source_sha=84b1ef2`。**Kimi 状态为 `PASS_WITH_RETRY_DENOMINATOR`，不是首跑全绿。**未使用 Codex reset credit。 | 五家最终 SHA 的 Level B、Artifact、完整历史迁移或长稳全部通过。 |
| 已有更深真实链路 | 旧固定 SHA `6e75e93` 的 Codex/ZCode 随机 marker、Core restart 冷续和 Artifact 哈希链通过；`1259738` 的真实 ChatGPT 网页 Participant `Task→Artifact→Result→PUBLISHED` 通过；`8be447b` 的 Tailscale Serve HTTPS/WSS 后端通过。后续产品改动需按相关性重验。 | 把上述旧 SHA 证据直接写成 `84b1ef2` 的同源包验收。 |
| 当前公开发布引用敏感扫描 | `node tools/check-sensitive.mjs --history` 本次覆盖 3637 个可发布引用历史对象，`0 findings`。 | “所有本机 Git refs/object 永无 `.local-protected`”或“执行包从未进入 Git”。[`V11-PUBLIC-HISTORY-SECURITY-REVIEW-20260922.md`](V11-PUBLIC-HISTORY-SECURITY-REVIEW-20260922.md) 已记录本机 Codex checkpoint refs 的严格例外与公开执行包事实；未经授权未清理/重写。 |

## 3. 尚未完成 / 证据不足

| 门禁 | 当前判定 | 完成所需最小证据 |
|---|---|---|
| UI 视觉终版与 11 个 P0 页面 | `OPEN`。UI 检查点仍为 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`；17 张截图为 `VISUAL_FIXTURE/PREVIEW_MOCK`，11 份 visual diff 未逐页 PASS。 | 最终合流产品 SHA 的 Light/Dark、可比视口、真实 Core 状态、交互与逐页 PASS 截图/差异记录。 |
| 无障碍与实体设备 | `OPEN`。最终 SHA 的 Windows Narrator/键盘/focus/200% 缩放真实抽查和实体手机 Remote 控制/观察者未完成。 | 按 UI 执行包真实运行并记录设备、缩放、屏幕阅读器和失败分母；模拟手机尺寸不能代替实体手机。 |
| GAP-001 Participant Join | `PARTIAL`。Slot/Binding 本地 Fixture 页面 PASS，但网页插件没有 `participant.join` 端到端证据。 | 网页端同一账号从 Join Instruction 认领到 BOUND、重新打开 UI 展示、失效/拒绝安全分支。 |
| GAP-002 Result Evidence | `PARTIAL`。写入/投影契约 PASS，但无真实 Result 的 Controller 声明采集及真实 Electron 页面复核；声明也不等于 Core 独立验证。 | 真实已发布 Result 附加结构化声明、断线/幂等复核、UI 展示来源；需要时另做 Git SHA/测试证据的独立校验设计。 |
| GAP-003 New WorkSession | `PARTIAL`。可用 Harness/preflight 门控 PASS，创建前容量仍为 `UNKNOWN`，真实 profile Electron 创建/迁移未验。 | 真实 Native profile 下新建/迁移、冷续、容量决策和失败/不确定回执的 UI+Core 同源包证据。 |
| GAP-004 修改请求 | `PARTIAL`。Fixture Electron 与本地/手机尺寸浏览器路径通过；最终安装包的 Remote/Mobile、真实丢回复后人工核对仍缺。 | 最终包上本地及远程真实路径、丢回复和不重放证明。 |
| 五家 Harness 深度与长期稳定性 | `PARTIAL`。本轮同包只有最小 Level A；Kimi 首跑 UNKNOWN。 | 对最终产品 SHA 逐项完成要求的 Level B/Artifact/Context/cold resume/故障与长稳矩阵，保留首败分母；不得从旧 SHA 自动继承。 |
| 最终包、安装与发布 | `OPEN`。当前是目录包，非签名安装器；最终 SHA 的 ZIP 全新解包/干净机安装、签名校验、发布回滚清单不足。 | 固定最终源码 SHA、签名安装包、全新机安装/卸载/升级、ZIP 解包、安全扫描与发布负责人批准。 |

## 4. 发布判定和下一步

`G7`（当前候选 C1/W11）已满足；Core 的若干 `G1–G6` 子项有强证据，但完整最终 SHA 的各 Gate 与 UI 全套门禁仍不满足。**可以继续以候选分支在受控隔离环境测试，不可以宣称 `V1.1_WINDOWS_RC_READY`，也不应 merge `main`、tag 或 release。**没有用户书面 waiver 可以替代真实未跑项目。

建议按依赖顺序收口：① UI 11 页真实状态与无障碍/实体设备；② 网页 `participant.join`、真实 profile New WorkSession、真实 Result Evidence 声明及远程请求修改；③ 最终固定 SHA 的 Harness 深度、ZIP/签名安装与安全扫描；④ 对同一最终 SHA 重跑 C1/W11 并由发布负责人复核 Gate 矩阵。所有新代码变更都会产生新的测试 SHA，旧包/旧报告保留为历史，不自动升级为新 SHA PASS。
