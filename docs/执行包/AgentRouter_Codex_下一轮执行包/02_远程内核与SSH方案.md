# Windows GUI 连接 Linux AgentRouter Core：V1.0 方案

## 一、当前实现是什么

当前不是 Local Web。

它是：

```text
Electron 桌面应用
├─ Renderer：React 页面，通过 loadFile 加载本地 HTML
├─ Main：受控 IPC、目录选择、托盘和生命周期
└─ 本地 Core 子进程
   └─ JSON-LF / stdio
```

Renderer 使用 HTML/React，不代表用户通过浏览器访问 Local Web。当前没有本地 HTTP 管理端口，也没有独立可远程连接的 API 服务。

## 二、新功能的正确目标

```text
Windows Electron GUI
        │
        │ AgentRouter Client API
        ▼
CoreTransport
 ├─ LocalStdioTransport：本机开发或本机运行
 └─ SshStdioTransport：Windows ssh.exe
        │
        │ 加密 SSH 通道，不暴露公网监听
        ▼
Linux agentrouter-ssh-bridge
        │
        │ 本机 Unix Domain Socket
        ▼
长期运行的 AgentRouter Core daemon
 ├─ SQLite：只放在 Linux 本地磁盘
 ├─ Harness 进程：Codex / Kimi Code / pi
 ├─ 产物存储
 ├─ 凭据和账号 Profile
 └─ 调度、恢复与审计
```

关键要求是：**SSH 断开只影响 GUI，不结束 Core 和正在运行的角色。**

## 三、为什么不推荐直接 `ssh host agentrouter core --stdio`

如果 SSH 命令直接创建整个 Core：

- Windows 睡眠、网络抖动或关闭 GUI 可能结束远程进程；
- Core 生命周期仍与客户端绑定；
- 多次重连可能启动多个 Core 并争用同一 SQLite；
- 无法可靠区分“GUI 断开”和“内核崩溃”。

因此 SSH 只启动一个轻量桥：

```text
agentrouter ssh-bridge --stdio
```

它连接已经运行的 Unix Socket：

```text
$XDG_RUNTIME_DIR/agentrouter/core.sock
```

Core 由 `systemd --user` 管理。需要注销后继续运行时，由用户明确选择是否启用 user lingering；不要静默修改系统设置。

## 四、SSH 客户端行为

Windows 端优先调用系统 OpenSSH：

```text
C:\Windows\System32\OpenSSH\ssh.exe
```

推荐通过用户的 `%USERPROFILE%\.ssh\config` 使用明确 Host Alias。AgentRouter 不保存私钥或 SSH 密码。

建议参数语义：

```text
-T
-o BatchMode=yes
-o ForwardAgent=no
-o ForwardX11=no
-o ClearAllForwardings=yes
-o ServerAliveInterval=15
-o ServerAliveCountMax=3
<host-alias>
agentrouter ssh-bridge --stdio --protocol agentrouter-client/1
```

实现时使用 `spawn/execFile` 的参数数组，不通过 shell 拼接命令。

### 首次连接

- 要求用户先在终端完成一次正常 `ssh <alias>` 并核对主机指纹；
- 不得自动设置 `StrictHostKeyChecking=no`；
- 不得把私钥内容读取进 AgentRouter 或 AI 上下文；
- 后台连接使用 `BatchMode=yes`，认证失败就明确显示，不弹出隐藏密码输入。

### 可选强化

为 AgentRouter GUI 使用专用 SSH key，并在 Linux `authorized_keys` 中限制为：

- forced command：只允许 `agentrouter ssh-bridge --stdio`；
- no PTY；
- no agent forwarding；
- no X11 forwarding；
- no任意端口转发。

如果用户还需要正常 SSH Shell，使用另一把 key，不要共用无限权限的 AgentRouter 控制 key。

## 五、Core 服务

### 1. Linux 进程

建议增加：

```text
apps/core-service/
apps/ssh-bridge/
packages/client-contract/
packages/client-transport/
packages/core-api/
```

`core-service`：

- 独占打开 SQLite；
- 监听 Unix Socket，不监听公网；
- 启动后执行恢复扫描；
- 承担所有调度、Harness 和账号工作；
- 允许 GUI 断开后继续；
- 保存事件序号与审计。

`ssh-bridge`：

- 不打开数据库；
- 不启动 Harness；
- 不解释业务；
- 将 SSH stdin/stdout 与 Unix Socket 帧双向转发；
- 将已认证 SSH principal/connection metadata 传给 Core；
- 连接结束即退出。

### 2. systemd 用户服务

至少提供：

- `agentrouter-core.service`
- 可选 `agentrouter-core.socket`
- 安装、启动、停止、状态、日志和卸载命令
- 数据目录默认：`~/.local/share/agentrouter`
- 配置目录默认：`~/.config/agentrouter`
- 运行时 Socket：`$XDG_RUNTIME_DIR/agentrouter/core.sock`

数据库不得放在 SMB/NFS/Windows 映射盘上。

## 六、共享 Client API

### 连接握手

客户端连接后先发送 `system.initialize`：

```json
{
  "client_protocol": "agentrouter-client/1",
  "client_version": "1.0.0-dev",
  "client_id": "stable-local-install-id",
  "requested_mode": "controller",
  "last_event_cursor": 1832
}
```

服务端返回：

```json
{
  "server_instance_id": "core_xxx",
  "server_version": "1.0.0-dev",
  "protocol": "agentrouter-client/1",
  "schema_version": 2,
  "platform": "linux",
  "capabilities": {},
  "control_mode": "controller",
  "event_cursor": 1901
}
```

### 三类帧

1. Request/Response：查询和命令；
2. Event：带持久化 cursor；
3. Heartbeat/connection status：不改变业务状态。

### 变更操作

每个写操作必须有稳定的：

- `operation_id`
- `client_id`
- `expected_revision` 或当前实体版本
- 项目/空间作用域

SSH 重连后，客户端用相同 `operation_id` 重试，Core 返回原结果，不能重复创建角色或任务。

### 事件恢复

UI 不再每三秒拉取全量数据库投影。

推荐：

1. 连接时读取 compact snapshot；
2. 订阅实时事件；
3. 断线重连后调用 `events.catchup(since_cursor)`；
4. 如果 cursor 已过期，服务端要求重新拉 snapshot；
5. UI 只把 Core 返回的状态当真，不根据对话文本自行推断。

## 七、控制权模型

V1.0 最简单稳定方案：

- 一个 Core 允许多个连接；
- 同一时刻只有一个 `controller lease` 可以执行写操作；
- 其他连接为 observer，只读；
- controller 定期续租；
- SSH 断开不会立即取消业务任务，但控制租约在短 TTL 后释放；
- 所有停止、批准和账号切换操作要求 controller 权限；
- Harness 内部 Route 工具不走 GUI controller，它们使用受限的 run-scoped identity。

这避免 Windows 和另一台客户端同时改变同一任务。

## 八、远程路径与文件

远程模式下，Windows 的本地目录选择器不能创建 Linux 项目。

新增 API：

- `filesystem.listRoots`
- `filesystem.listDirectory`
- `filesystem.validateProjectRoot`
- `project.createFromRemotePath`
- `artifact.open/readChunk`
- `artifact.downloadToClient`，需要用户明确操作

UI 显示：

```text
SSH: devbox / /home/user/projects/app
```

不要把 Linux 路径伪装成 Windows 路径，也不要让 UI 通过网络共享直接打开 Core 的 SQLite。

Git 引用和不可变 artifact 由 Linux Core 解析。UI 只获取可展示文本、diff、元数据或明确下载的副本。

## 九、关闭与断线语义

### 关闭 Windows 窗口

- 后台继续：Electron 保留，SSH 可以保持；
- 彻底退出 GUI：断开 SSH，但 Linux Core 和任务继续；
- 当前轮次结束后暂停：向 Core 写入持久化 drain 意图，然后 GUI 可退出；
- 停止并退出：请求取消；只有 Core 确认后显示停止完成。

### SSH 意外断线

- 不取消正在运行的角色；
- Core 记录客户端断开事件；
- 需要人工审批的操作保持等待；
- GUI 重连后从 cursor 补事件；
- 不能因为没有收到响应而自动重复执行新的变更命令。

### Linux Core 重启

- 运行中的外部副作用进入 UNKNOWN/RECONCILING；
- 重新核对原生 Harness 与产物；
- 不自动重新执行；
- UI 清楚展示需要人工处理的对象。

## 十、稳定性与可行性

### 可行

- 当前已经有 JSON-LF/stdio 分帧，可提炼为传输无关协议；
- Windows 已有 OpenSSH 客户端；
- Linux 可使用 Unix Socket 和 systemd 用户服务；
- Codex 自身也采用 SSH 启动/管理远端 App Server 的思路，说明产品形态合理。

### 主要风险

1. 当前 Core daemon 还没有接入实际调度；
2. 断线重连和事件补偿尚未实现；
3. 远程目录语义会影响现有桌面 IPC；
4. 多客户端控制权必须先定义；
5. Linux Harness 进程、sandbox、systemd 与凭据权限需要真实环境测试；
6. 一旦直接开放 TCP/WS，认证和攻击面显著增加。

### V1.0 推荐边界

V1.0 支持：

- Windows GUI + Windows Local Core；
- Windows GUI + Linux Remote Core over SSH；
- 单用户、单 Core、一个 controller；
- 不开放公网 HTTP/WS；
- 不支持浏览器版 Local Web；
- 不支持跨 Core 迁移正在运行的角色；
- 不支持自动同步 Windows 和 Linux 的工作目录。
