# COMPONENT_SYSTEM

## 分层

```
packages/ui/            纯受控基础件（无业务、无网络）
  status.ts             状态合成层（唯一的状态解释处）
  format.ts             时间/数量/队列位置格式化（注入 now，可冻结）
  primitives.tsx        ToneBadge/Badge/StatusDot/Avatar/Card/Button/EmptyState/
                        KeyValue/Tabs/Dialog/Drawer/CapabilityGate
apps/desktop/workbench/ 页面与复合件（消费 store，组合基础件）
  store.tsx             唯一 Core 会话入口（snapshot + 事件刷新；无第二套状态机）
  shell.tsx             全局壳
  composites.tsx        ProjectCard/CreateProjectCard/SpaceCard/DispatchDrawer/
                        TaskRow/ConversationView/Composer/ReconcilePanel
  pages-*.tsx           六个页面
```

铁律：
1. **UI 不维护第二套业务状态机**。渲染只消费 `snapshot` + `timeline` + `accounts/quotas`；变更通过 `call()` 发请求，成功后 `refresh()`。
2. **状态解释只在 `status.ts`**。页面不得自行 if/else 拼状态文案。
3. **相对时间必须注入 `now`**（`formatAgo(ms, now)`），测试用 `FIXED_NOW` 冻结。

## 关键组件契约

| 组件 | 输入 | 输出/行为 |
|---|---|---|
| `ToneBadge` | `DisplayState`（status.ts 产物） | 语义色徽标，`data-state-key` 供测试 |
| `CapabilityGate` | `available` + `unavailableReason` | 能力缺失/只读时禁用并给出文字原因；**不隐藏入口** |
| `ProjectCard` | `ProjectVM`（snapshot 派生组行/头像） | 卡组行 ≤5 头像 + `+N`；打开链接 |
| `CreateProjectCard` | — | 与项目卡**同尺寸**（规则 1） |
| `SpaceCard` | `SpaceVM` + 派生角色行 | purpose/规则 revision/ws-badge/角色行/派发 |
| `DispatchDrawer` | 目标 `RoleVM` | 忙/暂停时提示入队（位置以 Core 为准）；提交只显示"已提交/已入队" |
| `TaskRow` | `TaskVM` + 关联 `RunVM` | Task 态与 Run 态**并列**，互不覆盖 |
| `ConversationView` | `ConversationItemVM[]` | 10 种 kind 全部可见（含 GAP/APPROVAL/系统卡） |
| `Composer` | `RoleVM` | 无进行中任务时禁用并说明；发送后只显示"已提交" |
| `ReconcilePanel` | UNKNOWN `RunVM` | 六种对账动作；明示不自动重跑、留审计 |

## 扩展组件时

- 新状态文案 → 先加进 `status.ts`（label/tone/priority），不要写进页面。
- 新页面 → 从 store 取数，禁止自行 fetch。
- 新写操作 → 包 `CapabilityGate`（readOnlyReason 已由 store 统一计算）。
