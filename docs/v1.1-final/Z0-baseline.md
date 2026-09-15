# Z0 — CI 与基线（V1.1 Windows + Mobile 最终收口）

日期:2026-09-15 · 分支:`feat/v1.1-final-windows-mobile`(基线 `2bd41f9`)
worktree:`E:\AgentRouter\.worktrees\v1.1-final-zcode`(独立,不触碰 Codex 旧 worktree 与 root 用户变更)

## 第一 Gate:远端 CI 失败复现与修复

### 失败事实(2bd41f9,两条 workflow 同根因)

- C1 `Type and regression tests`:FAIL —
  `tests/integration/context-native-compaction.test.ts:68`
  `AssertionError: expected 'BLOCK' to be 'COMPRESS'`(1 failed | 408 passed / 409)
- W11 `Contract, security and process gates`:FAIL — 同一断言(check-w11 内部跑同一测试集)
- C1 frozen/sensitive gate:PASS(失败不在冻结层)

### 根因

生产代码按 Z1 口径已收紧:`assessContextBudget` 对缺失 `currentUsageTokens` 返回
`TARGET_CONTEXT_BUDGET_UNKNOWN → BLOCKED`(“不能给 → UNKNOWN,不能当 0”)。
该测试仍按旧语义省略 usage 字段并期望 `COMPRESS` —— **测试未跟上生产语义,生产行为正确**。

### 修复(不 skip、不放宽断言)

1. `tests/integration/context-native-compaction.test.ts`:两处 preflight 预算补
   `currentUsageTokens: 0`(模拟全新目标 WS、驱动上报实际 usage=0 的合法 EXACT 场景),
   并注释 Z1 语义。用例意图(native compaction 优先、预算复查、receipt 后才推进 cursor)不变。
2. 新增 `vitest.config.ts`:`testTimeout/hookTimeout = 30s`。
   全量并行(84 文件/409 用例)下,做真实 DB/esbuild/子进程的集成用例在默认 5s 边缘抖动
   (本地两次全量失败集合漂移:第1次 3 个、第2次 1 个且不同文件;单跑全过;CI 同 SHA 全过)。
   只加超时余量消除负载敏感假失败,真实挂起仍会在 30s 失败。

### 本地精确复现 CI 命令(修复后全绿)

C1(与 workflow 同序):
```text
node tools/generate-client-contract.mjs --check   PASS
node tools/check-client-freeze.mjs                PASS
node tools/generate-client-c1r1.mjs --check       PASS
node tools/check-client-c1r1-freeze.mjs           PASS
node tools/check-sensitive.mjs --staged           PASS(2031 files,0 findings)
node tools/check-sensitive.mjs --history          PASS(2694 files,0 findings)
node node_modules/typescript/bin/tsc --noEmit     PASS
node node_modules/vitest/vitest.mjs run tests/unit tests/integration tests/contract tests/chaos
                                                  409/409 PASS(连续两次稳定)
```
W11:
```text
& ./tools/build-supervisor.ps1                    PASS
node tools/check-w11.mjs                          PASS
```
依赖安装与 CI 相同:`pnpm@11.19.0 install --frozen-lockfile`;Electron 二进制按 CI 方式
`node node_modules/electron/install.js` 补齐(首跑 check-w11 因缺 electron.exe 报
“Process failed to launch”,非代码缺陷)。

## 基线事实

- Node `v24.14.0` · SQLite `3.53.4`(better-sqlite3 13.0.3,CI 同版本口径)
- pnpm `11.19.0`(frozen lockfile)· Electron 二进制经 install.js 安装
- 迁移 001—012(sha256 前 16 位,字节不可变;013+ 才允许新增):

| 文件 | sha256(前16) |
| --- | --- |
| 001-baseline.sql | 96c60988816b8c80 |
| 002-w11-application.sql | d49e1bae041c9703 |
| 003-native-execution.sql | 617cbb1701d85cd7 |
| 004-external-api-journal.sql | fe2645142aefe336 |
| 005-role-sessions.sql | 1cf43e27223c06c1 |
| 006-role-harness-dynamic.sql | 84e9173de9c761ce |
| 007-restore-current-binding-index.sql | e9014b8c880eb65a |
| 008-participant-grants.sql | 3860a9960b1cc2af |
| 009-role-session-handoffs.sql | 7e11cc46de84c211 |
| 010-run-provenance.sql | a2a8662a6a479f24 |
| 011-work-session-continuity.sql | 8103e00209659b8b |
| 012-role-context-index.sql | c3ba6d048be3af63 |

- Tailscale:`tailscale serve status` = **No serve config**(尚未配置,Z3/Z8 再配,不 reset 既有规则、不用 Funnel)。
  tailnet 节点:`young-lab`(本机,100.74.12.59,windows)、`hzx-lab`(100.105.163.21,windows,可作 Z5 第二台)、
  `trassi`(linux,offline — 本轮不用)。

## 受保护对象(本轮绝不触碰)

- 开发 ZCode 桌面进程(PID 53760/47588/58024/55676 等,09:08 启动)与当前 ZCode 会话
  (`sess_3ac22c60-82e8-4d51-95f5-f8dd29e28bf7`)。
- Codex hzxpro 进程(PID 56268/56272/9684,10:59 启动)及其认证/活动对话。
- 用户既有 Router 项目、Harness native session/conversation、认证文件、Tailscale 既有规则。
- 测试对象一律新建且前缀 `AR-V11-FINAL-*`;账号切换 `EXCLUDED_BY_USER`。

## 提交

本 Z0 提交只含:测试修复 + vitest.config.ts + 本文档。check-w11 运行再生的 evidence 截图
已 `git checkout` 还原,不混入提交。
