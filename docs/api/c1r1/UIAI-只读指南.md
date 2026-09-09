# UIAI 只读合同指南

从本分支读取以下文件，不修改冻结合同来适配页面：

- `contracts/client-api.c1r1.schema.json`、`contracts/agentrouter-role-plan.v1.schema.json`
- `packages/client-contract/c1r1/index.ts`、`generated.ts`
- `fixtures/client-c1r1/demo.json`：实际 Mock 生成的 Hello、两个三角色组、项目摘要、原子 Apply、跨组错误、合并 Preview/Commit 与交接包
- `fixtures/client-c1r1/two-groups.plan.json`、`model-seed.json`、`scenarios.json`
- `packages/core-api/mock-c1r1.ts`：`MockC1R1Server`；通过 open / handle / subscribe / disconnect 使用内存连接
- `docs/api/c1r1/methods.md`、`compatibility.md`、`CCR决策.md`；`docs/api/freeze.c1r1.json`

新连接先协商 C1R1，再按 capabilities 启用功能。此 Mock 未接入生产 transport / Electron preload；旧 `mock:c1` 命令仍启动旧 Mock。UIAI Phase A 可直接消费 fixture；不可把服务端 Mock、Node 模块或受信任测试端口打包进 Renderer。真实桥接属于复核后的集成工作。

AI 规划使用 group_key / role_key，plan 输入不得包含真实 role_id 或 effective_permissions。先 validate 展示错误、警告和确认项，再由用户确认 apply，并单独提交权限授予。权限取请求、用户授予、工作区与 Harness 能力交集；本 Mock 网络始终 none，不产生 OS 权限。未验证模型可以保存为计划/暂停角色，不能启动。

角色第一张系统卡展示 RoleCharter（revision/hash）及 Bootstrap 状态。章程历史正文不可变；投影的 bootstrapState 来自交付记录。修改职责、权限、模型或工作区重新发布章程和 Binding epoch。PENDING/DELIVERING/FAILED 均阻止首项任务；DELIVERED 也不能绕过模型未验证。FIRST_USER_INPUT 是明确的 Mock 回退标识，尚未认证任何 Adapter。

模型列表显示 source / availability / 原生 reasoning.levels；六个 pi seed 只表示执行包提案，全部 SEED/UNVERIFIED，不是本轮对模型存在性或账号可用性的确认。Runtime > Verified Cache > Seed；目录缺失模型不自动改用户选择、不回落为可启动。不能同时传 reasoning_effort 与 thinking_budget。

组重构使用统一 Preview → Drain → 再 Preview → Commit。UI 可以预选 SUSPEND_FOR_REVIEW，但请求必须显式列出每项队列处置。显示全部 blockers，提交同一 planId、planHash、expectedRevision；其他变更后重新预览。默认 NEW_SESSION_WITH_HANDOVER；NATIVE_RESUME_WITH_TRANSITION 必须有已认证能力，当前 Mock 默认拒绝。KEEP_ARCHIVED_ONLY 不执行。旧组归档、角色 ID 不变、工作树不合并、角色不自动唤醒。

MOVE_WITH_ASSIGNEE 在 Mock 中创建 sourceTaskId 关联的后继排队任务；原任务在旧组挂起并保留规则引用。拆组使默认结果去向跨组时返回 RESULT_TARGET_REVIEW_REQUIRED，用户必须显式设置 completion_to / problem_to；不自动改为用户或抄送旧组。交接包通过 charterId 引用完整新章程，旧上下文不会自动遗忘。

项目卡使用 snapshot 的 statusSummary；groups 最多显示 3 组、每组最多 5 角色，extra*Count 表示折叠数量，汇总计数包含全部活跃组。不另存一套首页业务状态。

变更需求通过 CCR 进入复核，不在本轮继续 W11 或 Renderer 实现。
