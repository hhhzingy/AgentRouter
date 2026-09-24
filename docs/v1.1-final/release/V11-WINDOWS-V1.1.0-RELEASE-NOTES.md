# AgentRouter V1.1.0 Windows Release Notes

`Tested product SHA=268fc71e81c2956ed1eeabf75df6389934836c09`。V1.1.0 Windows 候选通过已约定的发布前门禁；[C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35966426039) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35966426017) 均在该产品 SHA 成功。发布文档晚于受测产品代码提交；GitHub Release 正文另列实际 `Release docs commit`，并明确 `Runtime diff=none`。

## 下载与校验

- Portable ZIP：`AgentRouter-v1.1.0-windows-x64-268fc71.zip`，200110621 字节。
- SHA-256：`6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604`。
- 已验证该现有 ZIP 的 fresh unpack、生产 Core/SQLite/命名管道/Project 持久化与重启 packaged smoke。包 manifest 的 `sourceDirty=false`；`CANDIDATE_NOT_CERTIFIED` 表示开发机 portable 候选范围，不是签名安装器或干净目标机全面认证。

## 已验收的 V1.1 边界

- 新同项目 Golden Flow：Codex Bootstrap→真实 Artifact→Result；解包 Electron 的 Role/Result Detail、Request Changes 与唯一 follow-up；`Start blank` 创建 ZCode `GLM-5.3-Flash` 新 WorkSession→真实 Artifact/Result；Core 重启后新会话 ACTIVE、旧 Codex 会话 ARCHIVED/只读。完整阶段和跨 SHA 限制见 [黄金链复核](V11-FINAL-GOLDEN-FLOW.md)。
- Codex 和 ZCode 有最终产品 SHA 的真实 Harness 验收；Pi、Kimi、DeepSeek Harness（DSH）沿用 `a76ca27` 的真实 Artifact→Result 证据，因为后续差异不触及其 adapter、profile 或 native runtime，且最终 SHA 自动回归通过。短时真实测试不等于长期稳定性认证。
- ChatGPT Work 网页 Participant 与实体 iPhone Tailscale HTTPS/WSS 的既有真机/网页验收 PASS 沿用；未重复这些人工测试。
- ZIP、解包目录和发布 refs 历史的既定敏感扫描范围内 0 findings；不推论本机私有 refs、不可达对象或其他未扫范围绝对无凭据。

## 已知延期与不包含的能力

- **Codex→ZCode 完整历史迁移属于 V1.2**。V1.1 的上述换 Harness 使用 `Start blank`；不要解读为跨 Harness 全历史保真迁移。
- 不含 signed installer。完整 Windows Narrator、11 页人工视觉矩阵、全面 DPI/主题、干净卸载矩阵及 Linux 收口按既定计划延后；账号切换不在本次验收范围。
- 旧测试对象的 `BOOTSTRAP_ACK_MISSING`、沙箱/配置首跑失败保留在失败分母；新黄金链和最终产品 SHA 回归通过不抹去这些历史事实。详见 [最终候选复核](V11-FINAL-CANDIDATE-268FC71-20260924.md)。
