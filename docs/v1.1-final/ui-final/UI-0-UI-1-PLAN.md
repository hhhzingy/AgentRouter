# AgentRouter V1.1 UI-0 / UI-1 执行计划

## 基线与范围

- UI 基线：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- UI 分支：`feat/v1.1-ui-kimi`
- 主要所有权：Desktop Renderer、Workbench、Remote/Mobile 交互、UI ViewModel 投影、UI 测试
- 业务合同来源：`docs/v1.1-final/ui-base/UI-CONTRACT.md`
- 不变量：Role、WorkSession、Slot、Binding、Task、Run、Result、Artifact 分层；历史 WorkSession 永久只读；Observer 与 Controller 分离；未知能力不推断为成功。

## UI-0：现状盘点（Inventory / Reality Check）

### 页面与路由

| 路由 | 当前实现 | 处理 |
|---|---|---|
| `#/` | Project Cards | 保留，强化 Host/Core Identity、Needs Attention 与最近活动摘要 |
| `#/project/:id/overview` | 项目概览 | 重构为 Workbench，顺序固定为 Needs Attention、Roles、Running / Queue、Recent Results |
| `#/project/:id/timeline` | Conversation 记录 | 保留为 Activity，默认业务事件，技术事件折叠 |
| `#/project/:id/inbox` | Result 收件箱 | 扩展为 Results 列表与详情；明确 Delivery、Acceptance、Artifact 状态 |
| `#/project/:id/settings` | 项目设置 | 保留并按 Project、Roles & Permissions、Harnesses & Models、Workspaces、Connections、Advanced 分组 |
| 旧 `spaces/issues/artifacts/models` | 旧平级入口 | 合并进四个主页面，并保留旧 hash 的兼容落点 |
| `#/role/:id` | Role Detail | 重构为 Identity、Current WorkSession、Current Work、WorkSessions / Slots、Permissions、Conversation、Advanced |
| `#/roleplan/:id` | Role Plan | 保留，作为 Roles & Permissions 的创建入口 |
| `#/reconfigure/:id` | Space 重构 | 保留为 Settings 的高级流程，不作为主导航 |
| `#/remote` | Remote Devices | 保留，强化 Observer / Controller、transport truth、revoke/disconnect 文案 |
| Mobile `/` | 远程控制台 | 重构为 Needs Attention Intervention Console；移除 `prompt()` / `confirm()` / `alert()` |

### 组件与数据源

- `store.tsx` 是唯一 Core 会话入口；页面只消费 `SnapshotVM`、连接态与扩展接口，不建立第二套业务状态机。
- `shell.tsx` 负责 Core/Host Identity、连接态、Controller/Observer、断线冻结时间。
- `pages-project.tsx` 汇总 Project、Role、Task、Run、Issue、Approval、Result。
- `pages-role.tsx` 消费 Role Charter、WorkSession 扩展与 Slot 扩展。
- `task-editor.tsx` 负责 New Task 与明确 Task 范围内的 WAITING_INPUT。
- `composites.tsx` 承载 Project/Role 卡、Task 行、Result/Conversation 展示。
- `packages/remote/console.html` 是 Mobile/Web intervention surface。

### 已确认的真实状态

- 稳定：Project、Role、Task、Run、Issue、Approval、Result、Artifact、Core identity、connection/controller lease。
- 暂定（Provisional）：WorkSession 扩展、Slot/Participant Binding 投影、TaskInput、Context Transfer 详细阶段、effective model provenance。
- WorkSession 当前真实状态为 `ACTIVE/ARCHIVED`；`ARCHIVED` 只读。
- Slot 当前真实状态为 `OPEN/BOUND/CLOSED`；它不是 Run 状态。
- Result 的 `delivery` 与 `acceptance` 是两个独立维度。
- Remote HTTPS/WSS 未完成真实验收；UI 不显示安全锁或“安全远程已就绪”。

### 当前不一致与修复点

- Workbench 先列 Roles，Needs Attention 排在后面：调整顺序。
- Role 页历史 WorkSession 出现“可继续”字样：删除，统一显示 Historical WorkSession · Read-only。
- Create WorkSession 是行内单字段表单：改为多步骤 Dialog。
- Slot 只读列表且 `participant.slot.list` 未正确携带 controller lease：修复 UI extension 投影并添加创建入口。
- Results 只显示摘要与 Artifact ID：增加 Delivery、Acceptance、Evidence/Artifact 分层。
- Mobile 使用浏览器 `prompt/confirm/alert`：替换为正式 Sheet/Dialog。
- Core Identity 只在页脚：在顶部常驻展示 Host、Local/Remote、Connection、Observer/Controller。

## UI-1：信息架构与交互方向

### 信息架构

```text
Home
└─ Project Cards
   └─ Project
      ├─ Workbench
      │  ├─ Needs Attention
      │  ├─ Roles
      │  ├─ Running / Queue
      │  └─ Recent Results
      ├─ Activity
      ├─ Results
      └─ Settings
         ├─ Project
         ├─ Roles & Permissions
         ├─ Harnesses & Models
         ├─ Workspaces
         ├─ Connections
         └─ Advanced
```

### 关键用户旅程

1. 打开 App，先确认当前 Core/Host，再从 Project 卡定位需要处理的项目。
2. 进入 Workbench，第一屏处理 WAITING_INPUT、Approval、Result Review、Failure 与 UNKNOWN。
3. 打开 Role，先理解职责与当前 WorkSession，再查看 Task/Run。
4. 新建 WorkSession：Who/Where → Context → Review → Core progress/result。
5. 建立 Web Participant Slot：选择类型 → 创建 → 复制 Join Instruction → 等待 Bound。
6. 派发 Task：明确 Role、输入、预期结果与结果去向；忙碌时显示真实队列位置。
7. 查看 Result：Summary → Delivery → Acceptance → Artifact → Evidence。
8. Remote Observer 尝试 mutation 时显示具体阻止原因，并在允许时申请 Controller。
9. Mobile 只突出介入动作；长文本回复保存草稿，断线显示 Data as of。
10. 历史 WorkSession 只允许浏览 Conversation/Result，没有 Resume/Continue/Reactivate。

### 状态与错误矩阵

| 对象 | 默认展示 | 需要介入 | 禁止推断 |
|---|---|---|---|
| Connection | Connected / Connecting / Disconnected / Stale | identity change、disconnect、incompatible | 连接成功不等于 Controller |
| Control | Observer / May request / Controller / Held by other | Request/Release control | Observer 认证不等于可写 |
| WorkSession | Active / Historical read-only | create/transfer failure | Archived 不可恢复 |
| Slot/Binding | Empty/Open/Bound/Closed | waiting participant、binding conflict | Bound 不等于模型运行 |
| Task/Run | Queued/Running/Waiting Input/Unknown/Failed | reply、approval、reconcile | WAITING_INPUT 不是 Role 状态；UNKNOWN 不自动重试 |
| Result | Delivery + Acceptance | pending review、undeliverable | Published、Artifact available、User accepted 互不等价 |
| Capability | Verified / Implemented unverified / Unknown / Unsupported | inspect details | null/optional 不解释为支持 |

### 视觉方向（Visual Direction）

- 采用“工程协作控制台”风格：浅色中性表面、深蓝主操作、橙色关注、红色失败、绿色只表示明确完成的一层。
- 提高默认字号与触摸目标，适配 Windows 100%/125%/150% DPI。
- 每个状态同时提供文字与图形；颜色只辅助。
- 默认层展示用户决策所需信息；ID、revision、generation、request key 放到 Advanced。
- Desktop 使用宽屏双栏和侧 Sheet；Mobile 使用单列、底部导航与全屏 Sheet。

## Contract Gap 与不阻塞策略

沿用 UI Base 的 `UI-GAP-001` 至 `UI-GAP-010`。本轮 UI 不伪造缺失字段：

- Slot/Binding 缺 last-seen 与完整 participant identity 时显示“Core 未提供”。
- Context Transfer 只显示 Core 返回的低粒度状态，不显示虚构百分比。
- Artifact Evidence 缺结构化测试字段时仅展示已有 Artifact 元数据与 Result 关系。
- Remote transport 未验证时显示当前协议事实，不宣称 TLS ready。

## 计划修改文件

- `apps/desktop/workbench/pages-project.tsx`
- `apps/desktop/workbench/pages-role.tsx`
- `apps/desktop/workbench/task-editor.tsx`
- `apps/desktop/workbench/composites.tsx`
- `apps/desktop/workbench/shell.tsx`
- `apps/desktop/workbench/store.tsx`
- `apps/desktop/workbench/pages-remote.tsx`
- `apps/desktop/workbench.css`
- `packages/remote/console.html`
- `tests/ui/*`
- `docs/v1.1-final/ui-final/*`

