# V1.1 非 UI 最终收尾 F0 基线（2026-09-21）

状态：`F0_COMPLETE_WITH_CI_RED_BASELINE`。本文不是 Windows RC、不是非 UI RC，也不授权 merge、tag 或 release。

## 固定基线

- 工作树：`E:\AgentRouter\.worktrees\v1.1-functional-codex`
- 分支：`feat/v1.1-functional-closeout-codex`
- 执行包指定与实际本地 HEAD：`8c50febc6d464ef0fd598bd66a8ba526c99eac1a`
- `git fetch` 后远端同名分支：`8c50febc6d464ef0fd598bd66a8ba526c99eac1a`
- fetch 前后工作树均无 tracked 修改；执行包完整性校验：18/18 文件通过，未把校验脚本当作应用测试。
- 已复核 `FINDINGS-RETEST.md`、`CODEX-N4-CHECKPOINT.md`、`CODEX-N6-LEDGER-20260921.md`、`CODEX-N8-STABILITY-LEDGER-20260921.md`。

## Harness pin 与测试资产归属

- 安装版本、入口和 SHA-256 固定在 `UPSTREAM-PINS-20260921.json`。ZCode 固定执行包审阅过的官方上游 SHA；Codex、Kimi、DSH、Pi 固定 2026-09-21 执行时官方仓库 HEAD。Codex 安装版本到源码提交的一一映射留给 F1 对齐，不能把安装文件哈希或当日 HEAD 冒充发行版本源码映射。
- 本轮对象与保护边界固定在 `TEST-OWNERSHIP-LEDGER-20260921.json`。只有本批明确记录为 `created_by_this_batch=true` 的对象才可在证据冻结后清理。
- Codex 不使用 reset credit；现有账号、生产 HOME、既有会话和受保护 DUT 不做复制、导出或删除。

## 当前 CI 事实

GitHub 上当前 SHA 的两个工作流均在创建 job 后立即失败，且没有 step 和可下载失败日志：

| Workflow | Run | 结果 | 当前可证事实 |
|---|---:|---|---|
| W11 integration and P1 gates | `35552430383` | FAIL | Windows job 无 steps，`gh run view --log-failed` 返回 `log not found`。不能记作代码门禁 PASS。 |
| C1 contract and offline gates | `35552430446` | FAIL | c1 job 无 steps，`gh run view --log-failed` 返回 `log not found`。不能记作代码门禁 PASS。 |

因此 G6 仍为红色，后续需修复 runner/workflow 可执行性并取得本 SHA 的实际绿色运行，或取得用户明确 waiver。

## 本地门禁当前状态

首次通过 pnpm wrapper 运行时，其依赖状态自检尝试执行 npm 默认 `node-gyp rebuild`，因本机没有 Visual Studio C++ workload 而停止；应用测试尚未开始。复核发现 `better-sqlite3@13.0.3` 已随包携带 `prebuilds/win32-x64.node`，项目在 Node `v24.14.0` 可从标准入口加载该预编译文件。随后直接使用锁定依赖运行门禁，没有跳过数据库路径：

| Gate | 结果 |
|---|---|
| spec | PASS，36/36 |
| typecheck / lint | PASS |
| unit | PASS，41 files / 217 tests |
| integration | PASS，49 files / 226 tests |
| contract + chaos | PASS，9 files / 70 tests |
| C1 / C1R1 generation + frozen sources | PASS |
| SQLite probe | PASS，SQLite 3.53.4、WAL、FK on、integrity ok、foreign_key_check empty |
| staged sensitive scan | PASS，2153 files，0 findings |
| published-history sensitive scan | PASS，3200 blobs，0 findings |

历史扫描首次因 `--all` 纳入 Codex 桌面本机 `refs/codex/turn-diffs/*` 而误扫受保护 DUT 快照，同时固定 128 MiB 缓冲不足。当前修复将发布历史定义为 branches/tags/remotes，并把历史批处理上限显式提高至 512 MiB；新增合同测试证明私有 checkpoint ref 被排除，而同一泄漏对象一旦进入 branch 仍会使门禁失败。当前发布历史扫描实际通过。

## F0 结论与 F1 入口

F0 的 fetch、既有证据复核、upstream pin、ownership ledger、当前 CI 事实和全量本地门基线均已完成。CI 红色事实不在 F0 伪装成绿色，继续作为 G6 阻塞项。下一步进入 F1：先做 Codex 原生 app-server 隔离裸协议 probe，禁止第三次 Router 盲重试，禁止使用 reset credit。
