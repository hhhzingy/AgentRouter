# AgentRouter V1.1 Windows 功能收口 N0 基线

日期：2026-09-21
状态：`N0_BASELINE_RECORDED`；不是 Windows RC

## Git 与所有权

- 功能工作树：`E:/AgentRouter/.worktrees/v1.1-functional-codex`
- 功能分支：`feat/v1.1-functional-closeout-codex`
- 基线 HEAD：`3e4df007f6fe2b65acd74792d2eaba0e01a2ad48`
- UI Base：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- 祖先校验：UI Base 是本基线祖先（PASS）
- 创建时工作树：clean；主目录 `E:/AgentRouter` 不作为本轮源
- UI/UX 所有权：Kimi/UI 分支；本分支只负责 Core、协议、存储、Harness、MCP、Remote、安全、测试与可靠性。后端合同变化必须形成 `UI_CONTRACT_DELTA`。
- 未授权：merge main、tag、release。

## 已核实的基线能力

- migrations `001`—`017` 已纳入冻结清单，`tools/check-migrations.mjs` PASS。
- F01/F02/F03/F04/F05/F07/F09/F10/F11 已有代码修复及自动测试 checkpoint；F06/F12/F13/F14 已有闭环证据。
- Slot / Binding / Identity / Participant、Management MCP、Remote、固定规模与本地包均有自动 DUT 或静态证据。
- Cursor 是 Management MCP client，不是 Role；观察者 DUT 已通过。
- Pi、Kimi、DSH 与 Codex 有历史 Level A Artifact PASS，但证据不全在同一干净 SHA；ZCode 未通过。

## N0 仍不允许提升的结论

- 五 Harness 同一干净 SHA 的 Level A + Artifact + Level B 矩阵未完成。
- Web ChatGPT Participant 真实 Join/Identity/claim/artifact/result/downstream 未在本基线复测。
- Remote HTTPS/WSS、真实 revoke existing stream、Electron 安装/升级、CI 未闭环。
- Context Transfer 的生产 Harness 能力与跨 Harness receipt/保真度未形成完整真实证据。
- ZCode Bigmodel/GLM-5.3-Flash 已登录桌面，但 CLI provider registry 未授权可用模型；不得记 PASS。
- Pi 新 WorkSession 曾出现 native open `ENOENT`；Level B 不得记 PASS。

## 保护规则

- 不修改 `89a41b5` UI Base 历史，不重置/覆盖 UI 工作树。
- 不触碰用户生产 HOME、旧会话、旧项目、认证文件；真实测试只建新对象。
- 百炼 key 只经受信 loader 读取，不进入 Git、Prompt、日志、截图或命令行。
- 不使用 Codex reset credit。
- UNKNOWN / NOT_RUN / BLOCKED 保持原值，不以自动测试或声明替代真实 DUT。

后续按 N1→N10 连续执行；最终只有 `docs/12_ACCEPTANCE_AND_RC_GATE.md` 全部满足才可报告 Windows RC ready。
