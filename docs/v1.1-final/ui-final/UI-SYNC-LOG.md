# UI Contract Sync Log

## 2026-09-22

- UI 起始 SHA：`9e7388b985f5af2928e6b5c30f60d8039ac9804e`
- 已 fetch Codex 分支：`origin/feat/v1.1-final-cursor-win`
- 固定 Codex SHA：`3e4df007f6fe2b65acd74792d2eaba0e01a2ad48`
- 相对 UI Base `89a41b5e...` 的差异：仅两份 RC/复核文档。
- `UI-CONTRACT-CHANGE-*`：未发现。
- UI-facing contract/projection 变化：无。
- 决策：不 merge、不 cherry-pick；继续记录 `UI-CONTRACT-GAP-001/002`，缺失投影显示 UNKNOWN/Unavailable。
- 验证：全仓 typecheck、lint、UI/unit/contract 通过；integration 210/212，通过项之外的两项因测试 Core 未产生 endpoint（原生 SQLite 环境失败）阻断。
