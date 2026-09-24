# Remote & Mobile

AgentRouter V1.1.0 可以 opt-in 启用 Remote Gateway，再通过 Tailscale 提供手机访问。

## 推荐拓扑

```text
Phone browser
    |
Tailscale HTTPS/WSS
    |
Remote Gateway
    |
Local AgentRouter Core
```

推荐：
- Core/Remote Gateway 仅本机受控监听；
- 使用 Tailscale Serve 提供 HTTPS/WSS；
- 默认不要使用 Funnel 暴露公网。

## 启用 Remote Gateway

高级使用示例：

```powershell
$env:AGENTROUTER_REMOTE_ENABLED="1"
$env:AGENTROUTER_REMOTE_HOST="127.0.0.1"
$env:AGENTROUTER_REMOTE_PORT="0"
.\electron.exe
```

实际 bound 信息会写到当前数据目录的 remote gateway 信息文件。

## 手机能力

Mobile 是干预/复核控制台，适合：
- 查看 Project/Role/WorkSession 状态
- WAITING_INPUT
- Result review
- Controller/Observer
- cancel
- Activity/Results

它不是把完整 Desktop Workbench 缩小到手机。

## Controller

Observer 和 Controller 不同。只有持有 Controller lease 的客户端才能执行相应 mutation。

网络响应不确定时，客户端应先 reconcile operation status，而不是自动换新 request 重放 mutation。

## Revoke

设备 revoke 后，已有 live stream 应失效。

## V1.1.0 验证

V1.1.0 发布前已完成实体 iPhone + Tailscale HTTPS/WSS smoke。

这不等于所有手机/浏览器/DPI 的完整认证。
