# J3 工作包与实施顺序

## 0. 所有工作包共有的执行约束

每个工作包记录 owner、source SHA、allowed_paths/file lease、需求和 Test ID、具体命令/退出码、失败复现、实际变更、回退、证据位置。子任务需在本包下增加 ID，不能另开一轮网页审批。验收矩阵初始 NOT_RUN；历史 PASS 只可作为历史参考。

允许新建本文件列出的目录，但新目录不表示当前仓库已有实现。冻结的 C1/C1R1/C1R1P1 源文件、生成器与旧迁移不能直接改义或覆盖；优先增加后继合同/新迁移，确需修改走 CCR。只能通过真实安全边界验证后开放对应 capability。

共同回退：代码通过明确提交 revert，不 reset/clean 用户工作区；运行时停止本包拥有的进程，不按通用进程名全局结束；有数据迁移时必须先停写并按已测备份恢复，不能只回滚二进制。回退旧版本也可能恢复旧缺陷，应停派发并明确状态。

## 1. 顺序与并行

J3-00 → J3-01/J3-02 → J3-03/04/05 → J3-06/07/08/09 → J3-10/11 → J3-12。

J3-07 的无账号部分可在 J3-01 后进行；J3-08 的平台移植可先做，六格现场认证须等待安全门和各 Adapter；打包自动化可提前做，但发布证据只能针对最终候选。每阶段内部允许修复—复测多次，“最后一轮”不等于只能运行一次。

## J3-00｜固定基线、范围追踪与用户配合入口

**目标**：从 62b2e18 建立可恢复的 J3 集成分支，结束旧阶段等待状态。

**动作**：检查 Git 远程、分支、未提交修改和 worktree；核实两条 J2 提交的父子/差异关系；保存 main 与 integration 原始 SHA。建立本轮任务账、F01—F26/T001—T081/J2-46 覆盖账和现实缺口。更新 README/progress/API 使用入口的适用范围，不改历史报告。形成一份 H-01 用户配合请求，包括测试账号、预算、Ubuntu SSH alias、临时目录、干净 Windows 条件和同意访问范围。禁止读取认证文件正文。

**路径**：本轮 docs/evidence 摘要、原 README/进度入口、新任务清单；此步产品代码只读。

**验收**：旧事实和本轮目标分开；每个原始测试至少有 owner/执行域/前置条件；不存在漏掉的禁用核心能力。当前 J2 离线门禁在正确 Windows 环境重跑，并逐命令保存结果。没有 Windows 时保留阻断，不伪造复跑。

**退出/回退**：新分支、基础记录和用户请求就绪；无账号也可进入 J3-01/02。发现未声明修改不覆盖，只隔离并确认归属。

## J3-01｜生产 Core、公共执行接口与合同补齐

**目标**：生产启动不再是 NO_EXECUTOR，并且不会依赖 FixtureDriver 的模拟回调冒充真实执行。

**动作**：逐段审计 FixtureDriver 与 Core/ApplicationService 的职责，把通用 claim/dispatch/bootstrap/lease/事件持久化/收尾/释放逻辑抽为单一生产执行路径；fixture 仅作为该接口的独立测试后端。定义受控 Adapter 接口、运行身份、取消与资源停止证明、审批/人工输入回传、恢复对账。补齐现行合同声明但服务未支持的方法：目录/工作区、账户、绑定、审批、run.reconcile、维护和重构等；逐项检查 schema、Main/preload、UI 与服务真实行为的一致性。

实现 model catalog 的真实探测和版本/账号作用域缓存；Seed 只为待验证配置，不能进入可执行认证白名单。首字节发送之前/之后失败分别建模；数据库提交前失败不返回成功，外部执行未知不自动重发。

**路径**：`packages/core-service/**`、`packages/runtime/**`、`packages/domain/**`、`apps/core-daemon/**`、相关 tests；合同和 storage 新迁移需专属 lease。Main/preload 的受限扩展由同一合同 owner 集成。

**验收**：T018—T034、T057—T059、T064—T065 相关离线/故障场景；生产模式无 fixture marker 不启模拟执行；未具备真实能力时明确阻断；不会把任务正文“完成”当 route_finish，不会把工具调用成功当原生完成。

**回退**：保留已验证 fixture 回归入口；生产功能故障时停派发而非静默降为模拟。

## J3-02｜秘密隔离、认证存储与真实联调前置门

**目标**：真实凭据可以被受信任认证客户端使用，但不能进入开发 Agent、模型上下文、Shell 可读空间和普通日志。

**动作**：完成 OS secret store/受保护 Profile、DB 只存 secret_ref、脱敏导出、账户服务单一写 owner。验证 Windows ACL/受限身份和 Linux 用户/沙箱/进程环境边界；同一 OS 用户下的 chmod 600 或 DPAPI 不能单独证明 Agent 隔离。检查 Agent 子进程的环境、工具/插件、网络、MCP 和认证目录访问。使用 canary 和本地假 Provider 捕获验证，不用真实秘密做对抗测试。

开发 Codex 与被测账号、数据集、运行目录和进程树隔离。完成日志/截图/崩溃转储/构建产物扫描。凭据 Broker 仅在确有需要时实现固定 Provider 的受限通道，不变成任意 API 代理；禁止把 Broker 管理权限交给模型。

**路径**：`packages/accounts/**`、`packages/security/**`、必要平台执行边界、秘密扫描工具、测试和新迁移；真实 secret 目录在仓库外且不属于开发 Agent allowed_paths。

**验收**：原 SG-1—SG-3 安全门、T069/T071—T074、T081；工具无法读取 canary、打印长期 Key、越目录/代理/网络越权。无法建立有效边界时停止真实敏感账号测试，直接由用户选择可验证的隔离运行环境。

**回退**：撤销测试 Profile/Broker 授权，停止自有进程；若发生泄露先停止并通知用户轮换，不直接删除全部证据掩盖。

## J3-03｜Codex 真实 Adapter

**目标**：真实 app-server 完成会话、任务、工具交接、审批、停止、恢复，不只是版本握手。

**动作**：按实际安装路径/hash/version 导出 schema；实现 initialize、会话新建/恢复、模型查询、启动/补充/中断、审批/用户输入、工具响应和 thread/turn/binding 映射。业务六工具接入现有 Route bridge，发送者只能来自受控 run scope。对两个角色交错事件、迟到响应、native history replay、断流和错误分别处理。

**路径**：`packages/adapters/codex/**`、对应 `packages/role-bridge/**` 适配 glue、测试、脱敏版本说明；通用 Core 不由该 worker 同时修改。

**验收**：T007/T010/T013/T014/T078，六工具公共矩阵；真实测试报告、文件实际差异、结果入箱和原生终态证据。Windows 与 Linux 各自验证，不能共用平台证据。

**回退**：保留任务 UNKNOWN/待核对，关闭该组合 capability，停止自有进程；不注销开发者日常 Codex。

## J3-04｜Kimi Code 真实 Adapter

**目标**：锁定实际 ACP 协商版本，完成反向请求、执行、身份、取消与历史。

**动作**：实现协议握手、会话/模型配置协商、prompt、反向文件/终端/审批请求的 allowlist、取消和实际停止证明、历史显示与去重。不能把任何 Promise 返回都解释为完成。Profile 切换后能原生恢复则验证并明确标注；不能恢复则建立显式 new-session handover，保留旧历史，不伪装无损迁移。

**路径**：`packages/adapters/kimi/**`、相关测试与桥接 glue；真实 OAuth Profile 不进工作区。

**验收**：T008/T011/T053/T077 与六工具矩阵，Windows/Linux 分别认证；历史旧工具调用不再投递；请求越权被实际拒绝。

**回退**：停止当前受控会话、保留 Profile 与历史、停派发；不改写原生私人数据库。

## J3-05｜pi 真实 Adapter 与受控扩展

**目标**：真实 RPC、Provider 模型和受控扩展组成完整执行闭环。

**动作**：实现实际配置/模型/思考选项查询、会话、轮次、历史、abort/停止、工具事件、成本/用量。扩展只加载受控 allowlist；禁止工作区自动加载第三方扩展/隐藏 subagent/独立排队组件。保持协议 LF 分帧与 UTF-8 上限；stderr 不进入业务事件。

验证当前代码所假设的 agent_settled 是否来自锁定原生版本或受控扩展，保存来源与语义证明；agent_end/agentMessage/工具返回均不能代替最终完成屏障。不能由 UI 定时器合成 settled。

**路径**：`packages/adapters/pi/**`、`packages/pi-extension/**`、相关测试与版本证据。

**验收**：T009/T012/T056/T072/T075/T076、六工具矩阵和两平台真实执行；不把 token 成本等同于套餐剩余额度。

**回退**：撤销测试 Provider 授权，停止受控扩展和进程；保留用户已有 pi 安装，不擅自升级全局 npm。

## J3-06｜真实账号 A/B、额度与安全切换

**目标**：从 GUI 完成账号管理和安全切换，切号中断可恢复，不能只跑注入端口测试。

**依赖**：J3-02 与对应 Adapter。

**动作**：实现账号/Profile 创建或受控登记、实际身份校验、模型可用性、非秘密状态显示；Codex A→B→A、Kimi 两 Profile 和 pi Provider 组合实际验证。auth_unit 先停止新派发，等待/取消/确认整个旧执行进程族停止，保存最新刷新状态，原子激活目标，再核验身份和写入 epoch。旧令牌/结果失效，但历史保留。额度查询与刷新认证共享互斥，不在窗口外偷偷刷新。网络失败/业务错误/陈旧值区分 UNKNOWN/ERROR/STALE，不能显示零或无限。

**路径**：`packages/accounts/**`、Core 的账户 API、受限 Main/preload、账户 UI、tests 和新迁移。

**验收**：T049—T055/T069；按 `04_ACCOUNT_JOINT_DEBUG.md` 的逐阶段中断、身份不符、活动运行、切回刷新验证；同一 auth_unit 默认最大活跃数仍为 1，未经认证不提高。

**回退**：只恢复可证明身份的旧/新 Profile；否则 FAILED_SAFE，保留暂停。应用更新或重启不得擅自恢复派发。

## J3-07｜项目/worktree/版本产物/绑定与生产组重构

**目标**：解决真实项目协作依赖，不让用户在 SQLite 和终端间手工补核心动作。

**动作**：补项目重新定位、空间暂停/归档、worktree 新建/关联和安全移除、Windows 路径别名与 Linux 物理路径归一、跨空间共享资源互斥、版本化 AGENTS 受控区块、task 固定规则版本。实现不可变 artifact/Git 保留引用，live 输入必须明确标注并在消费时记录观察版本，不伪装固定输出。

绑定变更采用停派发—旧执行停止—新的 epoch/交接包—独立 Bootstrap，不删旧历史。RolePlan 支持手工编辑/严格 JSON/真实模型验证/两组多角色；内部 AI 设置会话只能提出严格草案，经用户 Preview/Apply，不能自行写权限或启动角色。

组重构完善 MERGE/SPLIT 的 targets/assignments/task_dispositions 编辑，修复当前只有单 target 和空映射的页面。完整执行 Preview → blockers → 明确处置 → plan_hash/expected_revision → Commit；活动/UNKNOWN Run、账号切换、共享资源、未处置任务阻断。重构后更新作用域和授权、保留旧组历史；拆组不等于遗忘旧上下文。

**路径**：`packages/runtime/management.ts`、`packages/core-service/{plans,application,artifacts}.ts`、`packages/artifacts/**`、相关平台/Git工具、workbench 相关页、新迁移和 tests。共享文件由集成 owner 串行写。

**验收**：T003—T006/T013—T017/T035—T043；新增多角色/重构现场矩阵。人工操作后重载不隐式启动；失败不半迁移，不自动清理脏 worktree；新旧作用域不串历史。

**回退**：重构提交前可放弃；提交后不承诺“一键撤销”。需要恢复时先停写、使用一致性备份或明确的补偿变更，保留审计。

## J3-08｜Ubuntu 常驻 Core 与 SSH 客户端

**目标**：用户现有 Windows GUI 连接 Ubuntu，实际任务执行与存储留在 Ubuntu，断线不杀任务。

**动作**：按 `06_SSH_LINUX_DEBUG.md` 完成 Linux 平台层、单一 Core、UDS、本机认证、systemd --user、轻量 bridge、Windows SSH transport、连接切换、路径句柄、事件补偿、控制租约、远程产物下载。保持同一业务 Core，不新建不相容远程任务引擎。

**路径**：`apps/core-daemon/**`、新 `apps/ssh-bridge/**`、`packages/platform/**`、`packages/client-transport/**`、受限桌面连接界面、安装/服务脚本及 tests。

**验收**：原持久化/安全/恢复项在 Linux 的适用部分，加本轮 SSH/六格矩阵。完成实际 SSH 断开、GUI 退出、Windows 睡眠/恢复、服务重启、双客户端 observer/controller 冲突；每项核对 task/run/operation/cursor 不重复。

**回退**：停/移除本包安装的 user service/bridge，保留远程数据；恢复原服务配置。禁止改 SDK、全局 Python/Node、系统发行版或任意 sshd 设置来凑通过。

## J3-09｜全 GUI 实际业务与人工交互收口

**目标**：所有 V1 主路径可由正式 GUI 操作，状态反映真实业务而非按钮反馈。

**动作**：落实 J2 四入口、角色主对话、独立草稿与结果中心。新增真实登录/模型/连接/审批/人工输入/取消/核对、内部设置会话、重构/备份操作接线。查询和命令 loading/error/UNKNOWN、结果去向、权限和连接身份明确；拒绝过期 epoch 的批准。

原生目录/保存对话框完成选择和取消；Windows 真正中文输入法候选窗、Enter/Shift+Enter 与 composition 实测；150%/200% 缩放、最小窗口、长输出、键盘焦点、错误恢复。普通成功不额外唤醒；人工补充/新任务不混淆。

**路径**：`apps/desktop/workbench/**`、样式、受限 Main/preload、UI tests；涉及新协议只走合同 owner。

**验收**：T028/T044—T048/T060—T063、J2 46 项完整回归及新增人工检查。现场观察须由用户确认，不能以程序注入或截图数量代替。

**回退**：UI 关闭受影响写操作并保留状态查询；不从 UI 绕过 Core 直接改库或调用 shell。

## J3-10｜故障、并发、稳定性和安全独立复核

**目标**：未知状态不重复副作用，资源释放有证据，恢复可解释。

**动作**：按测试 ID 执行数据库满/只读/提交前后失败、原生进程崩溃、Core 崩溃、网络/SSH 断线、重复/乱序/旧 epoch/迟到批准、秘密边界、路径穿越、controller/身份越权和消息压力。Windows Job 与 Linux 进程族分别实测：子进程/孙进程/忽略软取消、脱离进程组尝试；不能单凭主 PID 已退出宣布停止。任何无法证明隔离的写能力 fail closed。

T080 保留 12 角色/3 并发/10k 记录，3 并发应使用受测独立 auth_unit，不突破单 auth_unit=1。大规模负载用确定性 fixture 验证时明确证据类型；真实三家混合闭环也必须验证，不能用 fixture 压测替代六格认证。

**路径**：tests、平台 supervisor 的必要修复、受控证据索引；相关修复回到所属工作包登记。

**验收**：`07_ACCEPTANCE_AND_ACTUAL_DEBUG.md` 故障/时延/soak 门槛；安全 Reviewer 看实际 diff、日志摘要和负面测试。关键不变量失败不接受豁免。

**回退**：停止受影响认证组合；残留进程先隔离再用户处置，不能重新派任务来“试试看”。

## J3-11｜正式构建入口、安装、备份与升级恢复

**目标**：用户启动的是 J3/J2 新工作台与真实 Core，不是旧预览。

**动作**：统一 `build:win`、packaged test、运行时/本地 SQLite ABI、helper、全部迁移、资产与静态资源；加入 Windows 正式启动入口、受控 Linux 安装/服务包、版本/构建来源/About、许可清单和 manifest。包内不携带个人账号、测试数据和开发机路径。

在无系统 Node/开发依赖的干净 Windows VM 或机器，以普通用户、中文/空格路径运行；打包证据必须运行安装产物而不是 .local/desktop-w11。备份使用一致性方法并恢复到新目录核对 DB、artifact/Git 引用、规则、历史与版本；凭据按独立受控策略处理。演练 J2 数据升级、失败回退和卸载保留源项目。

**路径**：`tools/**` 发布脚本、新受控安装/服务定义、package metadata、README/REPRODUCTION、测试和 release docs。依赖变更必须精确锁定和安全验证。

**验收**：T001/T066—T070/T079/T081；最终包 hash、源 SHA、schema、runtime/SQLite/native helper、许可证和环境清单；迁移失败可恢复。不宣称已签名，除非实际签名验证通过。

**回退**：旧包+匹配备份成对恢复；不得用旧程序直接打开已经不可逆迁移的新 DB。

## J3-12｜用户验收、固定候选发布与维护交接

**目标**：结束本轮时是用户接受的可用软件，不再以 STOP_FOR_REVIEW 交网页。

**动作**：冻结候选代码并针对准确 SHA 重跑门禁；核对全部证据与产物的来源链；执行最终用户试用剧本；关闭全部阻断 Issue；让用户确认指定 commit/artifact 的 merge/tag/私人 Release。合并后的发布提交重新确认构建等价性并运行发布门禁，不给未经测试的新代码借用旧结果。

**路径**：release notes、manifest、用户手册、故障排查、维护 backlog、最终证据、经用户授权的 Git/Release 操作。

**验收**：六格认证矩阵、原始 81 项适用验收、J2 46 项及本轮新增项通过；关键人工未测为 0；用户能离开开发终端从正式入口完成实际协作；备份/恢复/回退可复现；用户签收记录存在。

**退出**：用户接受前为 READY_FOR_USER_ACCEPTANCE；接受且发布动作完成后为 RELEASED。任何未满足项保持明确阻断，直接交用户，不改为“实现已完成”。
