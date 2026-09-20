# AgentRouter V1.1 UI Base Checkpoint

## UI Base Identity

- branch：`feat/v1.1-final-cursor-win`
- source SHA（受测代码基线）：`7a366ad8a882433c4881f6064e7c640ed3eb19f8`
- source parent：`7a0f77c`
- UI_BASE_SHA：本文件所在的最终 checkpoint commit；完整 40 字符 SHA 由 `git rev-parse HEAD` 在提交后产生，并在最终回报与远端校验中给出（Git commit 不能在自身内容中自引用自己的 SHA）。
- timestamp：`2026-09-20T21:22:57+08:00`
- worktree：`E:\AgentRouter\.worktrees\v1.1-final-cursor-win`
- remote branch：`origin/feat/v1.1-final-cursor-win`
- clean status：提交并推送后必须由 `git status --porcelain` 验证为空。
- 性质：逻辑 UI 合同 checkpoint，不是 tag、RC 或 release approval。

## Product Semantic Baseline

- Role 是长期职责；WorkSession 是具体上下文；Slot 是规划/Join 位置；Binding 是实际 Participant/Harness 与 WorkSession 的可信绑定。
- historical WorkSession 永久只读；不得重新激活。
- Task、Run、Result、Artifact 是不同对象，状态与验收含义不可混淆。
- Cursor Management MCP 不是 Role；Participant MCP 才按 Role 加入。
- 同一 ACTIVE WorkSession 不偷偷更换 Harness/native session；Context 只在新 WorkSession 做一次 transfer。
- 详细字段与 UI 处理见 [UI-CONTRACT.md](./UI-CONTRACT.md)。

## UI-facing Contracts

稳定：C1R1P1 `CoreHelloVM`、`SnapshotVM` 中的 Project/Space/Role/Task/Run/Issue/Approval/Result，Artifact 分页类型，连接态、controller lease、capability 原值与历史 WorkSession 只读语义。

PROVISIONAL：WorkSession 扩展 ViewModel、Slot/Participant Binding 主投影、独立 TaskInput、Context Transfer detailed stages、participant session correlation、ZCode warm support、effective model provenance、DSH/ZCode 对旧冻结 Harness 枚举的兼容投影。所有 optional/null/UNKNOWN 必须显示为未知或未提供，不能推断成功。

## Existing UI Implementation

- 入口与边界：`apps/desktop/main.ts`、`preload.ts`、`renderer.tsx`、`workbench.tsx`、`workbench.html`；renderer 禁用 Node，调用经 preload/Core session。
- 数据层：`apps/desktop/workbench/store.tsx` 是唯一 Core 会话入口，消费 snapshot + 事件触发刷新，维护 controller lease、只读态、identity-bound pending mutations；不维护第二套业务状态机。
- 页面：`pages-home.tsx`、`pages-project.tsx`、`pages-role.tsx`、`pages-roleplan.tsx`、`pages-reconfigure.tsx`、`pages-remote.tsx`、`history.tsx`。
- 组件与交互：`composites.tsx`、`command-button.tsx`、`pending-panel.tsx`、`role-editor.tsx`、`task-editor.tsx`、`safe-text.tsx`、`shell.tsx`。
- Mobile/Web console：现有 Desktop workbench 提供响应式页面与 Remote 页面；真实移动浏览器已有 HTTP+WS/Tailscale observer 历史与自动视口证据，但 HTTPS+WSS 未验证。
- 当前程度：Project/Role/Task/Result/Activity/Needs Attention、Role Plan、Remote pairing、controller/observer/read-only 与 pending mutation 已有实现；WorkSession/Slot/Participant/Context Transfer 仍需依照 PROVISIONAL 扩展完善 UI。

## Current Capability Truth

以下是创建 UI Base 时的真实证据层，不因 UI 需要绿色而升级：

| Harness | Level A | Artifact | Level B / WAITING_INPUT / warm | 证据结论 |
|---|---|---|---|---|
| Pi | PASS（历史干净 SHA） | PASS：`9fb6a95/run-TioZFo` | FAIL/BLOCKED：新 WorkSession native open `ENOENT`；真实五 Harness WAITING_INPUT/cancel/restart-resume 未闭环 | PARTIAL，非当前同一 SHA 全矩阵 |
| Kimi | PASS（历史干净 SHA） | PASS：`9fb6a95/run-C0Ye3r` | NOT_RUN/UNKNOWN | PARTIAL |
| DSH | PASS（历史干净 SHA，百炼 qwen3.8-flash） | PASS：`0050c1b/run-L5gPEY` | NOT_RUN/UNKNOWN | PARTIAL |
| Codex | PASS（自然额度恢复；未用 reset credit） | PASS：`run-K3FTGr`，当时 dirty source；修复已提交为 `7a0f77c`，尚待干净 SHA live 复测 | Level B NOT_RUN | PARTIAL |
| ZCode | FAIL | NOT_RUN | NOT_RUN/UNKNOWN | 隔离桌面已登录 Bigmodel 并选 `GLM-5.3-Flash`，但 CLI provider registry 仍 `entitled:false`、Level A Bootstrap FAILED；百炼 qwen3.8-flash 仅是显式备选，未证明自动回退 |

Context export/import：自动 contract/fault 路径有覆盖；各 Harness 的生产 capability/保真度矩阵未闭环。Capability UI 必须显示实际 `VERIFIED/IMPLEMENTED_UNVERIFIED/UNSUPPORTED/UNKNOWN`。

## Known Backend Gaps

- 同一干净候选 SHA 的五 Harness Level A/Artifact/Level B 完整矩阵。
- ZCode Bigmodel CLI entitlement/受管链；百炼 qwen3.8-flash 显式备选链；禁止 UI 模拟为自动回退。
- Pi Level B 新 WorkSession `ENOENT`、五 Harness marker/WAITING_INPUT/cancel/restart-resume。
- 当前固定 SHA 的 Web ChatGPT Participant Join/Identity/Artifact/Result 与 Cursor controller 全链。
- Context production ports、真实 capability/保真度、Participant session correlation。
- Remote HTTPS+WSS 真机；当前只可陈述 HTTP+WS/Tailscale observer 历史。
- signed installer 安装/升级、GitHub CI、merge/tag/release。
- 完整 Artifact 跨 Harness 工程链和同 SHA 干净复测。

详见 [UI-KNOWN-GAPS.md](./UI-KNOWN-GAPS.md)。这些由 Codex 负责，Kimi 不进入 Core/migration 补业务。

## UI Ownership Boundary

Codex 主责：`packages/core-service/**`、`packages/runtime/**`、`packages/storage/**`、protocol/contracts、Management MCP、Participant MCP、Remote security/gateway、Harness drivers/native lifecycle、Context Transfer、Role/WorkSession/Slot/Binding、Task/Run/Result/Artifact、permissions/auth/leases、migrations、DUT/production tests、packaging correctness、real environment validation、RC/release gates。

Kimi 主责：`apps/desktop/workbench/**`、Desktop renderer、Workbench pages、Role/WorkSession UI、Task composer、Result/Activity/Needs Attention、Remote identity、Mobile/Web visual interaction、responsive layout、dialogs/sheets/drawers、CSS/visual design、empty/loading/error、copywriting、accessibility、interaction/screenshot tests。

共享敏感边界：`apps/desktop/workbench/store.tsx` 与 Core/API→UI ViewModel adapter。UI Base 后原则上 Kimi 成为 renderer/store UI projection 的主要修改者；Core 合同变更走 `UI-CONTRACT-CHANGE-<N>.md`，同文件关键修复单独提交并标 `KIMI_SYNC_REQUIRED`。

## Dirty Files Disposition

UI Base 前的 dirty 文件均分类为 E（可复现临时/重复生成 evidence）：

- `evidence/M00/desktop.json`：`tools/desktop-test.mjs` 覆写；新内容无 source SHA、无当前文档引用，恢复到已提交版本。
- `evidence/M00/desktop.png`：与下项内容 SHA256 完全相同，不能同时证明不同验收点；无固定 source SHA，恢复到已提交版本。
- `evidence/M07/roles.png`：被同一次 smoke 覆写为与 desktop.png 相同内容；无固定 source SHA，恢复到已提交版本。

未执行 `reset --hard` 或 `clean -fd`；`.local/`、`.local-protected/` 与凭据不提交、不打印、不上传。

## Tests on UI Base

测试不调用外部模型、不使用 Codex reset credit。最终结果在提交前回填：

| Gate | 状态 | 证据/备注 |
|---|---|---|
| typecheck | PASS | 固定 Node 24.14.0，`tsc --noEmit` |
| lint | PASS | 规范副本、领域依赖方向、直接依赖精确版本 |
| spec/contract | PASS | spec 36/36；contract 8 files / 67 tests；C1 generation verified |
| unit | PASS | 41 files / 213 tests |
| integration | PASS | 49 files / 212 tests |
| chaos | PASS | 1 file / 3 tests |
| migration/freeze | PASS | migration manifest + EOL guard；C1、C1R1、C1R1P1 frozen sources |
| secret scan | PASS | staged 2138 files，0 findings；输出已脱敏 |
| desktop build/type | PASS（type）/ NOT_RUN（build） | 全仓 typecheck 覆盖 Desktop；本次仅文档变化，不重复生成 build |
| Electron smoke | NOT_RUN | 不为 generated screenshot 重启真实模型；若非破坏性 smoke 可用则单独记录 |

## Kimi Branch Instruction

Kimi 必须从最终回报中完整 40 字符 `UI_BASE_SHA` 创建 `feat/v1.1-ui-kimi`，不得从 `main`、`feat/ui-ux-spec`、`feat/v1.1-final-windows-mobile`、`integration/v1.1-cross-platform` 或其它旧分支开始。分支职责与同步方式见 [BRANCH-MAP.md](./BRANCH-MAP.md)。

## External Gates Intentionally Not Blocking UI Base

- Codex：自然额度恢复后可继续 RC 复测；本阶段不使用 reset credit。
- ZCode：Bigmodel/GLM-5.3-Flash CLI entitlement 仍阻塞；本阶段不再次要求登录或购买资源。
- Web Participant：当前 SHA 全链 NOT_RUN。
- HTTPS/WSS：NOT_RUN。
- signed installer/安装升级：NOT_RUN。
- GitHub CI：NOT_RUN/BLOCKED by infrastructure。
- merge/tag/release：未授权且不执行。

> **重要声明：UI_BASE_SHA 只是供 Kimi 开始 UI/UX 开发的稳定业务合同基线，不是 V1.1 Windows RC，也不是 release approval。**
