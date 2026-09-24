# V1.1 Branch Map

| 分支 | 定位 | 状态与规则 |
|---|---|---|
| `main` | 稳定发布线 | **STABLE ONLY**；UI Base 不 merge main。 |
| `feat/v1.1-final-cursor-win` | Codex 主责 Core、功能、测试与最终 Windows 收口 | **ACTIVE**；名称含 cursor 但不改名。 |
| `feat/v1.1-ui-kimi` | Kimi 后续 UI/UX/Desktop Renderer/Mobile interaction | 从最终回报中的完整 `UI_BASE_SHA` 创建；当前不由本任务创建。 |
| `integration/v1.1-windows-rc` | 后续 Core + UI 最终组合候选 | 只有门禁满足后使用；当前不是 RC。 |
| `integration/v1.1-cross-platform` | Linux integration 历史/后续参考 | **REFERENCE**；不是当前 Windows UI Base。 |
| 其它旧分支 | 历史实现与证据 | **FROZEN / REFERENCE**；除非明确需要，不继续开发。 |

## 同步方向

Codex Core checkpoints → Kimi merge forward。不要在两个活动分支间随意互相 cherry-pick。

UI Base 后，Kimi 是 `apps/desktop/workbench/**`、renderer/store UI projection、Mobile/Web visual interaction 的主要修改者。Codex 若必须改变 UI-facing contract，应先在 Core 分支完成 schema/test，再新增 `UI-CONTRACT-CHANGE-<N>.md`，说明旧/新合同、原因、migration/UI 影响、需同步 commit SHA 与 breaking 性质。若必须修改同一 UI 文件，单独提交并标记 `KIMI_SYNC_REQUIRED`。

## Kimi 建分支指令

必须从最终回报给出的完整 `UI_BASE_SHA` 创建 `feat/v1.1-ui-kimi`。不要从 `main`、`feat/ui-ux-spec`、`feat/v1.1-final-windows-mobile`、`integration/v1.1-cross-platform` 或其它旧分支开始。
