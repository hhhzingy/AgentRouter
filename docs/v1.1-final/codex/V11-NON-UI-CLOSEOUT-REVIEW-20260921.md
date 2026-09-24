# AgentRouter V1.1 非 UI 最终收尾复核（2026-09-21）

分支：`feat/v1.1-functional-closeout-codex`
功能候选：`82195197c4c994a82147026df23cd83401d9112c`
远端：`origin/feat/v1.1-functional-closeout-codex` 已同步
结论：`NOT_V1.1_NON_UI_FUNCTIONAL_RC_READY`，更不能宣称 Windows RC。

## 1. 本轮新增完成项

1. Codex 官方 app-server 裸协议双进程 start/resume PASS；
2. Codex Router Level A、marker、TaskInput、cancel 分项 PASS，真实登录隔离 DUT PASS；
3. ZCode 0.16.9 resume/replay/workspace/safe diagnostics 已按官方源码对齐；
4. Pi/Kimi/DSH 在 clean SHA 各一组百炼 `qwen3.8-flash` 定向回归 PASS，历史失败分母保留；
5. 网页 ChatGPT `AgentRouter` 插件完成真实 Participant Task→Artifact→Result→`PUBLISHED`；
6. 修复 Artifact 文件先落盘、DB 后失败留下孤儿文件的问题，并证明不误删共享 blob；
7. clean `8219519`：112 files PASS / 1 skipped，625 tests PASS / 2 skipped；
8. Windows package、ZIP、解包 smoke、secret scan PASS；
9. 新增严格 `--package` Harness runner，并从 ZIP 新解包目录完成真实 Pi+百炼 `42/PUBLISHED`；
10. 所有源码/测试工具提交均已推送 GitHub；没有 merge、tag、release。

## 2. Release Gate 审计

| Gate | 状态 | 结论 |
|---|---|---|
| G1 Codex | OPEN | Level A 与多数 Level B 分项通过；最近一次 clean Core-restart 复测在 Bootstrap 被官方 `CODEX_USAGE_LIMIT_EXCEEDED` 阻断，用户指示先跳过后续 Codex 测试，完整 cold resume 未闭环 |
| G2 ZCode | BLOCKED | 官方 hosted app-server 需要外部 Host Account Overlay/runtime headers；AgentRouter 无官方 broker，不能复制客户端私有认证或用 Managed Provider 冒充 |
| G3 Kimi/DSH/Pi | PASS | clean targeted regression PASS，Pi ZIP 解包态百炼 smoke 也 PASS |
| G4 Participant/Remote | PARTIAL | 网页 Participant 真实闭环 PASS；Tailscale Serve 未启用，HTTPS/WSS backend 未实测 |
| G5 Data/Recovery | PARTIAL | migration、backup、DB integrity、fault 自动门通过；最终 owned cleanup 要在全部真实 Gate 冻结后执行 |
| G6 Package/CI | PARTIAL | package/unpack/secret/Pi smoke PASS；Codex/ZCode package smoke未过；C1/W11 `steps=[]` failure，无 waiver |

## 3. Codex 最终事实

已通过：

- 官方 app-server initialize → thread/start → turn/completed；
- 新 app-server thread/resume，同一 thread 第二轮；
- Router Bootstrap；
- Level A input/output Artifact + hash + `PUBLISHED`；
- 同 ACTIVE WS/thread marker；
- WAITING_INPUT/TaskInput；
- cancel；
- 现有登录账号隔离 DUT。

未通过：

- 完整 Core restart → 新 app-server → 同 thread resume → 不重复 marker 仍回忆。

最新唯一有界复测：

- DUT：`.local/j3-production-pi/run-vEDR3m`；
- source：`fca0665` clean；
- 原生 session ref 已创建；
- Bootstrap delivery：`FAILED / CODEX_USAGE_LIMIT_EXCEEDED`；
- application audit：`NATIVE_CODEX_USAGE_LIMIT_EXCEEDED`；
- Core 退出屏障：PASS；
- 没有进入 restart；
- 未使用 Codex reset credit；
- 用户已指示先跳过 Codex 测试，因此没有再次登录或重刷。

诊断修复 `fca0665` 只映射官方 `codexErrorInfo` discriminator，不保存错误正文或附加详情；未知形状仍折叠为泛化安全码。随后 `8219519` 将登录、identity seal 与 runner 的受保护 DUT 默认路径统一为 `.local-protected/codex-dut/dut-fj`。因此 G1 保持 OPEN，但失败原因已从不可解释的泛化码收窄为账号额度状态。

## 4. ZCode 最终事实

本机实际 ZCode `0.16.9`，上游 pin `zai-org/ZCode@872ad960...`。

已修正：

- 有 native ref 走 `session/resume`；
- `session/subscribe` 使用 `afterSeq`；
- replay 只提升水位，不污染新 Run；
- workspace 使用 Role resolved workspace；
- safe structured reason。

Existing Account 的官方边界：

- app-server 是 hosted account 模式；
- 需要外部 Host 调用 `provider/updateAccountConfig`；
- 每次请求还要处理 `interaction/requestProviderRuntimeHeaders`；
-登录客户端本身不是可复用的公开 Host broker。

准确状态：`BLOCKED_BY_UPSTREAM_ACCOUNT_HOST_CONTRACT`。
用户指定 Bigmodel / `GLM-5.3-Flash` 没有被 Managed Provider 或百炼备选替代为 PASS。

## 5. Participant / Remote / Package

Participant 详见 [FUNC-F4-PARTICIPANT-REMOTE-20260921.md](./FUNC-F4-PARTICIPANT-REMOTE-20260921.md)。

Release engineering 详见 [FUNC-F6-RELEASE-ENGINEERING-20260921.md](./FUNC-F6-RELEASE-ENGINEERING-20260921.md)。

最终候选 ZIP：

`E:\AgentRouter\.worktrees\v1.1-functional-codex\release\AgentRouter-j3-82195197c4c9.zip`

SHA-256：

`3fc58163bdf13d78b96c8d8a8da9ccfd271719d2f4f6afc78bbc5016414f1aac`

## 6. 需要外部决策/状态变化的三项

1. Tailscale 管理面启用 Serve，才能继续真实 HTTPS/WSS Remote；
2. ZCode 官方提供/批准可支持的外部 Existing Account Host contract，或总负责明确改变产品验收口径；
3. GitHub C1/W11 恢复实际 runner steps 并同 SHA green，或用户书面批准一次 infrastructure waiver。

Codex G1 已获得可解释的额度失败码；按用户指示暂停 live 测试，待使用有额度账号时再完成一次 Core restart continuity。

## 7. 禁止扩大声明

- 不输出 `V1.1_NON_UI_FUNCTIONAL_RC_READY`；
- 不宣称 Windows RC；
- 不把本地 625 tests PASS 写成 GitHub green；
- 不把 OpenAI Secure MCP Tunnel 当作 Tailscale HTTPS/WSS；
- 不把 Managed Provider/百炼备选当作 ZCode Existing Account；
- 不 merge main/UI，不 tag，不 release。

## 8. GitHub 提交状态

截至本文编写前，功能代码和测试工具已推送到：

`origin/feat/v1.1-functional-closeout-codex@82195197c4c994a82147026df23cd83401d9112c`

本文及分项复核文档作为证据提交后，远端分支会产生一个 docs-only 后继 SHA；运行时代码候选仍固定为 `8219519`，package manifest 也固定指向该 SHA。
