# AgentRouter V1.1.0 — Windows Quick Start

## 1. 系统要求

- Windows x64
- 可写的本地目录
- 如果需要 Harness：提前安装并登录/配置对应 Harness
- 如果需要手机远程：Windows 机器和手机加入同一 Tailscale tailnet

## 2. 下载

从 [GitHub Release v1.1.0](https://github.com/hhhzingy/AgentRouter/releases/tag/v1.1.0) 下载 `AgentRouter-v1.1.0-windows-x64-268fc71.zip`。

验证：

```powershell
Get-FileHash .\AgentRouter-v1.1.0-windows-x64-268fc71.zip -Algorithm SHA256
```

期望：

```text
6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604
```

## 3. 解压

把 ZIP 解压到普通用户可写目录，例如：

```text
C:\Users\<you>\Apps\AgentRouter-v1.1.0\
```

不要直接从 ZIP 预览窗口运行。包内 `候选包说明.txt` 是构建期遗留说明，V1.1.0 的权威使用边界以 GitHub Release 与仓库 README 为准。

## 4. 启动

双击：

```text
electron.exe
```

这是 V1.1.0 portable 包的桌面入口。

不要直接运行：
- `core-node.exe`
- `windows-supervisor.exe`

## 5. 第一次使用

进入 Projects：

1. 创建 Project；
2. 选择/批准 Project Workspace；
3. 创建 Role；
4. 为 Role 创建 WorkSession；
5. 选择已配置 Harness；
6. 创建 Task；
7. 在 Results 查看 Result / Artifact。

## 6. WorkSession 规则

- Role 是长期身份；
- WorkSession 是该 Role 的一次真实 Harness/Participant 会话；
- 当前 ACTIVE WorkSession 才能继续工作；
- 历史 WorkSession 永久只读；
- 新 WorkSession 创建成功后，不应恢复旧历史会话。

## 7. Result

Result 的几个概念不同：

- `PUBLISHED`：模型/执行链已正式发布 Result；
- Artifact available：产物文件已经登记并可校验；
- Evidence：Controller 记录的测试/来源证据；
- Accepted：人类/Controller 的验收结论。

不要把它们当成同一个状态。

## 8. 数据目录

默认桌面数据目录由 Electron userData 管理。

高级使用者可以在启动前设置：

```powershell
$env:AGENTROUTER_DATA="D:\AgentRouterData"
.\electron.exe
```

更改数据目录相当于打开一个不同的本地 Core 数据集，请不要随意切换后误认为旧数据丢失。

## 9. 关闭与重启

关闭桌面窗口只代表关闭当前 UI；具体 Core 生命周期由当前启动模式管理。

需要验证数据持久化时：正常退出、重新启动、确认 Project/Role/WorkSession/Result 仍存在。

## 10. 下一步

- Harness：[HARNESS-SETUP.md](HARNESS-SETUP.md)
- Web Participant：[MCP-AND-PARTICIPANT.md](MCP-AND-PARTICIPANT.md)
- Mobile：[REMOTE-AND-MOBILE.md](REMOTE-AND-MOBILE.md)
- Troubleshooting：[TROUBLESHOOTING.md](TROUBLESHOOTING.md)
