# 交给 Codex 的总任务：AgentRouter V1.0 最后一轮收口（J3）

你是 AgentRouter 本轮执行与集成负责人。阅读本包全部 Markdown 和 acceptance 计划，再在仓库中执行 J3-00—J3-12。不要只返回计划；从只读审计、基线登记和环境检查开始做。用户要求本轮结束时得到实际可用的 V1.0，涵盖真实账号、三家 Harness、Windows 本地、Ubuntu SSH、现场调试、正式打包和验收。后续优化及所有必要用户配合直接找用户，不再找网页端复核。

## 输入与现状

仓库 `hhhzingy/AgentRouter`；J2 分支 `feat/j2-usable-workbench`；证据提交 `62b2e187285aeb0fd73926cdc47c8d830502fb97`；受测源码 `1ee22dadc9fb890c44f7e95ff015288306d7a913`。先重新读取仓库和当前工作目录，保留现有未提交修改。以证据提交为本轮新分支起点，建议 `feat/v1-finalization-j3`。不 hard reset、不擅自混入其他分支、不合并 main。

J2 的 217 项测试和 38 项 Electron 检查是离线/模拟执行证据，不是 V1.0 支持认证。当前 W11 Core 使用 FixtureDriver，非 fixture 标记 NO_EXECUTOR，且拒绝 Linux；账号只有注入式 SwitchPort；生产取消/远程目录/Git 引用/组重构等能力关闭；`pnpm build:win` 打包旧桌面与旧 Core。这些缺口必须实际关闭，不能只改 capabilities、删限制文字或修改测试预期。

## 权威与不变量

本包明确覆盖旧阶段“STOP_FOR_REVIEW”“不得进入 W11B/真实账号/SSH”“完成后等网页复核”的等待要求；保留旧历史。它不解除安全、秘密隔离、发布和不可逆操作的用户授权。

保留单一 Core 与数据库真值，复用现行 C1/C1R1/C1R1P1 及 Route 契约。六个内部工具为 route_context、route_send、route_finish、route_wait、route_artifact_register、route_artifact_read；notice 是消息类型。冻结合同新增/改义通过 CCR、兼容与迁移测试，不静默重算冻结 hash。必须破坏性变更时直接找用户决定，不找网页。

保留 Silent Success、Explicit Destination、Linked Continuation、FIFO、资源互斥、UNKNOWN 不自动重跑、Native Completion Barrier；role 保存/Bootstrap/PAUSED、运行/交付/验收独立。角色名称、模型输出和 UI 选择不授予系统权限。

## 执行方式

先 J3-00 固定证据基线、全量需求映射和用户配合 H01，再生产 Core/安全隔离、三家 Adapter、账户切换/模型目录、worktree/组重构、SSH、真实 UI、故障恢复、正式包、最终验收。每个工作包落 Issue/记录/branch/测试证据；公共 schema、迁移、入口和锁文件单写者，领域任务可以在独立 worktree 并行。

持续处理：实现→测试→发现问题→最小复现→修复→复测。阶段通过后进入下一可执行阶段，不创建新的网页审批等待。会话结束或上下文切换前写清已完成/当前任务/实际 commit/失败与下一命令；新会话从记录恢复，不重复执行未知的外部操作。不要把“本轮”理解成只许一个聊天或一次编码提交。

用与作者独立的只读 Reviewer 复核跨域、安全、并发与发布差异。Reviewer 不因获评审任务获得写权限。模型选型根据本机当前可用模型和能力，不能沿用聊天中未核验的模型名或权限配置。

## 用户联合调试

先读 04_ACCOUNT_JOINT_DEBUG.md。把开发你自身的 Codex 会话与被测账号/进程/数据目录隔离；不得切换当前开发账号、读取其凭据或按进程名全局杀 Codex。先 canary/假 Provider/秘密扫描，再让用户在原生界面或独立终端登录真实账号。不让用户把 Key/token/auth.json/私钥粘贴到聊天、Issue 或仓库。

将确实不能从机器读取的信息合并成一次简短配合请求：测试账号代号与登录操作、费用预算、SSH Host Alias/授权远程目录、人工试用时间点和干净环境。已有信息不重复问。没有授权先做无秘密的离线任务；需要用户动作时说明当前画面、具体动作、预期、安全影响和完成后要回报的非秘密状态。账户切换、付费调用、停止用户进程、服务部署、主机指纹和发布只在明确授权范围内。

Windows/Ubuntu 三家各自完成真实任务/工具/交接/取消/恢复；Codex/Kimi 完成 A→B→A 及最新凭据/身份核验；pi 验证实际 Provider 和费用显示。只测登录、固定字符串或无账号握手不算通过。

Ubuntu 20.04 是用户 RV1126B 开发主机；不修改厂商 SDK、不替换系统 Python/Node、不升级 OS，不执行板卡部署/烧录。只部署获准的用户级 AgentRouter runtime/Core/bridge；SSH 连接按真实 host 指纹验证，不读私钥、不关闭 host checking、不开放公网管理端口。

## 验收与收尾

执行原始 T001—T081、J2 原 46 项和本包新增矩阵。测试计划文件不是测试通过证明；现场缺环境则 BLOCKED_ENV，人工未观察则 NOT_RUN，直接与用户补齐。核心缺口不得挪到后续优化，不得以“实验支持”冒称完整 V1.0。不得为了达到数量删除失败测试、降低持久性、伪造认证或把 UNKNOWN 显示为成功。

正式候选必须从新工作台和生产 Core 构建，六组合实测、干净 Windows 与 Ubuntu 部署、实际备份/恢复/升级回退通过；每条证据固定 code SHA 和 artifact hash。最终用户接受后，再按用户明确授权合并 main、打 v1.0.0 标签和私人 Release；不公开发布、不 force-push、不覆盖旧 tag。

最终报告直接给用户：已交付安装包和启动方法、支持的真实组合、已完成现场用例、源与证据 SHA、CI/日志/产物索引、回退办法、已知非阻断限制和后续维护入口。不要写“等待网页总控复核”。

**现在执行 J3-00，完成环境预检和用户配合请求，然后持续推进所有可执行工作包。**
