# Contract Change Requests（UIAI Phase A）

- 提交者：UIAI（产品与 UX 规范）
- 基线合同：`agentrouter-client/1`（C1，提交 `f45f99e` 冻结；当前头 `18c259c`）
- 处理人：Codex（C1R1 合同修订）
- 约定：以下均为**向后兼容扩展**（新增方法/可选字段），不删除、不改变 C1 既有语义；UI 在 capability 缺失时禁用对应功能。
- 状态列：⏳ 待 Codex 复核。

---

## CCR-UI-01 项目卡摘要 VM ⏳

- **用户场景**：首页项目卡展示最多 3 个协作组、每组最多 5 个角色头像与状态角标、项目级 Git/自动派发摘要（02 §二、03 §二）。
- **当前合同为何不足**：`ProjectVM` 仅有 `spacesCount/activeRunsCount/issuesCount` 计数，无组级角色摘要；首页若逐项目调用 `space.list + role.list` 会产生 N×M 次请求，违背快照语义。
- **可以由现有字段组合吗**：技术上可以（SnapshotVM 已带 spaces/roles 数组，客户端可组装），但 100+ 项目时快照过大；且 Git/自动派发开关状态无任何字段。
- **建议方法/字段**：新增 `project.listCardSummaries`（分页）返回 `ProjectCardSummaryVM { project, spaces: [{ id, name, status, workspace_label, roles: [{ id, name, status, task_state, run_state, pending_approvals_count, queued_tasks_count }], extra_roles_count }], extra_spaces_count, git_label?, auto_dispatch_enabled?, last_activity_ms }`；或扩展 `system.snapshot` 增加 `card_summaries` 数组。
- **类型**：新增方法 + 新 VM（或快照扩展）。
- **是否可选**：必须（首页核心）。
- **默认行为**：每组最多 5 角色、每项目最多 3 组，超出给计数。
- **状态语义**：摘要为快照时点值，角色状态由 07 §四规则客户端合成。
- **安全影响**：无敏感字段；不含凭据/路径全量（路径沿用 displayRoot 简写）。
- **Local/SSH 差异**：无；SSH 断线时摘要保持最后一致快照并带 `snapshot_cursor`。
- **向后兼容**：新增方法，旧客户端忽略。
- **Mock 场景**：sc-02/03/04。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-02 模型目录（Model Catalog）⏳

- **用户场景**：角色创建/编辑时按 Harness→Profile→目录→模型→推理强度选择；模型与账号页展示目录来源与可用性（04 §五、01 §十）。
- **当前合同为何不足**：C1 无 model.* 方法，`RoleVM.modelLabel` 是自由文本，无法表达 source/availability/推理档位。
- **可以由现有字段组合吗**：否。
- **建议方法/字段**：`model.list`、`model.get`、`model.refresh`、`provider.listProfiles`；`ModelDescriptor { harness, provider_id, provider_profile_id, model_id, display_name, source: RUNTIME|VERIFIED_CACHE|SEED, availability: AVAILABLE|REQUIRES_LOGIN|UNVERIFIED|RETIRED, modalities, tool_support, context/output 元数据, reasoning: { control, levels[], default }, last_observed_at, compatibility_notes }`。
- **类型**：新增方法 + 新 VM。
- **是否可选**：必须。
- **默认行为**：未登录返回 SEED 目录并标记 REQUIRES_LOGIN；runtime probe 覆盖 seed。
- **状态语义**：availability 是目录属性不是授权；已选模型在 Binding 前再确认。
- **安全影响**：目录不得包含 API Key/Base URL；仅公开模型元数据。
- **Local/SSH 差异**：无（目录由 Core 统一持有）。
- **向后兼容**：新增；`RoleVM.modelLabel` 保留为展示回退。
- **Mock 场景**：sc-18/20/21/22。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-03 Role Plan 验证/预览/应用 ⏳

- **用户场景**：AI 生成/导入/手工三入口产出 Role Plan，Review 后原子应用（04 §四）。
- **当前合同为何不足**：C1 只有低级 `role.create`（name/description/harness/workspace_id），无组结构、职责、章程、权限请求与原子多角色创建。
- **可以由现有字段组合吗**：否；逐条 role.create 无法原子、无差异预览。
- **建议方法/字段**：`rolePlan.validate`（Schema+语义校验，返回错误/警告数组）、`rolePlan.preview`（返回与现状 diff：新增/变更/冲突）、`rolePlan.apply`（原子创建组/角色/章程；幂等键 `plan_hash`）、`rolePlan.get`（查询已应用方案）。Plan 格式即 `agentrouter-role-plan/1`。
- **类型**：新增方法族。
- **是否可选**：必须。
- **默认行为**：apply 全成功或全回滚；重复 apply 同 plan_hash 幂等返回首次结果。
- **状态语义**：应用后角色初始为"待初始化"，章程 DELIVERED 后方可派任务。
- **安全影响**：plan 只含 requested_permissions，实际权限由 Core∩用户确认；plan 不含凭据。
- **Local/SSH 差异**：无。
- **向后兼容**：`role.create` 保留为低级手工入口。
- **Mock 场景**：sc-18/19/20。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-04 Role Charter 与 Bootstrap 状态 ⏳

- **用户场景**：角色详情第一条系统卡展示章程；章程历史版本可查；Bootstrap 未交付角色不可派任务（05 §三）。
- **当前合同为何不足**：C1 无 roleCharter.*；`ConversationItemKind` 无章程专用类型（SYSTEM_EVENT 无法携带结构化章程）；`DeliveryState` 存在但无查询入口。
- **可以由现有字段组合吗**：否。
- **建议方法/字段**：`roleCharter.get { role_id, revision? }`、`roleCharter.listRevisions`；`RoleCharterVM { role_id, display_name, project_id, space_id, mission, responsibilities[], out_of_scope[], input_contract[], output_contract[], handoff_rules[], contacts[], policy_revision, workspace_ref, effective_permissions, runtime { harness, provider_profile_id, model_id, reasoning_effort }, revision, hash, effective_at_ms, bootstrap_delivery { state: DeliveryState, delivered_at_ms? } }`；`ConversationItemKind` 增加 `ROLE_CHARTER`（或 SYSTEM_EVENT 子类型字段）。
- **类型**：新增方法 + 新 VM + 枚举扩展。
- **是否可选**：必须。
- **默认行为**：无章程角色不允许 ACTIVE；历史 revision 只读保留。
- **状态语义**：章程 revision 独立版本化；新任务锁定最新 revision。
- **安全影响**：章程不含凭据、不含他组角色/私有任务。
- **Local/SSH 差异**：无。
- **向后兼容**：新增；旧客户端对话流中章程卡显示为 SYSTEM_EVENT 回退。
- **Mock 场景**：sc-18。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-05 Space Reconfigure（合并/拆分）⏳

- **用户场景**：组重构向导 Preview blockers → 确认 → 原子 Commit（06 全文）。
- **当前合同为何不足**：C1 只有 `space.create/updateStatus`，无重构语义。
- **可以由现有字段组合吗**：否；自行拼装违反"不改写历史/原子提交"。
- **建议方法/字段**：`space.reconfigure.preview`（输入：源组、角色分配、目标组定义、新规则、工作区映射、队列处置、会话策略；返回 `plan_id, plan_hash, expected_revision, blockers[], affected { roles, tasks, runs, workspaces }, proposed_destinations, required_confirmations[]`）、`space.reconfigure.commit`（携带 plan_id+plan_hash+revision+controller lease）、`space.reconfigure.abort`、`space.reconfigure.get`（进度/结果）。
- **类型**：新增方法族。
- **是否可选**：必须。
- **默认行为**：blockers 非空不可 commit；失败整体回滚；旧组 ARCHIVED。
- **状态语义**：重构只影响未来通信/任务/规则；历史锁定旧 group_id 与 policy revision。
- **安全影响**：commit 需 controller lease；不做部分迁移。
- **Local/SSH 差异**：无；SSH 断线期间已提交事务由 Core 完成，重连后 `space.reconfigure.get` 取结果。
- **向后兼容**：新增。
- **Mock 场景**：sc-23/24。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-06 工作区/Worktree VM ⏳

- **用户场景**：组卡与角色详情展示工作区徽标；组≠worktree 认知；同物理工作区写互斥提示（03 §三、07 §八）。
- **当前合同为何不足**：`RoleVM.workspaceLabel`/`BindingVM.workspaceLabel` 仅文本；无工作区列表、策略、写租约持有者。
- **可以由现有字段组合吗**：否。
- **建议方法/字段**：`workspace.list`（Scope=project）返回 `WorkspaceVM { id, label, kind: SHARED_READ_ONLY|SHARED_SERIAL_WRITE|DEDICATED_WORKTREE|CUSTOM, display_path, write_lease_holder_run_id?, bound_roles: Id[] }`；`RoleVM` 增加可选 `workspace_id`。
- **类型**：新增方法 + 新 VM + 可选字段。
- **是否可选**：必须。
- **默认行为**：无写 Run 时 write_lease_holder_run_id 为空。
- **状态语义**：写互斥是资源态，随 Run 终态释放。
- **安全影响**：远程路径仅 display 形态。
- **Local/SSH 差异**：display_path 由 Core 给出，UI 不拼接。
- **向后兼容**：新增；label 字段保留。
- **Mock 场景**：sc-05/08。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-07 角色有效权限 vs 请求权限 ⏳

- **用户场景**：角色详情只显示实际授予权限；Review 页请求/实际对照（04 §六、05 §二）。
- **当前合同为何不足**：C1 `RoleCreateParams` 无权限字段，`RoleVM` 无任何权限视图。
- **可以由现有字段组合吗**：否。
- **建议方法/字段**：`RoleVM` 增加可选 `effective_permissions { workspace_access, allowed_paths[], tool_profiles[], network_profile }`；Role Plan 应用快照中保留 `requested_permissions`（随 CCR-03 存储）。
- **类型**：VM 可选字段扩展。
- **是否可选**：必须。
- **默认行为**：缺省视为最小权限（read_only、无网络）。
- **状态语义**：权限变更触发章程新 revision（CCR-04）。
- **安全影响**：只读视图，不含凭据；UI 不提供放宽入口，只提供收窄确认。
- **Local/SSH 差异**：无。
- **向后兼容**：可选字段。
- **Mock 场景**：sc-20。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-08 角色展示态派生字段 ⏳

- **用户场景**：头像角标/角色行按 07 §四 优先级合成展示态（含"最近完成"辅助标记）。
- **当前合同为何不足**：`RoleVM` 有 status/taskState/runState/计数，优先级 1（需介入）需要"该角色未确认 Issue 存在性"，优先级 10（最近完成）需要最近成功时刻——两者不可得。
- **可以由现有字段组合吗**：大部分可（优先级 2-9）；优先级 1 需 `issue.list` 按角色过滤轮询，优先级 10 无字段。
- **建议字段**：`RoleVM` 增加可选 `has_unacknowledged_issues: boolean`、`last_succeeded_run_at_ms?: integer`；或服务端直接给 `display_state` 派生枚举（次选，UI 倾向保留合成规则在客户端以便统一优先级调整）。
- **类型**：VM 可选字段。
- **是否可选**：强烈建议（否则优先级 1/10 无法完整实现）。
- **默认行为**：缺省 false/null。
- **状态语义**：派生信号，不改变 RoleStatus 合同枚举。
- **安全影响**：无。
- **Local/SSH 差异**：无。
- **向后兼容**：可选字段。
- **Mock 场景**：sc-12/16。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-09 时间线筛选参数 ⏳

- **用户场景**：协作时间线按组/角色/任务/Run/消息类型/时间筛选（01 §六）。
- **当前合同为何不足**：`MessageListTimelineParams` 只有 scope/after_id/limit。
- **可以由现有字段组合吗**：客户端可过滤已加载页，但深历史不可行。
- **建议字段**：params 增加可选 `role_id, task_id, run_id, kinds[], since_ms, until_ms`。
- **类型**：参数扩展。
- **是否可选**：可选（Phase B 先客户端过滤，数据量大后需要服务端）。
- **默认行为**：不传即现状。
- **状态语义**：无。
- **安全影响**：scope 之外仍不可查（组隔离）。
- **Local/SSH 差异**：无。
- **向后兼容**：可选参数。
- **Mock 场景**：sc-06/17。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-10 组历史与成员历史 ⏳

- **用户场景**：组详情显示目的/规则 revision/组历史；归档组只读视图；角色详情"组变更记录"（03 §四、05 §五）。
- **当前合同为何不足**：`SpaceVM` 无 purpose/policy_revision；无归档组列表参数；无 `role_membership_history` 视图。
- **可以由现有字段组合吗**：否。
- **建议方法/字段**：`space.list` 参数增加 `include_archived`；`SpaceVM` 增加可选 `purpose, policy_revision, archived_at_ms?`；新增 `role.listMembershipHistory { role_id }` 返回 `{ space_id, joined_at_ms, left_at_ms?, reason: CREATED|RECONFIGURE_MERGE|RECONFIGURE_SPLIT|MANUAL }[]`。
- **类型**：参数 + VM 扩展 + 新方法。
- **是否可选**：必须。
- **默认行为**：默认不含归档组。
- **状态语义**：历史只读，归档组不可派发。
- **安全影响**：无。
- **Local/SSH 差异**：无。
- **向后兼容**：可选扩展。
- **Mock 场景**：sc-24。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-11 账号切换进行中状态 ⏳

- **用户场景**：账号切换进度可见；进行中的切换是组重构 blocker（06 §四、sc-28）。
- **当前合同为何不足**：`account.switch` 只有入参定义，无进行中状态查询；`AccountProfileVM.status` 未定义切换中语义。
- **可以由现有字段组合吗**：否。
- **建议方法/字段**：`account.listSwitches`（或 `account.getStatus` 返回增加 `switch_in_progress { auth_unit_id, from_profile_id, to_profile_id, started_at_ms }`）。
- **类型**：VM 扩展/新方法。
- **是否可选**：必须（重构 blocker 判定依赖）。
- **默认行为**：无切换时为空。
- **状态语义**：切换是 auth-unit 级过渡态。
- **安全影响**：只暴露 profile id，不暴露凭据。
- **Local/SSH 差异**：无。
- **向后兼容**：可选扩展。
- **Mock 场景**：sc-28/23。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-12 项目/组最近活动摘要 ⏳

- **用户场景**：项目卡"最近活动一行"；角色"最近完成"辅助标记（02 §二、07 §四）。
- **当前合同为何不足**：`ProjectVM`/`SpaceVM` 无任何活动时刻/摘要。
- **可以由现有字段组合吗**：需全量扫时间线，不可行。
- **建议字段**：`ProjectVM` 增加可选 `last_activity { at_ms, actor_role_id?, summary }`；`SpaceVM` 同（可选）。
- **类型**：VM 可选字段。
- **是否可选**：必须（项目卡核心信息）。
- **默认行为**：无活动时空。
- **状态语义**：快照时点值。
- **安全影响**：summary 由 Core 生成并脱敏。
- **Local/SSH 差异**：无。
- **向后兼容**：可选字段。
- **Mock 场景**：sc-02/03/04。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-13 结构化 Issue code 清单 ⏳

- **用户场景**：问题中心与系统事件文案化（跨组拒绝、组重构阻断、模型未验证等）（sc-07）。
- **当前合同为何不足**：`IssueVM.code/messageKey` 存在但无枚举清单，UI 无法做稳定文案映射与图标分级。
- **可以由现有字段组合吗**：否（缺合同级清单）。
- **建议字段**：合同附录定义 Issue code 枚举（至少含 `CROSS_GROUP_ROUTE_DENIED`、`RECONFIGURE_BLOCKED`、`MODEL_UNVERIFIED`、`MODEL_RETIRED`、`RUN_UNKNOWN`、`ACCOUNT_SWITCH_FAILED`、`WORKSPACE_WRITE_CONFLICT`）及 messageKey 命名空间。
- **类型**：文档/枚举扩展。
- **是否可选**：强烈建议。
- **默认行为**：未知 code 显示通用卡。
- **状态语义**：无。
- **安全影响**：文案不含敏感细节。
- **Local/SSH 差异**：无。
- **向后兼容**：纯追加。
- **Mock 场景**：sc-07/13。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-14 Role Plan Apply 幂等键与进度 ⏳

- **用户场景**：大方案（6+ 角色）应用的进度展示与断线重连后续查（04 §七）。
- **当前合同为何不足**：随 CCR-03；幂等与进度需显式合同。
- **可以由现有字段组合吗**：否。
- **建议字段**：`rolePlan.apply` 入参 `plan_hash` 作幂等键；返回 `apply_id`；`rolePlan.getApply { apply_id }` 返回 `state: VALIDATING|CREATING|DELIVERING_BOOTSTRAP|SUCCEEDED|ROLLED_BACK` 与逐项进度。
- **类型**：随 CCR-03 的方法细节。
- **是否可选**：建议。
- **默认行为**：同 plan_hash 重复调用返回首个 apply_id。
- **状态语义**：应用是事务，进度只读。
- **安全影响**：无。
- **Local/SSH 差异**：SSH 断线后经 getApply 恢复视图，不重复提交。
- **向后兼容**：新增。
- **Mock 场景**：sc-18。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-15 队列处置与会话策略枚举 ⏳

- **用户场景**：重构向导步骤 6/7 的选项集（06 §五/§六）。
- **当前合同为何不足**：随 CCR-05；枚举值需合同固定以防 UI/Core 漂移。
- **建议字段**：合同定义 `QueueDisposition = MOVE_WITH_ASSIGNEE|SUSPEND_FOR_REVIEW|CANCEL|KEEP_IN_ARCHIVED_GROUP`；`SessionPolicy = NEW_SESSION_WITH_HANDOVER|NATIVE_RESUME_WITH_TRANSITION|KEEP_ARCHIVED_ONLY`；preview 返回中逐项回显。
- **类型**：随 CCR-05 的枚举。
- **是否可选**：必须（随 CCR-05）。
- **默认行为**：SUSPEND_FOR_REVIEW / NEW_SESSION_WITH_HANDOVER。
- **Mock 场景**：sc-23/24。
- **Codex 处理**：（待填）
- **复核结论**：（待填）

## CCR-UI-16 收件箱条目分类 ⏳

- **用户场景**：收件箱分"结果交付"与"系统通知"两区，结果区支持验收操作（01 §七）。
- **当前合同为何不足**：`inbox.list` 参数与返回未定义条目类型字段（C1 中 InboxListParams 仅 scope/after_id/limit）。
- **可以由现有字段组合吗**：若返回条目含关联 resultId 可推断，但无类型字段时通知与结果混杂。
- **建议字段**：Inbox 条目 VM 增加 `kind: RESULT_DELIVERY|NOTICE|SYSTEM`，及可选 `result_id`。
- **类型**：VM 扩展。
- **是否可选**：建议。
- **默认行为**：缺省按 NOTICE 处理。
- **状态语义**：NOTICE 不产生验收操作。
- **安全影响**：无。
- **Local/SSH 差异**：无。
- **向后兼容**：可选字段。
- **Mock 场景**：sc-16。
- **Codex 处理**：（待填）
- **复核结论**：（待填）
