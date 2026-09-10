# Windows GUI 与 Ubuntu Remote Core 实际联调

## 1. 固定架构

Windows Electron GUI → 受限 Main/preload → SshStdioTransport → Windows OpenSSH → 远程轻量 ssh-bridge → Unix Domain Socket → systemd --user 管理的常驻 AgentRouter Core → 本机 SQLite、产物、Harness 与账户。

沿用仓库 SSH 方案，不开放公网 HTTP/WS，不让 SSH 会话直接承载整个 Core；不在 Windows 共享盘/SMB/NFS 上放远程数据库。bridge 不打开数据库、不调度业务、不启动 Harness。认证用 SSH/OS 边界，client_id 或 JSON 中 principal 不是凭据。

## 2. 先保护现有 Ubuntu 开发环境

用户已提供 Ubuntu20.04 用于 RV1126B SDK 开发。先只读盘点架构、glibc、systemd user 会话、文件系统、空间、Git、Node/SQLite native ABI、三家 Harness 和 Shell。不能凭系统版本推断锁定运行时一定可用；实际加载、启动和 native module 测试必须通过。

不能擅自升级 Ubuntu、替换系统 Node/Python、改 SDK 工具链、动 linux6.1_sdk、刷板或改网络。需要兼容运行时、受限容器或系统包时，将方案和对 SDK 的影响直接交用户批准，安装范围限定 AgentRouter。本轮远程实测在新的临时非敏感工程，不访问旅行设备生产固件或硬件。

## 3. Core 和服务实现

提炼同一 ApplicationService/Core 的平台入口；Windows 保留 Named Pipe，Linux 使用 UDS 和可靠的 OS peer identity/目录权限。单数据集只允许一个 Core 写库，启动恢复先标记未知外部执行再决定可用性。

服务提供安装、status、start、stop、logs、卸载方法和明确数据目录。systemd --user 管理生命周期；只在用户明确授权后启用 user lingering。未启用时要实测注销行为并如实说明；不能把 GUI 退出不杀任务扩大为 OS 注销后仍存活。

生产 Linux supervisor 需管理整组工具后代并证明取消/崩溃后的资源状态；不能只以 kill 一个 PID 或放弃 SSH 句柄视为停止。进程逃逸/无法证明停止时，写资源隔离，任务 UNKNOWN，不再派发。

## 4. SSH 接入和权限

优先使用用户已有明确 Host Alias；首次连接用户在普通终端核对主机指纹和认证。AgentRouter 后台调用参数数组，不拼 shell 命令，禁止任意传入远程命令；alias 必须校验，拒绝选项注入。

建议参数语义：无 PTY、BatchMode、StrictHostKeyChecking=yes、禁用 agent/X11 forwarding、清理端口转发、有限 keepalive。准确路径和 bridge 参数由受测实现确定，不把建议当已存在命令。Host key 改变必须阻断并让用户核对，不能删除 known_hosts 或自动接受。

AgentRouter 不读取私钥正文，不把 SSH 密码/Agent Socket 管理权限交给模型。可选专用 key + forced command；由用户明确配置，不覆盖日常 shell key。模型 Provider 网络访问发生在 Linux 受控环境，与 SSH 通道权限分别验证。

## 5. 路径、连接和多客户端

Remote 路径来自 Core 发放的 path_handle；复用现行 `filesystem.*` 与 `project.create` 合同，不新增过时提案中的 createFromRemotePath 别名。Windows 本机目录选择器不能作为 Linux 项目根。界面始终显示 Core 模式、主机 alias、数据集和当前项目/工作区。

下载产物须用户主动选择 Windows 保存位置，按 artifact ID 分块传输并核对 SHA-256；Linux 不收到 Windows 任意写路径。禁用任意远端文件读取和 UNC/符号链接越界。

一个 Core 同时只有一个 controller，其他连接 observer。重连重新取得控制权后按原 operation_id 查询/重放，不生成新 ID。核对当前合同关于 TTL/断开释放的准确语义，修复 Core 与文档/测试漂移；不自行照抄早期 README 的例子。

事件恢复使用 snapshot + cursor + catchup；去重并显式显示 GAP。server_instance/dataset 改变时不混入旧快照/草稿/历史。Windows Local Core 和 Linux Remote Core 不同步或迁移正在运行的任务。

## 6. 必做现场试验

1. 全新连接：GUI → SSH → UDS → Core，读取并创建隔离项目，启动真实 Harness，查看工具与产物；不只测试 ssh echo。
2. GUI 退出：Linux Core PID 与任务继续，重新启动 GUI 后通过事件恢复看到同一 task/run，没有二次运行。
3. 杀掉 GUI 的 ssh transport：任务不因断线取消；审批请求停在 WAITING_USER，不默认同意。
4. Windows 睡眠/唤醒与短断网：断线状态准确；重复连接不生成第二 Core；结果只交付一次。
5. 首字节发送/业务提交/响应丢失分别故障注入：幂等返回或 UNKNOWN，任务不重复。
6. Linux Core 重启：未知外部执行进入核对；旧 Harness/工具进程隔离、旧 epoch 迟到结果拒绝；没有无证据自动重跑。
7. 两客户端：第二连接只读；控制租约转换、拒绝旧批准和重放测试通过。
8. 错 host key、认证失败、bridge 缺失、协议不兼容、UDS 权限错误、运行时不兼容：显示明确诊断，无空白“已连接”。
9. 两个不同 Core/数据集切换：路径句柄、草稿、scope、history、lease 和 pending op 不串。
10. 远程 worktree 并行与共享写互斥、artifact 下载校验、中文路径和重载。

每项记录实际客户端/远程版本、bridge 和 Core PID/instance、task/run/operation/cursor、期望/实际、失败和恢复。重复次数和补充用例见验收文件。

## 7. 回退

停止受测数据集的新派发；确认进程族后再停服务。按安装清单恢复用户服务配置，不删项目、auth Profile 和数据库。若既有 SSH 开发链路受影响，立即停变更并由用户恢复，不把网络/sshd 改动扩大到整个笔记本。
