# AgentRouter V1.1 Windows：Core/UI 联合候选复核（2026-09-23）

## 结论与源码边界

**当前仍为 `NOT_V1.1_WINDOWS_RC_READY`。** 这是独立集成候选分支，不是 `main`，没有 merge main、tag 或 release。Core/UI 合流后的 C1/W11、真实 Codex/ZCode、其他三家 Harness 短回归、打包/ZIP 解包与 Tailnet HTTPS/WSS 后端已有证据；但网页 Participant 的变更后真实复测、实体手机、完整 Electron 可访问性和 11 个 P0 页面逐页验收尚未闭环。这些门禁不能因非 UI 测试通过而自动转为 Windows RC。

| 来源 | 固定值 |
|---|---|
| Core 父提交 | `98dce0ca0f6a6476ec5fafaa3cf55cceb8e1a54d`，`feat/v1.1-functional-closeout-codex` |
| UI 父提交 | `bee47f9c126ce2e7f587f220c4072361b744f340`，`feat/v1.1-ui-kimi`；产品/测试源码 `ab7922b88ef1bb6181dcf104b8d0366b72550bea` |
| 合流候选 | `codex/v1.1-core-ui-candidate`；首次联合提交 `12084ce411117468c100bf93c8e73ace0ed4bae1`，随后修复 W11 桌面测试与本地管道断线状态 |
| 本轮产品修复 SHA | Core/UI 第一批产品修复 `8c6f84e34dba5e6a47dfc416de127562073d8ae8`；上一轮已测试/打包源码 SHA `8be447b405bc86827a5206787ab99f755227c8ae`。本轮手机端 Result 复核与断线处理修复为 `a6752eccc28636f5f4f3f2312a9df8ea0b57300e`；先前 `8be447b` 的包、Harness 和 CI 证据不能冒充此新 SHA。本文为后继文档提交，不冒充包内 SHA。 |

合流仅有 `tools/check-sensitive.mjs` 的历史扫描缓冲参数文本冲突；保留 Core 的 `HISTORY_BUFFER_BYTES` 与 `--branches --tags --remotes` 可发布引用范围。没有放宽扫描器或删除用户数据。

## 已证实

| 检查 | 证据与范围 |
|---|---|
| Core/UI 联合回归 | `pnpm typecheck`、`pnpm lint` PASS；`8be447b` 的 C1/W11 实际运行并绿灯，W11 包含真实 Electron J1/J2。此前 `ddfa4d8` 的 C1/W11 曾因固定 DUT 路径的源码文本断言红灯，修正断言后再跑绿灯；失败分母保留。新增真实 Core 退出回归验证本地命名管道会话转为 `DISCONNECTED`。 |
| Result 请求修改真实管道与桌面 UI | 网页 Participant 的第二个 Result 经本地 Core pipe `result.requestChanges`，原 Result 仍 `PUBLISHED`，反馈、后续 Task 与数据库关系可复核；另有 Core 原子/幂等/权限/回滚定向测试。`7d8a73d` 的 Windows CI J1 又从真实 Electron UI 点击「请求修改」，输入反馈，经本地 Core pipe 读取 `result.reviewStatus`，验证 `REJECTED`、反馈、原发布历史保留及后续 Task，并检查 UI 显示「已拒绝」；日志标记 `J1_REAL_ELECTRON_RESULT_REQUEST_CHANGES`。这是隔离 Fixture 环境的端到端链路，不是生产账号或最终安装包验收。 |
| Windows 构建与打包 Core | `8be447b` 干净源码构建，`sourceDirty=false`，manifest `artifactHash=f7d33a234baac05a398466b8f08d30d084aa0179bc393e9be452a16a4a62fc2b`；目录包及全新 ZIP 解包态 `pnpm test:packaged` 均 PASS：生产入口、18 migrations、真实命名管道、隔离 Core 重启及 Project/history 可读。非干净机安装、签名安装器或正式发布认证。 |
| 安全扫描 | 截至 `8be447b`：暂存扫描 2230 文件、0 findings；可发布分支/标签/远端引用历史 3551 个 blob、0 findings；目录包和 ZIP 解包态各 137 文件、0 findings。扫描范围不包含仅本机 Codex checkpoint refs；不能写成“任何执行包从未进入 Git”。 |
| GitHub Core 父 SHA | [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35816297797) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35816297821) completed/success。 |
| GitHub 联合 SHA | `8c6f84e` 的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35825964095) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35825964125) 均 completed/success；W11 包含 `J2_DISCONNECTED_NO_HEALTH_PROMISE`。此前联合 W11 红灯依次暴露旧 UI 选择器、折叠历史及真实管道断线误报在线，失败分母保留。 |
| GitHub 历史测试 SHA | `7d8a73d` 的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35828512926) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35828512920) 均 completed/success；W11 日志包含上述 J1 结果请求修改链路及 `J2_DISCONNECTED_NO_HEALTH_PROMISE`。 |
| 历史 SHA 打包 Core | `7d8a73d` 在开发机重建，`sourceDirty=false`，manifest `artifactHash=890f36f72171050bba099145124a4e7b1588ab0ce513014b5dffc717e062fb2d`；`pnpm test:packaged` PASS。首次运行误把 `--` 传为包路径而报 `ENOENT`，改用正确参数后通过；前次失败不是产品失败，也不隐去。 |
| 手机尺寸真实浏览器与本地 Remote | 在本机已安装 Chrome 上以 `390×844` 运行 `tests/live/v11-phone-console-browser.test.ts`，与 `tests/live/v11-packaged-remote-core.test.ts` 一起 2/2 PASS；覆盖 loopback WSS、配对 Cookie、controller/reconnect 与真实浏览器呈现。测试使用显式 `AGENTROUTER_TEST_CHROME` 指向 Chrome，原固定 Playwright Chromium 路径在本机不存在。此证据不是 Tailscale HTTPS、实体手机或最终安装包。 |
| 新 SHA 手机端 Result 复核 | `a6752ec` 修复手机 UI 把“请求修改”误接 `result.reject` 的 P0：现提交带反馈的 `result.requestChanges`，只有收到 `REJECTED`、后续 Task 和 `published_history_retained` 完整回执才确认成功；不确定回执保留草稿和操作标识，仅开放 `result.reviewStatus` 查询，不自动重放。`390×844` 真实 Chrome + loopback WSS 端到端测试 PASS，Core 断言反馈、后续 Task、原 Result `PUBLISHED`，并覆盖强制断线重连。初次加入该测试时因断线中的 WebSocket console error 失败，修复关闭旧 socket、清理 pending 后复跑通过。`pnpm typecheck`、`pnpm lint`、Remote integration 15/15 均 PASS。未知回执的前端人工状态复核分支尚未注入丢回复作独立浏览器测试；不能计入完整 G3。 |
| GitHub 最终测试 SHA | `8be447b` 的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35832297759) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35832297779) 均 completed/success；W11 保留 J1 请求修改与 J2 断线状态检查。 |
| 真实 Harness 同 SHA | `8be447b` 干净包：Codex CLI `0.155.0-alpha.16` 使用既有批准隔离 DUT，`run-4DhoRz` 的 Level A、同 native ref 随机 marker 与 Core restart 冷续 PASS，`run-eEd09A` 的 Artifact 读写/下载哈希 PASS；ZCode 安装客户端 `0.16.9` 的 embedded app-server + Existing Account Broker（Bigmodel / `GLM-5.3-Flash`），`run-rmQ8pC` 的 Level A、marker、正式 TaskInput、客户端重连、Core restart 冷续 PASS，`run-1TRzwG` 的 Artifact 读写/下载哈希 PASS。报告在 `.local/j3-production-pi/` 下，均为隔离项目；没有使用 Codex reset credit。 |
| 其他三家短回归 | 同产品代码的 `1a6cd2d` 包：Kimi `run-KShOIe` 与 pi `run-ziW6E4` 一次 `42/PUBLISHED`；DSH `run-KRzPvb` 首次 `NATIVE_DISCONNECTED`，独立重试 `run-yEJHCz` `42/PUBLISHED`。随后到 `8be447b` 仅改测试脚本/断言，未改 Native/Profile 产品代码；状态为 `PASS_WITH_RETRY_DENOMINATOR`，不谎称三家在 `8be447b` 包上重跑。 |
| 最终包与 ZIP | 目录包 `release/AgentRouter-j3-8be447b405bc-7bb57ff2-ad90-4895-9f5c-42a48c7dace9`；ZIP `release/AgentRouter-j3-8be447b405bc.zip`，200119035 bytes，SHA-256 `efbe112661142eb8389ff3651c303b53f56fc6b02a2606601b5cf78eefed73e9`。全新解包 `.local/unpacked-8be447b405bc/` 的 Core、Codex `run-zSLCkN`、ZCode `run-rXmEsA` 均 PASS，后两者为 `DELIVERED/SUCCEEDED/42/PUBLISHED`。ZIP 是候选归档，不是安装器。 |
| 真实 Tailnet Remote | `8be447b` 的 `tests/live/v11-tailscale-serve.test.ts` 1/1 PASS：真实 HTTPS/WSS、Cookie/Origin、observer/controller、cancel、提交后丢回复的 UNKNOWN 不重放、live revoke `4001`、服务重建后 catchup/snapshot。仅临时开启 tailnet-only Serve `443 → 127.0.0.1:44568`，未启用 Funnel；结束复查 `tailscale serve status --json={}`。仍非实体手机 UI 验收。 |

失败分母保留：ZCode 初测在沙箱虚拟用户名 `CodexSandboxOffline` 下因官方凭据密钥派生不符得到 `ZCODE_EXISTING_ACCOUNT_CREDENTIAL_LOCKED`；以原 Windows 用户上下文重测通过，生产 ZCode credential 文件修改时间在本轮前后均为 `2026-09-20T03:06:49.7227767Z`。测试脚本还先后暴露非 pi 仍强制检查 pi、未构建 Management MCP、组合场景租约未重新获取、角色使命误限“只做算术”等编排问题；均保留原失败，修正后独立/组合测试通过。本地独立打包 Electron 窗口冒烟曾因该开发机 GPU 子进程反复以 `-1073741515` 退出而超时，不能计 PASS。Windows CI 的 J1/J2 提供更强桌面自动化证据，但不能代替实体手机或屏幕阅读器验收。

## 仍未闭环的发布门禁

1. UI 原交接状态仍为 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`：11 个 P0 页面未逐页获得最终合流 SHA 的真实状态 PASS；17 张预览图为 `PREVIEW_MOCK`，不可充当 `REAL_CORE` 截图。
2. GAP-001 仅有 Slot/Binding 安全摘要，缺可信 `last_seen` 与外部会话显示；GAP-002 源码 SHA、结构化测试记录、已知限制没有成为 Core 持久事实；GAP-003 创建前容量预测仍 `UNKNOWN`。UI 安全降级已消费这些事实，但不能宣称完整契约闭环。
3. GAP-004 已新增 Windows CI 中 Electron UI→真实本地 Core pipe→Result/Task 状态的隔离端到端证据；还缺最终安装包、非 Fixture 数据和未知回执状态复核，不能扩写为发布门禁全过。
4. 旧网页 ChatGPT Participant 的真实 `Task→Artifact→Result→PUBLISHED` 证据仍可证明旧 SHA；合流后 `packages/core-service/participant-join.ts` 的 Slot 摘要和短引用解析已变，不能再宣称「相关代码未变」。当前自动/本地管道测试覆盖相关路径，但新的真实网页插件账号与当前合流 SHA 尚未重绑复测，G4 保持 `PARTIAL_REAL_WEB_RETEST_REQUIRED`。
5. `8be447b` 的真实 Tailnet 后端已通过，但 `a6752ec` 后的实体手机浏览器控制/观察者、屏幕阅读器与 DPI 逐页验收未完成；本机 Chrome 手机尺寸和 Windows CI Electron J1/J2 不能替代。此前同 Harness 历史完整迁移证据也尚未在最终 Core/UI 合流包逐项复跑。
6. 当前候选为可运行目录包与 ZIP，尚不是签名安装器；没有 `main` merge、tag 或 release。G1/G2/G5/G6/G7 的通过不等于 UI 11 页和网页 Participant 门禁通过，不能宣称 Windows RC。

因此不宣称 Windows RC，不提交到 `main`，不创建标签或发布。没有使用 Codex reset credit。
