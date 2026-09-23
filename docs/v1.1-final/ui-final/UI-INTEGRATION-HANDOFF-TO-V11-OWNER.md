# UI-INTEGRATION-HANDOFF-TO-V11-OWNER

> **2026-09-23 视觉终版重构最新交接（本节优先）**：下方原 20260922 交接保留作历史记录，所列 `a809417` 测试与打包证据不得复用于本轮 UI。当前状态是 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`。

## 本轮固定检查点

| 项目 | 值 |
|---|---|
| 唯一分支 | `feat/v1.1-ui-kimi`，未创建新分支 |
| 本轮源码/测试 SHA | `7779c15f8cf9365d6f18bc31de7e3b8f57026d1c` |
| VISUAL_FIXTURE 与本地 Core 证据提交 | `7cbed06`，16 张图，manifest `sourceSha=7779c15`、`sourceDirty=false`；新增 Managed/Web 向导和 Mobile Reply |
| Codex Core 对照 | `9794cdfc4ddf51de431f9e6ae069f3a4fec2d341`；仅审计 UI-facing 差异，未 merge |
| lane 状态 | `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION` |

## 安全扫描范围更新

Core 安全复核报告：普通分支、标签和远端 refs 的敏感扫描为 3470 blobs、0 findings，属于可发布引用范围；旧的“4 findings”不能用作该范围的结论。UIAI 在本机当前 worktree 执行 `node tools/check-sensitive.mjs --history`，该脚本使用 `git rev-list --objects --all`，包含仅本机的 `refs/codex/turn-diffs/checkpoints/*`；本次得到 3988 blobs、4 findings。两者扫描范围不同，交接中不再以旧 4 项阻断普通可发布引用；本地 checkpoint refs 例外仍按 Core 安全复核文档单独处理，UIAI 不重写历史。

## 已交付与验收边界

2026-09-23 再核验：基于 UI 源码/测试 SHA `7779c15`，直接 typecheck、lint、Unit 213/213、Contract+Chaos 70/70、UI 108/108、排除 DUT 的 Integration 209/209，以及 16 张 FIXTURE 的无横向溢出检查均通过。16 张截图仅为 `PREVIEW_MOCK`；`evidence/M00/desktop.png` 与 `M07/roles.png` 来自真实打包 Electron。

`f5614bb` 先完成全部 11 页 P0、10 维 CURRENT↔TARGET 审计，再进入代码。实现包括 Project Shell、Workbench 双栏、Projects 角色预览、Role 双栏、WorkSession transfer operation 查询、Connections 安全降级、Activity/Settings/Result 层级与 Mobile 介入优先顺序。逐页证据在 `visual-diffs/`，本轮没有页面被标为 PASS。

新增：Activity 业务事件默认优先、Results 全部/待验收筛选、Managed/Web WorkSession 入口分离、WAITING_INPUT 不确定提交防重发；Project Workbench 顶部移除重复 Core 徽标和原始路径；Slot 的 BOUND 改为中性“已绑定 · 在线未知”。当前 SHA 的 packaged Core smoke 与打包 Electron 本地窗口 smoke 已通过：产物 hash `b764b58afaf78da7a3ea7b3881e8d36e8f90ff10c3add44d7989ce4d00391bbc`，`sourceDirty=false`，覆盖真实本地 Core 连接、项目创建和控制租约。此测试不是完整 WorkSession/Remote/Mobile 验收。

历史 `pnpm typecheck` 依赖准备曾因 Visual Studio C++ Build Tools 缺失失败；本轮现有 `better-sqlite3` 可加载并完成打包，但没有重建依赖。DUT 仍缺 `DSH_BIN`；真实 WorkSession、Remote/Mobile、Electron DPI 与屏幕阅读器未在当前 SHA 重跑。

## 需总负责人协调

1. 将 `UI-CONTRACT-GAP-001/002/003/004` 分给 Core/合同负责人，尤其 New WorkSession 容量/压缩、Result Evidence 与 Request Changes 反馈闭环。
2. UIAI 继续完成 11 个 P0 的逐页视觉与交互收敛，特别是真实 WorkSession、Web Participant、Task/Result、Activity、State Library、Mobile Reply/Controller。
3. 基于当前或更新后的单一源码 SHA 补 V8/V9 的真实 WorkSession、Remote/Mobile、DPI 和 Windows 屏幕阅读器检查；当前打包与本地 Core smoke 可作已完成证据。
4. 合流只能由 V1.1 总负责人在 Windows RC 集成车道决定。UIAI 不自行 merge main、tag 或 release。

## 以下为 20260922 历史交接（不得用于本轮 PASS 判定）

以下关于“全历史 4 项”的旧表述基于当时含本机 Codex checkpoint refs 的扫描范围；当前普通可发布引用范围以本文件上方“安全扫描范围更新”为准。

## Fixed identity

- UI branch: `feat/v1.1-ui-kimi`
- UI Base: `89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- Starting handoff: `9e7388b985f5af2928e6b5c30f60d8039ac9804e`
- Tested source: `a809417d33e900598a90ac49f3a74aee56bb34c8`
- Evidence commit: `3e924b4fd0d1b08aea36ca360d412482634bbf05`
- Source dirty at evidence generation: `false`
- Node / pnpm: `v24.14.0` / `11.19.0`

## Final UI SHA and branch

Fetch `origin/feat/v1.1-ui-kimi`。产品源码与所有自动化测试的固定 SHA 是 `a809417d33e900598a90ac49f3a74aee56bb34c8`；最终截图/J2 证据固定在 `3e924b4fd0d1b08aea36ca360d412482634bbf05`。

## Last compatible Codex SHA

- inspected: `3e4df007f6fe2b65acd74792d2eaba0e01a2ad48`
- merged: none
- 审计结论：相对 UI Base 仅 docs-only delta，无 UI-facing contract/projection 变化。

## UI Contract Changes consumed

无 `UI-CONTRACT-CHANGE-*`。

## Unresolved Contract Gaps

- `UI-CONTRACT-GAP-001`：Slot / Participant binding 缺 display-safe 摘要。
- `UI-CONTRACT-GAP-002`：Result 缺 structured Evidence projection。
- blocker classification: additive Core contract gaps，当前 UI 已用 UNKNOWN/Unavailable 安全降级，它们不是本次安全门禁失败的原因。

## Pages/components delivered

- Global Shell：Projects / Connections / Settings，Desktop sidebar，Mobile bottom nav。
- Design System：semantic tokens、浅/深主题、Section/Banner/IconButton/SegmentedControl。
- Desktop：Home、Workbench、Role Detail、WorkSession、Task Composer、Activity、Results/Evidence、Project/Global Settings、Connections。
- Mobile：Home、Activity、Results、More、Controller、WAITING_INPUT、Result review、offline/stale。

## Test/evidence table

| Gate | Status | Evidence |
|---|---|---|
| typecheck / lint | PASS | final command logs |
| Unit | PASS | 41 files / 213 tests |
| Integration | PASS | 49 files / 212 tests |
| Contract + Chaos | PASS | 9 files / 70 tests |
| UI | PASS | 13 files / 108 tests |
| J2 Electron | PASS | `evidence/J2/desktop.json`, 19 checks |
| Packaged smoke | PASS | `evidence/M00/desktop.json` + packaged report |
| Current index secret scan | PASS | 2159 files, 0 findings |
| Full-history secret scan | BLOCKED | 4 legacy `.local-protected` objects |
| Screen reader spot check | NOT_RUN | Windows Narrator 不可靠自动化 |

## Packaged Electron

- path: `release/AgentRouter-j3-a809417d33e9-18ee8534-b2af-4f7f-8005-bac471fa7c6a`
- SHA-256: `56f159d94f55818777fc85d2cea2ad014b7fcebf0edbaedf317338796a6744c7`
- source SHA / dirty: `a809417d33e900598a90ac49f3a74aee56bb34c8` / `false`
- Desktop smoke 和 packaged smoke 均 PASS。

## Real Local/Remote/Mobile

- Local Core + Electron: PASS。
- Packaged Remote Core: PASS（1/1）。
- Mobile browser: PASS（1/1）。
- ZCode isolated list: NOT_RUN（2 skipped，环境条件不满足）。
- 真实 Harness support 为 0，不得扩大解读为五 Harness RC PASS。

## DPI/a11y

- 125/150/200% Electron zoom PASS；390/430 mobile 宽度 PASS；9 张截图无水平溢出。
- Keyboard/focus restore、抽屉背景 inert、token contrast >= 4.5、accessible names PASS。
- 真实 screen-reader spot check NOT_RUN，集成前需手工补做。

## Owned file map

- Renderer: `apps/desktop/workbench.css`, `workbench.tsx`, `pages-project.tsx`, `pages-role.tsx`, `pages-settings.tsx`, `shell.tsx`.
- Shared/mobile: `packages/ui/primitives.tsx`, `packages/remote/console.html`.
- Tests/tooling: `tests/ui/v11-uiai-design-system.test.tsx`, `tests/e2e-ui/v11-uiai-shoot.mjs`, `tools/check-sensitive.mjs`.
- Docs/evidence: `docs/v1.1-final/ui-final/*`, `evidence/J2/*`, `evidence/M00/*`, `evidence/M07/roles.png`.
- Core-owned domain/runtime/transport 没有被 UIAI 修改。

## Conflict hotspots

- `apps/desktop/workbench/shell.tsx`：正确并集是保留 Projects/Connections/Settings 三个全局入口、连接/控制身份和 mobile nav。
- `apps/desktop/workbench.css`：保留 semantic tokens、dark theme、responsive 断点和 200% zoom 无溢出。
- `apps/desktop/workbench/pages-project.tsx`：保留四主入口、设置分类和不误导的 Harness/Model 文案。
- `apps/desktop/workbench/pages-role.tsx`：保留单一 h1、默认可见 Conversation、UNKNOWN 对账和历史 WorkSession 只读。
- `packages/remote/console.html`：保留 Controller lease 语义、Result accept/reject 真实 mutation 与 offline/stale 安全降级。

## Recommended merge order

1. 不要直接合入 `main`；先由仓库负责人处置/确认 4 个历史敏感对象并补做 screen-reader spot check。
2. 创建或更新 `integration/v1.1-windows-rc`。
3. 合入 Codex final checkpoint，再合入 `feat/v1.1-ui-kimi`。
4. 按上述 hotspots 保留语义并集，重跑全部 RC gates。
5. 仅在历史安全门禁、screen reader 和其余 Windows RC 门禁通过，且用户明确批准后，才可 main/tag/release。

## RC rerun commands

```powershell
node tools/generate-client-contract.mjs --check
node tools/check-client-freeze.mjs
node tools/generate-client-c1r1.mjs --check
node tools/check-client-c1r1-freeze.mjs
node tools/generate-client-p1.mjs --check
node tools/check-client-p1-freeze.mjs
node tools/check-sensitive.mjs --staged
node tools/check-sensitive.mjs --history
node node_modules/typescript/bin/tsc --noEmit
node tools/lint.mjs
node node_modules/vitest/vitest.mjs run tests/unit tests/integration tests/contract tests/chaos tests/ui
node tools/build-w11.mjs
node tools/test-j2-desktop.mjs
node tools/build-win.mjs
node tests/e2e-ui/v11-uiai-shoot.mjs
```

## Remaining non-UI blockers

- 全 Git 历史 4 个敏感规则命中对象；需仓库负责人确认是否轮换凭据并授权历史重写。
- 真实 Windows screen-reader spot check 未执行。
- 最新 Codex checkpoint 仍记录 ZCode Provider Registry、Pi Level B、Web Participant、HTTPS/WSS、signed installer、CI/release 未完成；集成负责人必须重新核对最新状态，不可把本文当成发布 PASS。

## Final UI lane status

`UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`

本状态仅表示 UI lane 因安全和 a11y 门禁尚未允许合流；禁止写成 `V1.1_WINDOWS_RC_READY`。
