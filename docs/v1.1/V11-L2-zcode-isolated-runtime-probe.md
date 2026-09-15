# V11-L2 官方 ZCode 隔离启动实测

日期：2026-09-15。固定测试源码：`98cbab258a43e5b18f27ba7eb030955fa9781ff6`。

官方运行文件 `E:/software/ZCode/resources/glm/zcode.cjs`，执行前校验 SHA256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。

## 探测

创建全新独立 HOME 与工作目录；工作目录有本地 `.git` 边界，受管配置关闭插件/hooks，PATH 为空，环境未合并开发进程环境。通过 Node 启动官方 app-server，仅发送 session/list，不创建 session、不发送 prompt、不传入用户凭据或 MCP 配置。不回显原始 stdout/stderr，仅保留白名单响应结构。

固定源码探测返回 resultKeys=[sessions]，sessions 数量为 0；进程 PID 54548。测试 finally 停止自身创建的 app-server 并等待 close；目录及数据库保留。该探测不是 Windows Job 受管 Role 执行测试，也未穷举后代进程或网络行为。

## 分母

1. 首次未提交版本真实探测 1/1 通过，仅检查协议无 error、result 为对象；控制台成功日志未展示，证据粒度不足。
2. 增加白名单 evidence 文件后，在固定 SHA 再探测 1/1 通过，记录空 sessions 数组及 PID。无模型调用、无失败重试。

类型检查与提交冻结/敏感扫描通过。静态审阅额外确认插件 discoverPluginsSync 在 config.enabled=false 时立即返回空结果；这仍不等同于 session/create 后实际工具列表验证。

## 尚待

受管 Role 的 create/resume、bridge 工具列表、插件/内置 MCP 实际加载、认证方式、fresh 任务、取消停止证明仍需真实端到端测试。没有使用本次“空列表成功”替代这些验收，也未修改现有认证/会话。完整目标继续，账号切换 EXCLUDED_BY_USER，不合 main、不 tag/release。
