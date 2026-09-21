# AgentRouter V1.1 发布前最后一轮复核（2026-09-21）

执行包：`docs/执行包/AgentRouter_V1.1_发布前最后一轮_Codex执行包_20260921`

工作树：`E:\AgentRouter\.worktrees\v1.1-functional-codex`

分支：`feat/v1.1-functional-closeout-codex`

运行时与安装包候选：`823d8d23d321e32cbb44aeb1ce4dd4360ef4bfae`

远端：`origin/feat/v1.1-functional-closeout-codex` 已同步到上述候选。

## 1. 最终结论

**结论：`NOT_V1.1_NON_UI_FUNCTIONAL_RC_READY`，不得宣称 Windows RC。**

本轮已经闭环 ZCode Existing Account Broker、真实 Bigmodel / `GLM-5.3-Flash`、Level A、Level B、TaskInput、Artifact、Core restart、安装包与 ZIP 解包态真实冒烟；共享 Harness 回归、网页 Participant、数据库、契约、安全和本地完整测试也已有证据。

仍有三个不能冒用为 PASS 的边界：

1. 用户明确要求先跳过 Codex 测试；未使用 Codex reset credit，因此 G1 不是 PASS。
2. Tailscale Serve HTTPS/WSS 未启用，G5 仍是外部 Enablement 阻塞。
3. GitHub C1/W11 在最终候选 SHA 上均未分配 runner、`steps=[]`，精确原因是账户账单/支出上限，G7 不是 green。

没有 merge main、tag、release 或 UI merge。

## 2. R0—R6 执行对照

| 阶段 | 状态 | 本轮事实 |
|---|---|---|
| R0 基线与保护边界 | PASS | 固定独立 worktree/feature branch；生产 HOME 与 `.local-protected` 不写不删；ZCode 生产凭据仅只读比较散列，不在文档记录散列值 |
| R1 Core / 契约 / 数据 | PASS | typecheck、lint、36/36 spec、C1 generation、security、doctor、DB integrity/WAL/FK 全通过；doctor 仅提示全局 pnpm bin 未进 PATH |
| R2 Harness / ZCode | PASS | 官方安装客户端 0.16.9 的 embedded app-server + Existing Account Broker；Bigmodel / `GLM-5.3-Flash`；Level A、Level B、TaskInput、Artifact、Core restart 通过 |
| R3 共享 Harness 回归 | PASS_WITH_RETRY_DENOMINATOR | Pi 通过；Kimi 与 DSH 首次瞬态失败均保留，独立重试通过；没有抹去失败分母 |
| R4 Participant / Remote | PARTIAL | 网页 ChatGPT Participant 真实 Task→Artifact→Result→PUBLISHED 证据有效；Tailscale HTTPS/WSS 未启用 |
| R5 Release engineering | PARTIAL | 源目录包、ZIP、全新解包、secret scan、Core restart、真实 ZCode package smoke 通过；Codex package smoke 按用户指示跳过 |
| R6 CI / 最终签署 | BLOCKED_EXTERNAL | 最终候选 SHA 的 C1/W11 都因 GitHub Billing/Spending limit 未启动；没有 infrastructure waiver |

## 3. Release Gate Matrix

| Gate | 状态 | 复核结论 |
|---|---|---|
| G1 Codex | `SKIPPED_BY_USER` | 用户明确要求先跳过；未切换账号、未消费 reset credit；不能计为通过 |
| G2 ZCode | PASS | Existing Account、Bigmodel、`GLM-5.3-Flash`、Level A、cold resume、Core restart、TaskInput、Artifact、安装包态与解包态真实冒烟通过；生产凭据测试前后散列相等 |
| G3 Pi / Kimi / DSH | PASS_WITH_RETRY_DENOMINATOR | Pi 一次通过；Kimi、DSH 的首次真实失败与独立重试 PASS 同时记录 |
| G4 Web Participant | PASS_BY_UNCHANGED_CODE_EVIDENCE | 相关代码未变；沿用真实网页插件任务 `task_8552de86-6a1e-4007-ad12-90899d1e5809` 的 PUBLISHED 与 Artifact 独立校验 |
| G5 HTTPS Remote | `BLOCKED_ENABLEMENT` | Tailscale `CertDomains=null`、`serve status --json={}`；没有 HTTPS/WSS 实测，不用 OpenAI Secure MCP Tunnel 替代 |
| G6 Package / Recovery | PARTIAL | ZCode、Core、ZIP、解包、secret scan、DB 检查通过；Codex package smoke 被用户跳过，故不能给完整 G6 PASS |
| G7 GitHub CI | `BLOCKED_CI_BILLING` | C1/W11 `steps=[]`，未实际执行；无 waiver，不能把本地 PASS 写成 GitHub green |

## 4. ZCode 最终证据

### 4.1 产品与账号路径

本轮使用的是已安装 **ZCode Electron 客户端** 的官方 embedded app-server，不是把 ZCode 降格成 CLI，也没有配置替代 CLI 账号。

- ZCode：`E:\software\ZCode\ZCode.exe`，版本 `0.16.9`
- upstream pin：`zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`
- provider：`account:bigmodel-individual-coding-plan`
- model：`GLM-5.3-Flash`
- builtin revision：`30`
- 生产凭据文件仅在内存中读取所需账号并做前后散列相等比较；散列值和 secret 均未写入 Git。

Broker 只选定官方账号条目，按官方 AES-256-GCM 约定在内存中解密，并把运行时认证绑定到对应 request；所有重读错误统一为安全错误 `ZCODE_EXISTING_ACCOUNT_REFRESH_REQUIRED`。重复 runtime-auth、断连后 late secret、瞬态不可读 credential store 均有测试覆盖。

### 4.2 真实流程

最终候选 SHA 的 Level A：

- 报告：`.local/j3-production-pi/run-x1akWF/report.json`
- Bootstrap：`DELIVERED`
- Run：`SUCCEEDED`
- Result：`42 / PUBLISHED`
- Core exit：PASS
- credential hash unchanged：true

Level B 与功能证据：

- TaskInput：`.local/j3-production-pi/run-AfdgrF/report.json`
- Core restart / native resume：`.local/j3-production-pi/run-haW6Dc/report.json`
- marker + input/output Artifact + 两次 app-server cold resume：`.local/j3-production-pi/run-YxAQ7M/report.json`

上述 Level B 运行在 `6116fde`；其后的候选变更仅为 capability 宣告、测试加固和 credential reread 安全归一化。最终 `823d8d2` 又完成 Level A、完整测试集以及安装包/解包态真实 ZCode 回归。

ZCode `native_resume` capability 已标为 `VERIFIED`。跨 Work Session Context transfer 仍不扩大声明：官方 history export 能力当前为 `UNKNOWN`，因此产品按 fail-closed 不开放跨 WS transfer；这不是用假能力冒充通过。

## 5. 共享 Harness 与 Participant

共享 Harness 回归：

- Pi / Bailian：`.local/j3-production-pi/run-lhzFol/report.json`，PASS
- Kimi 首次：`.local/j3-production-pi/run-xSrRDw/report.json`，`NATIVE_PROCESS_CLOSED` / UNKNOWN，保留
- Kimi 独立重试：`.local/j3-production-pi/run-ZTMFws/report.json`，PASS
- DSH 首次：`.local/j3-production-pi/run-T8lrZW/report.json`，`NATIVE_DISCONNECTED`，保留
- DSH 独立重试：`.local/j3-production-pi/run-uHSZcw/report.json`，PASS

网页 Participant 详见 [FUNC-F4-PARTICIPANT-REMOTE-20260921.md](./FUNC-F4-PARTICIPANT-REMOTE-20260921.md)。本轮未改 Participant 相关代码，因此不伪造新测试，只沿用已独立验证的真实任务与 Artifact 证据。

## 6. 最终包、ZIP 与解包复测

源目录包：

`E:\AgentRouter\.worktrees\v1.1-functional-codex\release\AgentRouter-j3-823d8d23d321-408a5c07-ed0d-4a63-952e-ae436b36457b`

- `sourceSHA=823d8d23d321e32cbb44aeb1ce4dd4360ef4bfae`
- `sourceDirty=false`
- `artifactHash=0dd2450450bd21cec2031ca4b6cad9f10f7b1714b3877937aeb4080af978629f`
- 137 文件 secret scan：0 findings
- packaged Core restart smoke：PASS
- 真实 ZCode：Bootstrap DELIVERED、Run SUCCEEDED、`42/PUBLISHED`
- 报告：`.local/j3-production-pi/run-MOTGp9/report.json`

最终 ZIP：

`E:\AgentRouter\.worktrees\v1.1-functional-codex\release\AgentRouter-j3-823d8d23d321.zip`

- bytes：`200093492`
- SHA-256：`2f45edccff9f86debf2310b4068de4baf32671f9f3438ea2575f85bc400ae443`

全新解包目录：

`.local/unpacked-823d8d23d321/AgentRouter-j3-823d8d23d321-408a5c07-ed0d-4a63-952e-ae436b36457b`

- 137 文件 secret scan：0 findings
- Core restart smoke：PASS
- 真实 ZCode：Bootstrap DELIVERED、Run SUCCEEDED、`42/PUBLISHED`
- 报告：`.local/j3-production-pi/run-l3m3KD/report.json`
- 复测后生产 credential hash unchanged：true

Codex 安装包冒烟未运行，原因是用户明确要求先跳过 Codex 测试；不是 PASS，也不是代码失败。

## 7. 最终候选本地门禁

全部绑定运行时候选 `823d8d2`：

- `pnpm typecheck`：PASS
- `pnpm lint`：PASS
- `pnpm spec:check`：36 passed / 0 failed
- `pnpm contract:check`：PASS
- `pnpm security:check`：2165 文件 / 0 findings
- `pnpm doctor`：PASS，1 个非阻塞 warning（全局 pnpm bin 未进 PATH）
- `pnpm db:verify`：Node 24.14.0、SQLite 3.53.4、WAL、FK on、integrity ok
- 完整 Vitest：113 files passed / 1 skipped；638 tests passed / 2 skipped
- `pnpm test:unit`：42 files / 237 tests PASS
- `pnpm test:integration`：49 files / 229 tests PASS
- `pnpm test:contract`：8 files / 68 tests PASS
- `pnpm test:chaos`：1 file / 3 tests PASS
- 最终 package manifest：001—018 共 18 个 migration，freeze manifest SHA-256 为 `ed85b253863e362d13f94fa412ee454689df51b071418b88a985fb1c9e63e6d5`
- 当前交互 shell 为 Node 24.19.0，项目 engine 固定 24.14.0，因此 pnpm 输出 engine warning；数据库与发布包探针实际使用固定的 24.14.0。

## 8. GitHub CI 事实

最终候选 SHA：

- W11 run [35619982778](https://github.com/hhhzingy/AgentRouter/actions/runs/35619982778)，job `106400309507`
- C1 run [35619982745](https://github.com/hhhzingy/AgentRouter/actions/runs/35619982745)，job `106400309869`

两者均为 `status=completed`、`conclusion=failure`、`steps=[]`，runner 未实际执行。annotation 原文：

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

因此结论只能是 `BLOCKED_CI_BILLING`；不能把本地门禁通过写成同 SHA GitHub green。

后续对 docs/evidence-only SHA `c857590a58869b78c9f03c7b5dcfd90ba51a436c` 的复查得到相同结果：

- W11 run `35621701614`，job `106406074777`：`runner_id=0`、`steps=[]`
- C1 run `35621701588`，job `106406074995`：`runner_id=0`、`steps=[]`
- 两条 annotation 仍为相同 Billing / spending limit 原文

## 9. UI 契约增量

既有 Kimi UI/UX 基线不变：

`UI_BASE_SHA=89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`

该 SHA 已推送到 `origin/feat/v1.1-final-cursor-win`，只是 UI 开发基线，不是 Windows RC。

本轮没有修改 Desktop Renderer / Mobile UI，也没有改变冻结的 C1R1P1 schema。唯一面向 UI 的可观察增量是 ZCode lifecycle capability 中 `native_resume=VERIFIED`；Existing Account Broker、runtime header 和 credential fencing 都在 Core/Platform 内部，不要求 Kimi 从新的业务合同基线重开分支。

## 10. 清理与保护资产

已删除可重建且被当前候选取代的本轮临时产物：

- `.local/unpacked-b9eaf97152b5`
- `.local/zcode-upstream-872ad960`
- 旧 `8219519` / `b9eaf97` package 目录与 ZIP

保留当前 `823d8d2` package、ZIP、解包复测目录、当前 Gate 证据与失败分母。没有触碰 `.local-protected`、用户生产 HOME、现有项目、会话或凭据。

## 11. 最小外部动作卡

1. **Remote**：在 Tailscale 管理面为本机启用 HTTPS certificate / Serve；获得明确授权后再执行真实 `tailscale serve` 和 HTTPS/WSS 验收。
2. **CI**：修复 GitHub Billing / spending limit，然后在同一运行时候选 SHA 上重跑 C1 与 W11；若不是同 SHA，必须重新绑定证据。
3. **Codex**：只有用户明确恢复测试后，才使用可用额度账号补跑真实 cold resume 与 package smoke；仍不得自动使用 reset credit。

Remote 最新只读复查进一步确认：`tailscale serve status --json={}`、`CertDomains=null`，TLS certificate probe 返回 `your Tailscale account does not support getting TLS certs`。独立操作卡见 [V11-EXTERNAL-ACTION-CARD-20260921.md](./V11-EXTERNAL-ACTION-CARD-20260921.md)。

## 12. 发布边界

- 不输出 `V1.1_NON_UI_FUNCTIONAL_RC_READY`
- 不宣称 Windows RC
- 不 merge main/UI
- 不 tag
- 不 release
- 不把跳过的 Codex、未启用的 Remote、零步骤 CI 写成 PASS

本文提交会产生 docs/evidence-only 后继 SHA；运行时与安装包候选仍固定为 `823d8d23d321e32cbb44aeb1ce4dd4360ef4bfae`，最终回报会同时给出后继提交 SHA。
