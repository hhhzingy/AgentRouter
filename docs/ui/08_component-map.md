# 08 组件地图（组件 → ViewModel 依赖）

约定：

- **C1** = 现有 `agentrouter-client/1` 已有 VM/方法，可直接依赖；
- **CCR-nn** = 缺口，见 `contract-change-requests.md`，Phase A 不自行发明字段，fixtures 中以 `x_proposal` 演示；
- 组件名为逻辑名（非最终实现类名）。

## 一、全局壳

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `AppTopBar` | 顶栏：连接、健康、计数、全局暂停 | C1 `CoreHelloVM`、`Capabilities`、`runtime.getActiveWork`、`issue.list`、`approval.list`、`runtime.pauseDispatch/resumeDispatch` |
| `ConnectionBadge` | Local/SSH + Controller/Observer 徽标 | C1 `ConnectionState`、`LeaseVM` |
| `GlobalCountBadge` | 活跃Run/待介入/待审批计数 | C1 上述 list 方法聚合 |
| `ObserverWriteGuard` | Observer 态写操作禁用包装 | C1 `ConnectionState` + 错误码 `CONTROL_LEASE_REQUIRED` |
| `CapabilityGate` | capability 缺失时禁用新功能 | C1 `Capabilities.methods/harnesses` |

## 二、首页

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `ProjectCardGrid` | 响应式网格 + 虚拟滚动 | C1 `project.list` |
| `ProjectCard` | 项目卡（02 §二） | C1 `ProjectVM`；**CCR-01** 组/角色摘要、**CCR-12** 最近活动 |
| `GroupSummaryRow` | 卡组行：组名+角色头像≤5+`+N` | **CCR-01** |
| `RoleAvatar` | 头像+名缩写+状态角标（全应用复用） | C1 `RoleVM`（合成态 07 §四）；角色色 = role_id 哈希 |
| `CreateProjectCard` | 同尺寸创建卡 | — |
| `ProjectWizardDialog` | 创建项目五步向导 | C1 `filesystem.listRoots/listDirectory/validateProjectRoot`、`project.create`；SSH 分支依赖 `Capabilities.remote_filesystem` |
| `EmptyState` | 全应用复用空态（01 §十二 文案表） | 各页上下文 |

## 三、项目页

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `ProjectHeader` | 项目头部 | C1 `ProjectVM`、`ConnectionState`；**CCR-01** Git/自动派发 |
| `ProjectTabs` | 八页签 + 未读计数 | C1 `inbox.list`、`issue.list`、`approval.list` |
| `SpaceCardBoard` | 概览组卡布局（卡片/列表/看板切换） | C1 `space.list` |
| `SpaceCard` | 组卡（03 §三） | C1 `SpaceVM`、`role.list`、`task.list`、`issue.list`；**CCR-06** 工作区徽标、**CCR-10** purpose/规则 revision |
| `ActiveRunStrip` | 概览顶部活跃任务条 | C1 `run.list`（非终态） |
| `HandoffStrip` | 最近交接条 | C1 `message.listTimeline`（HANDED_OFF/ROUTE_RESULT） |
| `TaskDispatchDrawer` | 派发任务抽屉（03 §六） | C1 `task.createFromUser`、`role.list`（队列提示）；结果去向选项受同组约束 |
| `QueueIndicator` | "将进入队列，位置 N" | C1 `TaskVM.queuePosition` |

## 四、编排与角色创建

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `PlanEntryCards` | 三入口卡（04 §二） | — |
| `PlanImportEditor` | 粘贴/文件导入 + 即时 Schema 校验 | `agentrouter-role-plan/1`（执行包 schemas/，静态打包进 UI） |
| `PlanValidationList` | 逐条错误定位 | 校验器输出 |
| `RolePlanReviewTree` | Review 左树（项目→组→角色） | Role Plan 文档 |
| `RoleSpecCard` | Review 右卡（职责/非职责/输入输出/去向） | Role Plan 文档 |
| `PermissionComparePanel` | 请求 vs 实际权限对照（04 §六） | Role Plan `requested_permissions`；实际权限 = CCR-03 apply 返回快照 |
| `ModelSelectCascade` | Harness→Profile→目录→模型→推理 级联 | **CCR-02** `model.list/get/refresh`、`provider.listProfiles`；未登录降级 seed（执行包 `seeds/pi-model-catalog.v1.json` 形态） |
| `AvailabilityBadge` | RUNTIME/VERIFIED_CACHE/SEED + AVAILABLE/REQUIRES_LOGIN/UNVERIFIED/RETIRED | **CCR-02** `ModelDescriptor` |
| `ReasoningLevelPicker` | 模型原生档位选择（不支持则隐藏） | **CCR-02** `reasoning.levels/default` |
| `PlanApplyFooter` | 差异确认 + 原子应用 | **CCR-03** `rolePlan.validate/preview/apply`（幂等键 CCR-14） |

## 五、角色详情

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `RoleHeader` | 名/组/合成状态灯 | C1 `RoleVM`、`role.rename` |
| `RoleCharterSystemCard` | 对话第一条章程系统卡（05 §三） | **CCR-04** `roleCharter.get/listRevisions` + DeliveryState |
| `ConversationStream` | 对话流（含全部 Kind 渲染与 GAP 卡） | C1 `conversation.read`（`ConversationItemVM`） |
| `RouteEventCard` | ROUTE_TASK/ROUTE_RESULT 卡 | C1 `ConversationItemVM` |
| `ToolCallCard` | 工具调用折叠卡 | C1 `ConversationItemVM` |
| `ConversationComposer` | 输入 + "已送达" + 队列提示 | C1 `conversation.sendUserInput`；红线：无回执 |
| `TaskStateCard` / `RunStateCard` | Task/Run 分行状态卡 | C1 `TaskVM`/`RunVM` |
| `UnknownReconcilePanel` | UNKNOWN 对账（六动作+证据） | C1 `run.reconcile`、`ReconcileParams` |
| `ApprovalDecisionCard` | 审批决定 | C1 `approval.list/decide` |
| `RoleQueueList` | 队列 + 取消 | C1 `task.list/cancel` |
| `BindingHistoryList` | 当前/历史 Binding | C1 `binding.getCurrent/listHistory` |
| `GroupChangeHistory` | 组变更记录 | **CCR-10** membership history |
| `EffectivePermissionPanel` | 有效权限（非请求） | **CCR-07** |

## 六、组重构

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `ReconfigureWizard` | 10 步骨架 + 步骤失效管理 | **CCR-05** `space.reconfigure.*` |
| `RoleAssignmentMatrix` | 角色→目标组分配 | C1 `role.list`；**CCR-05** preview.proposed_destinations |
| `QueueDispositionTable` | 排队任务四选一处置 | **CCR-05/15** 处置枚举 |
| `SessionPolicyPicker` | 会话连续性三选一 | **CCR-05/15** |
| `PreviewBlockerList` | blockers 分组（阻断/警告）+ 去处链接 | **CCR-05** preview.blockers；**CCR-11** 账号切换 blocker |
| `ReconfigureProgress` | Commit 分步进度 + 回滚说明 | **CCR-05** commit/get |

## 七、时间线 / 收件箱 / 审批与问题 / 产物 / 模型与账号

| 组件 | 职责 | 数据依赖 |
|---|---|---|
| `TimelineView` | 人类语义流 + 意图/状态双轨 | C1 `message.listTimeline`；筛选维度 **CCR-09** |
| `TimelineFilters` | 组/角色/任务/Run/类型/时间 | **CCR-09**（可降级客户端过滤） |
| `InboxList` | 用户结果与通知 | C1 `inbox.list/markRead`；分区 **CCR-16** |
| `ResultCard` | 结果卡：去向、Acceptance、接受/拒绝 | C1 `ResultVM`、`result.accept/reject` |
| `IssueList` / `IssueCard` | 问题列表/确认/解决 | C1 `issue.list/acknowledge/resolve`；跨组拒绝文案 **CCR-13** |
| `ArtifactTable` | 产物表格 + 校验/下载/读片段 | C1 `artifact.list/get/verify/download/readChunk` |
| `AccountProfileList` | Profile、掩码身份、状态、配额 | C1 `account.listProfiles/getStatus`、`quota.listSnapshots` |
| `AccountSwitchProgress` | 账号切换进度（重构 blocker 来源） | C1 `account.switch`；**CCR-11** 进行中状态查询 |
| `ModelCatalogPanel` | 模型目录分组 + source/availability | **CCR-02** |

## 八、缺口汇总

| CCR | 影响的组件 |
|---|---|
| CCR-01 项目卡摘要 | ProjectCard、GroupSummaryRow、ProjectHeader |
| CCR-02 模型目录 | ModelSelectCascade、AvailabilityBadge、ReasoningLevelPicker、ModelCatalogPanel |
| CCR-03 Role Plan | PlanApplyFooter、PermissionComparePanel |
| CCR-04 Role Charter | RoleCharterSystemCard、章程摘要 |
| CCR-05 组重构 | ReconfigureWizard 全部 |
| CCR-06 工作区 | SpaceCard、RoleDetail、ModelSelectCascade（工作区步） |
| CCR-07 有效权限 | EffectivePermissionPanel、PermissionComparePanel |
| CCR-08 展示态派生 | RoleAvatar、RoleHeader（可客户端合成，建议服务端） |
| CCR-09 时间线筛选 | TimelineFilters |
| CCR-10 组历史/成员 | GroupChangeHistory、SpaceCard、归档组视图 |
| CCR-11 账号切换态 | AccountSwitchProgress、PreviewBlockerList |
| CCR-12 最近活动 | ProjectCard、RoleAvatar（最近完成） |
| CCR-13 Issue code 清单 | IssueCard（跨组拒绝等文案） |
| CCR-14 Apply 幂等/进度 | PlanApplyFooter |
| CCR-15 处置/会话枚举 | QueueDispositionTable、SessionPolicyPicker |
| CCR-16 收件箱分区 | InboxList |
