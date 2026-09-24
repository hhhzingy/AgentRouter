# AgentRouter V1.1 Windows 最终候选复核

复核日期：2026-09-24。裁决：**`V1.1_WINDOWS_RELEASE_CANDIDATE_READY`**，尚未 merge main、tag 或创建 GitHub Release；这些动作等待用户最终批准。本文区分产品提交、同项目黄金链分段执行以及历史失败分母，不把旧失败对象删除或冒称从未失败。

## 产品身份与发布物

| 项目 | 复核值 |
|---|---|
| `FINAL_PRODUCT_SHA` | `268fc71e81c2956ed1eeabf75df6389934836c09`；已推送 `origin/codex/v1.1-core-ui-candidate` |
| 工作树 | `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate`；主目录 `E:\AgentRouter` 不是本轮源工作树 |
| 版本与数据库 | V1.1.0；沿用 20 个既有 migration，本轮没有新增 migration |
| 目录包 | `release/AgentRouter-j3-268fc71e81c2-e738ebe3-00a6-4f78-85b3-c9b9cc028f61`；manifest `sourceDirty=false`，`artifactHash=ccfff04e5cb60b53f8d5ef712ed8446dc2f0b03cfc43acfb0c5547975b5ad303` |
| Portable ZIP | `release/AgentRouter-v1.1.0-windows-x64-268fc71.zip`；200110621 字节；SHA-256 `6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604` |
| Fresh unpack | `.local/final-unpack-268fc71`；目录包与全新解包的 packaged smoke 均 PASS |

Manifest 的状态仍是 `CANDIDATE_NOT_CERTIFIED`：它明确表示开发机 portable 候选包，而非签名安装器、干净目标机认证或已发布版本。复核文档提交晚于产品 SHA，不应拿文档 HEAD 代替受测产品 SHA。

## 最小修复与回归

`BOOTSTRAP_ACK_MISSING` 仅在同一次原生 Bootstrap 的 native stop **已证明**、终态正常、绑定 epoch 未变、诊断精确且唯一为 `BOOTSTRAP_ACK_MISSING`、`initialization_attempts` 恰为首次时，释放 initialization lease、把同一 delivery 退回 `PENDING`，记录 `BootstrapAckRetryScheduled` 事件并最多自动重试一次。第二次仍 missing 保持 `FAILED`；Core restart 也不会触发第三次。Timeout、disconnect、安全、provider、stop-unproven 或混合诊断均不自动重试。单元/集成覆盖 missing→success、missing→missing、其他错误不重试及重启后次数上限；没有新 migration。

同项目验收时又发现桌面端仍读 C1R1P1 投影，ZCode WorkSession 切换后 Role 从列表消失。产品 SHA `268fc71` 让 Electron 首次快照前协商 C1R1P2，并修正 REMOTE_CORE WebSocket transport 升级后的校验 revision。针对性测试与真实解包 Electron 复核均通过：Role Detail 显示 ZCode `GLM-5.3-Flash` W2 ACTIVE，Codex W1 为历史只读。此第二次变更只触及桌面入口和远程传输，不触及 Harness adapter、profile 或 native runtime。

## 同一 Project 真实黄金链

隔离数据集：`.local/AR_V11_FINAL_20260924_141100`；Project `project_6fee6dc0-868e-4d4c-ab8a-6d0509b00efd`；实际成功 Role `role_5ffe44c3-3256-4c58-ae71-f49310be4eb5`。

| 顺序 | 结果 |
|---|---|
| Codex Bootstrap→真实 Artifact→Result | Bootstrap `DELIVERED`；Task `task_fed604cd-6fef-42bd-884f-64a2983466b2` Run `SUCCEEDED`；Artifact `artifact_70a5c907-6802-42b5-975a-154b6085c021` 内容随机 marker 精确匹配，SHA-256 `e215bb418061fc4cbbefd54f9a8ecf5d308d1502f44d622c85552060406f290f`；Result `result_51bb3e7f-6793-4232-a294-d575c1a12978` `PUBLISHED`。 |
| Electron 人工关键动作 | 在解包 Electron 实际查看 Role Detail、Result Detail 与 Artifact SHA；Request Changes 一次成功，原 Result 保留 `PUBLISHED`、验收 `REJECTED`，恰好一个后续 Task `task_9fbc107f-6710-4659-8ebe-bcd5cef826a2`，其 Result `result_12237a76-d0c8-405d-9f93-f1e363163610` `PUBLISHED`。 |
| Electron 新 WorkSession | 同一 Role 创建 ZCode `GLM-5.3-Flash` W2，按用户 V1.1 边界选 `Start blank`，未声称 Codex→ZCode 完整历史迁移。旧 Codex W1 归档且界面标注 Historical WorkSession / Read-only。 |
| ZCode 真实 Result | W2 上 Task `task_97dbb471-64fd-449a-b579-eb4a276f3df0` Run `SUCCEEDED`；Artifact `artifact_d4352003-e2a7-4bcc-95fa-1731f56ebc25` 的随机 marker 精确匹配，SHA-256 `7879a377b318fe01153624526bb3a0e953d75f02519ff5032146cf9429c08c31`；Result `result_72689ed9-2988-4779-8f12-90f580954a7a` `PUBLISHED`。 |
| Core 冷重启 | 重新启动同一隔离数据目录后，Core API 与 DB 均显示该 Role 可见、W2 `ACTIVE/zcode`、W1 `ARCHIVED/codex`、旧任务验收 `REJECTED`、恰好三项任务和三个 `PUBLISHED` Result；`.local/AR_V11_FINAL_20260924_141100/restart-report.json` 为 PASS。 |

黄金链的 Codex 初段在修复 Bootstrap 后的 `10b51361a57c3262dbac774c13f706d4d0d0bffa` 上执行；切换后的 ZCode 段、新解包 Electron 与 Core 冷重启在 `268fc71` 上执行。**不能把跨 SHA 的整条链说成每一步都在最终 SHA 上重新跑过。** 为隔离这个差异，最终 `268fc71` 包还用已获准的 Codex DUT 独立复测 Bootstrap、真实输入/输出 Artifact、`42/PUBLISHED`、哈希和收尾，报告 `.local/j3-production-pi/run-Dx64x6/report.json` 为 PASS。ZCode 的最终 SHA 真实证据即同项目 W2 结果。Pi/Kimi/DSH 的真实结果沿用 `a76ca27`；之后的代码差异不触及它们的 adapter/profile/native runtime，自动回归通过。

## 最终门禁与安全边界

- 全量自动套件：117 文件 PASS、4 文件 SKIP；661 测试 PASS、7 测试 SKIP。Typecheck、lint、冻结契约检查、数据库迁移/SQLite 探针均 PASS。
- 最终 SHA 的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35966426039) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35966426017) 均 success。
- 目录包与 fresh unpack 的生产 Core/SQLite/命名管道/Project 持久化与重启 packaged smoke PASS。目录包、解包各 139 文件，publish refs 历史 3675 个 blob，敏感扫描均为 0 findings。零发现仅对已扫范围成立，不推论私有 refs、不可达对象或本机私有目录绝对无风险。
- ChatGPT Work 网页 Participant 和实体 iPhone Tailscale HTTPS/WSS 的真实 PASS 沿用此前证据，不重复人工测试；Electron 只补本轮要求的三个动作，不重跑 11 页人工矩阵。
- 签名安装器、完整 Narrator、DPI/主题与卸载矩阵按既定执行包延后；Codex→ZCode 完整历史迁移属于 V1.2，V1.1 仅支持 `Start blank` 及已有的安全连续性能力。

## 失败分母与发布决定

旧黄金数据集的 `BOOTSTRAP_ACK_MISSING`、首个原生 Task 已写 Artifact 却没有发布 Result，均继续保留。新数据集的第一个 Role 在受限沙箱发生 `RPC_NATIVE_REJECTED`，随后在非沙箱同项目另建 Role 才成功；该失败亦保留。最终 SHA 的独立 Codex 首跑误用不存在的默认 DUT 根，记录 `BOOTSTRAP_STOP_UNPROVEN`；改用既有获准 DUT 根后真实 PASS。历史网页 scope、手机瞬时 `PLAN_STATE_CONFLICT/CONNECTION_LOST`、DSH 并行波动及其最终权威复核，见 [受阻阶段复核](V11-FINAL-CLOSEOUT-20260924.md)。这些旧对象是证据分母，不是仍活跃的发布阻断。

在用户限定的 V1.1 范围内，当前没有未闭环的产品级 P0/P1 阻断；候选裁决为 `V1.1_WINDOWS_RELEASE_CANDIDATE_READY`。**没有执行 merge main、tag、GitHub Release，也没有使用 Codex reset credit。**
