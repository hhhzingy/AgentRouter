# 01 信息架构（IA）

## 一、全局结构

```text
AgentRouter（桌面应用，Electron 壳）
│
├─ 顶栏（全局，见 §二）
│
├─ /                        首页：项目卡网格 + 创建项目卡
│
├─ /projects/new            创建项目向导（全屏向导）
│
├─ /projects/:projectId     单项目页（八个一级页签）
│   ├─ ?tab=overview        概览（协作组卡片为中心）
│   ├─ ?tab=spaces          协作组与角色
│   ├─ ?tab=timeline        协作时间线
│   ├─ ?tab=inbox           用户收件箱
│   ├─ ?tab=approvals       审批与问题
│   ├─ ?tab=artifacts       产物
│   ├─ ?tab=models          模型与账号
│   └─ ?tab=settings        项目设置
│
├─ /projects/:projectId/roles/:roleId      角色详情（三栏，窄屏转页签）
│
├─ /projects/:projectId/plan               角色编排（AI 生成/导入/手工 → Review）
│
├─ /projects/:projectId/spaces/:spaceId/reconfigure   组重构向导（全屏向导）
│
└─ /connections             连接与设置（Core 连接、全局偏好）
```

路由原则：

- 角色详情、编排、重构都**带项目上下文**，无项目归属的页面不存在；
- 角色详情支持从项目卡/组卡点击后以**宽侧栏**形式快速查看（保留项目页背景），深链接仍落到独立路由；
- Observer 模式（无控制租约）下，所有写操作入口全局降级为禁用 + 原因提示，不做隐藏（见 07 §九）。

## 二、顶栏（全局）

```text
┌──────────────────────────────────────────────────────────────────┐
│ ◆ AgentRouter │ ⌁ Local · 本机 (Controller) │ ● 健康 │           │
│               │ ▶ 2 活跃 Run │ ⚠ 1 待介入 │ ⏸ 3 待审批 │ ⏸❚❚ │ ⚙ │
└──────────────────────────────────────────────────────────────────┘
```

| 元素 | 数据 | 说明 |
|---|---|---|
| 产品标识 | — | 点击回首页 |
| Core 连接 | `CoreHelloVM.connectionState` / `hostLabel` | Local/SSH + 主机 + Controller/Observer 徽标；点击进 `/connections` |
| Core 健康 | `CoreHelloVM.health` | OK / DEGRADED / DIAGNOSTIC_ONLY |
| 活跃 Run | `runtime.getActiveWork` | 数字徽标，点击跳项目筛选视图 |
| 待用户介入 | `issue.list` 未确认数 | 数字徽标 |
| 待审批 | `approval.list` PENDING 数 | 数字徽标 |
| 全局暂停 | `runtime.pauseDispatch` / `resumeDispatch` | 仅 Controller 可用；暂停态全局可见 |
| 用户菜单 | — | 设置、关于、诊断导出（脱敏） |

顶栏不放置项目级操作（创建组、派发任务等），那些只属于项目页。

## 三、首页 `/`

唯一内容：**项目卡网格 + 同尺寸创建项目卡**。详见 `02_home-project-cards.md`。

```text
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 项目卡 A     │ 项目卡 B     │ 项目卡 C     │ ＋ 创建新项目 │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

首页**不是**全局角色台：不放跨项目的角色列表、任务列表、对话流。跨项目聚合信息只以顶栏计数徽标形式存在。

## 四、创建项目向导 `/projects/new`

五步全屏向导，每步可回退，末步生成草稿后立即进入编排选择：

```text
步骤 1  选择 Core        [Local 本机] [SSH 远程主机…]
步骤 2  选择目录         Local → 系统目录对话框
                         SSH   → Core 远端目录浏览器（filesystem.listRoots/listDirectory）
        校验             filesystem.validateProjectRoot
步骤 3  名称与说明       项目名（必填）、说明（可选）
步骤 4  初始协作组       ○ 暂不创建  ● 创建一个初始协作组（命名）
步骤 5  编排入口         [AI 生成方案] [导入 JSON/YAML] [手工创建] [先空项目]
```

红线：

- SSH 模式**禁止**弹出本地文件选择器；远程路径全部来自 Core 返回；
- 项目创建（`project.create`）后才存在 projectId，编排入口步骤在已建项目上下文中打开 `/projects/:id/plan`；
- “先空项目”落到项目页空组状态，空状态必须给出下一步（见 03 §七）。

## 五、单项目页 `/projects/:projectId`

项目头部 + 八个一级页签，详见 `03_project-page.md`。页签即 IA 第 4~10 项交付页面：

| # | 页面 | 一句话职责 |
|---|---|---|
| 4 | 项目页（头部） | 项目身份、Core/路径、Git 状态、自动派发、活跃 Run、连接、创建组/导入方案入口 |
| 5 | 协作组（概览 + 组与角色页签） | 组卡、角色头像、组规则 revision、工作区、合并/拆分入口 |
| 6 | 角色详情 | 见 `05_role-detail.md` |
| 7 | 协作时间线 | 人类语义事件流 + 六维筛选 |
| 8 | 收件箱 | 交给用户的结果与通知，已读管理 |
| 9 | 审批与问题 | 审批决定、问题确认/解决、UNKNOWN 对账入口 |
| 10 | 产物 | 项目级产物列表、校验、下载 |
| 11a | 模型与账号 | Provider Profile、模型目录、登录状态、配额 |
| 11b | 连接与设置 | 项目级设置 + 全局 `/connections` |

## 六、协作时间线（页签）

默认**人类语义**渲染，不按协议帧平铺：

```text
10:41  林岚 让 周实现 完成登录接口，完成后交 陈复核 复核
10:52  周实现 提交 artifact_x，并向 陈复核 发起复核
11:03  陈复核 将不通过结论交给用户
```

筛选器：组 / 角色 / 任务 / Run / 消息类型 / 时间范围。
底层数据：`message.listTimeline`（Scope=project/space），筛选维度的服务端支持见 CCR-UI-09。

硬性区分：**任务意图**（谁让谁做什么）与**运行状态**（Run 处于何态）用不同视觉轨道呈现，禁止混写为一条"正在进行"（见 07 §七）。

## 七、收件箱（页签）

- 只放**去向是用户**的显式结果与系统通知；
- 每条标注：来源角色/组、关联任务、结果摘要、时间、Acceptance 状态；
- 成功发信**不产生**回执条目；普通通知**不唤醒**角色、只累计未读；
- 操作：查看结果详情、接受/拒绝（`result.accept`/`result.reject`）、标记已读（`inbox.markRead`）。

## 八、审批与问题（页签）

双区布局：

- **审批区**：`approval.list` PENDING 卡片 → 风险等级、请求内容、过期时间、批准/拒绝（`approval.decide`）；
- **问题区**：`issue.list` → code 文案化、关联对象跳转、确认（`issue.acknowledge`）/解决（`issue.resolve`）；UNKNOWN Run 的对账入口（`run.reconcile`）也在此区，同时在角色详情内嵌。

## 九、产物（页签）

`artifact.list/get` 表格：名称、来源任务/Run/角色、大小、校验状态、时间；操作：读取片段、下载（`artifact.download`）、校验（`artifact.verify`）。产物永远能回溯到产生它的任务链。

## 十、模型与账号（页签）

- **账号区**：`account.listProfiles` / `account.getStatus` —— Profile 列表、掩码身份、状态、配额（`quota.listSnapshots`）、账号切换（`account.switch`）进度；
- **模型区**：模型目录（依赖 CCR-UI-02，Phase A 以 seed 形态演示）——按 Harness/Provider 分组，展示 source（RUNTIME/VERIFIED_CACHE/SEED）与 availability（AVAILABLE/REQUIRES_LOGIN/UNVERIFIED/RETIRED）徽标；REQUIRES_LOGIN 提供"去登录/刷新"引导，UNVERIFIED 明确"不可启动，仅可存草稿"。

## 十一、连接与设置

- `/connections`：Local/SSH 连接档案、重连、Controller 租约状态、协议版本与 capability 展示（`Capabilities`），能力缺失的功能项在此统一说明；
- 项目设置页签：项目名、归档（`project.archive`）、路径迁移（`project.relocate`）、自动派发开关、项目级规则摘要（只读，规则版本化由 Core 管理）。

## 十二、空状态总则

每个空状态必须回答"下一步做什么"，禁止统一"暂无记录"：

| 位置 | 空态主文案 | 主按钮 |
|---|---|---|
| 首页无项目 | "还没有项目。从一个文件夹开始，让角色在其中协作。" | 创建新项目 |
| 项目无协作组 | "协作组是角色沟通与规则的边界。创建一个，或导入整套编排方案。" | 创建协作组 / 导入编排方案 |
| 组内无角色 | "角色需要章程才能运行。用 AI 生成、导入方案或手工创建。" | 打开编排 |
| 时间线为空 | "还没有协作记录。给某个角色派发第一项任务。" | 派发任务 |
| 收件箱为空 | "交给你的结果会出现在这里。角色完成任务并显式交付后可见。" | 了解结果去向 |
| 问题区为空 | "系统当前健康：无待介入、无 UNKNOWN、无阻断。" | 查看运行状态 |
| 模型区无可用模型 | "尚未登录任何 Provider。登录后目录自动刷新；此前可查看 seed 参考。" | 管理账号 |
| 产物为空 | "任务交付的文件与报告会归档在这里。" | 查看活跃任务 |
