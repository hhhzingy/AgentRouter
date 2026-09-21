# AgentRouter V1.1 非 UI 收尾 — F3 定向回归台账

日期：2026-09-21

状态：`COMPLETE_WITH_FAILURE_DENOMINATOR`

结论：不是 Windows RC，也不是 `V1.1_NON_UI_FUNCTIONAL_RC_READY`。

## Pi 首轮（修复前分母）

- source SHA：`e67c8abff7fdb2448cd40e0202dc428fe61d6446`，`sourceDirty=false`。
- DUT：`.local/j3-production-pi/run-OYKYkq`。
- 真实百炼模型：`qwen3.8-flash`。
- PASS：Bootstrap、基础 Result `42/PUBLISHED`、Role MCP、同 ACTIVE WorkSession 两轮随机 marker、同 native ref、Artifact 输入/输出、落盘 marker/hash、Core 退出。
- FAIL：cancel 子项在 admission 前报 `CANCEL_RUN_NOT_ACCEPTED`；失败保留，不从分母删除。

### 根因

本批前五个真实 Run 达到每 Role `5 runs / 60 seconds` 的自动启动限流。第六个 cancel 任务正确进入 `QUEUED`，Role Slot 为 `rate_limited`，但协调器只依赖数据库变更唤醒；限流时间窗自然到期不会产生变更，因此队列不会自动恢复。

### 修复与自动验证

- `ExecutionCoordinator` 对 `rate_limited` / `clock_rollback` 时间型门禁安排有界重新检查，不绕过限流。
- `stop()` 清理待触发 timer，避免 Core 停止后残留调度。
- 新增确定性测试证明无外部状态变化时仍会重新 dispatch。
- 门禁：unit `220/220`、integration `228/228`、contract + chaos `71/71`、typecheck、lint、diff check 全部 PASS。

## 修复后 clean SHA 定向回归

固定 source SHA：`5385dc51209ac852684c2e87c1478a4e7b8d10b5`，三组均为 `sourceDirty=false`。

| Harness | DUT | 结果 | 覆盖 |
|---|---|---|---|
| Pi / 百炼 `qwen3.8-flash` | `.local/j3-production-pi/run-1Tlipx` | PASS | Bootstrap、42/PUBLISHED、Role MCP、同 native ref marker、Artifact hash/marker、限流后自动恢复、原生 CANCELLED、Core exit |
| Kimi / 百炼 `qwen3.8-flash` | `.local/j3-production-pi/run-sbZKnP` | PASS | 同上 |
| DSH / 百炼 `qwen3.8-flash` | `.local/j3-production-pi/run-GboXU5` | PASS | 同上；报告同时确认 P2 upgrade 路径 |

F3 低优先级定向回归已闭环。所有修复前失败继续保留；本结论不扩展为 Codex、ZCode、Participant、Remote、Package、CI 或整体 RC。
