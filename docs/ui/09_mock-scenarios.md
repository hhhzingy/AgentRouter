# 09 Mock 场景（28 个）

## 一、约定

- 一景一文件：`fixtures/ui-proposals/<组>/sc-<nn>-<名>.json`；
- 快照数据一律使用 **C1 VM 形状**（`snapshot` 键）；C1 缺失、需 C1R1 提供的数据放在 **`x_proposal`** 键并标注 CCR 编号，Phase B 不得把 `x_proposal` 当作已冻结合同；
- `expected_ui` 是给 Phase B 的可执行断言（状态合成、渲染规则、红线检查）；
- fixtures 全部使用假名与掩码，无任何凭据形态数据；
- 统一假名：项目 `proj_atlas`（支付中台重构，SSH）/ `proj_nova`（官网改版，Local）；角色 林岚(规划) 周实现(执行) 陈复核(复核) 苏界面(UI) 唐测试(测试) 何文档(文档)；时间基准 `2026-09-09T13:30:00+08:00`（ms 1788931800000）。

## 二、场景索引

### 首页与项目卡（home/）

| # | 场景 | 验证点 |
|---|---|---|
| 01 | 空首页 | 空态文案 + 创建卡唯一内容；无"暂无记录"式兜底 |
| 02 | 多项目 | 网格排序（最近活动倒序）、Local/SSH 混合徽标、`+N` 组 |
| 03 | Local 单组项目 | Local 徽标、路径本地形态、1 组行 |
| 04 | SSH 项目 | SSH 徽标+主机、远程路径简写、能力依 Capabilities |

### 协作组（groups/）

| # | 场景 | 验证点 |
|---|---|---|
| 05 | 两个隔离组 | 组卡并列；组 A 角色下拉里看不到组 B 角色；组≠worktree 徽标成对 |
| 06 | 组内三角色 | 规划/执行/复核任务链；意图轨与状态轨分离 |
| 07 | 跨组拒绝 | Core 拒绝事件以 SYSTEM_EVENT 呈现"组隔离由 Core 强制"；无绕过提示 |
| 08 | 两组并行 | 不同 worktree 并行写；同物理工作区 🔒写互斥徽标 |

### 执行状态（execution/）

| # | 场景 | 验证点 |
|---|---|---|
| 09 | 活跃 Run | 角色态=正在执行；Run/Task 分行 |
| 10 | SETTLING | 显示"正在收尾"，禁止"完成"字样 |
| 11 | WAITING_APPROVAL | 角色态=等待审批（优先级 2）；审批卡可决定 |
| 12 | NEEDS_ATTENTION | 角色态=需要介入（优先级 1，压过执行中）；进顶栏计数 |
| 13 | UNKNOWN | 紫 `?`；不自动重跑；对账面板六动作；阻断组重构 |
| 14 | 三项排队 | queuePosition 1/2/3；派发抽屉提示"将进入队列，位置 4" |
| 15 | 等待子结果 | 角色态=等待输入/下属结果（优先级 6）；意图轨显示依赖 |
| 16 | 结果给用户 | 收件箱出现显式结果卡；Acceptance PENDING→接受/拒绝；成功发信无回执 |
| 17 | Handoff | HANDED_OFF 交接卡；交接双方向；最近交接条更新 |

### 编排与模型（role-plan/）

| # | 场景 | 验证点 |
|---|---|---|
| 18 | Role Plan 有效 | Review 全要素；Apply 差异"全部新增"；应用后角色"待初始化"直到章程 DELIVERED |
| 19 | Role Plan 错误 | 逐条 Schema 错误定位（坏 key/缺字段/越界引用）；不可 Apply |
| 20 | 权限请求超出 | 超界项标红默认剔除；实际权限只能收窄；公式文案呈现 |
| 21 | 模型需登录 | seed 目录可选但标"需登录验证"；禁止启动可存草稿 |
| 22 | 六个 pi seed | 6 模型全列出；推理档位按模型原生（low/high/max vs none/low/medium/xhigh）；不冒充可用 |

### 组重构（reconfigure/）

| # | 场景 | 验证点 |
|---|---|---|
| 23 | 合并 blockers | 活跃 Run/UNKNOWN/账号切换/未处置队列 → 全部阻断；无"忽略继续"按钮 |
| 24 | 拆分新会话 | 默认 NEW_SESSION_WITH_HANDOVER；每角色唯一目标组；旧组只读归档 |

### 连接与账号（connection/）

| # | 场景 | 验证点 |
|---|---|---|
| 25 | SSH 断线 | RECONNECTING/DISCONNECTED 呈现；数据冻结标注"截至"；Core 侧 Run 继续（顶栏计数不动） |
| 26 | Observer | 写入口全禁用+原因；"获取控制"入口；租约冲突显示 |
| 27 | 历史缺口 | GAP 卡明示时间区间与不可恢复；不静默跳过、不伪造内容 |
| 28 | 账号切换 | 切换进度可见；进行中阻断组重构；完成后模型清单需重新确认 |

## 三、状态合成测试矩阵（07 §四 的可执行版）

| 场景 | 输入（C1 字段） | 期望角色展示态 |
|---|---|---|
| sc-12 | taskState=NEEDS_ATTENTION | 需要用户介入（1） |
| sc-11 | pendingApprovalsCount=1, runState=WAITING_APPROVAL | 等待审批（2） |
| sc-13 | runState=UNKNOWN, reconciliationRequired=true | UNKNOWN/恢复核对（3） |
| sc-09 | runState=RUNNING | 正在执行（4） |
| sc-10 | runState=SETTLING | 正在收尾（5） |
| sc-15 | taskState=WAITING_INPUT | 等待输入/下属结果（6） |
| sc-14 | queuedTasksCount=3, 无活跃 Run | 有任务排队（7） |
| sc-26 附加 | status=PAUSED | 已暂停（8） |
| sc-16 附加 | 近 10 分钟 Run SUCCEEDED，无其他信号 | 空闲 + ✓最近完成辅助角标 |

优先级断言：sc-12 中角色同时 runState=RUNNING，必须显示"需要用户介入"而非"正在执行"。

## 四、使用方式（Phase B）

1. 每个 fixture 可加载为 Mock Transport 的快照响应（`system.snapshot` 的返回形态）；
2. `expected_ui` 逐条转为组件测试断言；
3. `x_proposal` 字段在 C1R1 冻结后替换为正式字段名并删除该键；
4. 新增场景必须先在此文档登记编号与验证点。
