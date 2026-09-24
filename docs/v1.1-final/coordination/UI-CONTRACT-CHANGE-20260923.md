# V1.1 UI 契约增量交接（2026-09-23）

基线：`feat/v1.1-functional-closeout-codex` 的本次提交。以下是 Core 的加法投影与扩展方法；冻结的 C1/C1R1/C1R1P1 schema 未修改。UI 合流前必须按最终源码 SHA 重跑真实链路。

## GAP-001：Slot / Participant 安全摘要

`participant.slot.list({role_id})` 的每个 Slot 保留原字段，并增加：

- `short_ref: "W<seq>"`：本角色内的非机密认领短引用；`participant.join` 现可按 `short_ref` 正确解析。
- `join_instruction_display: string | null`：仅 `OPEN` Slot 返回。它只包含 Role ID 与 Slot 短引用；认领仍需有效授权或配对凭据。
- `binding_summary: null | {display_name, participant_kind, state, last_seen_at_ms, external_session_display}`：仅真实 `ACTIVE` Binding 返回。`display_name` 是 Participant 类型标签，不是用户身份。现有数据没有可信在线心跳或可公开的外部会话引用，后两字段均为 `null`。

UI 可区分 `OPEN/BOUND/CLOSED` 与 Binding 是否存在；不得从 `BOUND` 推断在线。此缺口的“最近在线/外部会话显示”部分仍未解决。

### 合流候选后继增量：可信活动时间与脱敏别名

合流候选新增 migration `019-participant-binding-activity.sql`，仅新认领或同一 ACTIVE Binding principal 经授权检查的请求更新 `last_seen_at_ms`。从 v18 升级的既有 Binding 不回填创建时间，仍为 `null`；Core 为 v18 升级先生成 `before-v19-*` SQLite 备份。该字段语义是“最近已认证活动”，**不是在线心跳或当前连接状态**。`external_session_ref` 已登记时，Slot list 只显示由随机 Binding ID 生成的别名“已登记（绑定 #xxxxxxxx）”，不回显或截取外部引用；未登记时仍为 `null`。UI 显示活动时间与别名，但 `BOUND` 状态继续明确标示“在线未知”。

这关闭了 Core 持久活动来源和不泄露原始引用的展示路径；网页插件尚无 `participant.join` 工具，故真实 ChatGPT 网页会话的 Slot/Binding UI 端到端验收仍未闭环。

## GAP-002：Result Evidence 只读投影

新增扩展方法 `result.evidence({id})`。仅认证且有项目权限的连接可读取已发布给用户的 Result。返回：`result_id`、`evidence_layer=CORE_PERSISTED_RECORD`、可空 `source_revision/run_id/harness/provider_profile_id/model_id`、Artifact 的 `id/sha256/byte_size/media_type/state`、`tests=[]`、`test_records_status=NOT_RECORDED`、`known_limitations=null`。

Artifact 状态经 Core 实际文件和 SHA-256 核验。`NOT_RECORDED` 表示 Core 没有结构化测试记录，不能显示成测试通过；`source_revision=null` 也不能由文件名或 Run 状态推断。该方法提供现有权威元数据，但 source SHA、测试记录、限制清单的持久化仍是未解决部分。

## GAP-003：WorkSession 容量和操作阶段

`roleSession.preflight` 增加 `capacity_assessment={status:UNKNOWN, source:NOT_MEASURED, observed_at_ms:null, reason_code:SOURCE_AND_TARGET_CAPACITY_NOT_PROBED}` 和 `compression_policy=CORE_DECIDES`。当前创建前未探测目标容量，UI 必须如实显示未知，不能给用户虚构压缩选项。

`roleSession.transferStatus` 增加 `capacity_assessment` 和 `operation_summary={phase,can_cancel,needs_status_check,source_work_session_active}`。只有传输引擎已作容量判断时才可返回 `FITS` 或 `COMPRESSION_REQUIRED`，并带探测时间与原因；原生 fork 不以 token 容量判定，保持 `UNKNOWN`。`phase` 使用 Core 持久状态；`can_cancel=false`；非终态要求继续按 `op_id` 查询。源会话是否 ACTIVE 直接查数据库，不由 UI 推断。

创建前的容量预测仍未实现，故 GAP-003 不能标记完全关闭。

## GAP-004：Request Changes 原子闭环

新增扩展方法：

- `result.requestChanges({id,feedback})`：需要认证的 Controller、有效租约、`client_id`、`operation_id`、`expected_revision`。反馈为非空且不超过 4000 字。Core 在同一事务保留原 `PUBLISHED` Result、把原 Task 验收改为 `REJECTED`、保存反馈为后续 Task 正文、创建指向原 Result 的后续 Task，并写入权威 `result_handlings` 关联。返回 `source_result_id/acceptance/feedback/follow_up_task/follow_up_run_id/published_history_retained`。同操作 ID 同载荷重放返回原响应；不同载荷报 `OPERATION_CONFLICT`。网络结果不确定时只读查询，不自动提交第二个 ID。
- `result.reviewStatus({id})`：认证且有项目权限即可读取原 Result 的验收状态、反馈、后续 Task/Run 关联。UI 可在响应丢失后按 Result ID 核对。

旧 `result.reject` 仍只改验收状态，不等同于 Request Changes；它与 `result.accept` 只允许从 `PENDING` 转移，禁止已验收结果被反复翻转。UI 的“请求修改”按钮必须使用新方法，旧按钮只能标注“拒绝验收”。

三个 `result.*` 方法属于可选扩展，走扩展帧，不加入冻结 Client API 方法枚举。UI `callExtension` 需显式允许这三个方法；写方法的 Pending 记录必须保留原操作 ID，确认未知时查询 `result.reviewStatus`。

## 验证边界

定向集成测试覆盖安全摘要、短引用认领、容量状态、原 Result 保留、后续 Task 关联、重复请求、观察者拒绝与事务回滚。该文档不表示 UI 真实页面、Remote/Mobile、打包 Electron、DUT 或 Windows RC 已在本次代码上通过。
