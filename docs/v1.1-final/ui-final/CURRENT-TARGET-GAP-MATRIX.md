# P0 CURRENT ↔ TARGET 视觉差异矩阵（V1，改代码前）

基线 SHA：`cd6fc5537126eb8af40aed604da273eef22599d9`。所有 P0 参考图已实际查看。CURRENT 图分两类：执行包的 `CURRENT-*` 是真实 Electron 截图；本分支 `screenshots/01–09` 是固定 `PREVIEW_MOCK` 截图，源码自 `a809417` 至基线 SHA 未变。下文以 `P/` 表示执行包 `refs/PRIMARY/`，`C/` 表示 `refs/CURRENT_IMPLEMENTATION/`，`S/` 表示本分支 `docs/v1.1-final/ui-final/screenshots/`。后者只用于视觉现状，不作为 REAL_CORE 证据。

状态仅使用 `NEEDS_VISUAL_REWORK` 或 `BLOCKED_CONTRACT`。本矩阵记录差异，不宣称已收敛。参考图的假能力和错误状态机均不继承。

## 1. Global Shell — NEEDS_VISUAL_REWORK

证据：`P/project.png`、`P/10_05_17-4`；`C/01`、`C/02`、`C/04`、`S/01`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前全局左栏始终保留，项目页另有顶部 tabs；目标进入项目后切换为单一 Project Shell。 |
| Layout / grid | 当前横向顶栏、全局侧栏、项目 tabs 三层争抢空间；目标固定窄侧栏与清晰内容/右栏。 |
| Information hierarchy | `LOCAL_CORE`、Core 正常、This PC、租约和底栏原始标识重复；目标一次表达 Core/lease。 |
| Primary / secondary actions | 当前申请控制/转只读在顶栏，项目动作漂浮；目标在相应上下文呈现，保留可见权限状态。 |
| Interaction flow | 项目与全局导航同时可操作，返回路径不清；目标 `← Projects` 和对象 breadcrumb。 |
| Component structure | 当前顶栏徽标/横幅/侧栏状态重复；目标统一 CoreIdentity、SideNav、ControllerGate。 |
| Typography | 当前技术标签和多处状态与页面标题同级；目标标题 28–32、正文 13–14、技术仅 Advanced。 |
| Spacing / density | 顶部拥挤而下部留白；目标将首屏留给业务对象。 |
| State semantics | Connected、Core healthy、Controller 分开但重复；目标保留区分且避免绿色表示所有状态。 |
| Responsive / dark | 当前 dark 有基础但结构不变，Mobile 压缩桌面布局；目标分别验证窄窗、深色和 Mobile IA。 |

## 2. Projects — NEEDS_VISUAL_REWORK

证据：`P/project.png`；`C/02`（真实空态）、`S/01`、`S/08`（丰富预览）。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 全局三级导航已存在；目标保持 Projects 为首页，并让项目卡成为主要入口。 |
| Layout / grid | 当前真实空态占一整条虚线区域；丰富预览虽有卡片但宽而稀；目标紧凑卡片网格与 New Project 卡。 |
| Information hierarchy | 当前卡片优先展示 SSH/Core/技术状态；目标名称、active/attention、Role preview、最近活动。 |
| Primary / secondary actions | 当前建项目 CTA 在空态下方且被 observer 禁用；目标显著 New Project 与清楚的只读原因。 |
| Interaction flow | 当前卡片有独立“打开”按钮；目标卡片主体可进入，overflow 只放真实可用动作。 |
| Component structure | 当前 Role 用头像/小点堆叠；目标 3–5 条姓名与状态的紧凑预览。 |
| Typography | 当前“项目”与技术路径层级接近；目标 Projects 标题、路径次级并截断。 |
| Spacing / density | 当前两张卡后首屏大块空白；目标稳定网格、紧凑空态。 |
| State semantics | 当前“状态未知”和 run/attention 混在卡顶；目标摘要与真实 Role 状态分开。 |
| Responsive / dark | 当前 dark token 可读，但卡片密度/列数未收敛；目标浅深结构一致并自然降列。 |

## 3. Project Workbench — NEEDS_VISUAL_REWORK

证据：`P/10_05_17-4`；`C/04`、`S/02`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前项目 tabs 与全局侧栏并列；目标 Project Shell 侧栏仅 Back/Workbench/Activity/Results/Settings。 |
| Layout / grid | 当前所有区块纵向全宽堆叠；目标 Attention + Role 网格主区，Running/Queue 和 Recent Results 右栏。 |
| Information hierarchy | 当前统计条和 Group 先于 Role；目标 Attention → Roles，运行/结果为次级。 |
| Primary / secondary actions | 当前“添加角色/编辑角色”和“待处理”并列；目标唯一顶部主动作 New Role。 |
| Interaction flow | 当前从小组管理/派发进入 Role；目标 Role card Open、attention 就地 Reply/Review/Reconcile。 |
| Component structure | 当前 Group 大卡包多行 Role；目标独立 Role card，Group 仅过滤/组织。 |
| Typography | 当前中文/英文 eyebrow、技术 Run 字段混用；目标统一角色名/使命/WS/任务层级。 |
| Spacing / density | 当前丰富数据使页面超过两屏，右侧空白；目标 1440 首屏看见八个角色的紧凑结构。 |
| State semantics | 当前 `RUN_UNKNOWN` 以红色问题呈现；目标 Unknown 独立警示，不能当 confirmed failure。 |
| Responsive / dark | 当前 960/390 只是纵向压缩；目标右栏下沉、角色列数变 3/2/1，深色结构保持。 |

## 4. Role Detail — NEEDS_VISUAL_REWORK

证据：`P/10_25_13-4`；`S/03`（当前同源代码预览，真实当前截图缺失）。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前 Role 在全局左栏下展开长页；目标项目侧栏 + Workbench breadcrumb。 |
| Layout / grid | 当前 Identity/WS/Work/Composer/Conversation/Slots 全宽串联；目标 Identity、Current WS/Work、WorkSessions 三列及权限右栏。 |
| Information hierarchy | 当前 Conversation 和 Task Composer 长度压过当前 WS；目标 attention、当前工作先呈现。 |
| Primary / secondary actions | 当前“新建并继承上下文”在 WS 卡内但 disabled；目标经过 preflight 的 New WorkSession。 |
| Interaction flow | 当前任务内容/会话/Slot 混在长滚动；目标 Current/Planned/History 明确分区并可进入对象详情。 |
| Component structure | 当前通用 Section 与原生表单为主；目标紧凑 WorkSession rows、Current Work、Charter/Activity rails。 |
| Typography | 当前 raw `role_chen`、`codex session a1b2` 可见；目标人类名称为主，技术 ID 进 Advanced。 |
| Spacing / density | 当前单 Role 长达约 2300px；目标首屏看到身份、当前 WS、当前工作、历史入口。 |
| State semantics | 当前“收尾中”和 Slot 不支持说明真实；目标保留，历史永远 READ ONLY，Binding 不等于 Running。 |
| Responsive / dark | 当前缺同路由当前 dark 截图；目标窄窗从 3+1 列安全下沉，不丢动作。 |

## 5. New WorkSession — BLOCKED_CONTRACT

证据：`P/10_46_30-2`；`S/03` 的“当前 Core 尚不支持此操作”，`apps/desktop/workbench/pages-role.tsx`。当前无可进入的完整 Wizard 截图。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前是 Role 内禁用动作；目标 Role → 独立 Preflight → Setup/Context/Review。 |
| Layout / grid | 当前无对话页；目标大尺寸步骤面板、处理进度和 Unknown/Success 结果页。 |
| Information hierarchy | 当前只提示不支持；目标 Session Type、真实 Harness 能力、上下文容量与旧 WS 安全状态。 |
| Primary / secondary actions | 当前按钮 disabled；目标 Reply/View Task、Create Slot（有合同才显示）、Review/Create/Check Again。 |
| Interaction flow | 当前不能完成；目标 6 个真实处理阶段但只显示 Core 报告的阶段。 |
| Component structure | 当前无 RadioCard/Step/Progress/Reconcile 组合；目标复用设计系统。 |
| Typography | 当前“新建并继承上下文”把策略固定在动作名；目标先命名选择，再解释 transfer。 |
| Spacing / density | 当前缺页；目标可在 1440/960 清楚比较选项。 |
| State semantics | 当前安全禁用；目标源 WS 在确认前 ACTIVE，容量未知不伪装 Fits，Unknown 不盲 retry。 |
| Responsive / dark | 当前无证据；目标 Wizard 浅深与窄窗验证。 |

## 6. Connections — NEEDS_VISUAL_REWORK

证据：`P/17_08_15-5`；`C/03`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前名为“远程设备”，虽在 Connections 入口；目标连接控制中心。 |
| Layout / grid | 当前 Core 条 + Pair form + Devices 纵列；目标 Core/lease 主区，Clients/Participants/Devices 分区。 |
| Information hierarchy | 当前环境开关提示和 dataset ID 抢首屏；目标连接健康和控制权。 |
| Primary / secondary actions | 当前“生成配对码”主导；目标 Connect Core / Request Controller，Pair 为次级。 |
| Interaction flow | 当前只见本机配对；目标 Core detail → access → 分类对象；无合同的 Add Client 不出现。 |
| Component structure | 当前裸 select/checkbox/input；目标 Core card、Controller panel、分类 tabs/list、Pair sheet。 |
| Typography | 当前 raw env var 与 dataset 身份可见；目标用户名称，细节放 Advanced。 |
| Spacing / density | 当前表单占多数、下方空；目标紧凑概览和对象列表。 |
| State semantics | 当前只读/transport 未验证显示真实；目标 Paired、Connected、Controller 明确分开。 |
| Responsive / dark | 当前无 P0 对照的 dark/窄窗证据；目标保持可读且分类不挤压。 |

## 7. Activity — NEEDS_VISUAL_REWORK

证据：`P/17_19_45`；`C/05`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前作为项目顶部 tab；目标 Project Shell 的 Activity。 |
| Layout / grid | 当前两条全宽筛选后巨大空白；目标 timeline 主区、summary/attention 右栏、detail drawer。 |
| Information hierarchy | 当前过滤器先于内容且无业务概览；目标事件、actor/object、时间及关联对象。 |
| Primary / secondary actions | 当前只有筛选；目标 Attention filter、事件 Open/Review。 |
| Interaction flow | 当前不可查看事件详情；目标 row → 业务 drawer → 关联 Task/Result。 |
| Component structure | 当前原生 select；目标 FilterBar、Timeline、紧凑 EmptyState。 |
| Typography | 当前技术“已加载 0 条”等占视觉；目标人类可读事件标题。 |
| Spacing / density | 当前 1440 高度大部分留空；目标紧凑空态，丰富状态合理密度。 |
| State semantics | 当前没有 stale/unknown 的事件表达；目标显示数据 freshness，区别 attention 与确认结果。 |
| Responsive / dark | 当前未见暗色对照；目标 drawer/filters 在窄窗下可用。 |

## 8. Results List / Result Detail — NEEDS_VISUAL_REWORK

证据：`P/17_24_58-3`；`C/06`、`S/04`、`S/09`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前项目 tab 内“交付给我/文件与报告”；目标 Project Shell 的 Results 索引及正式详情。 |
| Layout / grid | 当前真实空收件箱占整行；丰富预览是卡+右侧嵌入详情；目标 summary/filter/table 或响应式 list+preview。 |
| Information hierarchy | 当前标题/Task/Run/Delivery 混用；目标 Result title、发布、验收、证据分层。 |
| Primary / secondary actions | 当前“接受/拒绝”直接在列表卡；目标 Preview/Open 后按真实状态 Review/Request Changes。 |
| Interaction flow | 当前详情嵌在页内并缺标准 Overview/Artifacts/Evidence/Activity；目标详情流程完整。 |
| Component structure | 当前 artifact 行与按钮尺寸不一；目标 ResultRow、status、artifact/evidence 复用。 |
| Typography | 当前 raw `run_413`、`task_review` 与中文标题并列；目标技术 ID 次级。 |
| Spacing / density | 当前空态过高、丰富态信息散；目标紧凑列表与窄窗卡片。 |
| State semantics | 当前 `DELIVERED` + `PENDING` 两层仍区分；目标明确 Published ≠ Accepted，Evidence ≠ Acceptance。 |
| Responsive / dark | 当前 430 预览有底导航覆盖内容风险；目标完整移动 Result review 和可达动作。 |

## 9. Settings（Global + Project）— NEEDS_VISUAL_REWORK

证据：`P/17_29_42`；`C/01`、`C/07`、`S/07`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前 Global 与 Project 已分开，但项目设置仍顶部 tabs；目标 Project Shell 内分组设置。 |
| Layout / grid | 当前 Global 四大卡、Project 二列大卡；目标分组侧栏/表单主区，Advanced 单独层。 |
| Information hierarchy | 当前默认 Global 暴露 dataset UUID/合同/raw enum；目标 Appearance/Startup/Remote shortcut/Diagnostics。 |
| Primary / secondary actions | 当前主题可操作、项目卡有分散链接；目标仅真实可控项有 Save/Action。 |
| Interaction flow | 当前用户需回 Projects 选项目；目标 Global/Project 层级清楚，Observer 只读有原因。 |
| Component structure | 当前 segmented 主题已存在，但 Project 内容是说明卡；目标统一 Field/Select/Section/Diagnostics。 |
| Typography | 当前 mono/contract label 占主视觉；目标技术标识只在 Advanced。 |
| Spacing / density | 当前大片低信息区域；目标紧凑可浏览设置。 |
| State semantics | 当前 Observer 标识正确；目标 disabled 明确原因，remote path 不触发本地 picker。 |
| Responsive / dark | 当前 dark 有 token 基础；目标浅深层级和窄窗表单验证。 |

## 10. State Library — NEEDS_VISUAL_REWORK

证据：`P/17_48_14-6`；当前无独立状态库截图，现有 UI 有局部 Badge/Banner/Section，见 `S/02`、`S/03`、`S/07`。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 状态库是跨页组件规范，非顶级路由；目标至少两页复用每类关键状态。 |
| Layout / grid | 当前散落于长页；目标统一 loading/empty/offline/attention/unknown/outcome 模式。 |
| Information hierarchy | 当前部分 raw enum 先于用户解释；目标状态标题、影响、下一步、详情。 |
| Primary / secondary actions | 当前 unknown 有时跳“检查并对账”；目标所有不确定副作用都只 Check Status/Details。 |
| Interaction flow | 当前各页不一致；目标 ControllerGate、ReconcilePanel、DestructiveConfirm。 |
| Component structure | 已有若干 primitive，但缺共享 Skeleton/Select/Timeline/Sheet 等。 |
| Typography | 当前状态 badge 字号、语言不一；目标统一用词和层级。 |
| Spacing / density | 当前提示和卡片尺寸不一致；目标紧凑、可复用状态结构。 |
| State semantics | 参考图中的普通 Retry 不可照搬；Unknown、Failed、Accepted 分别保真。 |
| Responsive / dark | 当前无完整状态集双主题证据；目标在桌面和手机实际页面复用。 |

## 11. Mobile — NEEDS_VISUAL_REWORK

证据：`P/17_59_04-5`、`P/17_59_06-6`；`S/06`、`S/09`（当前 390/430 预览）。

| 维度 | CURRENT ↔ TARGET 差异 |
|---|---|
| IA / navigation | 当前底栏仍是 Projects/Connections/Settings；目标 Home/Activity/Results/More。 |
| Layout / grid | 当前桌面 Project 页压成超长单列；目标 Intervention Home、对象详情和 bottom sheet。 |
| Information hierarchy | 当前顶栏与项目统计占前屏；目标 Needs Attention 优先、Running 次之。 |
| Primary / secondary actions | 当前多为“查看”且 Observer CTA 占顶端；目标 Reply/Review/Request Controller 在对应状态可达。 |
| Interaction flow | 当前从项目 tab 导航；目标 Home → Role/Task/Result、未知回复保留草稿并 Check Status。 |
| Component structure | 当前桌面卡片和 tabs 缩小；目标 44px 触控、sticky action、sheet、Core selector。 |
| Typography | 当前在 390 下技术字段和密集中文变小；目标短标签与可读正文。 |
| Spacing / density | 当前 390 首页超过 3000px；目标重要任务首屏可见。 |
| State semantics | 当前 observer/controller 区分仍真；目标 Connected ≠ Controller，reply unknown 不重复发。 |
| Responsive / dark | 当前 430 图显示固定底栏覆盖详情；目标 390/430/landscape、浅深及安全区验证。 |

## 附加对象页（随 P0 流程验收）

- Task Detail / WAITING_INPUT / Reply：目前无独立路由截图，Role Current Work 与 Workbench attention 是现状证据。P1 `15_03_00` 只提供语义参考。需要独立记录旧 Run settled → TaskInput → 新 Run 的真实合同和截图。
- Result Detail：目前嵌在 Results 列表，需独立 Preview/Detail 的结构与 Published/Acceptance 两条状态轨。
- New WorkSession：现有 Core capability gate 使 Preview Mock 不可进入。不得为获得截图绕过真实能力；先实现可安全展示的 UI 状态，再将需要 Core 字段/命令的部分登记合同差距。
