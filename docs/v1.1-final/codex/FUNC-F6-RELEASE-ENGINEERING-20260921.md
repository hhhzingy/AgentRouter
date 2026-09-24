# AgentRouter V1.1 非 UI 收尾 — F6 Release Engineering 复核

日期：2026-09-21
固定功能候选：`82195197c4c994a82147026df23cd83401d9112c`
状态：`PACKAGE_PASS / LOCAL_GATES_PASS / CI_INFRA_FAILURE`。不是 RC。

## 1. clean 自动门

在 `sourceDirty=false` 的 `8219519`：

- TypeScript `tsc --noEmit`：PASS；
- repository lint：PASS；
- C1 generated contract check：PASS；
- migration manifest + LF EOL guard：PASS；
- Vitest unit + integration + contract + chaos：112 files PASS / 1 skipped，625 tests PASS / 2 skipped。

数据库权威检查在 `3294855` 执行；之后的数据路径改动仅为 Participant rollback 修复，已由定向 fault tests 与最终 `8219519` 全量门覆盖：

- spec checks：36/36 PASS；
- SQLite：`3.53.4`；
- journal：WAL；
- foreign keys：ON；
- `integrity_check=ok`；
- `foreign_key_check=[]`。

## 2. Migration / backup / recovery 映射

- `001`—`018` 均存在，freeze manifest SHA-256 为 `ed85b253863e362d13f94fa412ee454689df51b071418b88a985fb1c9e63e6d5`；
- 历史 migration 字节和 LF EOL 门通过；
- `tests/integration/migration-current-binding.test.ts` 覆盖阶段升级、FK 失败和重开；
- `tests/integration/j3-native-registry.test.ts` 覆盖旧版本升级、迁移前 backup、FK、幂等 reopen；
- `tests/integration/backup.test.ts` 覆盖 backup/verify；
- `tests/unit/external-api-journal.test.ts` 覆盖旧数据库升级、backup 与 durable claim；
- packaged manifest 强制包含 18 个 migration；缺入口/数量不符时 packaged smoke fail-closed。

没有通过删库解决迁移问题。

## 3. 高价值 Fault 状态

| Fault | 状态 | 权威证据 |
|---|---|---|
| Context target create 后响应丢失 | COMMITTED | context-transfer engine/receipt/hash/reconcile tests |
| Artifact file write 成功、DB 失败 | COMMITTED | `PART-11`；新文件/blob 回滚，共享 blob 保留 |
| native prompt 后 disconnect | UNKNOWN_EFFECT | Codex/Kimi/Pi/ZCode lifecycle + native RPC tests，不能误结算成功 |
| Core stop 响应丢失但 OS 已退出 | COMMITTED | runner 允许 `CONNECTION_LOST` 后仍强制 process-exit barrier |
| controller write 响应丢失 | UNKNOWN_EFFECT | Remote test：提交一次、响应丢失、重连不自动重放 |
| Participant artifact/result retry | COMMITTED | request_key 幂等、同键异内容冲突、真实网页 Result |
| Remote revoke + queued mutation | FAILED_KNOWN（写入被拒） | live WSS 关闭，排队 mutation 在进入 Core 前丢弃 |
| native stop proof unknown | UNKNOWN_EFFECT | forged/缺失 stop proof 不得标成功或释放资源 |
| restart 不重复外部副作用 | COMMITTED | command/external API journal、reconnect/UNKNOWN tests |

`COMMITTED` 表示副作用被权威状态证明已提交；`UNKNOWN_EFFECT` 保持不确定并禁止自动重放；`FAILED_KNOWN` 表示明确未提交。没有用“测试通过”掩盖未知副作用。

## 4. Windows package

目录：

`E:\AgentRouter\.worktrees\v1.1-functional-codex\release\AgentRouter-j3-82195197c4c9-c86f7fed-162b-4d58-b479-000a4cc69e20`

Manifest：

- `sourceSHA=82195197c4c994a82147026df23cd83401d9112c`；
- `sourceDirty=false`；
- `artifactHash=5a206083b307694db67eaba49a81e69fb9afc34237ef8d81a6a6ec21ad6c1a2e`；
- Node `v24.14.0`；
- Electron `44.3.0`；
- better-sqlite3 `13.0.3`；
- SQLite `3.53.4`；
- Management、Participant stdio、Participant HTTP 三个 MCP 入口均存在；
- 五 Harness driver 均固定为 `source:8219519...`，协议为 Codex/ZCode app-server、Kimi/DSH ACP、Pi RPC；
- native Harness runtime 明确为 `EXTERNAL_NOT_BUNDLED`；
- 18 个 migration 全部列入 manifest；
- 137 files secret/path scan：0 findings。

Packaged smoke PASS：

1. 生产注册入口启动且无 Fixture fallback；
2. 真实命名管道与 Desktop Context；
3. 环境变量/marker/IPC 均不能启用 Fixture；
4. 正式 `runtime.shutdownCore`；
5. 同数据目录重启；
6. Project 与 history readback。

## 5. ZIP / 解包 / 真实 Harness

ZIP：

- 路径：`release/AgentRouter-j3-82195197c4c9.zip`；
- bytes：`200071473`；
- SHA-256：`3fc58163bdf13d78b96c8d8a8da9ccfd271719d2f4f6afc78bbc5016414f1aac`。

解包目录：`.local/unpacked-8219519`。

在新解包目录重复执行：

- manifest/file hash：PASS；
- packaged Core shutdown/restart/history：PASS；
- secret/path scan：137 files / 0 findings；
- 真实 Pi RPC + 百炼 `qwen3.8-flash`：Bootstrap `DELIVERED`、Run `SUCCEEDED`、Result `42/PUBLISHED`、Management MCP 同键幂等、Core 全树退出；
- package source SHA 与工作树 SHA 精确相同，`dirty_source=false`。

Codex/ZCode 打包态真实 smoke 没有伪造：

- Codex 按用户指示暂停后续 live 测试；最近一次 clean `fca0665` 有界复测由官方 `codexErrorInfo` 证明为 `CODEX_USAGE_LIMIT_EXCEEDED`，没有进入 Core restart；
- ZCode Existing Account 受 `BLOCKED_BY_UPSTREAM_ACCOUNT_HOST_CONTRACT` 限制；
- 因而 package Gate 不能扩大为“五 Harness 打包态 PASS”。

## 6. GitHub CI

`8219519` 的远端运行：

- C1：run `35575246417`，`failure`，job `c1`，`steps=[]`；
- W11：run `35575246447`，`failure`，job `windows`，`steps=[]`。

两者均在工作步骤启动前失败，属于 CI 基础设施/计费启动失败形态；不能写成代码测试失败，也不能写成 GitHub green。当前没有用户书面 CI waiver。

## 7. F6 判定

`PACKAGE_AND_UNPACKED_PI_SMOKE_PASS / CI_GATE_OPEN / CODEX_ZCODE_PACKAGE_SMOKE_OPEN`

发布工程产物可供继续诊断和 UI 分支集成，但不满足非 UI RC 的 G6 全条件。
