# CODEX N4 Checkpoint — Context Transfer / Native Lifecycle

状态：`PARTIAL_CODE_FIXED_REAL_DUT_PENDING`；不是 `FUNC-CHECKPOINT-C`，不是 Windows RC

## Source

- code SHA：`3bca2027dd212acebe5c4f6af5f3ce26c3e81e36`
- parent：`879093e4ac3bb7d17049abe8257532fb9000bfd2`
- branch：`feat/v1.1-functional-closeout-codex`
- UI Base：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- migration：无新增；冻结范围仍为 `001`—`018`
- frozen client contract：无字段变化；本批仅加强 Core ↔ native transfer port 内部合同

## 本批已闭环

Context Transfer 不再把“目标会话存在”当作“特定 seed 已接受”：

1. Core 对最终 seed（压缩后文本）计算并持久化 `seed_sha256`。
2. Driver 创建目标 native session 后，必须先通过 `recordTargetCreated` 持久化 native ref，再发送 seed。
3. Driver 成功回执必须同时返回 `acceptedPayloadHash`；只有它与 `seed_sha256` 相等才允许原子 commit。
4. 创建后、发送回执前发生 `UNKNOWN_EFFECT` 时，Core 转入 `SEEDED` 并只读 reconcile 已持久化目标；不得重建目标。
5. 重启恢复按 `operationId + native ref + expected payload hash` 核对；缺 hash、错误 hash、仅 session exists 均保持 `UNRESOLVED`，继续暂停派发。
6. ZCode 端口在 native input 中写入稳定 marker：`operationId + payload hash`；`session/resume` 必须观察到该 marker 才能补发接受回执。
7. ZCode 的 target-window 探测若必须 `session/create`，该会话立即成为并持久化为本次迁移目标；初始化阶段复用同一 native ref，不再创建无账本探针会话。保留 ref 与 Driver 返回 ref 不一致时拒绝 commit。

ZCode 在本架构里仍是客户端 Harness。生产端口调用的是其安装内置的官方 `app-server` 进程协议，用于受控会话 create/resume/send；这不把 ZCode 重新定义成普通 Role CLI，也不改变其 `COLD_RUN / native_resume=UNSUPPORTED` 声明。

## 自动证据

| Gate | 结果 |
|---|---|
| target create 后回执超时 → 按既有 ref/hash reconcile，且不重建 | PASS |
| wrong payload hash / session-exists-only → 不 commit，保持派发暂停 | PASS |
| target-window create → 同一 native target 被 initialize 复用 | PASS |
| reserved target ref → Driver ref 漂移 | PASS（拒绝 commit） |
| restart SEEDED → specific-payload confirm → 单次 commit | PASS |
| source/target sessionHome/profile/workspace 精确绑定 | PASS（既有 F12 回归） |
| A→B→C 后不复活历史 B | PASS（既有 F02 回归） |
| typecheck / lint / spec | PASS；spec 36/36 |
| unit | 41 files / 213 tests PASS |
| integration | 49 files / 219 tests PASS |
| contract + chaos | 9 files / 70 tests PASS |
| staged secret scan | PASS，0 findings |

说明：第一次与其他全套门禁并发跑 integration 时，`web-console.test.ts` 的重连轮询发生一次 31 秒资源竞争超时；该文件与 Context Transfer 定向隔离复跑 16/16 PASS，随后两次 integration 串行全量分别 217/217、最终 219/219 PASS。该波动不计为 Context Transfer 功能通过证据，保留在复核记录中。

## 未完成 / 不得扩大声明

- 当前生产 `transferPorts` 只接线 ZCode；其余 Harness 没有可验证的 native export/init receipt 端口。因此尚无真实同 Harness 或真实跨 Harness transfer PASS。
- ZCode 真实登录环境尚未在 `879093e` 上完成新 WS + transfer DUT；不得宣称 warm 或 Level B。
- 真实 `UNKNOWN_EFFECT` 崩溃/重启故障注入与三轮稳定性属于 N8，尚未执行。
- 未触碰用户生产 HOME、既有对话或账号；未 merge、tag、release。

下一步：在隔离 DUT 做 ZCode 新 WS + transfer 的真实 receipt 测试，并评估一个具备真实 export/init 通道的跨 Harness 路径；没有真实 receipt 证据的 Harness 继续明确 `UNSUPPORTED`，不伪造跨 Harness PASS。
