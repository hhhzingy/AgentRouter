# AgentRouter V1.1 Windows：UI 契约增量复核（2026-09-23）

Core 分支 `feat/v1.1-functional-closeout-codex`，产品源码与测试提交 `eccf799575ef4a1a4d761a9add11435874e98aab`，已推送 GitHub。UI 分支最后复核为 `feat/v1.1-ui-kimi` 的 `4c17cb55493830ea939f4256c16ba1143f2884cb`，尚未合流。冻结 C1/C1R1/C1R1P1 schema 未改。

## 本轮实现

1. `participant.slot.list` 增加 Role 内短引用、仅 OPEN 的安全认领说明和 ACTIVE Binding 类型摘要。认领短引用 `W<seq>` 的解析已修复。没有可靠心跳与外部会话公开字段时返回 `null`，不能宣称 Participant 在线。
2. `roleSession.preflight` 明确容量未探测、压缩由 Core 决定；`transferStatus` 仅投影实际探测后的容量结论、时间、原因，以及原始操作阶段和源 WorkSession 的真实 ACTIVE 状态。
3. `result.evidence` 提供已发布 Result 的 Core 持久记录与 Artifact 哈希/状态；无结构化测试记录或源码 SHA 时明确返回 `NOT_RECORDED`/`null`。
4. `result.requestChanges` 在单一事务中保存反馈、将原 Task 验收置为 `REJECTED`、创建后续 Task、记录 Result→Task 关联，同时保留原 `PUBLISHED` Result。`result.reviewStatus` 供响应丢失时核对；同操作 ID 重试幂等。旧 `result.reject` 仍是单纯拒绝验收，不能当作请求修改。
5. 修正 Participant 产出的 `kind/artifact_id` 在 Result snapshot 中的 Artifact ID 投影，避免真实 Artifact 已登记但列表为空。

字段、认证与 UI 消费约束见 [UI 契约增量交接](../coordination/UI-CONTRACT-CHANGE-20260923.md)。

## 验证

| 项目 | 结果 |
|---|---|
| 本地 TypeScript / lint / 冻结合同检查 | PASS |
| 定向集成 | Slot、短引用、容量结论、Result 安全读取/原子修改/回滚/幂等/越权拒绝均 PASS |
| 真实本地 Core pipe | `participant-workloop` 中由网页 Participant 提交第二个 Result，客户端通过本地 pipe 请求修改；原 Result 仍 `PUBLISHED`，反馈和后续 Task 关联在数据库中可复核，PASS |
| 本地全套 Unit、Integration、Contract、Chaos、UI | 111 文件，637 PASS、1 SKIP |
| 提交前 index 敏感内容检查 | 2180 文件，0 findings |
| 当前可发布分支、标签、远端历史扫描 | 3494 个 blob，0 findings |
| GitHub C1 | [运行 35815427852](https://github.com/hhhzingy/AgentRouter/actions/runs/35815427852) 成功 |
| GitHub W11 | [运行 35815427813](https://github.com/hhhzingy/AgentRouter/actions/runs/35815427813) 公开页面显示 completed/success；匿名 `gh` API 查询曾被限流 |

本地 1 个 SKIP 是条件测试，不应误记为通过。此提交未使用 Codex reset credit。

## 尚未闭环

- GAP-001 的最近在线与外部会话安全显示缺乏可信来源；当前只关闭 Binding 是否存在及类型摘要。
- GAP-002 的源码 SHA、测试记录和已知限制尚未成为 Core 的结构化持久事实；当前只提供 Result/Run/Artifact 可核验元数据。
- GAP-003 的创建前容量预测仍为 `UNKNOWN`；提交后的真实决策可以查询。
- GAP-004 的 Core 原子命令已实现，但 UI 尚未合流消费，也没有在真实 packaged/Remote/Mobile 路径完成最终验收。
- UIAI 最新交接仍为 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`；11 个 P0 页面、真实 WorkSession/Remote/Mobile、DPI、屏幕阅读器等门禁未在最终合流 SHA 全部完成。
- 现有发布包仍绑定旧源码 `7fda369...`。必须在最终 Core+UI SHA 重新打包、核验与运行，才能重新评估 Windows RC。
- 公开历史扫描零 findings 不等于“任何执行包从未进入 Git”，也不涵盖仅本机 `refs/codex/turn-diffs/*` 的不可恢复检查点清理；详见 [公开仓库安全复核](./V11-PUBLIC-HISTORY-SECURITY-REVIEW-20260922.md)。

因此本轮状态仍为 **`NOT_V1.1_WINDOWS_RC_READY`**。没有 merge main、tag 或 release。
