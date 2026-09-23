# AgentRouter V1.1 Windows：Core/UI 联合候选复核（2026-09-23）

## 结论与源码边界

**当前仍为 `NOT_V1.1_WINDOWS_RC_READY`。** 这是独立集成候选分支，不是 `main`，没有 merge main、tag 或 release。Core 与 UI 在同一源码树合流后，合同/类型/单元/集成/混沌/UI 自动测试和本地打包 Core 冒烟已通过；这些结果不能替代最终 SHA 的真实 Harness、HTTPS Remote、手机、完整 Electron 可访问性与逐页 P0 验收。

| 来源 | 固定值 |
|---|---|
| Core 父提交 | `98dce0ca0f6a6476ec5fafaa3cf55cceb8e1a54d`，`feat/v1.1-functional-closeout-codex` |
| UI 父提交 | `bee47f9c126ce2e7f587f220c4072361b744f340`，`feat/v1.1-ui-kimi`；产品/测试源码 `ab7922b88ef1bb6181dcf104b8d0366b72550bea` |
| 合流候选 | `codex/v1.1-core-ui-candidate`；首次联合提交 `12084ce411117468c100bf93c8e73ace0ed4bae1`，随后修复 W11 桌面测试与本地管道断线状态 |
| 本轮产品修复 SHA | `8c6f84e34dba5e6a47dfc416de127562073d8ae8`；其后仅增加两项测试接入，当前已测试源码 SHA 为 `7d8a73d9b621b4fab15e28e980b2f7d303c733e5`，均已推送 GitHub；本文为文档后继提交，不冒充包内 SHA |

合流仅有 `tools/check-sensitive.mjs` 的历史扫描缓冲参数文本冲突；保留 Core 的 `HISTORY_BUFFER_BYTES` 与 `--branches --tags --remotes` 可发布引用范围。没有放宽扫描器或删除用户数据。

## 已证实

| 检查 | 证据与范围 |
|---|---|
| Core/UI 联合回归 | `pnpm typecheck`、`pnpm lint` PASS；同 SHA Windows CI 的 Vitest 113 文件、647 PASS、2 SKIP。SKIP 不计 PASS。新增真实 Core 退出回归验证本地命名管道会话转为 `DISCONNECTED`。 |
| Result 请求修改真实管道与桌面 UI | 网页 Participant 的第二个 Result 经本地 Core pipe `result.requestChanges`，原 Result 仍 `PUBLISHED`，反馈、后续 Task 与数据库关系可复核；另有 Core 原子/幂等/权限/回滚定向测试。`7d8a73d` 的 Windows CI J1 又从真实 Electron UI 点击「请求修改」，输入反馈，经本地 Core pipe 读取 `result.reviewStatus`，验证 `REJECTED`、反馈、原发布历史保留及后续 Task，并检查 UI 显示「已拒绝」；日志标记 `J1_REAL_ELECTRON_RESULT_REQUEST_CHANGES`。这是隔离 Fixture 环境的端到端链路，不是生产账号或最终安装包验收。 |
| Windows 构建与打包 Core | `8c6f84e` 源码构建，`sourceDirty=false`，manifest `artifactHash=f235b67e20edd4fffe3b5bd2c8ce55d91adfe7b7a05cadda84a958f6e844ec9d`；`pnpm test:packaged` PASS，验证生产入口、18 migrations、真实命名管道、隔离 Core 重启及 Project/history 可读。非干净机、真实 Harness 认证。 |
| 安全扫描 | 合流提交前暂存索引 2229 文件、0 findings；当前可发布分支/标签/远端引用历史 3545 个 blob、0 findings。扫描范围不包含仅本机 Codex checkpoint refs；不能写成“任何执行包从未进入 Git”。 |
| GitHub Core 父 SHA | [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35816297797) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35816297821) completed/success。 |
| GitHub 联合 SHA | `8c6f84e` 的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35825964095) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35825964125) 均 completed/success；W11 包含 `J2_DISCONNECTED_NO_HEALTH_PROMISE`。此前联合 W11 红灯依次暴露旧 UI 选择器、折叠历史及真实管道断线误报在线，失败分母保留。 |
| GitHub 当前测试 SHA | `7d8a73d` 的 [C1](https://github.com/hhhzingy/AgentRouter/actions/runs/35828512926) 与 [W11](https://github.com/hhhzingy/AgentRouter/actions/runs/35828512920) 均 completed/success；W11 日志包含上述 J1 结果请求修改链路及 `J2_DISCONNECTED_NO_HEALTH_PROMISE`。 |
| 当前 SHA 打包 Core | `7d8a73d` 在开发机重建，`sourceDirty=false`，manifest `artifactHash=890f36f72171050bba099145124a4e7b1588ab0ce513014b5dffc717e062fb2d`；`pnpm test:packaged` PASS。首次运行误把 `--` 传为包路径而报 `ENOENT`，改用正确参数后通过；前次失败不是产品失败，也不隐去。 |
| 手机尺寸真实浏览器与本地 Remote | 在本机已安装 Chrome 上以 `390×844` 运行 `tests/live/v11-phone-console-browser.test.ts`，与 `tests/live/v11-packaged-remote-core.test.ts` 一起 2/2 PASS；覆盖 loopback WSS、配对 Cookie、controller/reconnect 与真实浏览器呈现。测试使用显式 `AGENTROUTER_TEST_CHROME` 指向 Chrome，原固定 Playwright Chromium 路径在本机不存在。此证据不是 Tailscale HTTPS、实体手机或最终安装包。 |

本地独立打包 Electron 窗口冒烟曾因该开发机 GPU 子进程反复以 `-1073741515` 退出而超时，不能计 PASS。Windows CI 使用独立 runner，可为同 SHA J1/J2 提供更强证据；它仍不能代替实体手机、屏幕阅读器或真实账号 Harness 复测。

## 仍未闭环的发布门禁

1. UI 原交接状态仍为 `UI_LANE_BLOCKED_FOR_WINDOWS_RC_INTEGRATION`：11 个 P0 页面未逐页获得最终合流 SHA 的真实状态 PASS；17 张预览图为 `PREVIEW_MOCK`，不可充当 `REAL_CORE` 截图。
2. GAP-001 仅有 Slot/Binding 安全摘要，缺可信 `last_seen` 与外部会话显示；GAP-002 源码 SHA、结构化测试记录、已知限制没有成为 Core 持久事实；GAP-003 创建前容量预测仍 `UNKNOWN`。UI 安全降级已消费这些事实，但不能宣称完整契约闭环。
3. GAP-004 已新增 Windows CI 中 Electron UI→真实本地 Core pipe→Result/Task 状态的隔离端到端证据；还缺最终安装包、非 Fixture 数据和未知回执状态复核，不能扩写为发布门禁全过。
4. `8c6f84e` 同 SHA 的 Codex、ZCode、Pi、Kimi、DSH 真实任务与冷恢复、Artifact 工作流未全套重跑。旧 SHA 的通过记录保留为历史证据，不自动迁移成联合 SHA PASS。
5. 最终包的 Tailnet HTTPS/WSS Remote、实体手机控制/观察者、WorkSession 真实迁移与屏幕阅读器/DPI 验收未完成；本机 Chrome loopback 测试不能替代这些门禁；当前包还不是安装包或发布候选。
6. 当前测试 SHA 的 C1/W11 已实际 completed/success；还需完成真实 Harness/Remote/Mobile/页面证据的同 SHA 绑定，不能将此 CI 绿灯扩大为 Windows RC。

因此不宣称 Windows RC，不提交到 `main`，不创建标签或发布。没有使用 Codex reset credit。
