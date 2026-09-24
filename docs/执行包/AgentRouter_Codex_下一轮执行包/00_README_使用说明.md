# AgentRouter 提交 16370d3 复核与下一轮执行包

## 1. 基线

- 仓库：`hhhzingy/AgentRouter`
- 复核提交：`16370d3971740c80ca9ccec7a6d9b3553e896545`
- 复核日期：2026-09-09
- 当前性质：开发预览，不是 AgentRouter V1.0 完整交付
- 当前真实 Harness 正式支持数：0
- 本包新增范围：Windows 桌面 GUI 可通过 SSH 连接 Linux 上长期运行的 AgentRouter Core

## 2. 本包回答的问题

1. Codex 的汇报是否与仓库一致；
2. 当前已经实现、仅做了探针、尚未实现的内容分别是什么；
3. 真实账号联调如何避免凭据进入模型上下文、日志、仓库或第三方网络；
4. 当前交互是 Local Web 还是桌面 GUI；
5. Linux Core + Windows GUI + SSH 应采用什么架构；
6. Codex 与 UIAI 如何分工、如何冻结协议、是否需要多 worktree；
7. 下一轮按什么 Gate 和验收标准推进。

## 3. 推荐执行顺序

### 第一步：只由 Codex 完成共享基线 C1

Codex 阅读：

1. `01_提交16370d3复核报告.md`
2. `02_远程内核与SSH方案.md`
3. `03_真实账号联调安全基线.md`
4. `04_共享客户端API_C1冻结草案.md`
5. `05_Codex下一轮执行包.md`
6. `07_Worktree与集成方案.md`
7. `08_下一轮验收矩阵.md`
8. `contracts/client-api.c1.schema.json`
9. `contracts/ui-view-models.c1.ts`

完成共享 API、传输接口、错误码、事件游标和安全 Gate 的 C1 提交后，暂停并等待复核。

### 第二步：从 C1 提交创建两个开发 worktree

- Codex：`feat/core-api-ssh`
- UIAI：`feat/ui-workbench`
- 集成：`integration/v1.0-next`，只由集成负责人操作

UIAI 必须从 C1 提交开始，不要直接从 `16370d3` 自行猜测接口。

### 第三步：并行实现

- Codex：Core、API、SSH、Linux 服务、适配器、安全、存储与集成。
- UIAI：桌面信息架构、页面、组件、交互、状态呈现、Mock API 与 UI 自动化测试。
- 两者都不得跨越文件所有权边界；需要改协议时提交 Contract Change Request。

### 第四步：先模拟联调，再真实账号联调

在“凭据不可见安全门”通过前，不允许把真实密钥、`auth.json` 或 OAuth 缓存放入开发 worktree、测试输入、证据日志或 AI 对话。

## 4. 两个可直接发送的入口

- Codex：`prompts/CODEX_下一轮任务.txt`
- UIAI：`prompts/UIAI_执行任务.txt`

## 5. 重要结论

- 当前交互是 **Electron 桌面 GUI**，Renderer 使用 Web 技术，但并不是浏览器访问的 Local Web。
- 当前 GUI 只连接本机由 Electron 启动的 Core 子进程，尚无远程传输层。
- SSH 远程模式不应直接暴露 SQLite、HTTP 或 App Server；推荐“SSH stdio 桥 → Linux Unix Socket → 常驻 Core”。
- 真实凭据安全不能靠“告诉 Codex 不要记住”。唯一可靠的目标是让模型及其可执行工具根本读不到凭据。
- 当前仓库允许提交 `evidence/**/*.log`。真实联调前必须修改，因为原始日志可能包含令牌、账号标识、路径或请求内容。
