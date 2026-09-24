> 当前执行阶段：J3（2026-09-10）。见 [J3执行与恢复入口](docs/j3/README.md)。以下旧阶段状态保留为历史；J3真实联调与完整V1.0目标覆盖旧等待要求，但不替代账号、费用、部署与发布授权。

# AgentRouter

Windows 本地多 Harness 协作工作台，目标版本 V1.0。

**当前是开发预览，不是 V1.0 完整交付。** 三家 Harness 的版本和无账号握手已探测，真实业务工具、模型执行、取消和账号切换验收尚未完成；正式支持计数为 0。

- 开发依据：`docs/执行包/AgentRouter_V1.0功能与开发手册包/08_Codex实施入口.md`
- 阶段状态：`docs/progress.md`
- 需求追踪：`docs/implementation-plan.md`
- 复现步骤：`REPRODUCTION.md`
- 兼容性：`compatibility-lock.json`
- 测试证据：`evidence/`

开发、下载缓存和临时目录位于本仓库内；pi 按用户要求安装到 Windows 用户目录。`.local/`、`.worktrees/`、`release/` 不提交；不在 E 盘根目录生成工作区。原始开发包保留原样。

当前桌面预览提供项目登记/归档、角色创建/暂停、只读状态投影和兼容性展示。核心库已有部分协议、事务、调度、恢复、内部桥、不可变文件和备份实现，尚未全部接入桌面。

运行 `pnpm build:win` 后，从 `release/AgentRouter-preview/electron.exe` 启动。GPU 受限环境可先设置 `AGENTROUTER_SOFTWARE_RENDERING=1`。这是受测开发机上的便携预览目录，不是干净 Windows 安装认证。

本私人仓库不授权公开再分发（UNLICENSED）。第三方软件遵循各自许可证，正式发行前仍需完成许可清单审查。

本轮 W10/C1 已形成待复核合同基线，详见 [交付报告](docs/reports/W10-C1.md) 与 [UIAI 接入指南](docs/api/README.md)。C1 Mock 不是生产 Core，真实 Harness 支持仍为0。
