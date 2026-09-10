# ADR-0007：J1 UI 接管与原生桌面边界

状态：J1 已实现并本地验证；本轮结束后等待复核。

- 保留 UIAI 固定提交与 20 条产品规则；Codex 接管 Renderer、Main/preload 与 Core 接线。默认入口为新 workbench，未恢复旧 GUI。C1/C1R1/C1R1P1 Schema、生成文件与两份已发布 SQL 迁移不变。
- Main 原生目录选择（Native Directory Picker）只返回连接绑定的 pathHandle。认证本地网关在 Controller 和有效租约下授权选中目录，再走现有 filesystem.validateProjectRoot / project.create。Renderer 不传任意文件系统路径给此接口；此网关扩展不属于冻结 Client API 方法表，不用于 SSH。
- 产物保存（Artifact Save）由 Main 执行原生保存对话框、分块下载与 SHA-256 校验。Core 校验实际项目授权、存储键、真实文件边界、尺寸和哈希；缺失/损坏产物不能下载。Main 校验总长度与哈希并复核控制权后写入用户所选路径。本轮最多 20 MiB；不声称实现生产产物导入或 Git 引用。
- 业务写入在 Renderer 发出前持久记录 operationId、原 expectedRevision 和 scope；同内容的明确重提复用记录，租约可更新。成功或确定失败后移除记录；结果不明则保留。多个在途命令各自合并更新存储。页面重载不自动重放业务写入。
- UI 从真实 capabilities 启用功能，发送前按冻结 Schema 校验请求；使用 conversation.read 的有效分页上限。申请控制与租约续期使用独立控制请求。URL hash 页面导航不关闭 Core 连接，实际 Renderer 重载/崩溃才清理旧连接。
- SETTLING 显示等待原生结束和资源停止确认；RESULT_STAGED 显示结果暂存，不能视作交付。UNKNOWN 保持可见，缺少 run.reconcile 时六动作均禁用；GUI 不直接释放资源。
- 测试产物注入只存在于显式隔离 Fixture 的父进程 IPC。真实 Electron、真实 SQLite 与独立 Core/Fixture 子进程的通过不等于真实 Harness 通过；真实支持数仍为 0。

限制：未进行真实账号、Harness、SSH/Linux、干净 Windows 安装/卸载或原生对话框人工操作验收。授权不承诺隔离同一 Windows 用户下的恶意本机进程。待核对命令的浏览器本地存储含用户提交正文，尚无持久保留/清理管理界面。
