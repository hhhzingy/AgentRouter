# INTERACTION_RULES

## 写操作通则

1. 一切写操作经 `store.call()` → Core 请求 → 成功 `refresh()`；失败由调用处提示，UI 不做乐观更新。
2. 写按钮一律包 `CapabilityGate`：Observer/断线/能力缺失时禁用并显示具体原因（`store.readOnlyReason`）。
3. 破坏性动作（拒绝结果、隔离工作区、Commit 重构、拒绝审批）使用 `btn-danger` 或显式确认。

## 派发任务（DispatchDrawer）

- 去向固定为所选角色；完成交付默认"用户"（`completion.to = user`）。
- 角色忙（有 ACTIVE/WAITING_INPUT 任务）或 PAUSED → 文案"将进入队列"，按钮变"派发到队列"；位置以 Core 返回为准。
- 提交结果只显示"已提交/已入队"。

## 对话输入（Composer）

- 必须关联进行中任务（合同要求 `task_id`）；无任务时输入框禁用并提示走派发。
- 发送成功只显示"已提交"。

## Role Plan

- 三入口：AI 生成（无已认证可建会话 Harness 时禁用并说明）/ 导入 JSON / 手工空白。
- 流程强制：导入 → `rolePlan.validate` → Review（组与角色、**权限"请求→拟授予"对照**、模型可用性徽标）→ 逐项确认 `requiredConfirmations` → `rolePlan.apply`。
- Apply 成功页明示"Apply 完成 ≠ Bootstrap 完成"，引导去角色详情看初始化。
- 未验证/种子模型在 Review 中以徽标标出，不阻断但不得显示"可用"。

## 组重构

- 强制四段：方式与来源组 → Preview（影响面 + blockers）→ 逐项确认 → Commit。
- blockers 非空时 Commit 禁用，**没有"忽略并继续"**；Core 侧也会拒（RECONFIGURATION_BLOCKED）。
- Committed 页明示"不能在界面内撤销"；拆组不宣称上下文遗忘。
- `space_reconfiguration` 能力缺失时整页降级说明。

## 审批 / 问题 / 收件箱

- 审批：显示风险等级与过期时间；PENDING 才可操作（APPROVE/DENY）。
- 问题：OPEN 可"知悉"；空列表文案"无未解决问题不等于系统健康"。
- 收件箱：PENDING 结果可接受/拒绝；只说"待验收"，不说"已完成"。

## 账号

- 只展示脱敏身份与 Core 观测的额度；**不提供任何 Secret 输入框**。
- "切换到此账号"调用 `account.switch`；切换期间可能阻断派发（由 Core 决定，UI 不承诺时长）。

## 错误呈现

- `CONNECTION_LOST`：壳横幅（最后已知状态），页面数据保持可见。
- `CONTROL_LEASE_REQUIRED`：按钮处的只读原因，不弹错。
- `CAPABILITY_UNAVAILABLE`：入口禁用 + 原因，不报错弹窗。
- 其他错误：就近 `hint tone-danger` 展示 code，不伪造成功。
