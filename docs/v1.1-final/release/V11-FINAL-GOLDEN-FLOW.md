# V1.1.0 Windows 真实黄金链复核

**裁决：Golden Flow `PASS`；`TESTED_PRODUCT_SHA=268fc71e81c2956ed1eeabf75df6389934836c09`。** 本文与 [最终候选复核](V11-FINAL-CANDIDATE-268FC71-20260924.md) 和 [门禁矩阵](V11-FINAL-GATE-MATRIX.json) 同口径。V1.1 不要求 Codex→ZCode **完整历史迁移**；该能力属于 V1.2，不能冒称已实现。

隔离 Project 为 `AR_V11_FINAL_20260924_141100`（`project_6fee6dc0-868e-4d4c-ab8a-6d0509b00efd`），成功 Role 为 `role_5ffe44c3-3256-4c58-ae71-f49310be4eb5`。这是一个 Project 内按顺序完成的用户旅程，不把几个独立 DUT 的结果拼成同一链。

| 顺序 | 同项目权威结果 | 裁决 |
|---|---|---|
| Codex Bootstrap→Artifact→Result | Bootstrap `DELIVERED`；Task `task_fed604cd-6fef-42bd-884f-64a2983466b2` Run `SUCCEEDED`；Artifact `artifact_70a5c907-6802-42b5-975a-154b6085c021` 的 bytes/hash 与随机 marker 精确匹配；Result `result_51bb3e7f-6793-4232-a294-d575c1a12978` `PUBLISHED` | PASS |
| 解包 Electron 结果复核与 Request Changes | 实际查看 Role Detail、Result Detail 及 Artifact SHA；对原 Result 提交一次 Request Changes，原件仍 `PUBLISHED`、验收为 `REJECTED`；唯一后续 Task `task_9fbc107f-6710-4659-8ebe-bcd5cef826a2` 生成 `PUBLISHED` Result `result_12237a76-d0c8-405d-9f93-f1e363163610` | PASS |
| Electron 新 WorkSession | 同一 Role 新建 ZCode `GLM-5.3-Flash` W2，选择 `Start blank`；旧 Codex W1 `ARCHIVED`，界面标为 Historical WorkSession / Read-only | PASS；不计完整历史迁移 |
| ZCode Artifact→Result | W2 的 Task `task_97dbb471-64fd-449a-b579-eb4a276f3df0` Run `SUCCEEDED`；Artifact `artifact_d4352003-e2a7-4bcc-95fa-1731f56ebc25` 的 bytes/hash 与随机 marker 精确匹配；Result `result_72689ed9-2988-4779-8f12-90f580954a7a` `PUBLISHED` | PASS |
| Core 冷重启 | 原数据目录重启后，该 Role 仍可见；ZCode W2 `ACTIVE`，Codex W1 `ARCHIVED`/只读；旧任务验收仍 `REJECTED`，同角色恰好三项任务、三个 `PUBLISHED` Result；`.local/AR_V11_FINAL_20260924_141100/restart-report.json` 为 PASS | PASS |

**SHA 边界：** 链的 Codex 初段发生在 `10b51361a57c3262dbac774c13f706d4d0d0bffa`；Electron P2 显示修复后，ZCode 段和 Core 重启在最终产品 SHA `268fc71`。不能声称整条链的每一步都在最终 SHA 从头重跑。为覆盖这一差异，最终 SHA 的 packaged Codex 独立真实 DUT 回归（Bootstrap、Artifact→`42/PUBLISHED`、哈希与原生收尾）另行 PASS：`.local/j3-production-pi/run-Dx64x6/report.json`。该第二次产品差异仅触及桌面入口和 Remote WebSocket transport，未触及 Pi/Kimi/DSH adapter、profile 或 native runtime，三者沿用 `a76ca27` 的真实证据。

旧数据集 `AR_V11_FINAL_20260924_102508` 的无 Result Task 和 `BOOTSTRAP_ACK_MISSING` 失败仍保留在 [历史失败分母](V11-FINAL-CLOSEOUT-20260924.md)，新 Project 的沙箱首试 `RPC_NATIVE_REJECTED` 也保留；它们不是新链的成功步骤，亦不因旧对象仍存在而推翻新链 PASS。网页 Participant 与实体 iPhone Tailscale 的既有真实 PASS 沿用，不重跑人工验收；仅完成本轮指定的三个 Electron 动作，不宣称已重跑全部人工视觉矩阵。
