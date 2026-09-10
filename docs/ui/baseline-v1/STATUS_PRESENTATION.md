# STATUS_PRESENTATION — 状态如何显示（本基线最重要的文档）

## 五条独立状态道，永不合并

| 道 | 取值来源 | 展示 |
|---|---|---|
| Task | `TaskVM.state` | 任务行徽标（排队含 Core 位置） |
| Run | `RunVM.state` | 任务行第二枚徽标 / 角色详情 Run 面板 |
| Result/Acceptance | `ResultVM.acceptance` | 收件箱验收徽标与操作 |
| Delivery | `DeliveryState` | 仅在投递语义处（Charter Bootstrap） |
| Connection | `ConnectionState` | 壳徽标 + 断线/重连横幅 |

禁止：用 Run 态覆盖 Task 态；用 Task 完成冒充 Run 完成；用连接态推断业务态。

## 角色主展示态（`status.ts roleDisplayStates`）

按优先级取第一项为主状态，其余并列展示（例："排队 2 + 暂停派发"）：

| 优先级 | key | 文案 | tone | 条件 |
|---|---|---|---|---|
| 1 | intervention | 待初始化 / 初始化失败 / 模型未验证 | danger | `interventionState` |
| 2 | unknown | 状态未知 | danger | Run UNKNOWN 或 reconciliationRequired |
| 3 | attention | 需要介入 | danger | Task NEEDS_ATTENTION 或未解决 Issue |
| 4 | approval | 等待审批 | warning | 关联 PENDING Approval |
| 5 | settling | 收尾中 | warning | Run SETTLING |
| 6 | wait-approval | 等待审批 | warning | Run WAITING_APPROVAL（与 4 去重） |
| 7 | running | 执行中 | active | Run CREATED/STARTING/RUNNING |
| 8 | waiting | 等待输入 | queue | Task WAITING_INPUT |
| 9 | queued | 排队 N | queue | QUEUED 任务计数 |
| 10 | paused | 暂停派发 | warning | Role PAUSED |
| 11/12 | disabled/archived | 已停用/已归档 | neutral | Role 状态 |
| 20 | idle | 空闲 | neutral | 无信号 |

硬规则：
- **SETTLING = "收尾中"，永远不是"完成"**。完成只认 Run SUCCEEDED + 显式 Result。
- **角色 ACTIVE ≠ 执行中**（sc：role_lin 显示"空闲"）。
- **UNKNOWN 不被任何状态掩盖**，且有独立对账入口（ReconcilePanel 六动作，不自动重跑）。
- **"空闲"不附带"刚完成"暗示**；V1 不做"最近完成"角标（避免被当成主状态）。

## 连接态语义

- `DISCONNECTED`：展示**最后已知状态** + "数据截至 <精确时刻>"；**不承诺远端 Run 是否继续**；写操作禁用（原因"连接已断开"）。
- `RECONNECTING/DEGRADED`：同上但提示重连中。
- Local 断线 **≠** 协议 `INCOMPATIBLE`；INCOMPATIBLE 只用于协议版本不匹配。
- `CONNECTED_OBSERVER`：横幅"全部内容只读"，可申请控制。

## 发信/回执

- `conversation.sendUserInput` 成功 → 只显示"已提交。对方是否接收与处理以后续事件为准。"
- 不存在"已读/已接收/已处理"任何 UI 元素（测试断言）。
- 补充输入必须关联进行中任务（`task_id`）；无任务时引导走"派发"。

## 排队

- 队列位置只显示 Core 返回的 `queuePosition`；没有就不显示，UI 不估算。
- 派发抽屉在角色忙/暂停时提示"将进入队列"，文案随状态变化。

## 模型可用性

| source × availability | 展示 |
|---|---|
| RUNTIME + AVAILABLE | "运行时实测 / 可用"（ok） |
| VERIFIED_CACHE + UNVERIFIED | "已验证缓存 / 未验证"（danger 可用性） |
| SEED + REQUIRES_LOGIN | "种子目录 / 需登录验证"（warning） |
| SEED + UNVERIFIED | "种子目录 / 未验证" |

Seed/未验证**不得**显示为"可用/可运行"（规则 13）。
