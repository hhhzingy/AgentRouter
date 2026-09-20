# V11 Final Windows RC — 固定源验收

- 规范源 SHA（canonical Windows）：`16598f621d7160627ce769ecafb8d14ab55399f4`
- 已提交证据 HEAD：`ed78235f6459594d139de98fa8f2978e2ccc55c8`
- 工作树：`E:\AgentRouter\.worktrees\v1.1-final-cursor-win` · `feat/v1.1-final-cursor-win`（本文生成时跟进 diff 待提交）
- 完整复核：`docs/v1.1-final/V11-WRAP-REVIEW-20260920.md`
- 状态：**`AUTO_SCOPE_DONE_WITH_BLOCKERS`**
- 未发出：`V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE`
- 未授权：merge `main` / tag / release

## 已完成

- C0–C11 控制面提交（C0 基线 → C11 记录）。
- Cursor Management MCP：IDE 已 Enable；现场 `CONNECTED_OBSERVER` / health OK；不是 Role。
- 手机 Tailscale HTTP+WS 配对成功（观察者，`ACTIVE`）。
- 最小 Level A：pi（百炼）、Kimi（百炼）、Codex（隔离 DUT）、DSH（DeepSeek flash）均为 `PASS_TASK_AND_BOOTSTRAP`（`42`/`PUBLISHED`）。

以上四个 live PASS 都是 `dirty_source=true`；其中 Pi 报告来自 `bbed011`，另外三项来自 `ed78235`。它们是最小路径证据，不是 docs/12 要求的同一干净候选 SHA 验收。

## 精确阻断

1. 同一干净候选 SHA 全量复测未跑；现有四个成功 live report 均为 dirty，且 Pi 来自较早 SHA。
2. ZCode 隔离 OAuth 登录已成功，但真实 Level A 仍未过；最后一次 live 精确失败为 `NATIVE_ZCODE_MODEL_SELECTION_REQUIRED`。字段透传已修并通过离线回归，尚未再做 live 复证。
3. docs/07 Artifact 工程链与 Level B 真机未跑（现有 live 仍是 42 文本路径）。
4. ChatGPT Web Participant 本固定 SHA 真机 Join/结果环未跑。
5. Remote HTTPS+WSS 未跑；Electron unpacked 工程包 Core/UI 冒烟已过（dirty source），安装器签名、安装/升级仍未跑。
6. GitHub CI 基础设施阻断。
7. 本文生成时 C11 后跟进 diff 尚待提交；本地身份目录与 `.cursor/mcp.json` 明确排除。

## 保护约束

- Cursor 只作为 `mcp_management_cursor`。密钥未进仓库/对话。未 merge / tag / release。
