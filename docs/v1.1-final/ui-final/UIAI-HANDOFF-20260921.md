# AgentRouter V1.1 UI / UX 当前交接

**交接日期：2026-09-21**  
**后续执行者：其他 UIAI / Codex Agent**  
**当前状态：实现已形成一个可复核 checkpoint，但 UI lane 尚未完成最终验收。**

## 1. 接续入口

| 项目 | 当前值 |
|---|---|
| 仓库 | `E:\AgentRouter` |
| UI worktree | `E:\AgentRouter\.worktrees\v1.1-ui-kimi` |
| UI 分支 | `feat/v1.1-ui-kimi` |
| 固定 UI Base | `89a41b5e0ff6af198141ded3c1d5c627fdcf9a52` |
| 当前 UI checkpoint | `9e16966` (`feat(ui): implement v1.1 workbench interaction lane`) |
| Codex 合入 checkpoint | 无；尚未进行 UI-6 Contract Sync |
| 最终允许状态 | `UI_LANE_READY_FOR_WINDOWS_RC_INTEGRATION` |

后续执行者必须继续在 `feat/v1.1-ui-kimi` 工作，不从 `main`、旧 UI 分支或 Codex 当前 HEAD 重建。不要 merge `main`、tag 或 release。

## 2. 已完成工作

### UI-0 / UI-1：盘点、信息架构与设计方向

已输出 [UI-0-UI-1-PLAN.md](./UI-0-UI-1-PLAN.md)，内容包括：

- 当前页面、路由与组件盘点；
- 页面保留、合并与兼容策略；
- Core / UI ViewModel 数据来源；
- Home / Project / Workbench 信息架构；
- 用户旅程；
- 状态和错误矩阵；
- Desktop / Mobile 行为；
- Visual Direction（视觉方向）；
- Contract Gap 与计划修改文件。

### UI-2：Workbench / Role / WorkSession

已完成：

- 顶部常驻 Core / Host Identity，显示 Local/Remote、Connected、Controller/Observer；
- Workbench 顺序调整为 Needs Attention → Roles → Running / Queue → Recent Results；
- Needs Attention 聚合 WAITING_INPUT、受阻任务、UNKNOWN Run、Approval、Result Review、Issue；
- Project Card 增加工作 Role 数、关注项与最近活动；
- Role Detail 重排为 Role Identity、Current WorkSession、Current Work、Task Composer、Conversation、Slots；
- Role Charter 的负责、不负责、默认结果去向进入默认层；
- Create WorkSession 改为三步 Wizard：Who/Where → Context → Review；
- 明确失败时原 WorkSession 保持安全；
- Historical WorkSession 统一显示 `Historical WorkSession · Read-only`，没有 Resume / Continue / Reactivate；
- Slot 创建 Dialog、Participant 类型选择、一次性 Join Instruction、复制操作；
- Slot `OPEN/BOUND/CLOSED` 与 WorkSession/Run 状态分开。

### UI-3：Task / Activity / Result

已完成：

- WAITING_INPUT 使用正式 Drawer/Sheet，显示 Role、Task、问题原因和任务范围；
- 回复草稿仍绑定明确 Task，不创建新 Task；
- Task Composer 保留 IME 防误发、Ctrl+Enter、草稿与队列说明；
- Results 页面增加 list/detail 结构；
- Result Detail 分开显示 Task、Role、Run、Delivery、Acceptance、Artifact/Evidence；
- 明示 Artifact 可读、测试通过与用户接受是不同事实；
- Conversation 降为 secondary view，业务对象仍以 Task/Run/Result/Artifact 为准。

### UI-4：Remote / Mobile

已完成：

- Remote 页面增加 Core identity 与 Observer/Controller 状态；
- Remote mutation 使用 CapabilityGate，显示具体只读原因；
- Transport security 未验证时不宣称安全远程已就绪；
- Mobile/Web Console 默认入口改为 Needs Attention；
- 移除所有浏览器 `prompt()`、`confirm()`、`alert()`；
- WAITING_INPUT、Approval、Cancel Run、Create WorkSession 改为正式底部 Sheet；
- Mobile 长文本回复保存在本地草稿；
- 断线时显示明确 Data-as-of 时间与写操作禁用；
- Observer/Controller 及历史 WorkSession 只读规则在 Mobile 保持一致；
- 修复窄屏顶部 Host/Control 信息重叠。

### UI-5：Errors / Diagnostics / Accessibility

已完成：

- UNKNOWN Run 保留 Reconcile，不自动重试；
- 增加脱敏诊断摘要复制入口；
- Disabled mutation 显示 Observer/connection/capability 原因；
- 增加 Windows 150% 等效视口和 Mobile 窄视口截图检查；
- 代表视口均通过 horizontal overflow 检查；
- 状态均配文字，保留键盘 focus、Dialog focus trap 与 reduced motion 基础。

### Settings 分组

项目 Settings 已按以下结构收敛：

- Project；
- Roles & Permissions；
- Harnesses & Models；
- Workspaces；
- Connections；
- Advanced / Diagnostics。

Management MCP 被放在 Connections 语义中，没有作为 Role 展示。

## 3. 主要修改文件

- `apps/desktop/workbench.tsx`
- `apps/desktop/workbench.css`
- `apps/desktop/workbench/store.tsx`
- `apps/desktop/workbench/shell.tsx`
- `apps/desktop/workbench/pages-project.tsx`
- `apps/desktop/workbench/pages-role.tsx`
- `apps/desktop/workbench/pages-remote.tsx`
- `apps/desktop/workbench/task-editor.tsx`
- `apps/desktop/workbench/composites.tsx`
- `apps/desktop/workbench/identity.ts`
- `packages/remote/console.html`
- `tests/ui/v11-uiai-execution.test.tsx`
- `tests/e2e-ui/v11-uiai-shoot.mjs`

没有修改 Core、DB、migration、protocol 或 Harness lifecycle 业务语义。

## 4. 已验证证据

### 自动测试

最后一次已通过：

```text
node tools/lint.mjs
PASS: 规范副本、领域依赖方向、直接依赖精确版本

vitest run tests/unit tests/ui
53 test files passed
317 tests passed

vitest run tests/ui
12 test files passed
104 tests passed
```

定向 TypeScript 校验已通过 Renderer 修改文件：

```text
tsc --ignoreConfig --noEmit --skipLibCheck --allowImportingTsExtensions
    --module NodeNext --moduleResolution NodeNext --target ES2022
    --jsx react-jsx --esModuleInterop <changed renderer files>
```

全仓 `tsc --noEmit` 尚未形成有效通过证据：新 worktree 的离线依赖缺 `ws` 与 MCP SDK tarball，直接借用主工作区依赖时仍缺这些模块。后续应使用仓库固定 Node `24.14.0` 和完整依赖重跑。

### 截图与视口证据

已生成 6 张代表截图，清单见 [screenshots/manifest.json](./screenshots/manifest.json)：

1. Home Project Cards；
2. Project Workbench；
3. Role / WorkSession；
4. Results / Evidence；
5. Windows 150% 等效视口；
6. Mobile narrow / Observer intervention。

截图脚本会检查 `scrollWidth <= clientWidth + 1`，上述场景均通过。

## 5. 已知 Contract Gap

### [UI-CONTRACT-GAP-001](../ui-gaps/UI-CONTRACT-GAP-001.md)

Slot / Participant Binding 缺统一 display-safe projection：

- Participant display identity；
- last seen；
- external session 脱敏引用；
- Core 生成的安全 Join Instruction / short ref。

当前 UI 只显示 Slot 的真实 `OPEN/BOUND/CLOSED`、Participant kind 与 WorkSession 是否关联，不推断“正在运行”。

### [UI-CONTRACT-GAP-002](../ui-gaps/UI-CONTRACT-GAP-002.md)

Result 缺结构化 Evidence 投影：

- source SHA；
- effective harness/provider/model；
- tests；
- known limitations；
- real / fixture layer；
- 明确 Run 关联。

当前 UI 只展示稳定 Result 字段和 Artifact 可验证元数据，不把缺失 Evidence 写成 PASS。

继续沿用 UI Base 的 `UI-GAP-001` 至 `UI-GAP-010`；这些缺口仍由 Codex/Core lane 负责。

## 6. 尚未完成，后续 AI 必须继续

### UI-6：Contract Sync / Real Core

- 从 `feat/v1.1-final-cursor-win` 获取明确的固定 SHA 与 `UI-CONTRACT-CHANGE-*`；
- 只按执行包规定 merge forward；
- 解决 merge conflict 后重跑相关 Renderer/Store projection 测试；
- 对 Slot/Binding、TaskInput、Context Transfer、Result Evidence 移除 provisional fallback；
- 不随机 cherry-pick，不自行进入 Core/migration 补业务。

### UI-7：Final Regression / Handoff

以下门禁未完成或证据不足：

- 使用完整依赖和固定 Node `24.14.0` 跑全仓 `typecheck`；
- 完整 `lint`、renderer/unit、state projection、interaction tests；
- Packaged Electron smoke；
- 真实 Local Core controller/observer；
- 真实 Remote Core observer/controller；
- 真实 Slot Waiting → Bound；
- Create WorkSession blank / transfer / failure / UNKNOWN；
- WAITING_INPUT send uncertain / reconnect；
- Result accept/reject 和 Artifact verify/download；
- Remote revoke/disconnect；
- Windows 100% / 125% / 150% DPI；
- Mobile narrow / wide；
- Keyboard-only、focus、touch target 和屏幕阅读器抽查；
- 固定最终 UI SHA 后重新生成截图 manifest；
- 生成最终 `UI-FINAL-REPORT.md` 与 `UI-FINAL-CHECKPOINT.json`。

当前不能写 `UI_LANE_READY_FOR_WINDOWS_RC_INTEGRATION`，因为 UI-6 与 UI-7 尚未完成。

## 7. 建议接续顺序

1. 确认 worktree 干净，运行 `git rev-parse HEAD`，应为 `9e16966...` 或本交接文档的后续提交。
2. 使用仓库规定的 Node `24.14.0` 恢复完整依赖，先跑 `typecheck/lint/tests`。
3. 读取 Codex 最新 checkpoint 与 `UI-CONTRACT-CHANGE-*`；没有正式 change 文档时不要盲目合并。
4. 完成 UI-6 Contract Sync，优先处理 `store.tsx`、WorkSession、Slot/Binding、Result Evidence。
5. 用真实 Core 跑执行包 `docs/18_TEST_AND_ACCEPTANCE.md` 的 14 条 Required Flows。
6. 完成 packaged smoke 和五种视口/DPI 检查。
7. 固定最终 UI SHA，再生成截图和最终报告/checkpoint。
8. 最终只报告 `UI_LANE_READY_FOR_WINDOWS_RC_INTEGRATION`；交给 `integration/v1.1-windows-rc` 合流，不 merge main。

## 8. 常用命令

```powershell
git -C E:\AgentRouter\.worktrees\v1.1-ui-kimi status --short --branch
git -C E:\AgentRouter\.worktrees\v1.1-ui-kimi log -3 --oneline

# 在依赖完整后
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:desktop
pnpm test:packaged -- <explicit-package-path>

# UI 测试与代表截图
pnpm exec vitest run tests/ui
node tests/e2e-ui/v11-uiai-shoot.mjs
```

## 9. 交接声明

- 本 checkpoint 是 UI 实现阶段性成果，不是 Windows RC，也不是 release approval。
- 没有使用 Codex reset credit。
- 未删除或覆盖用户源码、配置和数据。
- 未将 mock/provisional 能力宣称为真实支持。
- Historical WorkSession、Observer/Controller、Task/Run/Result/Artifact 等产品不变量仍保持。

