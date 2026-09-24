# B0 客户端接线就绪

阶段：B0；合同 C1R1P1（schemaVersion 3，protocol agentrouter-client/1）。正式 B0 SHA 发布于集成副本的 UIAI-START.md；本文件随 B0 源码提交。真实 Harness 支持仍为 0。

已实现三项有限勘误：Provider.mock boolean；conversation.read 的 role_id/task_id/run_id 定向过滤；task.submitFromUser({request}) 完整复用 Route TaskRequest。C1/C1R1 历史冻结保持不变；旧协商投影不把真实 Provider 强制标记为模拟。

## UIAI 文件入口

- 类型：packages/client-contract/c1r1p1/generated.ts；浏览器只 import type。校验器含 Node 代码，只用于 Main/Core。
- 客户端接口：packages/client-transport/p1/types.ts。
- Renderer 唯一入口：window.agentrouterClient.connect/request/subscribe/close（request/subscribe 位于 connect 返回的 session）。connect 填 clientId/clientVersion/requestedMode，contractRevision 默认 C1R1P1，mode 可校验预期后端。
- 新 UI 入口约定：apps/desktop/workbench.tsx，挂载 #root；可自行建立组件/样式子目录。tools/build-w11.mjs 在存在此入口时构建它。旧 Renderer 文件保持原样用于历史测试。
- 静态 #backend-mode 在 Main 决定的模式下常驻。PREVIEW_MOCK 已接通；此 B0 的 LOCAL_CORE 仍明确拒绝，W11A 就绪后才接通，无隐式回退。

## 启动与调用

从自己的独立 clone 根运行：`node tools/build-w11.mjs`。PowerShell 设置 `$env:AGENTROUTER_MODE='PREVIEW_MOCK'`、`$env:AGENTROUTER_DATA="$pwd/.local/ui-preview"`，可选 `$env:AGENTROUTER_PREVIEW_SCENARIO='two-groups'`，再运行 `node_modules/electron/dist/electron.exe .local/desktop-w11/p1-main.mjs`。数据目录须事先建立。测试场景加载仅 Main 环境参数可用，没有客户端管理口。

用户路径选择先调用 filesystem.listRoots（受控目录集合），使用返回的 pathHandle 调用 filesystem.validateProjectRoot 和 project.create。句柄绑定本次连接；不能跨连接保留。新项目可以没有组；workspace.list({project_id}) 获取真实 VM id，再填入规划中。UI 不构造物理目录或伪造工作区 ID。

写请求 options 必须带 operationId、expectedRevision、scope、leaseId（control.acquire 无 leaseId）。同一次不确定操作保留原操作 ID 和载荷；连接重建必须获取新 lease。关闭/重连取消旧订阅；过期旧 session 不可写。Preview 是写操作，重构 Drain 后必须重预览。当前只在 Mock 支持重构，不代表生产支持。

## 能力

由 hello.capabilities.methods 为准。新增 Mock 接通 filesystem.listRoots/listDirectory/validateProjectRoot、project.create/archive、task.submitFromUser/createFromUser、conversation.read/sendUserInput；保留 R1 的 RolePlan/Charter/模型/Workspace/重构方法与已支持读取。工作区方法仅 Mock 元数据，未实现方法 CAPABILITY_UNAVAILABLE，不能以方法表存在就启用按钮。

完整用户委托 `request` 必须包含 kind=task.request、to、summary、body、inputs、expected、completion，可有 on_problem/project_data。to 和 completion/on_problem 的角色目标只允许同组。默认目标只能预填，最终请求显式持久化。旧 task.createFromUser 仍只支持结果给用户。

## 已测与限制

新增 P1 合同/stdio/Mock 7 个用例通过；真实 Electron 测得 P1 握手、两个三角色组、六未验证模型、PENDING 章程、无 Node 暴露、断开后旧 session 拒绝、重连新租约及 Renderer reload。证据 evidence/B0/desktop.json。命令：node tools/check-w11.mjs。

初次依赖源码构建失败（缺 VS C++），独立 clone 改用精确锁包内预编译 SQLite，npm 生命周期忽略后按需单独安装 Electron；无提高模型可用性。PREVIEW_MOCK 仍是内存 DTO 预览，状态不跨服务进程持久化；真实持久 Core 属于继续执行的 W11A。未运行真实账号、真实 Harness、SSH/Linux。
