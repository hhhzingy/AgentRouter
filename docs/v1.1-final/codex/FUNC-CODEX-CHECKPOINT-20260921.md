# FUNC-CODEX-CHECKPOINT（2026-09-21）

状态：`PARTIAL_LEVEL_A_AND_LEVEL_B_SUBITEMS_PASS_CORE_RESTART_OPEN`。不是非 UI RC，不是 Windows RC。

## 固定版本与边界

- Codex：`codex-cli 0.155.0-alpha.9.2`。
- executable SHA-256：`bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226`。
- 官方仓库执行时 HEAD：`a86631502d49274cb47208925c7d3dcece032029`；尚未把 alpha 安装包一一映射为该源码提交。
- 受保护 DUT：`.local-protected/codex-dut/dut-fj/home`；账号只做批准邮箱哈希匹配，不输出或复制凭据。
- model/effort：`gpt-5.6-luna` / `low`。未使用 Codex reset credit。
- Windows Job 只证明 `LIMITED_ISOLATION` 与进程树停止，不声明完整 OS 隔离。

## C1 裸协议双进程

clean SHA `e6597c78e996113ab616bb61fed9ee5777029f0f`，`.local/codex-raw-appserver-probe/report.json`：

1. 第一 app-server：initialize、账号哈希匹配、model/effort 可用、thread/start、最短无工具 turn、turn/completed。
2. stdin 关闭后进程 exit code 0、stderr 为空。
3. 第二 app-server：initialize、thread/resume 同一 thread hash，resume 返回 1 个既有 turn，第二个无工具 turn/completed。
4. 两次响应均精确匹配预期 token；无 reverse request；报告不持久化原生 ID 或模型正文。

结论：账号、模型、cwd、thread 落盘与跨 app-server resume 已由官方协议实测通过。先前 Router Bootstrap 失败不能归因为这些基础能力。

## C2 Router Bootstrap 与 Level A

clean SHA `93b17f255b0f4d2cd4fd7d1c47c10463f74f7c2f`：

| DUT | 结果 |
|---|---|
| `run-z6lYCz` | Bootstrap DELIVERED；42/PUBLISHED；Core 全树退出。 |
| `run-HKf4Q1` | Level A PASS：真实输入 Artifact→读取→输出 Artifact→`route_finish`→PUBLISHED；下载 hash 与随机 marker 一致；Core 全树退出。 |

## C3 Level B 固定分母

| DUT | 子项 | 结果 |
|---|---|---|
| `run-nYNnI8` | 同 ACTIVE WS/thread 随机 marker 两轮 | PASS，同 native ref，第二轮请求未重复 marker 仍准确返回。 |
| `run-nYNnI8` | WAITING_INPUT/TaskInput | PASS，正式 TaskInput 恰好一次消费，CONTINUATION Run、同 WS/native ref、Result PUBLISHED。 |
| `run-OpRBXe` | cancel | PASS，运行中取消落为 `CANCELLED`，Job 停止屏障成立。 |
| `run-Nm5edI` | Core restart strong continuity | FAIL before restart：基线 Run 最终 SUCCEEDED，但 `route_context` 返回 `BRIDGE_HANDLER_FAILED`，任务按失败 Result 收尾。数据库末态 binding/epoch/activation/WS 均一致，无法倒推出调用瞬间原因。 |
| `run-ybHCJn` | 第二次且最后一次有界诊断复现 | FAIL before restart：Bootstrap 进程提前关闭，未产生 lifecycle/terminal 诊断；delivery reason 仍为 `BOOTSTRAP_EXECUTION_FAILED`。停止继续刷测。 |

因此 Codex Level B 只能写 `PARTIAL_SUBITEMS_PASS`，不能写完整 PASS。Core restart、新 app-server Router resume、跨重启不重复 marker 回忆仍未闭环。

## 本轮诊断修复

- `93b17f2`：Bootstrap 在 ACK 缺失、原生 failed/cancelled、wall timeout 时产生安全原因码，并持久化到 delivery reason；不保存模型正文。
- `1e683d6`：Role bridge 仅透传 `^[A-Z][A-Z0-9_]{1,95}$` 安全错误码；路径、正文、秘密仍折叠为 `BRIDGE_HANDLER_FAILED`。
- 当前待提交：app-server 在 lifecycle 终态前提前关闭时产生 `NATIVE_PROCESS_CLOSED` + phase，避免以后再次只剩通用 reason。同一失败场景本轮不再重跑。

## C4 真实账号 smoke

受保护 DUT 使用用户已批准的真实登录账号，所有本轮测试只创建新测试 thread/session，未修改或关闭旧 thread。裸协议与 Router 新 thread smoke 均通过；没有对生产 HOME 做前后旧会话枚举，因此只记 `REAL_LOGGED_ACCOUNT_ISOLATED_DUT_PASS`，不扩大为生产 HOME 资产审计。

## 下一步

1. 提交并验证 `NATIVE_PROCESS_CLOSED` phase 诊断；保留两个 Core-restart 失败分母，不再无界复现。
2. 按执行包优先级进入 ZCode F2；Codex G1 仍因 Core restart continuity 未关闭。
3. 最终固定候选前若出现可解释的 app-server 早退修复，再对 Core restart 只做一次 clean 定向复测。
