# AgentRouter

AgentRouter 是一个 Windows 本地多 Harness AI 协作工作台。它把长期 **Role**、一次真实会话对应的 **WorkSession**、Task / Run / Result / Artifact，以及本地/远程控制统一到一个本地权威 Core 中。

当前稳定发布：**V1.1.0 Windows x64**

## 下载

从 [GitHub Release v1.1.0](https://github.com/hhhzingy/AgentRouter/releases/tag/v1.1.0) 下载 `AgentRouter-v1.1.0-windows-x64-268fc71.zip`。

SHA-256：

```text
6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604
```

PowerShell 校验：

```powershell
Get-FileHash .\AgentRouter-v1.1.0-windows-x64-268fc71.zip -Algorithm SHA256
```

## 启动

V1.1.0 是 **portable ZIP**，不是安装器。

1. 把 ZIP 解压到普通用户可写目录；
2. 双击包根目录的：

```text
electron.exe
```

3. 不要直接启动内部的：
   - `resources/app/core-node.exe`
   - `resources/w11-core/windows-supervisor.exe`

它们是 AgentRouter 内部组件。

> V1.1.0 包内的 `候选包说明.txt` 是构建阶段遗留文本，部分措辞仍使用旧开发阶段名称。V1.1.0 的权威发布状态与使用方法以 GitHub Release 和本 README 为准。

详细步骤见 [Windows Quick Start](docs/QUICKSTART-WINDOWS.md)。

## V1.1.0 能做什么

- 本地 Windows Core 与 Electron Workbench
- Project / Role / WorkSession
- Task / Run / Result / Artifact
- 历史 WorkSession 永久只读
- Result Evidence / Accept / Request Changes
- Codex
- ZCode
- Kimi Code
- DeepSeek Harness (DSH)
- Pi
- ChatGPT Web Participant
- Management MCP / Participant MCP
- Tailscale HTTPS/WSS 手机远程控制
- Context / WorkSession 连续性与受控迁移能力（按 Harness 实际能力）

### Harness 支持边界

V1.1.0 已真实验证五个 Harness 的受管 Artifact → Result 基本链路。

Codex 与 ZCode 是 V1.1.0 的主要真实验收路径。

Kimi / DSH 的历史测试保留过瞬态失败分母，因此“已支持”不等于承诺长期零波动。

完整配置见 [Harness Setup](docs/HARNESS-SETUP.md)。

## 一个重要限制

**Codex → ZCode 的跨 Harness 完整历史迁移不属于 V1.1.0。**

V1.1.0 切换 Harness 时可以使用安全的 `Start blank` 路径。跨 Harness 完整可见历史迁移计划在 V1.2 重新设计。

## Web Participant

网页 ChatGPT 可以通过 Participant MCP 认领受控 Role/Slot，并：

- 获取 Role Identity
- 读取批准的 Task / Artifact
- 提交 Result

参见 [MCP & Participant](docs/MCP-AND-PARTICIPANT.md)。

## 手机与远程

AgentRouter Core 可以 opt-in 启用 Remote Gateway，再通过 Tailscale Serve 暴露 HTTPS/WSS 给手机浏览器。

参见 [Remote & Mobile](docs/REMOTE-AND-MOBILE.md)。

## 数据与安全

AgentRouter V1.1.0 是 local-authoritative 设计：

- Project/Role/Task/Run/Result 状态由本地 Core 保存；
- API key、登录凭据和 Remote token 不应提交到 Git；
- 发行 ZIP 不携带用户账号、密钥或用户数据；
- Harness 二进制和账号状态由用户自己准备。

参见 [安全说明](SECURITY.md)、[更新记录](CHANGELOG.md)和[本版验证边界](docs/releases/v1.1.0/VALIDATION.md)。

## 已知延期

以下不属于 V1.1.0 发布阻断，计划在后续版本继续完善：

- signed installer
- 品牌化 `AgentRouter.exe`
- 完整 Windows Narrator 认证
- 全 DPI/主题人工矩阵
- clean uninstall matrix
- Codex → ZCode 完整历史迁移
- Linux 最终收口
- account switching（未纳入 V1.1 验收）

## 开发

仓库保留 source、tests、fixtures、contracts、migrations、build / CI / security tooling。

V1.2 开始时从最新 `main` 创建新的开发分支，不继续复用 V1.1 feature branch。

## License

当前仓库元数据为 `UNLICENSED`。

公开可见不等于自动授予开源再分发许可证。后续如需正式开源许可证，由项目所有者单独决定。
