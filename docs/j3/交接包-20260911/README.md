# AgentRouter 开发与真实测试交接包

更新时间：2026-09-11。本文是当前状态快照，不是 V1.0 最终认证。最新用户要求先总结交接；暂不启动新的真实任务。

## 1. 工作位置与基线

- GitHub：私人仓库 hhhzingy/AgentRouter。
- 当前工作目录：E:/AgentRouter/.local/w11a/integration。
- 分支：feat/v1-finalization-j3；最新已提交并推送源码：e99782f7e675dcea896f0a45cfe90796c6508e23。
- E:/AgentRouter 是另一层历史工作目录和用户资产所在位置，不能在那里盲目 git add、reset 或切分支。
- 当前存在未提交修复、测试和证据，见本目录 git-status.txt。接手必须保留；不要 hard reset、覆盖、混入其他分支。
- 不合 main，不打标签，不发布。所有临时开发、worktree、测试目录留在 AgentRouter 内。
- CI 已成功： https://github.com/hhhzingy/AgentRouter/actions/runs/34574169187 和 https://github.com/hhhzingy/AgentRouter/actions/runs/34574169240 。仅对应 e99782f，不覆盖未提交修改。

## 2. 权威资料阅读顺序

1. 本文及同目录状态/证据索引。
2. docs/j3/checkpoint.md：有历史断点；本文覆盖其旧的“等待Kimi登录”等状态。
3. E:/AgentRouter/docs/执行包/AgentRouter_Codex_MCP管理面执行包 全部 Markdown。
4. E:/AgentRouter/docs/执行包/AgentRouter_Codex_J3_真实联调收敛执行包。
5. E:/AgentRouter/docs/执行包/AgentRouter_V1.0_Final_Execution_Pack_J3 全部 Markdown 与 acceptance。
6. docs/j3/traceability.json、work-ledger.json、H-01.json 以及原始执行包08_Codex实施入口.md。
7. docs/integration 中 C1/C1R1/C1R1P1 冻结和 CCR 记录。

历史包的离线限制、STOP_FOR_REVIEW 已被 J3 后续授权覆盖；不能据此再次等待网页复核。SSH 暂缓等最新用户限制继续有效。历史测试表不代表所有条目当前已完成，须按实际证据逐项对照。

## 3. 产品开发现状

已建立单一生产 Core、SQLite 持久事实、原生执行注册、账户/模型 Profile、Management MCP 与 RoleBridge 分权、新工作台、Windows Job 进程树监督、原生会话存储、可信 Provider 代理。

新工作台包含项目、角色、Role Plan、对话与历史、审批问题、产物、模型账号等主要页面；已有 J2 离线/模拟与 Electron 证据，但不能把这些数量当真实 Harness 支持认证。生产功能仍须联合矩阵验收。

生产链路为：GUI或Management MCP → 已认证Client连接 → Core/SQLite → 原生Harness → RoleBridge → 同一Core → 结果暂存 → 原生终态及资源停止 → 发布。Management MCP不能自行另建Core或直接读写业务数据库；被管Codex不能继承Management MCP。

核心语义不得变更：Silent Success（静默成功）、Explicit Destination（指定结果去向）、Linked Continuation（关联结果续办）、FIFO、资源互斥、UNKNOWN不自动重跑、Native Completion Barrier（原生收尾屏障）。角色保存、Bootstrap、PAUSED、运行、交付、验收相互独立。角色名称/模型输出/UI选择不产生权限。

## 4. 当前测试结论

| 范围 | 当前结论 | 证据与边界 |
|---|---|---|
| 固定源码 pi + DeepSeek 生产Core/MCP/Route | 通过 | evidence/J3/production-pi/1901b4e；真实42发布、原生成功、Job收尾、同key幂等 |
| 固定源码 Codex Luna/low 生产Core/MCP/Route/取消 | 通过 | evidence/J3/production-codex/e99782f；独立身份/模型/MCP配置门禁、42发布、RUNNING取消为CANCELLED |
| pi→Codex及Codex→pi双向交接 | 通过，源码未提交 | evidence/J3/production-pair/e99782f-dirty；两方向源HANDED_OFF、接收DELIVERED、每次仅一个最终用户结果；bundle hash已记录 |
| Kimi K2.7生产链路 | 未通过 | 最新run-wb9l5X：Bootstrap DELIVERED，结果42 STAGED，运行UNKNOWN；不发布、不重放，取消尚未执行到 |
| Kimi/pi原生部件恢复与取消 | 历史部件通过 | evidence/J3/real-components；不等价于完整产品恢复 |
| 真实Electron生产pi任务 | 部分通过 | 1901b4e GUI派发/结果/重载有截图；旧cleanup为SHUTDOWN_UNCONFIRMED，不能宣称该项通过 |
| Electron生命周期回归 | 4项通过 | Main/preload、重载保持Core、Renderer崩溃保持Core、关窗重开连接同Core；最近增量复测通过 |
| 离线全仓回归 | 最近已确认54文件377项通过 | 之后追加Kimi专用许可，8项定向测试和tsc通过；最后启动的扩大回归完成输出未收回，需重新确认，不能沿用377宣称最新树全绿 |
| External API | 实现中 | Registry、SQLite journal、004迁移/备份有测试；Client扩展及MCP list/describe/call尚未接通 |
| 正式包、干净环境、六组合 | 未完成 | 有开发候选构建；未达到正式V1.0验收；SSH用户暂缓 |

## 5. 关键修复及失败迭代

- pi旧 --no-tools 连Route扩展一起禁用，改为 --no-builtin-tools 并显式固定扩展。
- Bootstrap必须真实原生ACK包含charter hash，空end_turn不能算送达。
- 取消先撤销桥权限，再原生取消并确认Job空树；原生终态本身不能证明资源停止。
- Codex的auto不是明确工具许可，改为仅六Route approval_mode=approve；默认prompt、never审批策略及其他限制保留。
- Codex在thread/open/prompt前核验实际config、账户身份哈希、MCP六工具、模型和最低推理；不读开发会话认证。
- 桌面修复旧连接回调覆盖新连接、endpoint原子发布、半帧断流未捕获异常；超时/断流不自动重发业务。
- Kimi tools:[]曾连MCP全部禁用；已加六工具白名单和全局tools.enabled。
- 已确认Kimi实际看到并调用六Route中的context/finish，但ACP审批拒绝。固定0.42.0原生源码证明title来自注册tool name；现安装专用单次approve_once处理，拒绝其他名称/永久许可，现有session/epoch/active/cancel门禁保留。详见docs/j3/kimi-acp-permission-review.md。
- 最新Kimi已从“无结果”推进到“42已STAGED但UNKNOWN”，下一步查原生终态/进程关闭/Job屏障，不可强行改为成功。
- External API持久领取在副作用前写IN_FLIGHT；重开不重新领取，settle冲突不覆盖，按principal/client隔离。004升级前备份已测；旧冻结合同与001—003校验和不改。

重要失败根：run-hRPklR（审批拒绝，无结果）、run-iWVVBU（UNKNOWN）、run-wb9l5X（STAGED+UNKNOWN）；均位于.local/j3-production-pi。保留用于诊断，不重新派发原任务。旧run-BjUtlq取消后NEEDS_ATTENTION阻塞FIFO是正确行为，不得为测试方便强行放行。

## 6. 账号、预算和安全边界（接手必读）

### 已授权条件

用户允许低风险真实调试采用LIMITED_ISOLATION；费用预算不限，但仍用小任务/最低实际思考。授权目录全范围不等于可读取所有秘密、停止用户进程或破坏文件。SSH暂缓，不再询问。Codex DUT切号与完整重启恢复最后做，且仅AgentRouter独立实例。

### 开发账号 hzxpro

当前与用户对话的开发Codex账号。绝对不切换、不登出、不关闭、不复制/读取其认证；不按进程名全局杀Codex。不要让用户为了接手重启开发会话。

### Codex被测账号 DUT

- 独立目录：E:/AgentRouter/.local/w11a/integration/.local/j3-codex/dut-fj/home/.codex。
- approval metadata：.local/j3-codex/dut-fj/approved-identity.json，仅比较哈希，不输出个人身份。
- 目录虽叫dut-fj，当前账号是用户明确认可的新独立登录账号，不必等于旧fj种子。
- 用户原始 E:/AgentRouter/账号信息/codex/auth.json 旧种子曾401/刷新失败；不要再次复制覆盖当前DUT。
- 登录工具 tools/login-j3-codex-dut.ps1 仅在确实需要重新登录时使用；不要要求重复确认已批准身份。
- 当前核验版本0.153.4，模型gpt-5.6-luna，最低可用low。EXE路径及hash见生产Codex证据index。

### Kimi被测账号

- 独立最新认证位于 .local/j3-kimi/dut/home/.kimi-code/credentials/kimi-code.json。
- 该独立登录已实际验证有效，不再等待KIMI_DUT_LOGIN_COMPLETED。
- 日常来源 C:/Users/hap_p/.kimi-code/credentials/kimi-code.json 仅获准必要独立配置准备；不得覆盖日常账号。生产helper保留DUT刷新后的认证，不能每轮复制旧源。
- 当前kimi.exe位于 C:/Users/hap_p/.kimi-code/bin/kimi.exe，版本0.42.0；K2.7 Coding实际ID kimi-code/kimi-for-coding，原生最低只有Thinking On。不要假称已关闭思考。
- 生产run使用持久独立home。旧部件脚本描述“删除本次副本”不适用于当前持久DUT认证。

### pi / DeepSeek

- pi安装在Windows用户环境，不在项目内安装；版本0.85.1。
- 授权API源：E:/AgentRouter/账号信息/通用API/Deepseek.txt。
- 模型deepseek-v4-flash，thinking off；Provider在可信父进程读取Key，子进程只拿短期loopback capability。
- 不输出Key/token/auth.json/私钥/原始HTTP头、请求日志或认证内容到聊天、Git、Issue、截图。
- 固定上游api.deepseek.com，禁止任意HTTP代理、未登记出网、自动重试未知调用。
- 原生cost=0不等于实际免费；actualBilledCost未知应为null。Job停止不证明上游已取消计费。

只有真实Secret泄露、越权破坏、未登记出网、未知副作用可能重复或影响hzxpro时，硬停止对应链路；其他工作继续。需要独立登录/UAC/可见桌面时给最小行动单，不问已授权条件。

## 7. 接手操作与待办顺序

1. 只读检查pwd、git status、branch、HEAD，读本包manifest。不要清空.local、删除用户认证或未知文件。
2. Kimi下一定位：读取run-wb9l5X/report.json及受控DB，只提取非秘密诊断字段；区分Native terminal缺失、ACP断流、Job屏障或超时。UNKNOWN/STAGED不得重放。修复后新隔离根重新测试。
3. 先假Provider/假凭据负测，再真实新任务。将Kimi结果PUBLISHED、原生SUCCEEDED、resources_stopped=1全部证实；之后才测取消、跨Harness交接。
4. 收拢未提交修改，跑tsc、定向及全仓回归、三套冻结检查、秘密扫描，再提交；真实复测必须记录干净code SHA及实际bundle hash，不用旧SHA冒充新源码。
5. 补齐真实route_send/route_wait/关联续办、FIFO/互斥、重复请求、产物register/read、审批与权限拒绝、故障恢复、GUI取消和断线重连；双向handoff不代替全部六工具认证。
6. 完成External API可选扩展接线，见CCR-J3-MCP-02：同连接身份/Controller租约、Core固定注册动作、SQLite journal、MCP仅转发；闭合schema，兼容与迁移负测，不修改冻结hash。
7. 新源码构建候选，真实打包Electron验证新工作台+生产Core+RoleBridge+Job监督器。生产账号与owner配置不打包。
8. 验证备份/恢复/升级回退及故障断电/进程异常状态；再做Codex独立DUT切号与完整重启，任何操作不得影响hzxpro。
9. 逐项执行原T001—T081、J2原46项及J3新增矩阵。未观察标NOT_RUN，缺环境标BLOCKED_ENV；SSH标DEFERRED_BY_USER。实际最终用户接受和明确授权之前不合main/不发布。

工具命令（在integration目录执行）：

- node node_modules/typescript/bin/tsc --noEmit
- node node_modules/vitest/vitest.mjs run
- node tools/check-client-freeze.mjs
- node tools/check-client-c1r1-freeze.mjs
- node tools/check-client-p1-freeze.mjs
- node tools/build-w11-core.mjs
- node tools/test-j3-production-pi.mjs --live --kimi --cancel
- node tools/test-j3-production-pi.mjs --live --codex --cancel （先核对脚本参数与账号占用）
- node tools/test-j3-production-pair.mjs --live --runtime <本地已审查owner配置>
- node tools/test-w11-desktop.mjs
- node tools/build-win.mjs
- node tools/test-j3-packaged-gui.mjs <新候选目录>
- node tools/check-sensitive.mjs --staged （提交前先精确stage，不能git add根目录）

不要使用pnpm exec/install做例行测试：本机wrapper曾重链接/删除活动依赖；当前直接调用已安装Node脚本。Windows shell禁止跨shell拼接删除；不要全局杀进程。只对已验证属于本次测试的进程使用句柄或受控shutdown。

## 8. 尚未完成且不能淡化的事项

Kimi完整交付与取消；三家完整联合与关联续办；GUI完整生产矩阵；真实费用可信展示；External API管理面；跨Core账号home占用互斥进一步审查；完整Windows隔离认证；正式包干净Windows验证；Ubuntu/SSH六组合（用户暂缓）；实际备份恢复升级回退；Codex独立切号/完整重启；最终需求全量验收与用户接受。

开发候选不等于安装包交付，更不等于正式支持。当前不存在“全部后续测试已完成”的结论。

## 9. 清理与交接原则

原始凭据、数据库、用途未知文件及可追溯真实证据不自动删除。自己的可重建cache/tmp/旧build在确认无进程占用、证据索引完整且后续无价值后清理。worktree仅在任务完成、无未提交修改、提交已安全推送后用git worktree remove清理。本integration仍工作中，不符合删除条件。

本交接包不包含认证文件或原始会话日志。证据路径是导航，不授予读取秘密的权限。
