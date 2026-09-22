# AgentRouter V1.1 Codex 恢复测试与 Remote 复核（2026-09-22）

> 本文覆盖并更新 [上一轮复核](./V11-FINAL-PRE-RELEASE-REVIEW-20260921.md) 中“Codex 跳过 / Tailscale 不可用”的状态；上一轮的原始失败分母与历史证据仍保留。

## 结论

**仍为 `NOT_V1.1_NON_UI_FUNCTIONAL_RC_READY`；不得宣称 Windows RC。** Codex G1 已通过，clean SHA 的 Codex/ZCode 源包及 ZIP 解包态均通过。真实 Tailscale Serve HTTPS/WSS 后端已从不可用推进到实测部分闭环，但执行包规定的 cancel、response-drop UNKNOWN 不重放和完整 Core catchup 未在真实 Tailnet 链路上逐项证明。G7 同 SHA GitHub C1/W11 仍因 Billing 在 runner 分配前失败，均为 `steps=[]`。无 CI waiver；没有 merge、tag 或 release。

工作树：`E:\AgentRouter\.worktrees\v1.1-functional-codex`；分支：`feat/v1.1-functional-closeout-codex`。运行时/包候选 clean SHA：`8443abc9abdea3a432fdc0736fa61b22c07410bc`，已推送 `origin`。本轮新增的是 opt-in 真实 Tailnet 验收测试；从 `823d8d2` 到此前 `82fe5b1` 只有文档/证据变化，应用运行时代码未变。本文提交是文档后继 SHA，不冒充包内 `sourceSHA`。

## Gate 矩阵

| Gate | 状态 | 证据与边界 |
|---|---|---|
| G1 Codex | **PASS** | 隔离 DUT 完成原生登录后，真实 Core 关闭/重启、同 Native ref、随机 marker 回忆、`42/PUBLISHED`；clean SHA 包内与全新 ZIP 解包态真实 Codex 冒烟均通过。未使用 reset credit。 |
| G2 ZCode | **PASS** | 既有 Bigmodel / `GLM-5.3-Flash`、Level A/B、TaskInput、Artifact、cold resume 和 Core restart 证据继续有效；新 SHA 源包与解包态真实 Existing Account 测试均 `42/PUBLISHED`。生产凭据不写入，前后 hash 相等。 |
| G3 Pi/Kimi/DSH | **PASS_WITH_RETRY_DENOMINATOR** | 沿用上一轮真实回归；Kimi/DSH 首次瞬态失败与重试通过均保留。无共享 Native/Profile 运行时代码变更。 |
| G4 网页 Participant | **PASS_BY_UNCHANGED_CODE_EVIDENCE** | 沿用真实网页任务/Artifact/PUBLISHED 独立证据；相关代码未变。 |
| G5 HTTPS Remote | **PARTIAL_REAL_BACKEND** | 真正的 Tailscale Serve TLS 与 WSS、手机式安全 Cookie+Origin、观察者/控制者、lease、无害隔离项目写入、活动流撤销 4001、网关与应用服务重建后的凭据重连通过；未在真实链路证明 cancel、response-drop UNKNOWN 不重放、完整 Core 事件 catchup，也未做实体手机 UI 验收。 |
| G6 Data/Package | **PASS_AT_RUNTIME_SHA** | 18 migrations、clean SHA manifest、源包/ZIP/全新解包、两侧 137 文件 secret scan 0 findings、Core 重启、Codex/ZCode 两侧真实冒烟通过。不是干净机支持认证。 |
| G7 GitHub CI | **BLOCKED_CI_BILLING** | 同 SHA C1/W11 均 failure、`steps=[]`；C1 annotation 明确账户付款/支出上限。无 waiver，不能算 green。 |

## Codex 恢复测试

首次 `--live --codex --core-restart` 在隔离 DUT 返回 `BOOTSTRAP_NOT_DELIVERED`，数据库显示 `NATIVE_CODEX_MANAGED_LOGIN_REQUIRED`；这是缺失 DUT 登录，不是模型额度或连续性失败。失败报告 `.local/j3-production-pi/run-OnUQ2S/report.json` 保留。用户按隔离登录流程完成设备授权后，只在内存中比对批准身份，结果 `approved_identity_matches=true`，未输出身份/令牌，也未修改生产 HOME。

随后同一强测试通过：`.local/j3-production-pi/run-aLPQOk/report.json`。Bootstrap `DELIVERED`、Run `SUCCEEDED`、Result `42/PUBLISHED`；实际重启 Core 后 `sameNativeRef=true`、`markerRecalled=true`、`resultPublished=true`，Core 正常退出且 stderr 为空。所用隔离目录为 `.local-protected/codex-dut/...`；没有 Codex reset credit。

## 真实 HTTPS/WSS Remote

用户明确授权配置最小 Serve。起始 `tailscale serve status --json={}`，证书域 `young-lab.tail7dc63e.ts.net` 可用；仅执行 tailnet 内的 `tailscale serve --bg --https=443 http://127.0.0.1:44568`，未开启 Funnel。首次连接因 ACME 取证书超时，保留该失败分母；证书准备后独立重试通过 `tests/live/v11-tailscale-serve.test.ts`。测试数据只在 `.local/v11-tailscale-serve`，对象命名限定 `AR-V11-FINAL-REMOTE-*`。通过项：HTTPS health、WSS 精确 Origin + Secure/HttpOnly/SameSite Cookie 配对、observer 不可申请 controller、controller lease、隔离项目创建、已连接 WSS 撤销即时 `4001`、应用/网关在同一隔离数据库重建后重新连接、撤销凭据拒绝。既有 Remote 集成与打包 Core 启停测试回归 15 PASS / 1 opt-in SKIP；单独启用真实用例 1 PASS。验收结束已执行 `tailscale serve --https=443 off`，复查配置 `{}`，没有留下指向已停端口的入口。

这不是“完整 G5 PASS”：真实链路尚缺 cancel、response-drop UNKNOWN 不重放和完整 Core restart event catchup。现有 loopback 集成语义不能替代这三个真实 Tailnet 断言。

## 同 SHA 包与本地门禁

Windows 包：`release/AgentRouter-j3-8443abc9abde-e060ec93-9485-4fe2-afc0-cda35d1d525b`；manifest `sourceDirty=false`，`artifactHash=c9b3ee603843c9fb286cf4a3d68429714b5e051f64b2dfe1f7e0b3ae55e191b9`。ZIP：`release/AgentRouter-j3-8443abc9abde.zip`，`200093487` bytes，SHA-256 `27736fa0724bb521f3db472682aed87bb6c39b59372daf7a718ca77275b59f7e`。全新解包：`.local/unpacked-8443abc9abde/AgentRouter-j3-8443abc9abde-e060ec93-9485-4fe2-afc0-cda35d1d525b`。

- `pnpm test:packaged` 在源包和解包目录各 PASS，包含生产入口、18 migrations、隔离 Core 重启与项目/history 可读。
- 源包 Codex `.local/j3-production-pi/run-Zh3Q9z/report.json`、ZCode `run-mtzNLv/report.json`；解包 Codex `run-lILVUQ/report.json`、ZCode `run-kJjNZG/report.json`：四次均 `DELIVERED/SUCCEEDED/42/PUBLISHED`，Core 正常退出。
- 源包、解包目录 secret scan 各 137 文件 / 0 findings。
- 新 SHA `pnpm typecheck`、`pnpm lint` PASS；完整 Vitest：113 files PASS / 2 SKIP，638 tests PASS / 3 SKIP。新增真实 Tailnet 用例默认 opt-in 跳过，显式启用时 PASS。Node shell 24.19.0 与项目 engine 24.14.0 不同，仅产生 warning；包内 Node 是 24.14.0。

## GitHub 与后续

同 SHA [C1 run 35674685271](https://github.com/hhhzingy/AgentRouter/actions/runs/35674685271) 和 [W11 run 35674685373](https://github.com/hhhzingy/AgentRouter/actions/runs/35674685373) 均 completed/failure、`steps=[]`；C1 页面明确提示近期付款失败或需提高 spending limit。修复 GitHub Billing 后必须对最终源码 SHA 重新运行两条工作流并确认实际步骤 green；若 SHA 改变，须重新绑定证据。另需补全上述 G5 真实链路三项断言，才可能签署非 UI 功能 RC。用户未授权 merge、tag、release；本轮均未执行。

清理：已删除可重新构建的旧 `823d8d2` 与 `82fe5b1` 包目录、ZIP、解包目录；这些本地旧产物不可直接恢复，但可从相应 Git SHA 重建。保留当前 `8443abc` 包、ZIP、解包目录及测试报告；未清理 `.local-protected`、生产 HOME 或既有项目/会话。历史复核中的旧包路径因此仅作为当时证据记录，不再是现存交付物。
