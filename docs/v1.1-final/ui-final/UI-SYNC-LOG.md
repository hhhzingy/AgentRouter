# UI Contract Sync Log

## 2026-09-23 — 视觉终版重构 V0–V3 进行中

- 按 20260922 `00_START_HERE.md` → 20260923 Master Prompt 顺序启动；确认 `feat/v1.1-ui-kimi` 在 `cd6fc553` 与远端一致，Core 对照仍为 `3e4df007`。只在既有分支工作。
- P0 主参考 11 张和 CURRENT 7 张均实际查看；`f5614bb` 先提交 `UI-VISUAL-BASELINE.md` 与 11 页、10 维 CURRENT↔TARGET 差异矩阵。`UI-VISUAL-CONVERGENCE-001` 继续 OPEN。
- `0edb0d5` 完成第一批 Project Shell、Workbench 双栏、Projects 角色预览及截图脚本修复；未修改 Core、合同或迁移。截图脚本现在寻找可用 Chromium，并处理随机端口进入浏览器不安全端口列表的问题。
- Role 页把新建工作会话命名改为不预设迁移策略；创建失败保留向导，结果不确定时禁用再次创建并引导核对待处理操作。项目页移除重复顶级 Tabs 后，同步更新 UI 断言，`tests/ui` 108/108 PASS。
- 第二批布局：Role 页改为身份 + WorkSession/当前工作双栏，Conversation 默认收起；Activity 两个筛选器并排；Settings 将项目 ID/修订移入技术详情；Connections 拆分 Core、管理客户端、参与者、设备，未启用配对能力时明确禁用。新增 Connections/Activity/Project Settings/Results Dark 的 fixture 截图，总计 13 张，横向溢出检查通过。
- Core `roleSession.create` 在继承上下文时先返回 transfer operation；UI 现在持久保存 operation ID，并按 Core 的 `roleSession.transferStatus` 展示 PREPARING/EXPORTED/SEEDED/COMMITTED/FAILED。未确认或 UNRESOLVED 时禁止第二次创建，允许显式“检查状态”。容量/压缩策略仍无 display-safe 合同，不猜测数值或阶段。
- 对照 Core 当前 preflight 补齐 `NEEDS_NEW_WORKSESSION`、历史只读和原生连续性不支持的文案；Result Detail 将交付/验收分开展示为人类可读状态，Run ID 放入技术详情。直接 `tsc --noEmit`、`node tools/lint.mjs`、UI 108/108 PASS。
- 已记录 `UI-CONTRACT-GAP-003`：New WorkSession 缺容量/压缩策略和用户级迁移阶段投影。Mobile 项目首屏顺序调整为 Attention → Running → Recent Results → Roles，优先支持介入场景。
- `node node_modules/typescript/bin/tsc --noEmit` PASS；9 张 `VISUAL_FIXTURE` 代表截图与无横向溢出检查 PASS。manifest 记录 `PREVIEW_MOCK`，不作为真实 Core 验收。
- 本机 `pnpm typecheck` 的依赖准备因缺少 Visual Studio C++ Build Tools、`better-sqlite3` 无法重编译而中止；TypeScript 本体检查已直接通过。此环境问题与先前 `.git` 沙盒 ACL 初始化失败分开记录。
- 当前仅 V2/V3 的一部分；Role/New WorkSession/Task/Result/Connections/Activity/Settings/Mobile、a11y 与真实 Core 终版证据尚未收敛。状态保持 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`。

## 2026-09-22

- UI 起始 SHA：`9e7388b985f5af2928e6b5c30f60d8039ac9804e`
- 已 fetch Codex 分支：`origin/feat/v1.1-final-cursor-win`
- 固定 Codex SHA：`3e4df007f6fe2b65acd74792d2eaba0e01a2ad48`
- 相对 UI Base `89a41b5e...` 的差异：仅两份 RC/复核文档。
- `UI-CONTRACT-CHANGE-*`：未发现。
- UI-facing contract/projection 变化：无。
- 决策：不 merge、不 cherry-pick；继续记录 `UI-CONTRACT-GAP-001/002`，缺失投影显示 UNKNOWN/Unavailable。
- 最终验证（2026-09-23）：typecheck、lint、Unit 213/213、Integration 212/212、Contract/Chaos 70/70、UI 108/108 全部通过。
- 真实流程：J2 真实 Electron + Local Core 19 项通过；packaged smoke、Remote Core 和手机浏览器流程通过。
- 最终源码 SHA：`a809417d33e900598a90ac49f3a74aee56bb34c8`；证据提交：`3e924b4fd0d1b08aea36ca360d412482634bbf05`。
- 安全备注：当前索引扫描 PASS，但全历史扫描发现 4 个旧 `.local-protected` 对象；未重写历史，并将 UI lane 标为 BLOCKED。
