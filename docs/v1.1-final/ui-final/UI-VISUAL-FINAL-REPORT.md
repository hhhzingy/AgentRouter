# AgentRouter V1.1 UI 视觉终版阶段报告

日期：2026-09-23。状态：`UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`。这是一份阻断状态报告，不是视觉终版 PASS。

## 固定身份

- 分支：`feat/v1.1-ui-kimi`；未新建分支，未 merge main/tag/release。
- 本轮源码 SHA：`d3b73c58f498b8d3f5dde74f3e2a5e2308237089`。
- VISUAL_FIXTURE 证据提交：`621ee075992283e9b6fe42caccd83aa5eacb16e4`，13 张截图，manifest `sourceSha=2c5ced7`、`PREVIEW_MOCK`、`sourceDirty=false`。
- 对照 Core：总负责人更新的最新固定 SHA `9794cdfc4ddf51de431f9e6ae069f3a4fec2d341`；相对旧对照 `3e4df007` 的 UI-facing 差异仅是 client transport 主体类别和 extension mutation metadata 透传，没有 Renderer/生成合同变化。本轮未 merge Core 分支。

## 阅读与 P0 审计

按 20260922 `00_START_HERE.md` → 20260923 `UIAI_MASTER_START_PROMPT.txt` 的顺序阅读执行包。实际查看 PRIMARY 的 11 张 P0 图和 CURRENT_IMPLEMENTATION 的 7 张图；先在 `f5614bb` 提交 11 页、10 维 CURRENT↔TARGET 差异矩阵，再修改代码。详见 `UI-VISUAL-BASELINE.md` 和 `CURRENT-TARGET-GAP-MATRIX.md`。

## 本轮实现

- Global/Project Shell 分离；项目页取消竞争性的顶部 tabs，改用 `← Projects / Workbench / Activity / Results / Settings`。Core 身份在顶栏一次表达。
- Projects 项目卡显示可读的 Role 姓名与状态；Workbench 采用 Attention/Role 主区和 Running/Results 右栏，顶部主动作 New Role。
- Role 页改为 Identity、Current WorkSession、Current Work 双栏；Conversation 收到次级区域。新建 WorkSession 不预设继承策略；inherit 返回 transfer operation 后，界面查询 Core 实际状态，并在结果未知时阻止再次创建。
- Connections 拆分 Core、管理客户端、参与者与设备；缺设备能力时安全禁用配对。Activity 筛选器、Settings 技术字段、Result 交付/验收层级与表单外观已改进。
- Mobile 项目首屏优先 Attention、Running、Recent Results，再展示 Roles。13 张 VISUAL_FIXTURE 截图无横向溢出。

## 未通过的 P0

11 个 P0 页面均保留 `BLOCKED` / `BLOCKED_CONTRACT`；逐页对照见 `visual-diffs/`。Role 的真实 WS/Slot 数据、New WorkSession 容量/压缩/Web Participant 分支、Activity 业务事件优先级、Results 结构化 Evidence、Mobile Reply/Controller、State Library 与深色/窄窗完整人工复核尚未完成。`UI-VISUAL-CONVERGENCE-001` 仍 OPEN。

合同缺口：`UI-CONTRACT-GAP-001` Slot/Binding display-safe 投影；`002` structured Result Evidence；`003` New WorkSession 容量/压缩与迁移阶段。UI 只做安全降级，未改 Core 状态机、协议或 DB。

## 本轮验证边界

负责人接收交接后，已在 UI HEAD `2c5ced7` 重跑直接 typecheck、lint、Unit 213/213、Contract+Chaos 70/70、UI 108/108、排除 DUT 的 Integration 209/209，以及 13 张 FIXTURE 截图（`sourceDirty=false`）。`d3b73c5` 到 `2c5ced7` 无产品源码差异。

- 直接 `tsc --noEmit` PASS；`node tools/lint.mjs` PASS；`tests/ui` 108/108 PASS。
- 13 张 `VISUAL_FIXTURE` 截图通过无横向溢出检查，覆盖 1440×900、960×600 @150%、390×844、430×932、Light/Dark 的代表场景。
- `pnpm typecheck` 的自动依赖准备因 `better-sqlite3` 需要的 Visual Studio C++ Build Tools 不存在而停止；TypeScript 本体已单独通过。
- Unit 213/213、Contract+Chaos 70/70 PASS。Integration 全量 210/212：DUT 测试因 `DSH_BIN_MISSING` 失败，Web Console 一次时序失败后单独重跑 PASS；排除 DUT 的 48 文件 209/209 PASS。Packaged Electron、REAL_CORE Local/Remote/Mobile、Windows 125/150/200% Electron 缩放与屏幕阅读器均未在本轮源码 SHA 上重跑。旧 `a809417` 的绿色证据不能复用于本轮。

## 集成决定

UI lane 保持 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`。V1.1 总负责人需要安排 UI 继续收敛、处理三个合同缺口与本机原生依赖环境，再在新的单一源码 SHA 上重跑 V8/V9。UIAI 不自行 merge main、tag 或 release。
