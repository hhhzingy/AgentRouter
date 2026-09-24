# Codex 下一轮执行包

## 一、身份与职责

你是 AgentRouter 的 **Core、协议、传输、安全、Harness Adapter 和最终集成负责人**。

你不是 UI 视觉设计负责人。你不得为了方便改变“静默成功、显式结果去向、同角色排队、关联结果续办、原生收尾屏障、UNKNOWN 不盲目重跑”等已冻结语义。

## 二、工作基线

- 仓库：`hhhzingy/AgentRouter`
- 基线提交：`16370d3971740c80ca9ccec7a6d9b3553e896545`
- 当前真实 Harness 支持：0
- 当前阶段：开发预览
- 新增范围：Windows GUI 通过 SSH 连接 Linux 常驻 Core
- 真实账号：在安全 Gate 通过前继续延期

先读取本执行包同目录所有文件。

## 三、文件所有权

### 你负责

- `apps/core-daemon/**`
- 新增 `apps/core-service/**`
- 新增 `apps/ssh-bridge/**`
- `packages/runtime/**`
- `packages/storage/**`
- `packages/protocol/**`
- 新增 `packages/client-contract/**`
- 新增 `packages/client-transport/**`
- 新增 `packages/core-api/**`
- `packages/adapters/**`
- `packages/role-bridge/**`
- `packages/accounts/**`
- `packages/artifacts/**`
- `packages/platform/**`
- `apps/desktop/main.ts`
- `apps/desktop/preload.*`
- Core、协议、传输、适配器、Chaos 与集成测试
- Linux service/installer
- 最终合并与冲突处理

### UIAI 负责，未经 Contract Change Request 不修改

- `apps/desktop/renderer/**`
- `apps/desktop/components/**`
- `apps/desktop/styles/**`
- `packages/ui/**`
- `tests/ui/**`
- `tests/e2e-ui/**`
- `docs/ui/**`

如果现有 `renderer.tsx` 需要拆分，由 UIAI 完成。你只保证 preload 暴露冻结客户端 API。

## 四、硬性安全约束

1. 不读取当前用户真实 `auth.json`、API Key、Cookie 或 SSH 私钥；
2. 不将任何 Secret 写入 Prompt、日志、evidence、SQLite、命令行或 Git；
3. 真实联调前先修改 evidence 原始日志策略；
4. 不设置 `StrictHostKeyChecking=no`；
5. 不开放未认证公网 HTTP/WS；
6. 不用 shell 字符串拼接 SSH 命令；
7. 不让 GUI 直接访问 Linux SQLite；
8. 不把 UI 连接断开等同于取消任务；
9. 不使用模拟 Adapter 声称真实 Harness 支持；
10. 不跨越失败 Gate 宣告阶段完成。

## 五、执行顺序

# W10：复核缺口修正与 C1 合同冻结

### 目标

在并行开发前形成唯一 Client API。

### 工作

- 将 `contracts/client-api.c1.schema.json` 和 `ui-view-models.c1.ts` 转为仓库正式规范；
- 定义 `CoreTransport`；
- 定义 request/response/event framing；
- 定义 `system.initialize`、event cursor、capability、controller lease；
- 所有变更命令要求 `operation_id`；
- 生成 TypeScript 类型，不手工维护两份；
- 写 ADR：Local/SSH transport、Linux daemon、单 controller；
- 修复 `.gitignore`，区分 raw 和 redacted evidence；
- 建立 Secret 扫描和脱敏日志库；
- 修复 `route_context(section)`；
- 为 notice 建立“持久化但不唤醒”的目标收件语义；
- 制定 SQLite 兼容版本策略，不再精确等于单一版本；
- 为 UNKNOWN 定义对账 API；
- 明确 `git/live` 暂不支持时的 capability；
- 明确 AuthUnit V1.0 最大并发为 1，或真正实现计数租约。

### Gate C1

必须交付：

- API Schema；
- 生成的 TypeScript 类型；
- Mock server；
- UI fixtures；
- ADR；
- Contract test；
- 兼容性表；
- 变更摘要；
- 供 UIAI 使用的只读文档。

C1 完成后停止，等待用户/复核者确认，再创建 UIAI worktree。

# W11：将 Core daemon 变成真实服务

### 目标

不依赖桌面 UI，也能通过 Client API 完成模拟协作闭环。

### 工作

- Core API 接入 send、dispatch、finish、wait、settle、artifact、approval、issue、reconciliation；
- 接入 RoleBridge 生命周期；
- 接入 Mock Harness Adapter；
- 支持事件持久化与推送；
- 支持 snapshot + catchup；
- 管理操作幂等；
- 一个 controller，多 observer；
- GUI 断开不改变业务状态；
- stderr/错误变成结构化诊断，不静默丢弃；
- 不使用三秒全量 polling 作为最终方案。

### Gate

在没有真实账号、没有 Electron 的情况下，通过 CLI test client：

1. 创建项目和三个角色；
2. 角色 A 派发给 B；
3. B 完成后交给 C；
4. C 结果给用户；
5. B 和另一个角色在不同 workspace 并行；
6. 断开客户端；
7. Core 继续；
8. 重连后按 cursor 补齐事件；
9. 相同 operation ID 不重复；
10. Core 崩溃后 UNKNOWN 不自动重跑。

# W12：Linux 常驻 Core 与 SSH bridge

### 目标

Windows GUI 能控制 Linux Core，SSH 断开后任务不停止。

### 工作

- Linux Core 监听 Unix Socket；
- systemd user service；
- `agentrouter ssh-bridge --stdio`；
- `SshStdioTransport` 调用系统 `ssh.exe`；
- 使用 Host Alias；
- 主机指纹错误明确失败；
- 支持 keepalive、断线、重连和事件 catchup；
- 远程 filesystem API；
- Local 与 Remote 使用相同方法和 ViewModel；
- 远程 GUI 退出不发送 shutdown；
- Linux Core 不监听公网；
- 提供安装/卸载/诊断脚本。

### Gate

- Windows 到 Linux SSH 连接成功；
- SSH 进程被强制结束后，Linux Core PID 与正在运行的 Mock 任务保持；
- 重连不重复创建任务；
- Remote Path Picker 不读取 Windows 本地路径；
- 第二客户端只能 observer，或明确取得 controller 后才能写；
- SQLite 始终在 Linux 本地文件系统。

# W13：稳定性闭环

### 工作

- UNKNOWN Reconciliation；
- notice inbox；
- artifact_links 与保留；
- Git 引用和固定提交读取；
- worktree 登记与资源租约；
- 结果收尾屏障的进程级测试；
- 真正 kill 子进程和 SSH；
- drain、pause、stop 的区别；
- Raw log 脱敏；
- 数据库备份恢复；
- 长时间队列和事件裁剪策略。

### Gate

完成 `08_下一轮验收矩阵.md` 中 G10—G13。

# W14：完整 Mock Adapter

不要直接从事件 mapper 跳到真实账号。

Adapter 必须实现：

- detect/probe；
- start/stop process；
- create/resume session；
- send prompt；
- receive streamed events；
- approval request/response；
- cancel；
- inject Route tools；
- normalize conversation；
- native settled；
- reconnect/reconcile；
- sanitize logs；
- capability report。

Mock Adapter 与三家真实 Adapter 共用合同测试。

# W15：Codex 真实纵向闭环

只有 SG-1—SG-5 通过后执行。

### 最小范围

- 专用测试账号；
- 专用 `CODEX_HOME`；
- 最小权限 Profile；
- 无敏感临时仓库；
- 创建线程；
- 一次 Prompt；
- 一次 Route tool；
- 一次取消；
- 一次恢复；
- 一次正常 settle；
- 身份和额度只返回脱敏元数据；
- 联调后撤销/轮换。

不得使用用户日常账号作为第一轮测试。

# W16：Kimi Code 与 pi

按同一合同分别实现。任何差异通过 capability 表达，不在 Core 中写“看到某个文本就猜结束”。

pi 特别要求：

- `agent_end` 不能释放资源；
- `agent_settled` 才可通过收尾屏障；
- Provider Key 不进入 Agent 环境；优先 Credential Broker。

# W17：与 UIAI 集成

- 先合并 C1；
- UIAI 分支 rebase 到 C1；
- 合并 Core 和 UI；
- Contract test 必须通过；
- UI 不读 SQLite；
- UI 不调用 Harness；
- UI 对 Local/SSH 不出现两套状态语义；
- 真实 Harness 尚未验证的按钮必须禁用并显示原因。

## 六、测试要求

至少增加：

- Client API contract；
- event cursor/catchup；
- management idempotency；
- control lease；
- SSH disconnect；
- remote core persistence；
- remote path validation；
- notice passive inbox；
- context section least disclosure；
- raw log redaction；
- canary secret denied；
- actual child process kill；
- unknown reconciliation；
- artifact retention；
- multiple observer；
- SQLite safe version policy；
- local/remote parity。

不要把单元测试里的方法调用当成真实进程测试。

## 七、每轮汇报格式

```text
基线提交：
新提交：
阶段：
已实现：
真实测试：
模拟测试：
未测试：
被阻断：
安全 Gate：
兼容性变化：
修改文件：
证据：
剩余风险：
下一步建议：
```

“PASS”必须说明环境、版本、是否真实账号、是否真实 Harness、是否真实 SSH。

## 八、完成定义

本轮完成不是“三家可用”。本轮完成定义为：

> C1 合同冻结；Core 可独立运行；Local 和 SSH 客户端共享协议；Linux Core 在 GUI 断开后继续；安全 Gate 能证明凭据没有进入模型可见路径；UIAI 可以无须读 Core 代码完成 UI。

完成后提交，不自行进入真实账号联调，等待用户授权。
