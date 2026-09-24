# V1.0 范围与直接用户交接

## 1. 权威与覆盖关系

用户本次明确要求：查看仓库，签发包含账户联合调试和实际调试的完整最后一轮执行包；结束时 AgentRouter 可用；后续 Codex 直接与用户对接，不再提交网页总控复核。

据此登记以下本轮决定（J3-00 写入仓库当前控制入口）：

| 决定 | 内容 |
|---|---|
| J3-D01 | 使用 J2 证据提交 62b2e18 为起点；保留现有 Core 与 workbench |
| J3-D02 | 以原 F01—F25、T001—T081 和 J2 已纳入能力为完整功能范围；F26 只保留内部扩展边界 |
| J3-D03 | 将已入库 SSH 方案转为本轮实施范围：Windows GUI + Windows Local Core，以及 Windows GUI + 用户 Ubuntu Remote Core；不开发 Linux GUI |
| J3-D04 | 旧 STOP_FOR_REVIEW、不推进 W11B、暂不真实登录/SSH 的阶段停止条件在本轮被替代；完成内部 Gate 后继续执行，环境和权限问题直接问用户 |
| J3-D05 | “不再找网页复核”不等于不测试、不做独立代码审查、不经用户批准切号/系统改动/正式合并 |
| J3-D06 | 当前冻结合同保留。需要新增能力时由 Codex 的合同负责人提交最小 CCR，独立 Reviewer 检查兼容性；破坏性改义、产品承诺或安全边界改变直接由用户决定 |
| J3-D07 | 本轮允许完成内部 AI 角色配置辅助、生产 MERGE/SPLIT、真实 worktree；AI 仅出方案，用户明确 Apply/Commit，不能自行扩大权限或创建无界角色树 |
| J3-D08 | 只有真实证据和最终用户接受之后才标 V1.0 RELEASED；不能用真实凭据缺失作“实现完成即交付”的豁免 |

范围差异必须显式记录：原始功能手册以 Windows 为 V1.0、Linux 仅预留；较后的 SSH 文档提出 Remote Core。本包基于当前用户的完整联调目标，将 Remote Core 纳入此次实施，而非谎称早期手册已包含它。[S09](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/执行包/AgentRouter_V1.0功能与开发手册包/01_功能手册.md)；[S11](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/执行包/AgentRouter_Codex_下一轮执行包/02_远程内核与SSH方案.md)

## 2. “可用”的用户级闭环

从安装后的正式 GUI 开始，用户可以：连接本地或远程 Core；登记实际项目；选择真实账号、Harness 和经探测可用的模型；创建/编辑角色及组，保存后单独初始化；发起任务并观察真实对话、工具活动与进程；将结果交给另一角色或直接交给用户；人工审批/拒绝/取消/核对；在重启、断线后继续查看真实状态；安全切号；管理 worktree、固定产物和 Git 版本；备份、恢复；重新打开软件继续工作。

核心动作不得要求用户修改 SQLite、手写 IPC、给 schema 改真假值或重新编译前端。一次性原生登录、SSH 首次信任和明确的系统安装配置可以由用户协作完成。

## 3. 支持矩阵与不支持边界

默认认证目标是三家 Harness × 两个 Core 平台的 6 个组合；每个组合至少锁定一个实际授权的 Provider/Profile 和模型。Windows GUI 不代表认证 Linux 桌面。此六格矩阵是本轮新增明确门槛。

| Harness | Windows Local Core | Ubuntu Remote Core / SSH |
|---|---|---|
| Codex / app-server | 必须现场认证 | 必须现场认证 |
| Kimi Code / ACP | 必须现场认证 | 必须现场认证 |
| pi / RPC + 受控扩展 | 必须现场认证 | 必须现场认证 |

认证不代表支持全部模型、所有版本或所有第三方插件。缺少某原生可选能力时可显示 UNSUPPORTED，但不能把创建、真实工具、任务交接、停止证据、安全隔离这些核心项降为可选。三家中任何一家未过公共与现场门禁，原始完整 V1.0 发布门槛未满足。[S10](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/执行包/AgentRouter_V1.0功能与开发手册包/04_验收与追踪矩阵.md)

不加入浏览器版 Local Web、公网 HTTP/WS 管理、多用户/多租户、跨 Core 活跃任务迁移、自动同步 Windows/Linux 工程、任意 API 代理、自动语义合并、网页 ChatGPT 自动化或额外 Harness。

## 4. 执行团队和写入边界

主 Codex 为 Implementation/Integration Lead，掌握计划、跨域整合、用户请求和证据账。允许将已界定工作包委派给独立 worker：Core/Contracts、Adapters、Accounts/Security、Linux/SSH、Desktop/Release。另设只读 QA/Security Reviewer。

每个 worker 使用独立分支与 worktree，登记 allowed_paths 和基线 SHA。共享 `contracts/**`、数据库迁移、根依赖、Core 调度、Main/preload 和发布脚本同一时刻只有一个整合 writer。Review 不等于作者在原上下文自称“复核通过”。没有第二实例时直接由用户承担该项独立检查，不伪造 Reviewer。

并行只提高无共享写冲突的实现吞吐；不得并行切换同一个 auth_unit，不得同时有两个 Core 写同一数据集，也不得多个 Agent 在同一个工作目录写。

## 5. 默认授权与须直接找用户的事项

本包允许计划范围内的代码、测试、文档和隔离夹具修改。Codex 在用户现有工具权限下可以构建和本地验证；权限系统仍然有效。本答复没有代用户执行 Git 写操作或外部发布。

以下操作必须通过用户确认包获得明确对象和范围：访问真实账号、一次性登录、付费调用和预算、导入/更换认证配置、执行真实项目写入、安装/修改服务、user lingering、SSH key/config/主机指纹、停止既有进程、恢复覆盖实际数据、正式 merge/tag/Release、仓库权限和可见性变化。

可以批量批准一组已列明的无破坏测试，包含路径、账号 alias、预算、有效时段和撤销方法；不把“继续做”解释为任意命令、无限费用或任意生产数据修改。禁止 passwordless-sudo/danger-full-access 作为通过测试的方法。

## 6. 处理阻断的方法

状态建议：PLANNED → IN_PROGRESS → IMPLEMENTED → VERIFIED_OFFLINE → VERIFIED_LIVE → READY_FOR_USER_ACCEPTANCE → RELEASED。BLOCKED_ENV / BLOCKED_USER / FAILED 是显式分支；它们不映射为 Done。

每个环境阻断先报告：缺什么、影响哪些 Test ID、用户需要执行的最小动作、预期与风险、完成后从何处继续。Codex 不得结束整轮并要求用户把报告交回网页；没有环境依赖的剩余任务继续推进。涉及安全事故则停止受影响运行并通知用户。

产品要求无法按原范围验证时，Codex 直接把可选方案及范围/安全/成本影响交用户决定；不得自行改名、删测试、弱化验收或虚构账号。
