# N8 Recovery / Migration / Stability 账本（2026-09-21）

状态：`IN_PROGRESS`。本文不构成 Windows RC，也不替代 N6 真实 Harness 分层账本。

## 固定候选与保护边界

- 分支：`feat/v1.1-functional-closeout-codex`。
- 固定 source SHA：`15634d5d41481060c8efa624cb6a47f4f05ada99`。
- Windows 隔离数据根：`.local/v10-load/round-*`；`AGENTROUTER_FIXTURE=1`，不读取生产 HOME、Provider 凭据或真实会话。
- 报告：`.local/v10-load/fixed-load-report.json`（可再生成，不入 Git）。
- 此批次证明 Core/数据库/受管进程确定性稳定性；它不是 Pi/Kimi/DSH/Codex/ZCode 的真实 Provider 稳定性证据。

## 三轮固定负载结果

命令：`node tools/v11-fixed-load.mjs`。

| Round | 结果 | 覆盖 | RSS 末值 | DB |
|---|---|---|---:|---|
| 1 | PASS | 多角色 Plan/Bootstrap；5 个完成并 PUBLISHED；同 operation id 幂等重放仅 1 Task；运行中 cancel；controller 客户端重连无 mutation 复活；历史可读；active work 清零；Core 退出屏障 | 202872 KiB | 67 tables；`integrity_check=ok` |
| 2 | PASS | 同一固定负载 | 201288 KiB | 67 tables；`integrity_check=ok` |
| 3 | PASS | 同一固定负载 | 200844 KiB | 67 tables；`integrity_check=ok` |

三轮 RSS 末值没有单调增长；但这只是三个独立 Core 的 sanity 数据，不能据此宣称无内存泄漏。每轮均实际完成业务任务，不用空闲等待代替稳定性负载。

## 增强批次：补齐执行包 Stability 固定负载组成

执行包 `docs/10` 要求固定稳定性批次同时包含 Artifact I/O、WAITING_INPUT、new WS、controller contention。为避免用 N6 的独立子项替代组合稳定性证据，当前 dirty 工具做了以下补强：

- Fixture 工具白名单只新增 `artifact_write` / `artifact_read`，仍经 Core 的正式 Artifact 原子写入/读取实现，不开放其他工具。
- 每轮写入唯一 Markdown Artifact，再通过管理面 `artifact.download` 比对字节。
- 每轮执行 `WAITING_INPUT`，再经正式 `conversation.sendUserInput` 产生 TaskInput，验证第二个 Run 为 `CONTINUATION` 且输入被消费。
- 每轮创建 blank WorkSession，验证旧 ACTIVE 变为 ARCHIVED、新会话成为唯一 ACTIVE。
- 每轮在原 controller 租约有效时启动第二 controller，必须得到 `CONTROL_LEASE_BUSY`，不能静默抢占。

第一次增强运行三轮均在取消步骤超时。权威 DB 显示新增四项全部已完成，取消 Task 为 `QUEUED`、slot `blocked_reason=rate_limited`：同一角色 60 秒已有五次自动启动，第六次被产品既定限速正确阻止。该 3 FAIL 作为测试负载设计失败保留，不算产品 cancel 失败。修正后把取消负载放到第二角色，不减少业务量。

| 增强 Round | source | 结果 | 新增与原有覆盖 | RSS 末值 | DB |
|---|---|---|---|---:|---|
| 1 | `15634d5` dirty | PASS | 6 Role Bootstrap；5 完成/PUBLISHED；幂等重放；Artifact write/download；WAITING_INPUT→TaskInput→CONTINUATION；new WS/旧 WS 归档；controller contention 拒绝；cancel；client reconnect；历史读取；active work 清零；Core stop | 191284 KiB | 67 tables；`integrity_check=ok` |
| 2 | `15634d5` dirty | PASS | 同一固定负载 | 190160 KiB | 67 tables；`integrity_check=ok` |
| 3 | `15634d5` dirty | PASS | 同一固定负载 | 189068 KiB | 67 tables；`integrity_check=ok` |

增强批次结论：`FIXTURE_ENHANCED_FIXED_LOAD_3_OF_3_PASS_DIRTY_WITH_FAILURE_DENOMINATOR`。工具尚未提交，必须在 clean SHA 再跑 3/3 后才能关闭 Stability 固定负载子项。Core cold restart 不在同一批次中；N6 Pi/Kimi/DSH 在 clean `7fe1774` 有随机 marker 强证据，但不能扩展为 Codex/ZCode 或整包 RC。

增强工具 dirty 门禁：typecheck/lint PASS，unit 217/217，integration 226/226，contract 67/67，chaos 3/3。Fixture 扩展只在 `fixtureMode` 的既有隔离分支生效；生产 native 工具仍走受信 bridge 与有效权限校验。

## Clean 固定候选复测

增强工具提交并推送为 `f69c720b294359ae9c6d2985f25ac9af1c3fedd1` 后，在 clean 工作树重建 Core 并重跑相同三轮：

| Round | source | 结果 | checks | RSS 末值 | DB / stop |
|---|---|---|---:|---:|---|
| 1 | `f69c720` clean | PASS | 11/11 | 191452 KiB | 67 tables；integrity ok；active work 0；退出屏障 PASS |
| 2 | `f69c720` clean | PASS | 11/11 | 189188 KiB | 同上 |
| 3 | `f69c720` clean | PASS | 11/11 | 190160 KiB | 同上 |

固定稳定性负载子项判定：`FIXTURE_ENHANCED_FIXED_LOAD_3_OF_3_PASS_CLEAN_WITH_FAILURE_DENOMINATOR`。三轮都包含 multi-role、Artifact I/O、WAITING_INPUT/TaskInput continuation、cancel、client reconnect、new WS、idempotent retry、controller contention，以及 DB/resource/stop 观测。此判定只关闭 `docs/10 Stability` 的固定 fixture 负载子项；Migration 逐项证据映射、完整 fault injection 清单、100/1k/10k performance sanity、最终 Windows package 仍未完成，所以 N8 与 Windows RC 均保持未关闭。

## Migration / Fault / Performance 当前证据边界

- 当前全套 integration `226/226`、contract `67/67`、chaos `3/3` 已通过，覆盖仓库中的 migration、backup、fault 单测/集成场景；尚未逐条把执行包列出的每个 fault injection 映射到当前 SHA 的独立证据，因此不能宣称 N8 全闭环。
- 100/1k/10k 历史记录 performance sanity 的补强与结果见下节；当前仍是 dirty evidence，待提交后 clean 复测。
- Windows package migration 完整性、upgrade 失败恢复和旧版本拒绝策略仍需按最终 package 候选统一复核。

## Performance sanity 补强（dirty）

原 `v11-c10-scale.test.ts` 会插入 100/1k/10k conversation items、做 snapshot 与 20 MiB Artifact 分块读取，但没有真正把 conversation 分页读完，也未测 frame size 或 event catchup latency。当前 dirty 补强：

- 对每个规模用 `conversation.read` 每页 100 条一直翻到末页，验证新增 `c10_*` id 无重复且数量精确；
- 记录并限制最大 conversation page、snapshot、event catchup frame 字节数；
- 记录 event catchup latency、分页耗时、请求 p95 与 RSS；
- 报告写入可再生成的 `.local/w11-tests/c10-scale-report.json`，不入 Git。

第一次运行 FAIL：100 档实际读到 103 条，因为 Plan/Bootstrap 已在该 Space 生成 3 条真实 conversation；这是测试 baseline 断言错误，不是分页丢失。修正为分别验证 `c10_* == n` 与 `total == baseline+n` 后，针对性测试 2/2 PASS：

| 历史规模 | 完整分页耗时 | 请求数 | 最大页 | snapshot | event catchup | event frame |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 12 ms | 2 | 15167 B | 9901 B | 2 ms | 815 B |
| 1,000 | 42 ms | 11 | 15167 B | 9901 B | 1 ms | 815 B |
| 10,000 | 343 ms | 101 | 15552 B | 9901 B | 1 ms | 815 B |

本次请求 latency p95 为 18 ms；RSS 从 114836 KiB 到 358120 KiB，低于该 sanity test 的 +512 MiB 上限。20 MiB Artifact 首/中/末块仍分别验证 65536/65536/4096 bytes 与 `hasMore`。这些数字是单机一次 dirty run，只用于发现明显断线、全量 frame 或无界增长，不是性能承诺。
