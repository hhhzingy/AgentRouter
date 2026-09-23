# UI-INTEGRATION-HANDOFF-TO-V11-OWNER

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
