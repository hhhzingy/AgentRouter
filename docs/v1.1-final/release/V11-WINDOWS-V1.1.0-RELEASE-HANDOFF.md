# AgentRouter V1.1.0 Windows 发布前交接

**当前裁决：`V1.1_WINDOWS_RELEASE_BLOCKED`，不是 Windows RC。** 完整事实和失败分母以 [最终收口复核](V11-FINAL-CLOSEOUT-20260924.md) 为准；机器状态以 [门禁矩阵](V11-FINAL-GATE-MATRIX.json) 为准。本文件不再沿用旧产品 SHA 的阻断判断。

- 产品代码：`a76ca2773b55b9808a5488bd15ed61bc92f4b016`；分支 `codex/v1.1-core-ui-candidate`，工作树 `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate`，产品提交已推送 GitHub。
- 文档提交与测试产品 SHA 分开：`git log -1 --format=%H -- docs/v1.1-final/release/V11-WINDOWS-V1.1.0-RELEASE-HANDOFF.md`；运行时代码差异为 0。
- 同 SHA 的自动套件 114 文件、654 PASS / 2 SKIP，C1/W11 [分别成功](https://github.com/hhhzingy/AgentRouter/actions/runs/35949912060) / [成功](https://github.com/hhhzingy/AgentRouter/actions/runs/35949911914)。Pi、Kimi、DSH、Codex、ZCode 五家真实 DUT 的 Bootstrap、`42/PUBLISHED`、Artifact 哈希链均有本 SHA 的独立 PASS；不等于长期稳定或同一黄金链。
- ChatGPT Work Participant Join、读取显式输入 Artifact、提交网页 Result 已通过；实体手机 Tailscale HTTPS/WSS 经正确项目 scope 配对，Request Changes 最终在 Core 中确认为原 Result `PUBLISHED/REJECTED`、恰好一个后续 Task。后续新 Result 是原生 Codex Run，**不是网页 Participant 二次交付**。
- 真实 ZCode Run 上 Controller-attested Evidence 和 Request Changes 幂等通过。最终 ZIP 全新解包后 Core/SQLite/重启 smoke 与 Electron Projects/Workbench/Results/连接状态核对通过。
- 候选 ZIP：`release/AgentRouter-v1.1.0-windows-x64-a76ca27.zip`，SHA-256 `8f9e3241495cd0d62bab181cf724842229e4b82e899ede2d06b326d39b5c5410`。索引、publish refs 历史、包目录及解包目录敏感扫描均为 0 findings，仅对这些范围成立。

**未闭环：** 单一 `AR_V11_FINAL_*` 数据集的首个原生 Task 写入 Artifact 后未发布 Result；完整的同链黄金用户旅程与 Electron 全部关键动作仍为 `PARTIAL`。Codex→ZCode 完整历史迁移已由用户明确放到 V1.2，不能再算 V1.1 P1，也不能说已实现。签名安装器等按执行包延后。本轮未获 merge/tag/release 授权，也未使用 Codex reset credit；**不得上传候选 ZIP 为正式 GitHub Release**。
