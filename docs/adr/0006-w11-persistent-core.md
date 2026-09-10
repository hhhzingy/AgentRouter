# ADR-0006：持久化 Core、独立进程与原生收尾

状态：W11A 实现，等待 UIAI B1 后联合验收（J1）。

## 决策

- 桌面 Main/preload 通过本地 Windows 命名管道（Named Pipe）连接独立 Core。Core 先取得端点独占，再打开 SQLite；窗口和连接关闭不等于 Core 关闭。启动器只运行固定构建产物，不接受 Renderer 指定命令。
- `ApplicationService` 调用实际 SQL/Core；`MockP1Product` 仅存在于显式 PREVIEW_MOCK。LOCAL_CORE 模型保持 SEED/UNVERIFIED，真实 Harness 支持数仍为 0。
- 保留 001-baseline.sql，增量迁移 002；升级旧库前备份，校验和或完整性错误时拒绝启动，不重建数据库。新数据集身份持久化，Core 每次启动生成新 boot 身份；旧 cursor 需重新快照。
- RolePlan Apply 的组、角色、Binding、章程和 Bootstrap 意图在一个事务内写入。初始化单独取得资源，按 epoch/hash 校验；失败不撤销 APPLIED，不覆盖用户 PAUSED。初始化未知资源跨重启隔离。
- 用户任务明确 `sender=user`；Route 的静默技术成功、指定结果去向、关联续办不改。无父任务的角色结果创建 RESULT_HANDLING。用户结果箱只接收发布后的显式用户结果。
- 命令账本以受信任 principal/client_id/operation_id 定位，授权在重放之前；业务摘要保留原始 expected_revision，排除传输 request id 和新 lease id。租约属于连接/本次 Core 生命周期，不跨启动复活。
- 变更、审计、命令结果同事务；取消/关机等进程副作用在提交后执行。原生 terminal 与确认子进程退出必须同时成立才释放资源、发布结果。UNKNOWN 不自动重跑。
- 客户端先订阅底层流，再初始化/快照；缓冲 cursor 并去重。溢出明确要求重新快照。对话在 SQL 内按角色/任务/运行过滤分页，GAP 不补造内容。

## 隔离 FixtureHarness

只有显式标记的测试数据目录可启用。执行器是实际独立子进程，但业务输出为确定性模拟，run_sources/initialization_attempts 来源写 SIMULATED。父测试进程 IPC 可配置故障和合成资源；此入口不在 Client API、命名管道请求方法或 preload 中。合成 AuthUnit 没有真实账号和登录目录。

## 限制

本轮仅 Windows 本地模式；无真实账号、真实 Harness、SSH/Linux 验证。没有生产 worktree 创建或协作组重构，能力明确禁用。已存在 UNKNOWN 需后续受控对账；GUI 不能直接释放资源。端点认证不承诺隔离同一 Windows 用户下的其他恶意进程。安装打包、真实模型验证和跨用户安全加固不计入本轮通过。
