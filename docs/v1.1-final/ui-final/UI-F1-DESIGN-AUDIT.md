# UI F1 现实审计与 Design System 收口

日期：2026-09-22
审计起点：`9e7388b985f5af2928e6b5c30f60d8039ac9804e`

## 1. 现有路由、页面与组件

### 全局路由

| 路由 | 页面 | 状态 |
|---|---|---|
| `#/` | Projects Grid / New Project | IMPLEMENTED |
| `#/remote` | Connections / Devices | IMPLEMENTED，部分投影受合同限制 |
| `#/settings` | App/Core Settings | IMPLEMENTED（本轮新增真实本机主题与 Core 身份） |

全局 Shell 已固定为 `Projects / Connections / Settings`，Core Identity、Local/Remote、Connected/Reconnecting/Offline 与 Controller/Observer 常驻显示；窄屏转换为底部导航。

### Project 内路由

| 路由 | 页面 | 状态 |
|---|---|---|
| `#/project/:id` | Workbench | IMPLEMENTED |
| `#/project/:id/timeline` | Activity | IMPLEMENTED |
| `#/project/:id/inbox` | Results | IMPLEMENTED |
| `#/project/:id/settings` | Project Settings | IMPLEMENTED |
| `#/role/:id` | Role / WorkSession / Current Work | IMPLEMENTED |
| `#/roleplan/:projectId` | New Role / Role Plan | IMPLEMENTED |
| `#/reconfigure/:projectId` | Group reconfiguration | IMPLEMENTED，capability gated |

旧的 `spaces/artifacts/models/issues` hash 仍投影到四个主入口，保留历史深链兼容；未重新暴露为全局一级导航。

### 已有共享组件

`Badge`、`ToneBadge`、`StatusDot`、`Avatar`、`Card`、`Button`、`EmptyState`、`KeyValue`、`Tabs`、`Dialog`、`Drawer`、`CapabilityGate`。

本轮补齐 `Section`、`Banner`、`IconButton`、`SegmentedControl`，并把 Global Settings 的主题选择建立在共享组件上。业务组件包括 ProjectCard、RoleRow、TaskRow、Conversation、ReconcilePanel、Task Editor、WaitingInputSheet、WorkSession Wizard、SlotBindingPanel 与 Result Detail。

## 2. Design System

`apps/desktop/workbench.css` 已包含：

- semantic color：background/surface/elevated、foreground、border、primary、success、warning、danger、info、queue、neutral；
- typography：`xs/sm/md/lg/xl/2xl` 与 mono；
- spacing：4/8/12/16/20/24/32/40；
- radius：sm/md/lg/xl；
- elevation：两级 shadow；
- focus ring；
- motion duration/easing 与 reduced-motion；
- z-index；
- desktop/compact/mobile breakpoints；
- Light/Dark 双主题。

状态色规则保持：绿色只表示确认事实，橙色表示 attention/wait/unknown，红色表示确认 failure/destructive，灰色表示 idle/offline/history，蓝色表示 primary/selected。

## 3. P0 页面差异矩阵

| 页面 | 当前判定 | 本轮/现状说明 |
|---|---|---|
| Projects | IMPLEMENTED | grid、限高卡、Role preview、attention 摘要、New Project、Global Shell；已有 light，新增真实 dark token |
| Workbench | IMPLEMENTED | Needs Attention → Roles → Running/Queue → Recent Results 顺序有测试保护 |
| Role Detail | IMPLEMENTED | Identity、Current WorkSession、Current Work、History read-only、Charter/Permissions、secondary Conversation |
| New WorkSession | IMPLEMENTED | Preflight 与 Setup/Context/Review 分离；失败不提前关闭旧 WS；UNKNOWN 不盲重试 |
| Task / WAITING_INPUT | IMPLEMENTED | TaskInput 绑定原 Task；未知提交进入 pending/reconcile；不伪装旧 Run 长期运行 |
| Results | IMPLEMENTED | Delivery/Acceptance/Artifacts/Evidence 分层；Accept/Request Changes 使用真实合同 |
| Connections | NEEDS_REAL_ENV_VALIDATION | Core/Management Client/Participant/Device/Controller 语义不混用；真实 Remote 门禁未跑 |
| Activity | IMPLEMENTED | 业务时间线，不暴露 raw event log |
| Settings | IMPLEMENTED | Project 与 Global 分层；Global 只含真实客户端主题/Core 信息 |
| State Library | IMPLEMENTED_IN_COMPONENTS | UNKNOWN/read-only/controller/capability/empty/pending/error 已复用；仍需真实视觉复核 |
| Mobile | IMPLEMENTED_NEEDS_REAL_BROWSER | Home/Activity/Results/More、WAITING_INPUT 草稿、Controller gate、offline/stale、真实 Result review |

## 4. 不可破坏的语义测试

- UI 13 files / 108 tests：PASS。
- unit 41 files / 213 tests：PASS。
- contract 8 files / 67 tests：PASS。
- 全仓 TypeScript：PASS。
- lint：PASS。

重点保护：Historical WorkSession read-only、Observer mutation gate、UNKNOWN/reconcile、TaskInput/new Run identity、Published ≠ Accepted、Artifact/Evidence ≠ Acceptance、Management Client ≠ Role、Slot ≠ Run。

## 5. 合同缺口

- `UI-CONTRACT-GAP-001`：Slot / Participant display-safe projection。
- `UI-CONTRACT-GAP-002`：Result structured Evidence projection。

Codex checkpoint `3e4df007...` 没有 UI-facing 代码差异，也没有新的 `UI-CONTRACT-CHANGE-*`。UI 保留真实 UNKNOWN/Unavailable，不推断 PASS/Ready。

## 6. 环境与视觉限制

- 本地图像查看器与 Windows UI 自动化均因 `windows sandbox ... helper_unknown_error` 失败；P0 参考的正式文字判定已用于实现，但逐图可视复核、DPI/键盘/屏幕阅读器不得记为 PASS。
- `better-sqlite3` 因本机缺 Visual Studio C++ Build Tools 未能编译，阻断两项 Core-backed integration、packaged Electron 与真实 Local/Remote 流程。

因此 F1 的代码和自动语义门已通过，但真实视觉/环境门仍处于 `BLOCKED_ENVIRONMENT`，不能据此宣称 UI lane ready。
