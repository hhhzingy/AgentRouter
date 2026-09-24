# J3-MCP-01 Management MCP（管理面）

状态：IN_PROGRESS。Owner：Codex；分支：feat/v1-finalization-j3；输入证据基线：90ed45436974bfb848cfcf83ac936bac5fe967f6。

权威：docs/执行包/AgentRouter_Codex_MCP管理面执行包。用户明确允许 LIMITED_ISOLATION 低风险实际调试；完整 Windows 隔离继续修复，不作为 MCP 开工前置门。SSH 暂缓；开发 hzxpro 不读取认证、不切换、不关闭；DUT 切号/重启最后。

## 已实现

- 官方 TypeScript MCP SDK 精确锁定 1.30.0；STDIO 薄网关仅调用现行 C1R1P1 Client API，未修改冻结 schema 或 hash。
- 能力驱动工具注册，observer 不注册写工具；管理工具不提供 RoleBridge 六工具、桌面目录授权或 Core shutdown。
- stable request_key 派生 Core operation_id；业务幂等由原 SQLite command_ledger 提供。MCP JSON-RPC id 不作为业务幂等键。
- 控制租约内部保存，每10秒续租；等待最长30秒，读取不阻塞取消；派发仅返回任务 id/state。模糊失败保留 unknownOutcome，不自动重放业务。
- Core 写审计补记 origin/client_id/operation_id，不保存请求秘密。
- 独立常驻 Core：.local/management-live/core；仅允许独立 workspace。启动器遇已有 endpoint 拒绝重复启动。MCP退出不关闭Core。
- 当前用户 Codex 已注册 agentrouter-management，命令仅含 Node、脚本、Core目录、controller，无秘密环境变量。未修改 auth.json。

## 已测试

tools/test-management-mcp.mjs 使用 SDK Client → STDIO Server → Windows named pipe → 实际 LOCAL_CORE/SQLite，禁止 fixture Core。覆盖读取、Role Plan validate/apply、同键重放/冲突、MCP重启持久化、排队派发、空结果、并发等待取消、分页、释放重试、observer拒绝控制。每次独立数据目录，清理仅结束本测试创建的Core。

全仓326项原有测试通过；类型检查、冻结规范检查通过。上述结果不是三家 Harness 支持认证。计划引用的角色模板仅用于保存/验证，不执行 FixtureDriver。

## 修复记录

1. 取消参数误用 task_id，按冻结合同修为 id；未修改合同迎合实现。
2. 写队列阻塞长等待：只串行控制和写入。
3. wait_ms=0 终态错误标超时：先检查实际 TaskState 终态。
4. release 重试受本地租约清空阻断：保存已完成结果及发送前原租约，模糊失败可原键重试。
5. 原根 package.json 未保留 SDK 声明：补齐精确依赖并与锁文件核对。

## 未测试与风险

- 当前开发 Codex 本会话工具列表尚未加载新注册 MCP：NOT_RUN；SDK调用不能冒充该验收。不得为刷新关闭 hzxpro。
- managed launcher 尚未落地；入口环境标记仅为防误启动，不能当作操作系统权限隔离。managed Codex 不继承 Management MCP 尚未认证，不启动该链路。
- 实际 NativeProcessHost/账号注册/Route 工具接线仍待完成；pi、Kimi、Codex真实任务、取消恢复本增量均 NOT_RUN。不能将排队成功当作Harness执行。
- External API registry/list/describe/call 尚未实现；当前没有开放任意HTTP代理。
- 续租遇并发revision冲突会丢失本地租约，可能短暂控制不可用；不自动重试业务。
- 当前系统 Node 24.14.0；pnpm运行器24.19.0警告。pnpm自动安装触发 better-sqlite3 源构建因缺VS失败；现有二进制实际SQLite测试通过，干净安装仍不能认证。

## 恢复入口

先 git status --short，保留未提交修改。node tools/build-w11-core.mjs；node tools/build-management-mcp.mjs；node tools/test-management-mcp.mjs。常驻服务先读取 .local/management-live/owner.json 并核对进程，不重复启动、不按进程名杀Codex。没有 main 合并或发布授权。
