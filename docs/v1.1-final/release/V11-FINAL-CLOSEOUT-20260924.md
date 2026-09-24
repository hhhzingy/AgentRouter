# AgentRouter V1.1 Windows 发布前最后一次收口复核

复核日期：2026-09-24。**结论：尚不能宣称 Windows RC，也不能发布。** 本文对应产品代码 `a76ca2773b55b9808a5488bd15ed61bc92f4b016`（简称 `a76ca27`），而不是后续仅修改文档的提交。Codex→ZCode **完整历史迁移属于 V1.2**，不列为 V1.1 阻断；V1.1 仍需对其能力未知或不支持如实显示并 fail closed。

## 身份与发布物

| 项目 | 核对值 |
|---|---|
| 分支 / 工作树 | `codex/v1.1-core-ui-candidate` / `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate` |
| 非本轮源目录 | `E:\AgentRouter` 为其他分支，仅用于读取执行包 |
| 产品 SHA / 工作树 | `a76ca2773b55b9808a5488bd15ed61bc92f4b016`；构建和实测前工作树干净，已推至 GitHub |
| 版本 / 迁移 | `1.1.0` / 20 个迁移 |
| 候选目录包 | `release/AgentRouter-j3-a76ca2773b55-9ce39cf4-7cdc-4f2e-a787-b91f8572cda7`；`sourceDirty=false`，`artifactHash=c6bf03530c5876c4488eb78116488c246952ec75cd457b1e55fa58f99cc9c230` |
| 候选 portable ZIP | `release/AgentRouter-v1.1.0-windows-x64-a76ca27.zip`；200110120 字节；SHA-256 `8f9e3241495cd0d62bab181cf724842229e4b82e899ede2d06b326d39b5c5410` |
| 文档 SHA | 以 `git log -1 --format=%H -- docs/v1.1-final/release/V11-FINAL-CLOSEOUT-20260924.md` 查询；文档提交不冒充产品重新测试 |

ZIP 是**候选物**，manifest 仍为 `CANDIDATE_NOT_CERTIFIED`，不是 GitHub Release。没有签名安装器；执行包允许 V1.1.0 使用 portable ZIP。未做 merge、tag、GitHub Release。

## 已完成的真实验收

| 能力 | 结果和可复核证据 |
|---|---|
| 自动门 | 最终 SHA 的 typecheck、lint 通过；114 个测试文件、654 PASS / 2 SKIP（一次完整非沙箱运行）。C1 [success](https://github.com/hhhzingy/AgentRouter/actions/runs/35949912060)、W11 [success](https://github.com/hhhzingy/AgentRouter/actions/runs/35949911914)。 |
| 最终包 / 解包 | 目录包与新建 `.local/final-unpack-a76ca27` 的 `tools/packaged-test.mjs` PASS：生产 Core、SQLite、pipe、Project 持久化和重启。解包后真实 Electron 也已打开，连接正确的隔离数据集。 |
| Codex 原生 DUT | `.local/j3-production-pi/run-PX43l8/report.json`：获准的隔离 DUT、Bootstrap、`42/PUBLISHED`、输入→输出 Artifact、随机 marker、下载哈希及 Windows Job 收尾 PASS；未使用 reset credit。 |
| ZCode 原生 DUT | `.local/j3-production-pi/run-DVEXUc/report.json`：客户端 Existing Account Broker，Bigmodel / `GLM-5.3-Flash`；同上原生链 PASS。 |
| Pi / Kimi | 最终 SHA 共享工具说明变更后重新 live：`run-2d7bzh` / `run-ugytRw` 的 Bootstrap、`42/PUBLISHED`、Artifact/hash PASS；不是继承旧 SHA。 |
| DeepSeek Harness (DSH) | `run-nyRRXz`：首次并行 `run-juqea7` 原生连接中断；单独复测的 Bootstrap、`42/PUBLISHED`、Artifact/hash 和收尾 PASS。保留首跑失败分母，不宣称长期零波动。 |
| Result Evidence | `.local/final-evidence-a76-report.json`：在真实 ZCode Run Result 上记录 `source_revision=a76ca27` 和结构化测试；Controller-attested、`REAL_NATIVE`、同 operation id 幂等 PASS。这里“Controller 声明”不是 Core 独立证实测试通过。 |
| Request Changes | 上述 ZCode Result 上同 operation id 幂等、原 Result 保留 `PUBLISHED`、`REJECTED`、恰好一个 follow-up PASS。实体手机对网页 Result 的真实操作也有同样的 Core 权威结果。 |
| ChatGPT Work Participant | 同一隔离 Project 中，网页端 `participant_join` / identity、claim、读取显式引用的跨 Task Artifact、提交 `WEB_VERIFIED:FINAL_NATIVE_2edafa43` Result 成功；`W2` BOUND；Result `result_b369d169-eb43-4be9-b340-c33c4cea26e9` 已发布。此前 `TASK_SCOPE_DENIED` 在本 SHA 修复，并有正负集成测试。 |
| 实体手机 HTTPS/WSS | 用户 iPhone 经 Tailscale Serve 配对；首次空 scope 正确只读为空，撤销该测试设备并重签显式 Project scope 后显示 1 Project / 3 Role / 目标 Result。用户从手机提交“请补充来源说明”；Core 核对原 Result 保持 `PUBLISHED`、验收 `REJECTED`，仅创建一个 follow-up `task_12b4a239-e8db-4147-9ef8-241c6ce0951e`。 |
| Electron 界面 | 从最终 ZIP 全新解包启动的 Electron 实际显示 `This PC / Local / Connected / Observer`、隔离 Project、3 Role、原网页 Result `REJECTED` 和后续 Result `PENDING`；Result Detail 的 Artifact 可用状态和 SHA-256 与 Core 一致。 |
| 安全扫描 | 最终产品索引 2238 文件、可发布 branches/tags/remotes 历史 3660 个 blob、目录包及解包各 139 文件，均 `findings=0`。范围不含本机私有 checkpoint refs 或不可达对象，不能推论“历史永无秘密”。 |

## 仍未闭环 / 不得夸大

1. **单一 Golden Flow 尚未直接 PASS。** `AR_V11_FINAL_20260924_102508` 同一项目中，首个原生 Codex Task 的 Run `SUCCEEDED`、Artifact 已写入，但因当时模型以错误参数调用 `route_finish`，未生成该 Task 的 Result，Task 保留 `NEEDS_ATTENTION`。修正工具说明后，Codex/ZCode 在各自新隔离数据集的完整 Artifact→Result 链已通过；不能把分散数据集冒称同一条完整黄金链。此处为发布前用户旅程证据缺口，必须补齐或由发布负责人明确接受缩减的验收范围。
2. **网页 follow-up 的执行源必须区分。** 手机 Request Changes 后，新 Result `result_95e221b5-9be8-4460-9630-4b342bb510c3` 是测试 Role 自动派发的**原生 Codex Run**，不是 ChatGPT Work 网页 Participant 自动交付。最初 `WEB_VERIFIED` 才是网页 Participant 提交。该测试 Role 同时具备原生绑定和 Web Slot，不能用后续 Result 证明网页二次处理。
3. **桌面人工步骤未全覆盖。** 最终解包 Electron 已核对 Projects、Workbench、Results/Result Detail 与连接状态；没有在同一项目的 Electron 上亲自执行 Request Changes，也未逐项完成 New WorkSession、Role Detail 等全部六个黄金页面。手机是真机浏览器验收，不是桌面动作的替身。
4. **冷续证据是分段的。** 旧 SHA 上 Codex/ZCode 各自同 Harness marker 与 Core 冷重启核心断言通过，但组合脚本清理阶段分别失败；最终 `a76ca27` 未重做两家的 cold continuation。跨 Harness 完整历史迁移已移至 V1.2，不应再以此作为 V1.1 P1。
5. **环境/失败分母保留。** 首次网页读取报 `TASK_SCOPE_DENIED`（已修）；手机首配空 Project scope（测试配置错误，已撤销重配）；手机操作中出现过 `PLAN_STATE_CONFLICT` 与 `CONNECTION_LOST`，最终以 Core 状态确认为一次修改请求；Codex 首测使用失效二进制路径、随后误用无批准身份的 DUT 目录，切到获准 DUT 后 PASS；ZCode 沙箱首测 Bootstrap 失败，非沙箱 PASS；首次隐藏窗口 Electron 启动错误，在可见正常桌面上下文重启后成功。Kimi 历史 UNKNOWN 和 ZCode 旧组合脚本租约过期亦不抹去。

五家 Harness 均在本产品 SHA 有真实 Artifact 链 PASS，但这些是各自隔离数据集的短实测，不是同一个 Golden Flow，更不证明长期零波动。

## 发布决定

目前为 `V1.1_WINDOWS_RELEASE_BLOCKED`，原因是单一 Golden Flow / 桌面人工关键动作仍 `PARTIAL`。该状态不是 Windows RC，不允许上传候选 ZIP 为正式 Release。签名安装器、完整 Narrator、全面 DPI/主题、账号切换与 Linux 按执行包分别延后或排除。发布负责人若决定接受缩减黄金链，需书面确认剩余风险；如继续修产品代码，必须产生新产品 SHA、重建包并按影响图重测。
