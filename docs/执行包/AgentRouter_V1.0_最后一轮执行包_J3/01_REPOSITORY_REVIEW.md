# 指定仓库基线核查

## 1. 核查结论

J2 是可继续使用的 UI/本地 Core 开发基线，但不是可真实工作的 AgentRouter V1.0。保留 J2 已有工作，不重做 UI、不重建第二套 Core、不把 fixture 拔掉后留下空执行器。

本次为有针对性的仓库静态核查和远端 CI 元数据核对，不是对全仓所有文件的逐行审计。没有重新运行 217 项测试或 38 项 Electron 检查，也没有目视重验全部 17 张图片。

## 2. 已确认事实和本轮处置

| ID | 可定位事实 | 本轮必须处理 |
|---|---|---|
| AUD-01 | J2 报告记录 217 测试、38 Electron 检查、17 张截图；44 PASS / 1 PARTIAL / 1 人工未测 | 作为 J2 历史证据保留；本轮用新候选 SHA 重新验证，不累计冒充现场认证 |
| AUD-02 | Windows CI run 34447454261 的 head_sha 是 `1ee22dadc9fb890c44f7e95ff015288306d7a913`，结论 success；C1 run 34447454249 的 c1 job 也是 success，步骤明确 no account / no SSH | CI 通过不等于真实模型、账户、SSH 或完整发布通过 |
| AUD-03 | `compatibility-lock.json` 三家均 PROBED、`certified=false`、`live_test_status=BLOCKED_ENV` | 实现 Adapter 并实测后再逐平台、版本、Profile/模型能力认证 |
| AUD-04 | `w11-main.ts` 非 win32 抛 `WINDOWS_CORE_ONLY_THIS_STAGE`；始终构造 FixtureDriver；非 fixture 的 endpoint source 是 NO_EXECUTOR | 提炼真正生产执行接口和独立平台入口，接通 Linux；不得仅改展示字段 |
| AUD-05 | `ApplicationService.capabilities()` 中 create_session/cancel=false；非 fixture 不公布 run.cancel；remote_filesystem=false；git/live=false；space_reconfiguration=false | 以端到端实现和实测驱动 capabilities；同步更新 UI、合同与门禁 |
| AUD-06 | `packages/adapters/*` 当前只有事件归一化文件和 package 元数据 | 不把事件翻译器当成完整创建/启动/工具/恢复/取消 Adapter |
| AUD-07 | accounts/index.ts 只有注入 SwitchPort 的切换状态机，注释明确真实文件/认证实现未提供 | 真实凭据管理、刷新、身份核对、UI 和中断恢复均属于本轮工作 |
| AUD-08 | build:win 指向 tools/build-win.mjs，它打包旧 main/preload/renderer 与旧 core-daemon/main.ts；输出还是 AgentRouter-preview | 统一正式入口，打包 J2 workbench 与本轮生产 Core，不能发错应用 |
| AUD-09 | J2 限制说明：Seed 模型保存不等于可用，内部 AI 设置会话、真实 worktree、真实切号、生产重构未启用 | 逐项补齐；不是允许永久禁用核心功能的清单 |
| AUD-10 | pages-reconfigure.tsx 的预览构造只有一个 targets 项，assignments/task_dispositions 为空；当前依赖能力禁用 | 实现完整 MERGE/SPLIT 编辑、显式映射和任务处置；不能打开开关就称生产可用 |
| AUD-11 | 原生目录/保存对话框、Windows 中文输入候选窗、五分钟试用未形成实际人工证据 | Codex 直接与用户现场完成，不可用模拟返回或 DOM composition 冒充 |
| AUD-12 | main 仍在 16370d3，J2 未并入；当前 branch API 返回 protected=false | 使用隔离新分支和明确用户批准的合并/发布；不得假设分支保护已经生效 |

对应来源：AUD-01/11 → [S01](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/J2-review.md)；[S02](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/J2-known-limitations.md)；AUD-03 → [S03](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/compatibility-lock.json)；AUD-04 → [S04](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/apps/core-daemon/w11-main.ts)；AUD-05 → [S05](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/packages/core-service/application.ts)；AUD-07 → [S06](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/packages/accounts/index.ts)；AUD-08 → [S07](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/tools/build-win.mjs)；[S18](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/package.json)；AUD-09/10 → [S02](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/J2-known-limitations.md)；[S16](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/apps/desktop/workbench/pages-reconfigure.tsx)。

## 3. 不复用过期说明作当前事实

`docs/progress.md` 中有早期“43 条离线测试”等历史描述，`docs/api/README.md` 也保留早期阶段禁令。这些文件不能代替当前 J2 证据和现行 C1/C1R1/C1R1P1 冻结合同。J3-00 必须建立逐条适用性与覆盖关系，更新当前入口而保留历史。[S13](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/api/README.md)；[S19](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/progress.md)

旧 SSH 方案中建议的 `project.createFromRemotePath` 已被后续 C1 说明明确不采用；实际应复用 `project.create` + Core 发放的 `path_handle`。本轮以现行合同为准，不照抄旧提案 API。[S11](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/执行包/AgentRouter_Codex_下一轮执行包/02_远程内核与SSH方案.md)；[S13](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/api/README.md)

## 4. 独立于实现的发布阻断项

错身份投递、消息丢失、未知副作用自动重跑、未确认原生停止即释放写资源、秘密泄露、任意 API/公网管理入口、伪造兼容性支持、发布错误入口，均不能列为“后续优化”。

本轮新增数量/时延门槛、工作包划分、双平台认证矩阵和直接用户交接规则是本包执行决策；不是声称旧仓库已经规定或已经通过。
