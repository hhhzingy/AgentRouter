# AgentRouter V1.1.0 Windows 发布前交接

**当前裁决：`V1.1_WINDOWS_RELEASE_CANDIDATE_READY`。** 这是候选包准备完成，不是已经 merge、tag 或发布 GitHub Release；三个动作仍等待用户最终批准。完整事实见 [最终产品复核](V11-FINAL-CANDIDATE-268FC71-20260924.md)，机器状态见 [门禁矩阵](V11-FINAL-GATE-MATRIX.json)。[此前受阻阶段复核](V11-FINAL-CLOSEOUT-20260924.md) 保留为历史失败证据，不代表现况。

- `FINAL_PRODUCT_SHA`：`268fc71e81c2956ed1eeabf75df6389934836c09`；分支 `codex/v1.1-core-ui-candidate`，工作树 `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate`，产品提交已推送 GitHub。
- 文档提交与测试产品 SHA 分开：`git log -1 --format=%H -- docs/v1.1-final/release/V11-WINDOWS-V1.1.0-RELEASE-HANDOFF.md`；运行时代码差异为 0。
- 同 SHA 全量自动测试 117 文件 PASS、4 文件 SKIP；661 项 PASS、7 项 SKIP。[C1 成功](https://github.com/hhhzingy/AgentRouter/actions/runs/35966426039)、[W11 成功](https://github.com/hhhzingy/AgentRouter/actions/runs/35966426017)。Codex 在本 SHA 的独立真实 DUT Bootstrap、`42/PUBLISHED`、Artifact 哈希链 PASS；ZCode 在同项目黄金链本 SHA 的真实 Artifact→Result PASS。Pi/Kimi/DSH 沿用 `a76ca27` 的真实证据：此次变更未触及其 adapter/profile/native runtime，自动回归未发现退化。
- ChatGPT Work Participant 与实体 iPhone Tailscale HTTPS/WSS 的既有真实 PASS 沿用，不重复人工测试；不得把手机 follow-up 的原生 Codex Result 称作网页 Participant 二次交付。
- 同项目黄金链 `AR_V11_FINAL_20260924_141100`：Codex Bootstrap→真实 Artifact→PUBLISHED Result；解包 Electron 实际查看 Role/Result Detail 并 Request Changes→恰好一个 follow-up；Electron 新建 ZCode W2（Start blank）→真实 ZCode Artifact/Result；Core 冷重启后 ZCode W2 ACTIVE、Codex W1 ARCHIVED/只读，三个 Result 仍 PUBLISHED。Codex 初段在 `10b5136` 上执行；只改桌面/远程 P2 兼容的本 SHA 上完成后段与重启，并另做本 SHA 独立 Codex 原生回归。不得宣称整条链从头到尾同一 SHA。
- 候选 ZIP：`release/AgentRouter-v1.1.0-windows-x64-268fc71.zip`，200110621 字节，SHA-256 `6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604`。Manifest `sourceDirty=false`，目录包 `artifactHash=ccfff04e5cb60b53f8d5ef712ed8446dc2f0b03cfc43acfb0c5547975b5ad303`。目录包与 fresh unpack 的 packaged smoke、历史及包敏感扫描均 PASS，扫描范围内 0 findings；这不是签名安装器。

**边界：** 旧 `BOOTSTRAP_ACK_MISSING` 单链失败、沙箱 `RPC_NATIVE_REJECTED`、误用不存在 DUT 根的首跑失败都留在失败分母，不因旧对象仍存在而阻止本次候选裁决。Codex→ZCode 完整历史迁移属于 V1.2；签名安装器等按执行包延后。未使用 Codex reset credit。**未经用户最终批准不得 merge main、tag 或创建 GitHub Release。**
