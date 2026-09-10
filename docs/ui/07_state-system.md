# 07 状态系统

## 一、五条独立状态道（铁律）

UI 永远分开呈现以下五道，禁止合并成一个"状态灯"：

| 状态道 | 枚举来源（C1） | 展示位 |
|---|---|---|
| Connection | `ConnectionState`（7 态） | 顶栏、项目卡、项目头部 |
| Role（展示态） | 合成态（§四），非合同枚举 | 头像角标、角色行、角色详情头部 |
| Task | `TaskState`（11 态） | 任务卡、队列、时间线 |
| Run | `RunState`（9 态） | Run 卡、活跃任务条 |
| Result/Acceptance | `AcceptanceState`（4 态） | 结果卡、收件箱 |

另：`DeliveryState`（6 态）只用于章程/消息投递内部展示；`SpaceStatus`/`ProjectStatus`（ACTIVE/PAUSED/ARCHIVED、ACTIVE/ARCHIVED）决定容器的可写性，不是角色状态。

## 二、各状态道定义

### Connection

| 状态 | 图标 | 标签 | 颜色 Token | 说明 |
|---|---|---|---|---|
| DISCONNECTED | `○⌁` | 已断开 | `conn.offline` | 数据保持可见（Core 继续运行），写操作禁用 |
| CONNECTING | `◌⌁` | 连接中 | `conn.progress` | |
| CONNECTED_CONTROLLER | `●⌁` | 已连接 · 可控制 | `conn.ok` | 带"Controller"文字徽标 |
| CONNECTED_OBSERVER | `◐⌁` | 已连接 · 只读 | `conn.observer` | 带"Observer"文字徽标，写入口全局禁用+原因 |
| RECONNECTING | `◌⌁` | 重连中 | `conn.progress` | 显示已断时长 |
| DEGRADED | `▲⌁` | 已降级 | `conn.degraded` | 部分能力不可用，capability 清单可查 |
| INCOMPATIBLE | `⛔⌁` | 版本不兼容 | `conn.error` | 阻断，引导升级 |

### Task（`TaskState`）

| 状态 | 图标 | 标签 | Token |
|---|---|---|---|
| QUEUED | `⧉` | 排队中（位置 N） | `task.queued` |
| ACTIVE | `●` | 进行中 | `task.active` |
| WAITING_INPUT | `◐` | 等待输入/下属结果 | `task.waiting` |
| RESULT_STAGED | `▣` | 结果待交付 | `task.staged` |
| DELIVERED | `⇒` | 已交付 | `task.delivered` |
| HANDED_OFF | `⇄` | 已交接 | `task.handedoff` |
| PARTIAL | `◑` | 部分完成 | `task.partial` |
| FAILED | `✕` | 失败 | `task.failed` |
| CANCELLED | `⊘` | 已取消 | `task.cancelled` |
| NEEDS_ATTENTION | `!` | 需要介入 | `task.attention` |
| SUSPENDED | `⏸` | 已挂起 | `task.suspended` |

### Run（`RunState`）

| 状态 | 图标 | 标签 | Token |
|---|---|---|---|
| CREATED | `·` | 已创建 | `run.created` |
| STARTING | `◌` | 启动中 | `run.starting` |
| RUNNING | `●` | 运行中 | `run.running` |
| WAITING_APPROVAL | `⏸!` | 等待审批 | `run.approval` |
| SETTLING | `◍` | 正在收尾 | `run.settling` |
| SUCCEEDED | `✓` | 已成功 | `run.succeeded` |
| FAILED | `✕` | 已失败 | `run.failed` |
| CANCELLED | `⊘` | 已取消 | `run.cancelled` |
| UNKNOWN | `?` | 状态未知 | `run.unknown` |

红线：

- **SETTLING 显示"正在收尾"，绝不显示"完成"**；完成只认 SUCCEEDED + 显式 Result；
- **UNKNOWN 不自动重跑**：唯一入口是对账面板（`run.reconcile`，六动作），并阻止组重构（06 §四）；
- Run 与 Task 同屏时分两行显示，禁止用 Run 态覆盖 Task 态。

### Result/Acceptance（`AcceptanceState`）

| 状态 | 标签 | 说明 |
|---|---|---|
| NOT_REQUIRED | 无需验收 | |
| PENDING | 待验收 | 在收件箱/结果卡高亮 |
| ACCEPTED | 已接受 | |
| REJECTED | 已拒绝 | 附原因 |

## 三、颜色 Token（第一天结构化，亮/暗双主题）

Token 命名语义化，组件不直接引用色值。亮色主题初值（暗色主题 Phase B 同构映射）：

| Token | 值（light） | 用途 |
|---|---|---|
| `status.attention` | `#C7293B`（红） | 需介入、失败、风险高 |
| `status.approval` | `#B25E09`（琥珀） | 待审批、警告 |
| `status.unknown` | `#6D4AC8`（紫） | UNKNOWN、恢复核对（与红区分：是"不确定"不是"错误"） |
| `status.running` | `#1A7F4B`（绿） | 执行中、健康 |
| `status.settling` | `#3E7CB1`（蓝） | 收尾、过渡 |
| `status.waiting` | `#5B6B7C`（灰蓝） | 等待输入/结果、排队 |
| `status.paused` | `#8A8F98`（灰） | 暂停、挂起、归档 |
| `status.idle` | `#B9BEC6`（浅灰） | 空闲 |
| `status.success` | `#1A7F4B` | 成功（与 running 同色不同图标，成功是终态） |
| `conn.*` | 复用 status 色板 | 连接道专用别名 |
| `accent.primary` | `#2F5AB8` | 主按钮、链接（不沿用旧 GUI 蓝绿） |
| `surface.*` / `text.*` | 中性灰阶 8 级 | 背景/文字 |

每个状态 = **图标 + 文字标签 + 颜色**三通道，缺一不可（可访问性硬要求）。

## 四、角色展示态：合成规则与优先级

角色展示态**不是合同字段**，由 UI 从 C1 字段按固定优先级合成（优先级高者胜出）：

| 优先级 | 展示态 | 图标 | 合成条件（C1 字段） |
|---|---|---|---|
| 1 | 需要用户介入 | `!` 红 | 任一 ACTIVE 任务 `taskState=NEEDS_ATTENTION`，或存在该项目该角色的未确认 Issue |
| 2 | 等待审批 | `⏸!` 琥珀 | `pendingApprovalsCount > 0` 或 `runState=WAITING_APPROVAL` |
| 3 | UNKNOWN/恢复核对 | `?` 紫 | `runState=UNKNOWN` 或 `reconciliationRequired=true` |
| 4 | 正在执行 | `●` 绿 | `runState ∈ {STARTING, RUNNING}` |
| 5 | 正在收尾 | `◍` 蓝 | `runState = SETTLING` |
| 6 | 等待输入/下属结果 | `◐` 灰蓝 | `taskState = WAITING_INPUT` |
| 7 | 有任务排队 | `⧉` 灰蓝 | `queuedTasksCount > 0` |
| 8 | 已暂停 | `⏸` 灰 | `status = PAUSED` |
| 9 | 空闲 | `○` 浅灰 | 以上皆不满足且 `status = ACTIVE` |
| 10 | 最近完成 | `✓` 辅助角标 | 最近 10 分钟内有 Run SUCCEEDED（依赖 CCR-UI-12 最近活动时间）；**短时次要标记，不覆盖 1-9** |
| — | 已禁用/已归档 | `⊘` | `status ∈ {DISABLED, ARCHIVED}`，容器级呈现 |

"最近完成"与"角色空闲"的区别：角色是长期身份，"完成"不是永久状态；`✓` 只表达"刚交付了一项任务"的时效信息，10 分钟后自动消退回空闲。

## 五、组/项目聚合态

- 组卡/项目卡不合成单一状态，用**计数条**（▶运行 / ⚠介入 / ⏸审批 / ⧉排队）；
- 组内任一角色触发优先级 1-3，组名旁出现对应图标 + 计数；
- ARCHIVED 组整体灰显 + "已归档·只读"文字。

## 六、UNKNOWN 专门规范

- 出现处：Run 卡、角色详情、审批与问题页、顶栏"待介入"计数；
- 文案统一："状态未知：Core 与原生会话失去确认。不会自动重跑。"；
- 对账动作六选一（`run.reconcile`）：confirm_native_completed / confirm_no_side_effect_and_retry / mark_failed / reattach_native_session / quarantine_workspace / release_after_manual_verification，均需附证据（evidence_ids）；
- 未对账 UNKNOWN 是组重构 blocker（06 §四）。

## 七、意图与运行分离

时间线与组卡中，"谁让谁做什么"（任务意图，来自 ROUTE_TASK）与"实际运行到哪"（Run/Task 态）分轨道渲染：

```text
意图轨:  林岚 → 周实现「登录接口」→ 陈复核「复核」
状态轨:  ●Run#412 运行中 12:31      ◐等待上游结果
```

禁止写"复核正在进行"当复核角色的 Run 尚未启动。

## 八、组与 worktree 状态表达

- 组徽标（通信边界）与工作区徽标（文件边界）永远成对出现；
- 工作区写互斥：同一物理工作区存在写 Run 时，其他组的工作区徽标叠加 `🔒写占用中`；
- 合并不合并 worktree 的提示见 06。

## 九、Controller / Observer

| 能力 | Controller | Observer |
|---|---|---|
| 查看全部数据 | ✓ | ✓ |
| 派发/取消/审批/对账/重构/应用方案 | ✓ | ✕（按钮禁用 + Tooltip"当前为只读连接"） |
| 全局暂停 | ✓ | ✕ |
| 租约显示 | 显示租约剩余/续期 | 显示"获取控制"入口（`control.acquire`，冲突时显示持有者） |

写操作报 `CONTROL_LEASE_REQUIRED` 时，UI 引导至租约条而非报错弹窗。

## 十、Local / SSH 差异

| 项 | Local | SSH |
|---|---|---|
| 连接徽标 | `⌂ Local · 本机` | `⌁ SSH · 主机名` |
| 目录选择 | 系统对话框 | Core 远端浏览器（`filesystem.listRoots/listDirectory`） |
| 断线表现 | 几乎不发生；发生即 INCOMPATIBLE 级处理 | 常见：RECONNECTING 倒计时，项目卡降饱和，数据冻结在最后一致快照并标注"数据截至 12:04:33" |
| 路径显示 | 本地路径 | 远程路径（来自 Core，不拼接本地分隔符） |
| 能力 | 全量 | 依 `Capabilities.remote_filesystem` 等降级 |

除此之外**两模式共用全部界面与组件**，不做 SSH 专属页面。

## 十一、状态到 fixtures 的映射

每个展示态至少一个 Mock 场景（09 的 sc-09 ~ sc-16、sc-25 ~ sc-27），断言中明确"合成输入 → 期望展示态"，Phase B 以此写单元测试。
