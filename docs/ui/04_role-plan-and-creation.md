# 04 AI 编排与角色创建

## 一、原则

- 每个可运行角色必须有经过验证的 Role Spec 与 Role Charter；作者可以是外部 AI、AgentRouter 临时规划会话或人类；
- UI 主流程以 **AI 辅助规划**为推荐入口，同时保留**导入方案**与**手工创建**（初次无角色可调用、AI 可能请求过大权限、用户需要应急通道）；
- 任何来源的方案都必须经过 **Role Plan Review**，用户确认后才原子应用；AI 输出的是 `requested_permissions`，不是授权；
- 不允许创建"只有名字和 Harness、没有职责"的角色。

## 二、三个入口

`/projects/:projectId/plan` 统一编排页，顶部三卡：

```text
┌─ ✦ AI 生成 ─────────┐ ┌─ ⇪ 导入方案 ────────┐ ┌─ ✎ 手工创建 ───────┐
│ 描述目标，由规划会话  │ │ 粘贴或选择符合        │ │ 逐项填写 Role Spec， │
│ 产出完整 Role Plan    │ │ agentrouter-role-    │ │ 同样生成角色章程      │
│                     │ │ plan/1 的 JSON/YAML  │ │                     │
│ [开始规划]           │ │ [选择文件 / 粘贴]     │ │ [填写表单]           │
└─────────────────────┘ └─────────────────────┘ └───────────────────┘
```

### 1. AI 生成（AgentRouter 内 Setup Session）

- 开启**临时 Setup Session**：不是正式角色、只有读项目规则与受控文件权限、输出 Role Plan、**不直接创建角色**；
- 输入表单：项目目标、非目标、约束、可用 Harness/模型偏好、期望组数；
- 输出即进入 Review（§四）；
- 真实 Harness 未接入前，此入口显示"需要可用 Harness"，降级引导到导入/手工（sc-21 同类降级逻辑）。

### 2. 导入 JSON/YAML

- 支持文件选择与粘贴板；即时按 `agentrouter-role-plan/1` 做 Schema 校验；
- 校验失败：逐条列出错误（路径 + 原因 + 修复建议），定位到行，见 sc-19；
- 校验通过：进入 Review。

### 3. 手工创建

表单字段与 Role Spec 完全对齐（mission / responsibilities / out_of_scope / accepted_inputs / required_outputs / default_completion_target / problem_target / workspace / requested_permissions / runtime / bootstrap_notes），提交后同样生成 Role Charter 草稿并进入 Review。手工创建单角色时组结构简化为"选择现有组 / 新建组"。

## 三、Role Plan 校验规则（UI 层即时校验）

1. `schema_version` 必须等于 `agentrouter-role-plan/1`；
2. `role_key`/`group_key` 符合 `^[a-z][a-z0-9_-]{0,79}$`，且 roles 引用的 group_key 必须存在；
3. AI 方案不得携带真实 `role_id`（只允许临时 key，真实 ID 由 Router 生成）；
4. `requested_permissions.network_profile=custom_request` 时必须填 notes；
5. `default_completion_target`/`problem_target` 引用 role_key 时必须存在于方案内；
6. 与现有角色重名 → 警告（不阻断，展示名可重复，ID 不同）；
7. 模型选择 `selection_source=seed` → Review 中标注"未验证"（见 §五）。

## 四、Role Plan Review（核心页面）

树 + 卡片双视图。左树右卡：

```text
┌─ 方案: 双组并行开发 ──────────── 来源: external_ai ─┐
│ 项目                                                 │
│ ├─▼ 核心实现组 (3 角色)        ⧉wt:core · r(new)      │
│ │   ├─ 林岚 · 规划            codex/runtime          │
│ │   ├─ 周实现 · 执行          pi/deepseek-v4-pro·high│
│ │   └─ 陈复核 · 复核          pi/glm-5.3·max         │
│ └─▼ UI 组 (3 角色)             ⧉wt:ui  · r(new)      │
│     ├─ 苏界面 · 设计执行      pi/glm-5.3-flash·max   │
│     ├─ 唐测试 · 测试          pi/qwen3.8-flash·xhigh │
│     └─ 何文档 · 文档          kimi_code/runtime      │
└──────────────────────────────────────────────────────┘
┌─ 周实现 · 执行 ──────────────────────────────────────┐
│ 使命      实现 Core 合同与服务                        │
│ 职责      · 实现合同和核心服务  · 补齐测试             │
│ 不负责    · 不设计最终 UI  · 不修改 Renderer          │
│ 输入      冻结合同 · 测试报告                         │
│ 输出      提交、测试和风险报告                        │
│ 结果去向  完成→陈复核  异常→用户                      │
│ 运行      pi · deepseek · deepseek-v4-pro · 推理 high │
│           来源: SEED ⚠ 需登录验证                     │
│ 工作区    ⧉wt:core (read_write: packages, apps/…)    │
│ 权限      请求 read_write + 网络 provider_only        │
│           ── 实际授予 (用户可调) ──                   │
│           read_write ✓  网络: provider_only ✓        │
│ 风险      ⚠ 请求了 2 项项目策略外路径 → 已标红待确认   │
└──────────────────────────────────────────────────────┘
```

Review 必须展示（逐项核对执行包要求）：

| 项 | 呈现 |
|---|---|
| 组 | 树节点：名称、目的、隔离原因、组级交接规则、工作区策略 |
| 角色 | 树子节点：展示名、角色类别（仅人类理解用）、Harness/模型一行摘要 |
| 职责/非职责 | 卡片两栏并列，非职责同等显著 |
| Harness/Provider/模型/推理 | 运行区块，含 source 徽标（RUNTIME/VERIFIED_CACHE/SEED） |
| 工作区 | 策略 + 路径列表 + read_only/read_write |
| 请求权限 vs 实际权限 | 上下两行对照；实际行可编辑（只能收窄，不能放宽）；请求超出项目允许/Harness 支持的部分标红并默认剔除（sc-20） |
| 结果去向 | 完成去向 + 异常升级对象，引用树内角色高亮联动 |
| 风险 | 方案 `review.known_risks` + UI 检测风险（权限超界、未验证模型、重名）合并列表 |
| Apply 前差异 | 与现状 diff：新增组/角色、变更角色、冲突；首次应用显示"全部新增" |

底部操作条：`[上一步] [导出方案] [确认并应用]`。"确认并应用"仅在：无校验错误、全部红色风险逐项确认后可用。应用原子执行（CCR-UI-03），失败整体回滚并展示失败点。

## 五、模型与推理强度选择（角色表单区）

顺序固定：`Harness → 账号/Provider Profile → 模型目录 → 模型 → 推理强度 → 工作区 → 权限`。

联动规则：

| 条件 | UI 行为 |
|---|---|
| 未登录 | 显示 seed 目录，全部标记"需登录验证"（sc-21/22） |
| 无账号 | 可保存草稿，禁止"应用并启动" |
| 模型不支持推理控制 | 隐藏推理选择器 |
| 仅一个合法档位 | 只读显示该档位 |
| Provider refresh 后目录变化 | 提示"模型清单已更新，请重新确认"，不静默改选择 |
| 模型已退役 RETIRED | 禁止选择；已选中的显示替换引导，不静默映射 |

推理强度是**模型原生概念**：展示档位来自目录 `reasoning.levels`（如 deepseek `low/high/max`，qwen `none/low/medium/xhigh`），UI 不做跨模型归一化、不发明"中档"。Flash 是模型变体不是推理强度。

## 六、权限对照区（请求 vs 实际）

```text
请求:  read_write · 路径[packages, apps/core-service] · 工具[build,test] · 网络 provider_only
实际:  read_write · 路径[packages, apps/core-service] · 工具[build,test] · 网络 provider_only
       └─ 编辑（只能收窄）─────────────────────────────
公式:  AI 请求 ∩ 项目允许 ∩ Harness 支持 ∩ 用户确认 = 实际权限
```

红线：AI 不能读凭据、不能自授管理权限、不能跨组通信、不能改 Route 总协议、不能自动开网、不能自动批准高风险命令 —— 这些项在权限区**根本不渲染**为可请求项。

## 七、应用结果

应用成功后落到项目概览，新组/角色以"新建"徽标高亮 24h；每个新角色的第一项动作是 Core 交付 ROLE_BOOTSTRAP（章程），UI 在角色详情以系统卡呈现（05 §三）；Bootstrap 未交付成功的角色显示"待初始化"，不能派发任务（sc-18 断言）。
